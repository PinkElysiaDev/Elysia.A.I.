import { describe, expect, it } from 'vitest'
import type {
  MaheshvaraRequest,
  MaheshvaraResponse,
  MaheshvaraStreamEvent,
  MaheshvaraUsage,
} from './maheshvara.js'

/**
 * 字段名保真测试：maheshvara 是 Go（Elysia-Api）与 TS 共享的线上规范，
 * JSON 字段名必须与 maheshvara.go 的 json 标签完全一致（snake_case），
 * golden fixture 才能在两侧测试里通用。
 */
describe('maheshvara 类型 JSON 字段名保真', () => {
  it('请求序列化保持 snake_case 字段名', () => {
    const request: MaheshvaraRequest = {
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: 'https://x' }] },
      ],
      max_output_tokens: 128,
      temperature: 0.7,
      stream: true,
      stream_options: { include_usage: true },
      tools: [{ type: 'function', name: 'get_time', parameters: { type: 'object' } }],
      thinking: { enabled: true, budget_tokens: 1024 },
    }
    const json = JSON.parse(JSON.stringify(request))
    expect(json).toHaveProperty('max_output_tokens', 128)
    expect(json).toHaveProperty('stream_options.include_usage', true)
    expect(json).toHaveProperty('tools[0].parameters.type', 'object')
    expect(json).toHaveProperty('thinking.budget_tokens', 1024)
    expect(json.messages[0].content[1]).toEqual({ type: 'image_url', image_url: 'https://x' })
  })

  it('JSON.parse 的线上对象可直接断言为 maheshvara 类型（无映射层）', () => {
    const wire = `{
      "id": "resp_1", "model": "claude-x", "created_at": 1755400000, "status": "completed",
      "output": [{ "type": "message", "role": "assistant", "content": [{ "type": "text", "text": "hello" }] }],
      "stop_reason": "stop",
      "usage": { "input_tokens": 10, "output_tokens": 5, "total_tokens": 15, "cache_creation_input_tokens": 3 }
    }`
    const response: MaheshvaraResponse = JSON.parse(wire)
    expect(response.usage?.input_tokens).toBe(10)
    expect(response.usage?.cache_creation_input_tokens).toBe(3)
    expect(response.output?.[0]?.content?.[0]?.text).toBe('hello')
  })

  it('流事件与用量类型可承载完整字段集', () => {
    const usage: MaheshvaraUsage = {
      input_tokens: 1, output_tokens: 2, total_tokens: 3,
      cached_input_tokens: 1, reasoning_tokens: 2,
      audio_input_tokens: 3, web_search_call_count: 1,
      estimated: false, source: 'upstream',
    }
    const event: MaheshvaraStreamEvent = {
      type: 'message_delta', delta: 'x', tool_call_id: 'call_1',
      tool_arguments_delta: '{"a"', finish_reason: 'stop',
      usage, choice_index: 0, sequence: 7,
    }
    expect(event.usage?.web_search_call_count).toBe(1)
    expect(event.tool_arguments_delta).toBe('{"a"')
  })
})
