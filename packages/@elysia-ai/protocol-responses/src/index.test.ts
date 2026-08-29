import { describe, expect, it } from 'vitest'
import type { CanonicalRequest } from '@elysia-ai/canonical'
import { CONTENT_TEXT } from '@elysia-ai/canonical'
import {
  ResponsesStreamDecoder,
  decodeResponsesResponse,
  encodeResponsesRequest,
  extractMessageText,
} from './index.js'

function sse(data: string) {
  return { event: '', data, id: '', retryMs: undefined } as const
}

describe('encodeResponsesRequest', () => {
  it('消息 → input 数组（system 剔除进 instructions）', () => {
    const req: CanonicalRequest = {
      model: 'gpt-5',
      instructions: 'sys prompt',
      messages: [
        { role: 'system', content: [{ type: CONTENT_TEXT, text: 'more sys' }] },
        { role: 'user', content: [{ type: CONTENT_TEXT, text: 'hi' }] },
        { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', name: 'f', arguments: '{"a":1}' }] },
      ],
      max_output_tokens: 100,
    }
    const body = encodeResponsesRequest(req)
    expect(body['instructions']).toBe('sys prompt\n\nmore sys')
    expect(body['max_output_tokens']).toBe(100)
    const input = body['input'] as Array<Record<string, unknown>>
    expect(input[0]).toEqual({ role: 'user', content: [{ type: 'input_text', text: 'hi' }] })
    expect(input[1]).toEqual({ type: 'function_call', call_id: 'c1', name: 'f', arguments: '{"a":1}' })
  })

  it('original 基底保留未建模字段', () => {
    const body = encodeResponsesRequest(
      { model: 'm2', messages: [{ role: 'user', content: [{ type: CONTENT_TEXT, text: 'x' }] }] },
      { model: 'm1', background: true, custom_field: 'keep' },
    )
    expect(body['model']).toBe('m2')
    expect(body['background']).toBe(true)
    expect(body['custom_field']).toBe('keep')
  })
})

describe('decodeResponsesResponse', () => {
  it('message/reasoning/function_call 输出项 + usage details', () => {
    const response = decodeResponsesResponse({
      id: 'resp_1', object: 'response', status: 'completed', model: 'gpt-5', created_at: 1755400000,
      output: [
        { id: 'rs_1', type: 'reasoning', status: 'completed', summary: [{ type: 'summary_text', text: '摘要' }], encrypted_content: 'enc' },
        { id: 'msg_1', type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: '答案', annotations: [] }] },
        { id: 'fc_1', type: 'function_call', status: 'completed', call_id: 'c1', name: 'f', arguments: '{"a":1}' },
      ],
      usage: { input_tokens: 8, output_tokens: 6, total_tokens: 14, input_tokens_details: { cached_tokens: 4 }, output_tokens_details: { reasoning_tokens: 5 } },
    })
    expect(response.status).toBe('completed')
    expect(extractMessageText(response)).toBe('答案')
    const reasoning = response.output?.find((i) => i.type === 'reasoning')
    expect(reasoning?.reasoning?.text).toBe('摘要')
    expect(reasoning?.reasoning?.encrypted_content).toBe('enc')
    expect(response.usage).toMatchObject({ input_tokens: 8, output_tokens: 6, total_tokens: 14, cached_input_tokens: 4, reasoning_tokens: 5 })
  })
})

describe('ResponsesStreamDecoder', () => {
  it('created → 文本增量 → 完成（带 usage 前置）的标准序列', () => {
    const decoder = new ResponsesStreamDecoder()
    const events = [
      ...decoder.decode(sse('{"type":"response.created","response":{"id":"resp_1","model":"gpt-5","status":"in_progress"}}')),
      ...decoder.decode(sse('{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_1","type":"message","role":"assistant","status":"in_progress"}}')),
      ...decoder.decode(sse('{"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"你"}')),
      ...decoder.decode(sse('{"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"好"}')),
      ...decoder.decode(sse('{"type":"response.completed","response":{"id":"resp_1","status":"completed","model":"gpt-5","output":[],"usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}}')),
    ]
    expect(events[0].type).toBe('response.created')
    expect(events[0].response_id).toBe('resp_1')
    const deltas = events.filter((e) => e.type === 'response.output_text.delta')
    expect(deltas.map((e) => e.delta)).toEqual(['你', '好'])
    const usageEvent = events.find((e) => e.type === 'response.usage.delta')
    expect(usageEvent?.usage).toMatchObject({ input_tokens: 3, output_tokens: 2 })
    const completed = events.find((e) => e.type === 'response.completed')
    expect(completed?.response?.status).toBe('completed')
    expect(decoder.getTerminal()).toBe(true)
  })

  it('function_call_arguments 增量与完成', () => {
    const decoder = new ResponsesStreamDecoder()
    const events = [
      ...decoder.decode(sse('{"type":"response.function_call_arguments.delta","output_index":0,"call_id":"c1","name":"f","delta":"{\\"a\\":"}')),
      ...decoder.decode(sse('{"type":"response.function_call_arguments.done","output_index":0,"call_id":"c1","name":"f","arguments":"{\\"a\\":1}"}')),
    ]
    expect(events[0].tool_arguments_delta).toBe('{"a":')
    expect(events[1].tool_arguments_done).toBe('{"a":1}')
    expect(events[1].tool_call_id).toBe('c1')
  })

  it('error 事件 → response.failed', () => {
    const decoder = new ResponsesStreamDecoder()
    const events = decoder.decode(sse('{"type":"error","error":{"message":"boom","code":"500"}}'))
    expect(events[0].type).toBe('response.failed')
    expect(events[0].error?.message).toBe('boom')
    expect(decoder.getTerminal()).toBe(true)
  })
})
