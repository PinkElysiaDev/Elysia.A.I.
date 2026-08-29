import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_LINE_LENGTH, SSEParser, SSEParserError, readSSE } from './sse.js'

/** 把整段文本按给定分片切开后喂入解析器，模拟网络分片到达。 */
function parseInChunks(text: string, chunkSize = Infinity): string {
  const parser = new SSEParser()
  const events: string[] = []
  const emit = (list: ReturnType<SSEParser['push']>) => {
    for (const event of list) {
      events.push(JSON.stringify({ event: event.event, data: event.data, id: event.id, retryMs: event.retryMs ?? null }))
    }
  }
  if (chunkSize === Infinity) {
    emit(parser.push(text))
  } else {
    for (let i = 0; i < text.length; i += chunkSize) {
      emit(parser.push(text.slice(i, i + chunkSize)))
    }
  }
  emit(parser.end())
  return events.join('\n')
}

/** 去掉 JSON 里的 null retryMs 占位，便于断言核心字段。 */
function parse(text: string): Array<{ event: string, data: string, id: string, retryMs: number | null }> {
  return parseInChunks(text).split('\n').filter(Boolean).map(line => JSON.parse(line))
}

describe('SSEParser 基础装配', () => {
  it('解析单行 data 事件', () => {
    const [event] = parse('data: hello\n\n')
    expect(event).toEqual({ event: '', data: 'hello', id: '', retryMs: null })
  })

  it('多行 data 按规范用换行拼接', () => {
    const [event] = parse('data: line1\ndata: line2\ndata:line3\n\n')
    expect(event.data).toBe('line1\nline2\nline3')
  })

  it('解析 event / id / retry 字段', () => {
    const [event] = parse('event: message\ndata: {"a":1}\nid: 42\nretry: 3000\n\n')
    expect(event).toEqual({ event: 'message', data: '{"a":1}', id: '42', retryMs: 3000 })
  })

  it('只有 event 字段没有 data 的事件也会产出（data 为空串）', () => {
    const [event] = parse('event: ping\n\n')
    expect(event).toEqual({ event: 'ping', data: '', id: '', retryMs: null })
  })

  it('连续空行不产出多余事件', () => {
    expect(parse('data: a\n\n\n\n')).toHaveLength(1)
  })
})

describe('SSE 规范细节', () => {
  it('字段值仅剥离一个前导空格，第二个空格属于值', () => {
    const [event] = parse('data:  two spaces\n\n')
    expect(event.data).toBe(' two spaces')
  })

  it('无空格的 data:value 也能解析', () => {
    const [event] = parse('data:value\n\n')
    expect(event.data).toBe('value')
  })

  it('CRLF 行尾正确处理', () => {
    const [event] = parse('event: x\r\ndata: crlf\r\n\r\n')
    expect(event).toEqual({ event: 'x', data: 'crlf', id: '', retryMs: null })
  })

  it('冒号开头的注释行忽略', () => {
    const [event] = parse(': keep-alive comment\ndata: real\n\n')
    expect(event.data).toBe('real')
  })

  it('retry 非完整整数被忽略（等价 Go ParseInt 严格整串解析）', () => {
    const [event] = parse('data: x\nretry: 100abc\n\n')
    expect(event.retryMs).toBeNull()
  })

  it('retry 为负数被忽略', () => {
    const [event] = parse('retry: -5\ndata: x\n\n')
    expect(event.retryMs).toBeNull()
  })

  it('未知字段名的行按 data 保留（Go 默认分支行为）', () => {
    const [event] = parse('weird_field: value\n\n')
    expect(event.data).toBe('weird_field: value')
  })

  it('流末尾无空行收尾时 end() 冲刷挂起事件', () => {
    const [event] = parse('data: tail-without-blank')
    expect(event.data).toBe('tail-without-blank')
  })

  it('流末尾残行带 CR 也会被剥掉', () => {
    const [event] = parse('data: tail\r')
    expect(event.data).toBe('tail')
  })
})

describe('非标服务器兜底', () => {
  it('裸 [DONE]（无 data: 前缀）立即触发事件', () => {
    const [first, second] = parse('data: chunk\n\n[DONE]')
    expect(first.data).toBe('chunk')
    expect(second).toEqual({ event: '', data: '[DONE]', id: '', retryMs: null })
  })

  it('裸 JSON 行（无 data: 前缀）立即触发事件', () => {
    const [event] = parse('{"error":{"message":"boom"}}')
    expect(event.data).toBe('{"error":{"message":"boom"}}')
  })

  it('已积累字段后，裸 JSON 按普通 data 行处理而非立即触发', () => {
    const events = parse('event: x\n{"a":1}\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('{"a":1}')
  })

  it('带 data: 前缀的 [DONE] 走普通路径（需空行触发）', () => {
    const events = parse('data: [DONE]\n')
    // 无空行，仅靠 end() 冲刷
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('[DONE]')
  })
})

describe('分片边界', () => {
  const PAYLOAD = 'event: m\ndata: {"k":"中文🚀"}\nid: 7\nretry: 500\n\ndata: second\n\n[DONE]'

  it('逐字符喂入与整段喂入结果一致', () => {
    expect(parseInChunks(PAYLOAD, 1)).toBe(parseInChunks(PAYLOAD))
  })

  it('各种分片大小结果一致', () => {
    const expected = parseInChunks(PAYLOAD)
    for (const size of [2, 3, 5, 7, 11]) {
      expect(parseInChunks(PAYLOAD, size)).toBe(expected)
    }
  })

  it('CR 与 LF 落在不同分片也能正确组装', () => {
    const [event] = parseInChunks('data: split\r\n\r\n', 3).split('\n').filter(Boolean).map(l => JSON.parse(l))
    expect(event.data).toBe('split')
  })

  it('多字节 UTF-8 内容完整保留', () => {
    const [event] = parse('data: 中文🚀emoji\n\n')
    expect(event.data).toBe('中文🚀emoji')
  })
})

describe('防御上限', () => {
  it('超长行抛出 SSEParserError', () => {
    const parser = new SSEParser({ maxLineLength: 16 })
    expect(() => parser.push(`data: ${'x'.repeat(32)}\n\n`)).toThrow(SSEParserError)
  })

  it('无终结的超长半行同样抛出', () => {
    const parser = new SSEParser({ maxLineLength: 16 })
    expect(() => parser.push('x'.repeat(17))).toThrow(SSEParserError)
  })

  it('默认上限为 16MB（对齐 Go SSEBufMax）', () => {
    expect(DEFAULT_MAX_LINE_LENGTH).toBe(16 * 1024 * 1024)
  })
})

describe('readSSE 异步封装', () => {
  it('把异步分片序列解析为事件流', async () => {
    async function* chunks(): AsyncGenerator<string> {
      yield 'event: a\ndata: one\n\n'
      yield 'data: two\n'
      yield '\ndata: three\n\n[DONE]'
    }

    const events: SSEEvent[] = []
    for await (const event of readSSE(chunks())) events.push(event)

    expect(events.map(e => [e.event, e.data])).toEqual([
      ['a', 'one'],
      ['', 'two'],
      ['', 'three'],
      ['', '[DONE]'],
    ])
  })
})

// 局部类型引用，避免 tests 目录下的循环 import 报告
type SSEEvent = import('./sse.js').SSEEvent
