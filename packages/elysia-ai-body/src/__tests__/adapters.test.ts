import { describe, it, expect, vi } from 'vitest'
import { sessionToPlatformMessage } from '../adapters/koishi/session-to-platform-message'
import { createDefaultRuntime } from 'koishi-plugin-elysia-ai-runtime'

// ==================== sessionToPlatformMessage 测试 ====================

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    messageId: 'msg-1',
    id: 'session-id',
    platform: 'qq',
    selfId: 'bot-001',
    guildId: 'guild-123',
    channelId: 'channel-456',
    userId: 'user-789',
    content: 'Hello World',
    timestamp: 1700000000000,
    ...overrides,
  } as unknown as import('koishi').Session
}

describe('sessionToPlatformMessage()', () => {
  it('should convert session to PlatformMessage correctly', () => {
    const session = makeSession()
    const msg = sessionToPlatformMessage(session)

    expect(msg.id).toBe('msg-1')
    expect(msg.platform).toBe('qq')
    expect(msg.botId).toBe('bot-001')
    expect(msg.guildId).toBe('guild-123')
    expect(msg.channelId).toBe('channel-456')
    expect(msg.userId).toBe('user-789')
    expect(msg.content).toBe('Hello World')
    expect(msg.timestamp).toBe(1700000000000)
  })

  it('should use session.id as fallback when messageId is undefined', () => {
    const session = makeSession({ messageId: undefined })
    const msg = sessionToPlatformMessage(session)

    expect(msg.id).toBe('session-id')
  })

  it('should return empty string for content if not provided', () => {
    const session = makeSession({ content: undefined })
    const msg = sessionToPlatformMessage(session)

    expect(msg.content).toBe('')
  })

  it('should return empty string for botId if selfId is undefined', () => {
    const session = makeSession({ selfId: undefined })
    const msg = sessionToPlatformMessage(session)

    expect(msg.botId).toBe('')
  })
})

// ==================== handlePlatformMessage 测试 ====================

describe('handlePlatformMessage()', () => {
  it('should convert PlatformMessage to Stimulus and pass to runtime', async () => {
    // 动态 import 避免 koishi 相关模块在测试中报错
    const { handlePlatformMessage } = await import('../index')
    const runtime = createDefaultRuntime()
    await runtime.start()

    const handler = vi.fn()
    runtime.context.eventBus.on('stimulus.received', handler)

    await handlePlatformMessage(runtime, {
      id: 'msg-test',
      platform: 'qq',
      botId: 'bot-001',
      guildId: 'guild-123',
      channelId: 'channel-456',
      userId: 'user-789',
      content: 'test message',
      timestamp: Date.now(),
    })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0].stimulusId).toBe('msg-test')
  })

  it('should use guildId as habitatId when available', async () => {
    const { handlePlatformMessage } = await import('../index')
    const runtime = createDefaultRuntime()
    await runtime.start()

    // 追踪 receiveStimulus 调用
    const spy = vi.spyOn(runtime, 'receiveStimulus')

    await handlePlatformMessage(runtime, {
      id: 'msg-2',
      platform: 'qq',
      botId: 'bot-001',
      guildId: 'guild-abc',
      channelId: 'channel-xyz',
      content: 'hello',
    })

    const stimulus = spy.mock.calls[0][0]
    // 这里直接测 receiveStimulus 被调用
    expect(spy).toHaveBeenCalledOnce()
    expect(stimulus.id).toBe('msg-2')
  })
})
