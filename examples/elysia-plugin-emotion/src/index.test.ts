import { describe, expect, it } from 'vitest'
import type { CoreEventMap, PerceptionResult } from '@elysia-ai/core'
import { ELYSIA_PIPELINE_STAGES, createHarness } from '@elysia-ai/core'
import { emotionStageName, wireEmotion } from './index.js'

describe('elysia-plugin-emotion（kernel harness 驱动，无需 Koishi app）', () => {
  it('emotion 阶段插入 perception 与 cognition 之间；上下文读写与扩展事件全链路', async () => {
    const harness = createHarness<CoreEventMap>()
    for (const stage of ELYSIA_PIPELINE_STAGES) {
      harness.runner.registerStage(stage)
    }
    // 被测插件的库层装配。
    const handle = wireEmotion({
      pipeline: harness.runner,
      eventBus: harness.bus,
      config: { arousalDecay: 0.2 },
    })
    expect(handle).toBeDefined()

    // 阶段顺序断言：emotion 位于 perception 之后、cognition 之前（与注册顺序无关）。
    const order = harness.runner.getStageOrder()
    expect(order.indexOf(emotionStageName)).toBeGreaterThan(order.indexOf('perception'))
    expect(order.indexOf(emotionStageName)).toBeLessThan(order.indexOf('cognition'))

    // 上游 perception 结果写入共享上下文（模拟 perception 钩子的产出）。
    harness.runner.registerHook({
      stage: 'perception',
      owner: 'fake-perception',
      priority: -100,
      async run(pctx) {
        const perception: PerceptionResult = {
          stimulusId: (pctx.core as { stimulus: { id: string } }).stimulus.id,
          intent: { primary: 'greeting', confidence: 0.9, alternatives: [] },
          entities: [],
          sentiment: { label: 'positive', score: 0.8, mixed: false },
          context: { tokenCount: 5, recentMessages: [], matchedKeywords: [] },
          metadata: {},
        } as unknown as PerceptionResult
        pctx.write('perception', perception)
      },
    })

    // 扩展事件订阅（类型化：emit 键在 CoreEventMap 上有编译期约束）。
    const evaluated: Array<{ mood: number, arousal: number }> = []
    harness.bus.on('emotion.evaluated', ({ mood, arousal }) => {
      evaluated.push({ mood, arousal })
    })

    // 驱动刺激段管线（含 emotion 阶段，因为它在 STIMULUS 段顺序中位于 perception 后）。
    await harness.runPipeline({
      id: 'stim-1',
      core: { stimulus: { id: 'stim-1', type: 'utterance', habitatId: 'h1', payload: {}, timestamp: Date.now() } },
      stages: ['stimulus.received', 'perception', emotionStageName],
    })

    // 正面情感 → mood 为正、arousal 上升；扩展事件已发。
    expect(handle!.service.getMood('')).toBeGreaterThan(0)
    expect(handle!.service.getDiagnostics().serviceName).toBe('elysia.emotion')
    expect(evaluated).toHaveLength(1)
    expect(evaluated[0].mood).toBeGreaterThan(0)

    handle!.dispose()
  })

  it('config.enabled=false 时不装配', () => {
    const harness = createHarness<CoreEventMap>()
    for (const stage of ELYSIA_PIPELINE_STAGES) {
      harness.runner.registerStage(stage)
    }
    expect(wireEmotion({
      pipeline: harness.runner,
      eventBus: harness.bus,
      config: { enabled: false },
    })).toBeUndefined()
  })
})
