import { describe, expect, it } from 'vitest'
import type { CanonicalRequest } from '@elysia-ai/canonical'
import { CONTENT_TEXT, CONTENT_TOOL_OUTPUT } from '@elysia-ai/canonical'
import {
  AnthropicStreamDecoder,
  decodeMessagesResponse,
  encodeMessagesRequest,
  extractMessageText,
} from './index.js'

function sse(data: string) {
  return { event: '', data, id: '', retryMs: undefined } as const
}

describe('encodeMessagesRequest', () => {
  it('system/developer 消息抽到 system 字段，instructions 与其以空行拼接', () => {
    const req: CanonicalRequest = {
      model: 'claude-x',
      instructions: 'base prompt',
      messages: [
        { role: 'system', content: [{ type: CONTENT_TEXT, text: 'extra' }] },
        { role: 'user', content: [{ type: CONTENT_TEXT, text: 'hi' }] },
      ],
      max_output_tokens: 512,
      temperature: 0.3,
    }
    const body = encodeMessagesRequest(req)
    expect(body['system']).toBe('base prompt\n\nextra')
    expect(body['max_tokens']).toBe(512)
    const messages = body['messages'] as Array<Record<string, unknown>>
    expect(messages).toHaveLength(1)
    expect(messages[0]['content']).toEqual([{ type: 'text', text: 'hi' }])
  })

  it('未指定 max_tokens 时给 65536 下限', () => {
    const body = encodeMessagesRequest({ model: 'm', messages: [{ role: 'user', content: [{ type: CONTENT_TEXT, text: 'x' }] }] })
    expect(body['max_tokens']).toBe(65536)
  })

  it('开启 thinking 时强制 temperature=1 并移除 top_p', () => {
    const body = encodeMessagesRequest({
      model: 'm',
      messages: [{ role: 'user', content: [{ type: CONTENT_TEXT, text: 'x' }] }],
      temperature: 0.2,
      top_p: 0.9,
      thinking: { enabled: true, effort: 'low' },
    })
    expect(body['thinking']).toEqual({ type: 'enabled', budget_tokens: 1280 })
    expect(body['temperature']).toBe(1.0)
    expect(body['top_p']).toBeUndefined()
  })

  it('tool_calls → tool_use block；tool_output → tool_result block', () => {
    const body = encodeMessagesRequest({
      model: 'm',
      messages: [
        // P0-5 后 assistant 开头会自动补一条 user 前置消息（Claude 要求首条为 user）
        { role: 'assistant', tool_calls: [{ id: 't1', type: 'function', name: 'f', arguments: '{"a":1}' }] },
        { role: 'user', content: [{ type: CONTENT_TOOL_OUTPUT, tool_call_id: 't1', tool_output: 'done' }] },
      ],
    })
    const messages = body['messages'] as Array<Record<string, unknown>>
    expect(messages).toHaveLength(3)
    expect(messages[0]['role']).toBe('user')
    expect(messages[1]['content']).toContainEqual({ type: 'tool_use', id: 't1', name: 'f', input: { a: 1 } })
    expect(messages[2]['content']).toContainEqual({ type: 'tool_result', tool_use_id: 't1', content: 'done' })
  })
})

describe('decodeMessagesResponse', () => {
  it('text/thinking/tool_use 块 → canonical，消息项置首', () => {
    const response = decodeMessagesResponse({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-x', stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: '内幕', signature: 'sig==' },
        { type: 'text', text: '回答' },
        { type: 'tool_use', id: 't1', name: 'f', input: { a: 1 } },
      ],
      usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 3 },
    })
    expect(response.output?.[0]?.type).toBe('message')
    expect(extractMessageText(response)).toBe('回答')
    expect(response.output?.map((i) => i.type)).toEqual(expect.arrayContaining(['message', 'reasoning', 'function_call']))
    expect(response.stop_reason).toBe('end_turn')
    expect(response.usage).toMatchObject({ input_tokens: 13, output_tokens: 4, total_tokens: 17, cached_input_tokens: 3 })
  })
})

