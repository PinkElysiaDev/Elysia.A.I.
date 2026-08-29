import { describe, expect, it } from 'vitest'
import type { Stimulus } from '@elysia-ai/core'
import { ScopeBucketTracker } from './bucket.js'
import { createPlanningContext } from './index.js'
import { resolveStimulusScope } from './scope.js'
import { calculateStimulusSignal } from './signals.js'
import { routeStimulus } from './router.js'

// P1-7 回归：buffer（攒话）路由此前因 bucketStimulusCount 恒为 1 而永不可达。

const config = {
  enableReply: true,
  directWindowMs: 5_000,
  userBufferedWindowMs: 30_000,
  threadBufferedWindowMs: 45_000,
  habitatBufferedWindowMs: 60_000,
}

function makeStimulus(overrides: Partial<Stimulus> = {}): Stimulus {
  return {
    id: 's1',
    type: 'utterance',
    timestamp: Date.now(),
    habitatId: 'habitat-1',
    actorId: 'user-1',
    payload: { content: '在吗' },
    ...overrides,
  } as Stimulus
}

describe('ScopeBucketTracker', () => {
  it('窗口内累计计数（含当前），窗口外过期清除', () => {
    const tracker = new ScopeBucketTracker()
    expect(tracker.record('k', 1000, 10_000)).toBe(1)
    expect(tracker.record('k', 5000, 10_000)).toBe(2)
    expect(tracker.record('k', 12_000, 10_000)).toBe(2) // t=1000 已出窗
    expect(tracker.count('k', 12_000, 10_000)).toBe(2)  // 只读不影响
  })

  it('不同 scope key 互不干扰', () => {
    const tracker = new ScopeBucketTracker()
    expect(tracker.record('a', 1000, 10_000)).toBe(1)
    expect(tracker.record('b', 1000, 10_000)).toBe(1)
    expect(tracker.record('a', 2000, 10_000)).toBe(2)
  })
})

describe('buffer 路由可达性（P1-7）', () => {
  it('同 scope 窗口内第 2 条群聊消息进入 buffer 路由', () => {
    const tracker = new ScopeBucketTracker()
    const stimulus = makeStimulus()

    const firstContext = createPlanningContext(stimulus, config, {
      bucketStimulusCount: tracker.record('life-1:user:habitat-1:user-1', 1000, config.userBufferedWindowMs),
    })
    const firstScope = resolveStimulusScope(stimulus, firstContext)
    const firstSignal = calculateStimulusSignal(stimulus, firstScope, firstContext)
    expect(routeStimulus(firstSignal)).not.toBe('buffer')

    const secondContext = createPlanningContext(stimulus, config, {
      bucketStimulusCount: tracker.record('life-1:user:habitat-1:user-1', 2000, config.userBufferedWindowMs),
    })
    expect(secondContext.bucketStimulusCount).toBe(2)
    const secondSignal = calculateStimulusSignal(stimulus, firstScope, secondContext)
    // directness 70（utterance）≤85 且 bufferPressure = 2*20 = 40 + …
    // user scope：40 < 60 不入 buffer；habitat scope：40+20 = 60 ≥60 入 buffer
    expect(secondSignal.bufferPressure).toBe(40)
    expect(routeStimulus(secondSignal)).not.toBe('buffer')

    const habitatStimulus = makeStimulus({ actorId: undefined, threadId: undefined })
    const habitatContext = createPlanningContext(habitatStimulus, config, {
      bucketStimulusCount: 2,
    })
    const habitatScope = resolveStimulusScope(habitatStimulus, habitatContext)
    const habitatSignal = calculateStimulusSignal(habitatStimulus, habitatScope, habitatContext)
    expect(habitatSignal.bufferPressure).toBeGreaterThanOrEqual(60)
    expect(routeStimulus(habitatSignal)).toBe('buffer')
  })

  it('直接 @ 消息（directness 高）不进入 buffer', () => {
    const stimulus = makeStimulus({ type: 'addressing', isMentioned: true })
    const context = createPlanningContext(stimulus, config, { bucketStimulusCount: 5 })
    const scope = resolveStimulusScope(stimulus, context)
    const signal = calculateStimulusSignal(stimulus, scope, context)
    expect(signal.directness).toBeGreaterThan(85)
    expect(routeStimulus(signal)).not.toBe('buffer')
  })
})

