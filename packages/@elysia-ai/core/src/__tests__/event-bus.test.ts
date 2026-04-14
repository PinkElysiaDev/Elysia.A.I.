import { describe, it, expect, vi } from 'vitest'
import { MemoryEventBus } from '../bus/memory-event-bus'
import type { CoreEventMap } from '../bus/event-map'
import type { Stimulus } from '../types/stimulus'

const createStimulus = (id: string): Stimulus => ({
  id,
  type: 'utterance',
  timestamp: Date.now(),
  habitatId: 'test-habitat',
  payload: {},
})

describe('MemoryEventBus', () => {
  it('should emit and receive events', async () => {
    const bus = new MemoryEventBus<CoreEventMap>()
    const handler = vi.fn()
    const stimulus = createStimulus('test-1')

    bus.on('stimulus.received', handler)
    await bus.emit('stimulus.received', { stimulusId: 'test-1', stimulus })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ stimulusId: 'test-1', stimulus })
  })

  it('should support multiple listeners for the same event', async () => {
    const bus = new MemoryEventBus<CoreEventMap>()
    const h1 = vi.fn()
    const h2 = vi.fn()
    const stimulus = createStimulus('test-2')

    bus.on('stimulus.received', h1)
    bus.on('stimulus.received', h2)
    await bus.emit('stimulus.received', { stimulusId: 'test-2', stimulus })

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('should not receive events after dispose() is called', async () => {
    const bus = new MemoryEventBus<CoreEventMap>()
    const handler = vi.fn()
    const stimulus = createStimulus('test-3')

    // on() 返回 dispose 函数
    const dispose = bus.on('stimulus.received', handler)
    dispose()
    await bus.emit('stimulus.received', { stimulusId: 'test-3', stimulus })

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