describe('AnthropicStreamDecoder', () => {
  it('message_start → 文本增量 → 工具参数拼装 → message_delta 完成序列', () => {
    const decoder = new AnthropicStreamDecoder()
    const events = [
      ...decoder.decode(sse('{"type":"message_start","message":{"id":"msg_1","model":"claude-x","role":"assistant","usage":{"input_tokens":5,"output_tokens":1}}}')),
      ...decoder.decode(sse('{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}')),
      ...decoder.decode(sse('{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}')),
      ...decoder.decode(sse('{"type":"content_block_stop","index":0}')),
      ...decoder.decode(sse('{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"f"}}')),
      ...decoder.decode(sse('{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"a\\":"}}')),
      ...decoder.decode(sse('{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"1}"}}')),
      ...decoder.decode(sse('{"type":"content_block_stop","index":1}')),
      ...decoder.decode(sse('{"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":9}}')),
    ]
    expect(events.find((e) => e.type === 'response.created')?.response_id).toBe('msg_1')
    expect(events.find((e) => e.type === 'response.output_text.delta')?.delta).toBe('你好')
    const done = events.find((e) => e.type === 'response.function_call_arguments.done')
    expect(done?.tool_arguments_done).toBe('{"a":1}')
    expect(done?.tool_call_id).toBe('t1')
    const completed = events.find((e) => e.type === 'response.completed')
    expect(completed?.finish_reason).toBe('tool_use')
    expect(decoder.getTerminal()).toBe(true)
  })

  it('thinking 增量与签名增量分别映射', () => {
    const decoder = new AnthropicStreamDecoder()
    const events = [
      ...decoder.decode(sse('{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}')),
      ...decoder.decode(sse('{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"想"}}')),
      ...decoder.decode(sse('{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig=="}}')),
    ]
    expect(events.find((e) => e.type === 'response.reasoning.delta')?.reasoning_delta).toBe('想')
    expect(events.find((e) => e.type === 'response.reasoning_signature.delta')?.reasoning_signature_delta).toBe('sig==')
  })

  it('ping 事件被忽略', () => {
    const decoder = new AnthropicStreamDecoder()
    expect(decoder.decode(sse('{"type":"ping"}'))).toEqual([])
  })
})

// ─────────────────────────────────────────────────
// P0-5：Claude 角色交替 / 字段严格性回归
// ─────────────────────────────────────────────────

describe('encodeMessagesRequest Claude 角色交替（P0-5）', () => {
  it('system 剔除后相邻同角色消息合并为一条', () => {
    const body = encodeMessagesRequest({
      model: 'm',
      messages: [
        { role: 'user', content: [{ type: CONTENT_TEXT, text: 'a' }] },
        { role: 'system', content: [{ type: CONTENT_TEXT, text: 'mid-system' }] },
        { role: 'user', content: [{ type: CONTENT_TEXT, text: 'b' }] },
        { role: 'assistant', content: [{ type: CONTENT_TEXT, text: 'ok' }] },
      ],
    })
    const messages = body['messages'] as Array<{ role: string; content: Array<{ type: string; text?: string }> }>
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(messages[0].content).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ])
  })

  it('assistant 开头时补一条 user 前置消息（Claude 要求首条为 user）', () => {
    const body = encodeMessagesRequest({
      model: 'm',
      messages: [
        { role: 'assistant', content: [{ type: CONTENT_TEXT, text: 'hello?' }] },
        { role: 'user', content: [{ type: CONTENT_TEXT, text: 'hi' }] },
      ],
    })
    const messages = body['messages'] as Array<{ role: string }>
    expect(messages[0].role).toBe('user')
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('消息级不输出 name/metadata/cache_control（Claude 严格校验会 400）', () => {
    const body = encodeMessagesRequest({
      model: 'm',
      messages: [{
        role: 'user',
        name: 'alice',
        metadata: { x: 1 },
        cache_control: { type: 'ephemeral' },
        content: [{ type: CONTENT_TEXT, text: 'hi' }],
      }],
    })
    const messages = body['messages'] as Array<Record<string, unknown>>
    expect(Object.keys(messages[0]).sort()).toEqual(['content', 'role'])
  })

  it('tool_use.id 缺失时合成确定性 id', () => {
    const body = encodeMessagesRequest({
      model: 'm',
      messages: [
        { role: 'user', content: [{ type: CONTENT_TEXT, text: 'go' }] },
        { role: 'assistant', tool_calls: [{ id: '', type: 'function', name: 'f', arguments: '{}' }] },
      ],
    })
    const messages = body['messages'] as Array<{ role: string; content: Array<Record<string, unknown>> }>
    const toolUse = messages[1].content.find((block) => block['type'] === 'tool_use')
    expect(typeof toolUse?.['id']).toBe('string')
    expect((toolUse?.['id'] as string).length).toBeGreaterThan(0)
  })

  it('OpenAI 形态工具结果（role:tool + tool_call_id + 纯文本）映射为 tool_result block', () => {
    const body = encodeMessagesRequest({
      model: 'm',
      messages: [
        { role: 'assistant', tool_calls: [{ id: 'call-9', type: 'function', name: 'f', arguments: '{}' }] },
        { role: 'tool', tool_call_id: 'call-9', content: [{ type: CONTENT_TEXT, text: 'result payload' }] },
      ],
    })
    const messages = body['messages'] as Array<{ role: string; content: Array<Record<string, unknown>> }>
    // assistant 开头被补了 user 前置：[user(start), assistant(tool_use), user(tool_result)]
    const toolResult = messages[2].content.find((block) => block['type'] === 'tool_result')
    expect(toolResult).toBeDefined()
    expect(toolResult?.['tool_use_id']).toBe('call-9')
  })

  it('stop 为单字符串时归一为 stop_sequences 数组', () => {
    const body = encodeMessagesRequest({
      model: 'm',
      stop: 'END',
      messages: [{ role: 'user', content: [{ type: CONTENT_TEXT, text: 'x' }] }],
    })
    expect(body['stop_sequences']).toEqual(['END'])
  })
})