// ─────────────────────────────────────────────────
// P1-10：cognition 已安装但结果缺失时保守跳过
// ─────────────────────────────────────────────────

describe('cognition 结果缺失的保守跳过（P1-10）', () => {
  it('cognitionAvailable=true 且缓存无结果时不触发 behavior.instruction', async () => {
    const { createBehaviorPluginRuntime } = await import('./index.js')
    const { MemoryEventBus } = await import('@elysia-ai/core')

    const eventBus = new MemoryEventBus<import('@elysia-ai/core').CoreEventMap>()
    const warnings: string[] = []
    const runtime = createBehaviorPluginRuntime({
      runtime: { context: { eventBus } },
      config,
      logger: {
        info: () => {}, debug: () => {}, error: () => {},
        warn: (message: string) => warnings.push(message),
      },
      cognitionAvailable: true,
    })

    const instructions: unknown[] = []
    eventBus.on('behavior.instruction', (payload) => { instructions.push(payload) })

    // stimulus 缓存由 stimulus.received 填充；cognition.completed 不发（模拟顺序颠倒/失败）
    await eventBus.emit('stimulus.received', { stimulusId: 's-order', stimulus: makeStimulus({ id: 's-order' }) })
    await eventBus.emit('projection.routed', { stimulusId: 's-order', routing: { lifeIds: ['life-1'], reason: 'test' } as never })

    expect(instructions).toHaveLength(0)
    expect(warnings.some((message) => message.includes('cognition result missing'))).toBe(true)
    runtime.dispose()
  })

  it('未安装 cognition（cognitionAvailable 缺省）时维持旧行为：无门控继续规划', async () => {
    const { createBehaviorPluginRuntime } = await import('./index.js')
    const { MemoryEventBus } = await import('@elysia-ai/core')

    const eventBus = new MemoryEventBus<import('@elysia-ai/core').CoreEventMap>()
    const runtime = createBehaviorPluginRuntime({
      runtime: { context: { eventBus } },
      config,
      logger: { info: () => {}, debug: () => {}, error: () => {} },
    })

    const instructions: unknown[] = []
    eventBus.on('behavior.instruction', (payload) => { instructions.push(payload) })

    await eventBus.emit('stimulus.received', { stimulusId: 's-nogate', stimulus: makeStimulus({ id: 's-nogate', isMentioned: true, type: 'addressing' }) })
    await eventBus.emit('projection.routed', { stimulusId: 's-nogate', routing: { lifeIds: ['life-1'], reason: 'test' } as never })

    expect(instructions).toHaveLength(1)
    runtime.dispose()
  })
})

// ─────────────────────────────────────────────────
// P1-13：enableReply=false 压制出声路由
// ─────────────────────────────────────────────────

describe('enableReply 开关（P1-13）', () => {
  it('enableReply=false 时高显著性 @ 消息不产生 dialogue instruction，只走内部更新', async () => {
    const { createBehaviorPluginRuntime } = await import('./index.js')
    const { MemoryEventBus } = await import('@elysia-ai/core')

    const eventBus = new MemoryEventBus<import('@elysia-ai/core').CoreEventMap>()
    const runtime = createBehaviorPluginRuntime({
      runtime: { context: { eventBus } },
      config: { ...config, enableReply: false },
      logger: { info: () => {}, debug: () => {}, error: () => {} },
    })

    const instructions: { instruction: { actions: { type: string }[] } }[] = []
    eventBus.on('behavior.instruction', (payload) => { instructions.push(payload as never) })

    await eventBus.emit('stimulus.received', {
      stimulusId: 's-mute',
      stimulus: makeStimulus({ id: 's-mute', type: 'addressing', isMentioned: true }),
    })
    await eventBus.emit('projection.routed', { stimulusId: 's-mute', routing: { lifeIds: ['life-1'], reason: 'test' } as never })

    expect(instructions).toHaveLength(1)
    expect(instructions[0].instruction.actions.map((a) => a.type)).not.toContain('dialogue')
    runtime.dispose()
  })
})
