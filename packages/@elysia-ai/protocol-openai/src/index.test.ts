import { describe, expect, it } from 'vitest'
import type { CanonicalRequest } from '@elysia-ai/canonical'
import { CONTENT_IMAGE, CONTENT_TEXT, CONTENT_TOOL_OUTPUT } from '@elysia-ai/canonical'
import {
  ChatCompletionsStreamDecoder,
  decodeChatCompletionsResponse,
  encodeChatCompletionsRequest,
  extractMessageText,
} from './index.js'

function sse(data: string) {
  return { event: '', data, id: '', retryMs: undefined } as const
}

describe('encodeChatCompletionsRequest', () => {
  it('基础消息：system 保留、单文本部件折叠回字符串', () => {
    const req: CanonicalRequest = {
      model: 'gpt-4o',
      instructions: 'be nice',
      messages: [
        { role: 'system', content: [{ type: CONTENT_TEXT, text: 'extra sys' }] },
        { role: 'user', content: [{ type: CONTENT_TEXT, text: 'hi' }] },
      ],
      max_output_tokens: 128,
      temperature: 0.5,
    }
    const body = encodeChatCompletionsRequest(req)
    expect(body['model']).toBe('gpt-4o')
    expect(body['max_tokens']).toBe(128)
    expect(body['temperature']).toBe(0.5)
    const messages = body['messages'] as Array<Record<string, unknown>>
    // instructions 变成首条 system；原 system 消息原样保留（Go 行为）。
    expect(messages[0]).toEqual({ role: 'system', content: 'be nice' })
    expect(messages[1]).toEqual({ role: 'system', content: 'extra sys' })
    expect(messages[2]).toEqual({ role: 'user', content: 'hi' })
  })

  it('stream=true 时注入 stream_options.include_usage', () => {
    const body = encodeChatCompletionsRequest({ model: 'm', messages: [], stream: true })
    expect(body['stream']).toBe(true)
    expect(body['stream_options']).toEqual({ include_usage: true })
  })

  it('图片部件 → image_url data URI', () => {
    const body = encodeChatCompletionsRequest({
      model: 'm',
      messages: [{ role: 'user', content: [
        { type: CONTENT_TEXT, text: '看图' },
        { type: CONTENT_IMAGE, image_base64: 'QUJD', media_type: 'image/png' },
      ] }],
    })
    const messages = body['messages'] as Array<Record<string, unknown>>
    expect(messages[0]['content']).toEqual([
      { type: 'text', text: '看图' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
    ])
  })

  it('tool_calls 缺 id 时合成确定性 ID；tool_output 变 role:"tool" 消息', () => {
    const body = encodeChatCompletionsRequest({
      model: 'm',
      messages: [
        { role: 'assistant', tool_calls: [{ id: '', type: 'function', name: 'get_time', arguments: '{}' }] },
        { role: 'user', content: [{ type: CONTENT_TOOL_OUTPUT, tool_call_id: 'call_0_0', tool_output: '12:00' }] },
      ],
    })
    const messages = body['messages'] as Array<Record<string, unknown>>
    const assistant = messages.find((m) => m['role'] === 'assistant')!
    expect((assistant['tool_calls'] as any[])[0]['id']).toBe('call_0_0')
    const tool = messages.find((m) => m['role'] === 'tool')!
    expect(tool).toEqual({ role: 'tool', tool_call_id: 'call_0_0', content: '12:00' })
  })
})

describe('decodeChatCompletionsResponse', () => {
  it('典型响应 → canonical（消息项 + usage + finish）', () => {
    const response = decodeChatCompletionsResponse({
      id: 'chatcmpl-1', object: 'chat.completion', created: 1755400000, model: 'gpt-4o',
      choices: [{ index: 0, message: { role: 'assistant', content: '你好' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })
    expect(response.id).toBe('chatcmpl-1')
    expect(response.stop_reason).toBe('stop')
    expect(response.usage).toMatchObject({ input_tokens: 10, output_tokens: 5, total_tokens: 15 })
    expect(extractMessageText(response)).toBe('你好')
  })

  it('reasoning_content 与 tool_calls 分别成为独立输出项', () => {
    const response = decodeChatCompletionsResponse({
      id: 'x', model: 'm',
      choices: [{ index: 0, finish_reason: 'tool_calls', message: {
        role: 'assistant', content: null, reasoning_content: '思考中',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'f', arguments: '{"a":1}' } }],
      } }],
    })
    const types = response.output?.map((item) => item.type)
    expect(types).toContain('reasoning')
    expect(types).toContain('function_call')
    const call = response.output?.find((item) => item.type === 'function_call')
    expect(call?.name).toBe('f')
    expect(call?.arguments).toBe('{"a":1}')
  })
})

describe('ChatCompletionsStreamDecoder', () => {
  it('文本增量 → 完成 → [DONE] 的标准序列', () => {
    const decoder = new ChatCompletionsStreamDecoder()
    const events = [
      ...decoder.decode(sse('{"id":"c1","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"}}]}')),
      ...decoder.decode(sse('{"id":"c1","choices":[{"index":0,"delta":{"content":"你"}}]}')),
      ...decoder.decode(sse('{"id":"c1","choices":[{"index":0,"delta":{"content":"好"}}]}')),
      ...decoder.decode(sse('{"id":"c1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}')),
      ...decoder.decode(sse('[DONE]')),
    ]
    expect(events.filter((e) => e.type === 'response.output_text.delta').map((e) => e.delta)).toEqual(['你', '好'])
    const completed = events.find((e) => e.type === 'response.completed')
    expect(completed?.finish_reason).toBe('stop')
    expect(decoder.getTerminal()).toBe(true)
    expect(events.find((e) => e.type === 'response.usage.delta')?.usage).toMatchObject({ input_tokens: 3, output_tokens: 2 })
  })

  it('工具调用增量跨事件拼装并在 finish 时补 arguments_done', () => {
    const decoder = new ChatCompletionsStreamDecoder()
    const events = [
      ...decoder.decode(sse('{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_9","type":"function","function":{"name":"f","arguments":""}}]}}]}')),
      ...decoder.decode(sse('{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":"}}]}}]}')),
      ...decoder.decode(sse('{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}')),
      ...decoder.decode(sse('{"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}')),
    ]
    expect(events.find((e) => e.type === 'response.function_call.added')?.tool_name).toBe('f')
    const deltas = events.filter((e) => e.type === 'response.function_call_arguments.delta')
    expect(deltas.map((e) => e.tool_arguments_delta).join('')).toBe('{"a":1}')
    const done = events.find((e) => e.type === 'response.function_call_arguments.done')
    expect(done?.tool_arguments_done).toBe('{"a":1}')
    expect(done?.tool_call_id).toBe('call_9')
  })

  it('reasoning_content 增量映射为 reasoning delta', () => {
    const decoder = new ChatCompletionsStreamDecoder()
    const events = decoder.decode(sse('{"choices":[{"index":0,"delta":{"reasoning_content":"想一想"}}]}'))
    expect(events[0].type).toBe('response.reasoning.delta')
    expect(events[0].reasoning_delta).toBe('想一想')
  })
})
