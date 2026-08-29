import { describe, it, expect, vi } from 'vitest'
import { KoishiBodyAdapter } from '../adapters/koishi/koishi-body-adapter.js'
import { createDefaultRuntime } from 'koishi-plugin-elysia-ai-runtime'

// 自消息过滤：OneBot 等适配器会把 bot 自己发出的 message_sent 也派发为
// 'message' 事件，body 若不过滤会把自己的回复当刺激再次感知，
// 形成自言自语死循环（P0-1）。

function createMessageCapturingContext() {
  let messageHandler: ((session: unknown) => Promise<void>) | undefined
  const ctx: any = {
    logger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    on(event: string, handler: (session: unknown) => Promise<void>) {
      if (event === 'message') messageHandler = handler
      return () => {}
    },
  }
  return {
    ctx,
    dispatch: (session: unknown) => {
      if (!messageHandler) throw new Error('message listener not registered')
      return messageHandler(session)
    },
  }
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    messageId: 'm1',
    platform: 'onebot',
    selfId: 'bot-1',
    channelId: 'c1',
    userId: 'u1',
    content: 'hi',
    timestamp: 1700000000000,
    ...overrides,
  }
}

describe('KoishiBodyAdapter self-message filtering', () => {
  it('忽略 bot 自身消息，不注入 runtime（防自回复死循环）', async () => {
    const { ctx, dispatch } = createMessageCapturingContext()
    const runtime = createDefaultRuntime()
    const spy = vi.spyOn(runtime, 'receiveStimulus')
    const adapter = new KoishiBodyAdapter(ctx, runtime)
    adapter.registerListeners()

    await dispatch(makeSession({ userId: 'bot-1', messageId: 'self-msg' }))

    expect(spy).not.toHaveBeenCalled()
  })

  it('正常用户消息仍会注入 runtime', async () => {
    const { ctx, dispatch } = createMessageCapturingContext()
    const runtime = createDefaultRuntime()
    const spy = vi.spyOn(runtime, 'receiveStimulus')
    const adapter = new KoishiBodyAdapter(ctx, runtime)
    adapter.registerListeners()

    await dispatch(makeSession({ userId: 'user-9', messageId: 'user-msg' }))

    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0].id).toBe('user-msg')
  })
})
