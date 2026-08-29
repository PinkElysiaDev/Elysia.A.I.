import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DialogueMessage } from '@elysia-ai/core'
import { createAnthropicProvider } from './anthropic.js'
import { createChatCompletionsProvider } from './chat-completions.js'
import { createGeminiProvider } from './gemini.js'
import { createResponsesProvider } from './responses.js'

const messages: DialogueMessage[] = [
  { role: 'system', content: '你是助手' },
  { role: 'user', content: '你好' },
]

function mockFetch(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(payload),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('网关 provider 基于协议包的端到端链路', () => {
  it('chat-completions：encode → fetch → decode 全链路', async () => {
    const fetchMock = mockFetch({
      id: 'chatcmpl-1', object: 'chat.completion', created: 1755400000, model: 'gpt-4o',
      choices: [{ index: 0, message: { role: 'assistant', content: '回复' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    })
    const provider = createChatCompletionsProvider({
      id: 'p1', type: 'chat-completions', apiKey: 'sk-x', baseURL: 'https://api.example.com', model: 'gpt-4o',
      maxTokens: 256, temperature: 0.2,
    })
    const response = await provider.execute({ messages })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    const sentBody = JSON.parse(init.body as string)
    // canonical 桥接：system 保留、user 单文本折叠回字符串。
    expect(sentBody.messages).toEqual([
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '你好' },
    ])
    expect(sentBody.max_tokens).toBe(256)
    expect(sentBody.temperature).toBe(0.2)
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-x')

    expect(response.output).toBe('回复')
    expect(response.finishReason).toBe('stop')
    expect(response.usage).toEqual({ inputTokens: 4, outputTokens: 2, totalTokens: 6 })
    expect(response.messages).toHaveLength(3)
    expect(response.messages?.[2]).toEqual({ role: 'assistant', content: '回复' })
  })

  it('anthropic：system 抽取与 text block 解析', async () => {
    const fetchMock = mockFetch({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-x', stop_reason: 'end_turn',
      content: [{ type: 'text', text: '答' }],
      usage: { input_tokens: 3, output_tokens: 1 },
    })
    const provider = createAnthropicProvider({
      id: 'p2', type: 'anthropic', apiKey: 'k', baseURL: 'https://api.example.com', model: 'claude-x',
    })
    const response = await provider.execute({ messages })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/messages')
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.system).toBe('你是助手')
    expect(sentBody.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: '你好' }] }])
    expect(sentBody.max_tokens).toBe(4096)
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k')

    expect(response.output).toBe('答')
    expect(response.finishReason).toBe('stop')
    expect(response.usage).toEqual({ inputTokens: 3, outputTokens: 1, totalTokens: 4 })
  })

  it('gemini：systemInstruction 与 finishReason 归一化', async () => {
    const fetchMock = mockFetch({
      responseId: 'g1', modelVersion: 'gemini-x',
      candidates: [{ content: { parts: [{ text: '答' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1, totalTokenCount: 3 },
    })
    const provider = createGeminiProvider({
      id: 'p3', type: 'gemini', apiKey: 'gk', baseURL: 'https://api.example.com', model: 'gemini-x',
    })
    const response = await provider.execute({ messages })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1beta/models/gemini-x:generateContent?key=gk')
    expect(response.output).toBe('答')
    expect(response.finishReason).toBe('stop')
    expect(response.usage).toEqual({ inputTokens: 2, outputTokens: 1, totalTokens: 3 })
  })

  it('responses：input 数组与 output_text 提取', async () => {
    const fetchMock = mockFetch({
      id: 'resp_1', object: 'response', status: 'completed', model: 'gpt-5', created_at: 1755400000,
      output: [{ id: 'msg_1', type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: '答' }] }],
      usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
    })
    const provider = createResponsesProvider({
      id: 'p4', type: 'responses', apiKey: 'sk', baseURL: 'https://api.example.com', model: 'gpt-5',
    })
    const response = await provider.execute({ messages })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/responses')
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.instructions).toBe('你是助手')
    expect(sentBody.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: '你好' }] }])
    expect(response.output).toBe('答')
    // P1-11：completed 状态归一化为统一词表 'stop'，而非裸生命周期状态
    expect(response.finishReason).toBe('stop')
    expect(response.usage).toEqual({ inputTokens: 5, outputTokens: 2, totalTokens: 7 })
  })
})
