import { describe, expect, it } from 'vitest'
import type { CanonicalRequest } from '@elysia-ai/canonical'
import { CONTENT_TEXT, CONTENT_TOOL_OUTPUT } from '@elysia-ai/canonical'
import {
  GeminiStreamDecoder,
  decodeGenerateContentResponse,
  encodeGenerateContentRequest,
  extractMessageText,
} from './index.js'

function sse(data: string) {
  return { event: '', data, id: '', retryMs: undefined } as const
}

describe('encodeGenerateContentRequest', () => {
  it('system 消息进 systemInstruction；assistant → model；连续同角色合并', () => {
    const req: CanonicalRequest = {
      model: 'gemini-x',
      messages: [
        { role: 'system', content: [{ type: CONTENT_TEXT, text: 'sys' }] },
        { role: 'user', content: [{ type: CONTENT_TEXT, text: 'a' }] },
        { role: 'user', content: [{ type: CONTENT_TEXT, text: 'b' }] },
      ],
      max_output_tokens: 256,
      temperature: 0.4,
    }
    const body = encodeGenerateContentRequest(req)
    expect(body['systemInstruction']).toEqual({ parts: [{ text: 'sys' }] })
    expect(body['generationConfig']).toEqual({ temperature: 0.4, maxOutputTokens: 256 })
    const contents = body['contents'] as Array<Record<string, unknown>>
    // 两条连续 user 合并为一条。
    expect(contents).toHaveLength(1)
    expect(contents[0]['role']).toBe('user')
    expect(contents[0]['parts']).toEqual([{ text: 'a' }, { text: 'b' }])
  })

  it('tool_calls → functionCall part；functionResponse 按函数名回查', () => {
    const body = encodeGenerateContentRequest({
      model: 'm',
      messages: [
        { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', name: 'f', arguments: '{"a":1}' }] },
        { role: 'user', content: [{ type: CONTENT_TOOL_OUTPUT, tool_call_id: 'c1', tool_output: '{"ok":true}' }] },
      ],
    })
    const contents = body['contents'] as Array<Record<string, unknown>>
    // 跨厂商 functionCall 无签名时注入占位签名跳过上游校验（Go 行为）。
    expect(contents[0]['parts']).toEqual([{ functionCall: { name: 'f', args: { a: 1 }, id: 'c1' }, thoughtSignature: 'skip_thought_signature_validator' }])
    expect(contents[1]['parts']).toEqual([{ functionResponse: { name: 'f', response: { ok: true }, id: 'c1' } }])
  })

  it('functionResponse 找不到对应函数名时抛错', () => {
    expect(() => encodeGenerateContentRequest({
      model: 'm',
      messages: [{ role: 'user', content: [{ type: CONTENT_TOOL_OUTPUT, tool_call_id: 'nope', tool_output: 'x' }] }],
    })).toThrow(/no matching function name/)
  })
})

describe('decodeGenerateContentResponse', () => {
  it('thought 部件与普通文本分流；functionCall 成为独立输出项', () => {
    const response = decodeGenerateContentResponse({
      responseId: 'g1', modelVersion: 'gemini-x',
      candidates: [{ content: { parts: [
        { text: '思考', thought: true, thoughtSignature: 'sig' },
        { text: '回答' },
        { functionCall: { id: 'c1', name: 'f', args: { a: 1 } } },
      ] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10, thoughtsTokenCount: 2 },
    })
    expect(response.stop_reason).toBe('STOP')
    expect(extractMessageText(response)).toBe('回答')
    const reasoning = response.output?.find((i) => i.type === 'reasoning')
    expect(reasoning?.content?.[0]?.text).toBe('思考')
    const call = response.output?.find((i) => i.type === 'function_call')
    expect(call?.name).toBe('f')
    expect(response.usage).toMatchObject({
      input_tokens: 7, output_tokens: 5, total_tokens: 10,
      reasoning_tokens: 2, cached_input_tokens: undefined,
    })
  })
})

describe('GeminiStreamDecoder', () => {
  it('文本/thought/函数调用/完成的流式序列', () => {
    const decoder = new GeminiStreamDecoder()
    const events = [
      ...decoder.decode(sse('{"candidates":[{"content":{"parts":[{"text":"你"}]},"index":0}]}')),
      ...decoder.decode(sse('{"candidates":[{"content":{"parts":[{"text":"想","thought":true}]},"index":0}]}')),
      ...decoder.decode(sse('{"candidates":[{"content":{"parts":[{"functionCall":{"id":"c1","name":"f","args":{"a":1}}}]},"index":0}]}')),
      ...decoder.decode(sse('{"candidates":[{"content":{"parts":[]},"index":0,"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2,"totalTokenCount":3}}')),
    ]
    expect(events.find((e) => e.type === 'response.output_text.delta')?.delta).toBe('你')
    expect(events.find((e) => e.type === 'response.reasoning.delta')?.reasoning_delta).toBe('想')
    expect(events.find((e) => e.type === 'response.function_call.added')?.tool_name).toBe('f')
    expect(events.find((e) => e.type === 'response.function_call_arguments.done')?.tool_arguments_done).toBe('{"a":1}')
    expect(events.find((e) => e.type === 'response.completed')?.finish_reason).toBe('STOP')
    expect(decoder.getTerminal()).toBe(true)
  })

  it('promptFeedback 拦截 → response.failed', () => {
    const decoder = new GeminiStreamDecoder()
    const events = decoder.decode(sse('{"promptFeedback":{"blockReason":"SAFETY"}}'))
    expect(events[0].type).toBe('response.failed')
    expect(events[0].error?.type).toBe('content_filter')
  })
})
