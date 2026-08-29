import { describe, expect, it } from 'vitest'
import { MemoryEventBus } from '@elysia-ai/core'
import type { CoreEventMap } from '@elysia-ai/core'
import { DefaultObservatoryService } from './service.js'
import { createObservatoryPluginRuntime } from './index.js'

/**
 * Phase 43（P5）验收：runtime.trace.completed 事实事件经 onAny 分流进入
 * trace 环形缓冲；facade 的 getRecentTraces 可按 stimulusId 过滤。
 */

const logger = { info() {}, debug() {}, warn() {}, error() {} }

describe('trace 汇聚', () => {
  it('runtime.trace.completed 进入 trace 缓冲并照常记为事件', async () => {
    const eventBus = new MemoryEventBus<CoreEventMap>()
    const observatoryRuntime = createObservatoryPluginRuntime({
      runtime: { context: { eventBus } },
      config: {},
      logger,
    })
    expect(observatoryRuntime).toBeDefined()
    const facade = observatoryRuntime!.service
    const internal = facade.service

    // 模拟 runtime 发出的 trace 完成事件（onAny 分流）。
    await eventBus.emit('runtime.trace.completed' as never, {
      stimulusId: 'stim-1',
      kind: 'stimulus',
      root: { name: 'root', startedAt: 1, endedAt: 2, status: 'ok', children: [{ name: 'stage:perception', startedAt: 1, endedAt: 2, status: 'ok', children: [] }] },
      events: [{ kind: 'context-write', namespace: 'perception', action: 'write', at: 1 }],
    } as never)

    const traces = internal.getRecentTraces()
    expect(traces).toHaveLength(1)
    expect(traces[0].stimulusId).toBe('stim-1')
    expect((traces[0].root as { children: unknown[] }).children).toHaveLength(1)
    expect(traces[0].events).toHaveLength(1)

    // 事件侧照常记录 + facade 查询透出。
    expect(internal.queryEvents({ event: 'runtime.trace.completed' } as never)).toHaveLength(1)
    expect(facade.getRecentTraces?.({ stimulusId: 'stim-1' })).toHaveLength(1)
  })

  it('环形缓冲截断与 stimulusId 过滤（直接驱动 service）', () => {
    const service = new DefaultObservatoryService(500)
    for (let i = 0; i < 12; i++) {
      service.recordTrace({
        stimulusId: `stim-${i}`,
        kind: 'stimulus',
        root: { children: [] },
        events: [],
      })
    }
    expect(service.getRecentTraces({ limit: 5 })).toHaveLength(5)
    expect(service.getRecentTraces({ stimulusId: 'stim-7' })).toHaveLength(1)
    expect(service.getRecentTraces({ stimulusId: 'stim-7' })[0].stimulusId).toBe('stim-7')
  })
})
