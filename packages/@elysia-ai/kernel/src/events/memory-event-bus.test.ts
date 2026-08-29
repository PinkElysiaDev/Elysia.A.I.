import { describe, expect, it } from 'vitest'
import { MemoryEventBus } from './memory-event-bus.js'

interface TestEvents {
  'a.happened': { value: number }
  'b.happened': { text: string }
}

describe('MemoryEventBus', () => {
  it('onAny 捕获全部事件（名称+载荷）', async () => {
    const bus = new MemoryEventBus<TestEvents>()
    const seen: Array<[string, unknown]> = []
    bus.onAny((event, payload) => seen.push([event, payload]))
    await bus.emit('a.happened', { value: 1 })
    await bus.emit('b.happened', { text: 'x' })
    expect(seen).toEqual([
      ['a.happened', { value: 1 }],
      ['b.happened', { text: 'x' }],
    ])
  })

  it('onAny 抛错不影响具名订阅者，具名抛错不影响 onAny 与其他订阅者', async () => {
    const bus = new MemoryEventBus<TestEvents>()
    const order: string[] = []
    bus.onAny(() => {
      order.push('any')
      throw new Error('any handler boom')
    })
    bus.on('a.happened', () => {
      order.push('first')
      throw new Error('listener boom')
    })
    bus.on('a.happened', () => {
      order.push('second')
    })
    await expect(bus.emit('a.happened', { value: 1 })).resolves.toBeUndefined()
    expect(order).toEqual(['any', 'first', 'second'])
  })

  it('onAny 取消订阅后不再收到事件', async () => {
    const bus = new MemoryEventBus<TestEvents>()
    let count = 0
    const off = bus.onAny(() => count++)
    await bus.emit('a.happened', { value: 1 })
    off()
    await bus.emit('a.happened', { value: 2 })
    expect(count).toBe(1)
  })

  it('once 只触发一次', async () => {
    const bus = new MemoryEventBus<TestEvents>()
    let count = 0
    bus.once('a.happened', () => count++)
    await bus.emit('a.happened', { value: 1 })
    await bus.emit('a.happened', { value: 2 })
    expect(count).toBe(1)
  })
})
