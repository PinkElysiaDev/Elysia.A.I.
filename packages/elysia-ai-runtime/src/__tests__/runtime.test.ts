import { describe, it, expect, vi } from 'vitest'
import { createDefaultRuntime } from '../runtime'

describe('DefaultRuntime', () => {
  it('should be created with createDefaultRuntime()', () => {
    const runtime = createDefaultRuntime()

    expect(runtime).toBeDefined()
    expect(runtime.context).toBeDefined()
    expect(runtime.lifeRegistry).toBeDefined()
    expect(runtime.habitatRegistry).toBeDefined()
    expect(runtime.lifecycle).toBeDefined()
  })

  it('should start in idle state', () => {
    const runtime = createDefaultRuntime()
    expect(runtime.getState()).toBe('idle')
  })

  it('should transition to running after start()', async () => {
    const runtime = createDefaultRuntime()
    await runtime.start()

    expect(runtime.getState()).toBe('running')
  })

  it('should transition to stopped after stop()', async () => {
    const runtime = createDefaultRuntime()
    await runtime.start()
    await runtime.stop()

    expect(runtime.getState()).toBe('stopped')
  })

  it('should emit stimulus.received event when receiving a stimulus', async () => {
    const runtime = createDefaultRuntime()
    await runtime.start()

    const handler = vi.fn()
    runtime.context.eventBus.on('stimulus.received', handler)

    await runtime.receiveStimulus({
      id: 'stim-1',
      type: 'utterance',
      habitatId: 'habitat-1',
      actorId: 'user-1',
      timestamp: Date.now(),
      payload: { content: 'hello' },
    })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0].stimulusId).toBe('stim-1')
  })

  it('should ignore stimulus when not running', async () => {
    const runtime = createDefaultRuntime()
    // 未调用 start()，runtime 仍在 idle 状态

    const handler = vi.fn()
    runtime.context.eventBus.on('stimulus.received', handler)

    await runtime.receiveStimulus({
      id: 'stim-ignored',
      type: 'utterance',
      habitatId: 'habitat-1',
      timestamp: Date.now(),
      payload: {},
    })

    expect(handler).not.toHaveBeenCalled()
  })
})
