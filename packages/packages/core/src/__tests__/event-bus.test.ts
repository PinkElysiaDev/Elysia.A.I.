import { describe, it, expect, vi } from 'vitest'
import { MemoryEventBus } from '../bus/memory-event-bus'
import type { CoreEventMap } from '../bus/event-map'

describe('MemoryEventBus', () => {
  it('should emit and receive events', async () => {
    const bus = new MemoryEventBus<CoreEventMap>()
    const handler = vi.fn()

    bus.on('stimulus.received', handler)
    await bus.emit('stimulus.received', { stimulusId: 'test-1' })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ stimulusId: 'test-1' })
  })

  it('should support multiple listeners for the same event', async () => {
    const bus = new MemoryEventBus<CoreEventMap>()
    const h1 = vi.fn()
    const h2 = vi.fn()

    bus.on('stimulus.received', h1)
    bus.on('stimulus.received', h2)
    await bus.emit('stimulus.received', { stimulusId: 'test-2' })

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('should not receive events after dispose() is called', async () => {
    const bus = new MemoryEventBus<CoreEventMap>()
    const handler = vi.fn()

    // on() 返回 dispose 函数
    const dispose = bus.on('stimulus.received', handler)
    dispose()
    await bus.emit('stimulus.received', { stimulusId: 'test-3' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('should emit runtime lifecycle events', async () => {
    const bus = new MemoryEventBus<CoreEventMap>()
    const handler = vi.fn()

    bus.on('runtime.started', handler)
    await bus.emit('runtime.started', { timestamp: Date.now() })

    expect(handler).toHaveBeenCalledOnce()
  })

  it('should emit life.loaded event', async () => {
    const bus = new MemoryEventBus<CoreEventMap>()
    const handler = vi.fn()

    bus.on('life.loaded', handler)
    await bus.emit('life.loaded', {
      lifeId: 'test-life',
      type: 'elysia-default',
      config: { id: 'test-life', type: 'elysia-default' },
    })

    expect(handler).toHaveBeenCalledOnce()
    const call = handler.mock.calls[0][0]
    expect(call.lifeId).toBe('test-life')
    expect(call.type).toBe('elysia-default')
  })
})
