import { describe, expect, it } from 'vitest'
import { createDefaultRuntime } from 'koishi-plugin-elysia-ai-runtime'
import type { Runtime } from 'koishi-plugin-elysia-ai-runtime'
import { createPerceptionPluginRuntime } from '@elysia-ai/perception'
import { createCognitionPluginRuntime } from '@elysia-ai/cognition'
import { createBehaviorPluginRuntime } from '@elysia-ai/behavior'
import { createDialoguePluginRuntime } from '@elysia-ai/dialogue'
import type { BrainService, CoreEventMap } from '@elysia-ai/core'
import { NS_DIALOGUE_OUTPUT } from '@elysia-ai/core'

/**
 * Review BUG-4 补测：receiveStimulus → … → sender 的真实端到端链路
 * （四主链库钩子装配 + decide/execute 拆分后的事件顺序 + trace 事件）。
 */

const logger = { info() {}, debug() {}, warn() {}, error() {} }

function wireMainChain(runtime: Runtime, brain: BrainService) {
  createPerceptionPluginRuntime({
    runtime: runtime as never,
    config: {
      enabledIntentClassify: true,
      enabledEntityExtract: true,
      enabledSentiment: true,
    },
    logger,
  })
  createCognitionPluginRuntime({
    runtime: runtime as never,
    config: {
      recentConversationLimit: 5,
      salienceDirectMentionBonus: 0,
      salienceDirectMessageBonus: 0.5,
      salienceReplyBonus: 0,
      salienceQuestionBonus: 0.2,
      salienceLengthFactor: 0,
      behaviorThreshold: 0,
    },
    logger,
  })
  createBehaviorPluginRuntime({
    runtime: runtime as never,
    config: {
      directWindowMs: 1500,
      userBufferedWindowMs: 2500,
      threadBufferedWindowMs: 3500,
      habitatBufferedWindowMs: 5000,
    } as never,
    logger,
    cognitionAvailable: true,
  })
  createDialoguePluginRuntime({
    runtime: runtime as never,
    brain,
    config: { enabled: true, memoryLimit: 10 },
    logger,
  })
}

describe('Phase 44：receiveStimulus → sender 端到端', () => {
  it('全链路：事件顺序完整、输出进入上下文并送达 sender 钩子、trace 事件两棵树', async () => {
    const runtime = createDefaultRuntime(logger)
    const brain: BrainService = {
      async execute() {
        return { output: 'e2e reply', messages: [] }
      },
    }
    wireMainChain(runtime, brain)

    const events: string[] = []
    runtime.context.eventBus.onAny((event) => events.push(event))

    const sentOutputs: string[] = []
    runtime.context.pipeline!.registerHook({
      stage: 'sender',
      owner: 'test-sender',
      async run(pctx) {
        const outputs = pctx.read<CoreEventMap['dialogue.output.created'][]>(NS_DIALOGUE_OUTPUT) ?? []
        for (const output of outputs) sentOutputs.push(output.content)
      },
    })

    await runtime.loadManifest({
      version: '1.0',
      lifeInstances: [{ id: 'life-e2e', type: 'elysia-default' }],
    })
    await runtime.start()

    await runtime.receiveStimulus({
      id: 'stim-e2e',
      type: 'utterance',
      timestamp: Date.now(),
      habitatId: 'hab-e2e',
      payload: { content: '你好' },
      actorId: 'user-e2e',
      isDirectMessage: true,
    } as never)

    // 事件顺序（decide/execute 拆分后保持不变；dialogue.task.created 由
    // behavior-execution 派发与 dialogue 执行各发一次，属既有双发事实，
    // 不纳入单调序断言，单独验证出现次数）。
    const expectedOrder = [
      'stimulus.received',
      'perception.completed',
      'projection.routed',
      'cognition.reasoning',
      'cognition.completed',
      'behavior.candidates.generated',
      'behavior.selected',
      'behavior.execution.plan.created',
      'behavior.instruction',
      'dialogue.generation.requested',
      'dialogue.started',
      'dialogue.generated',
      'dialogue.output.created',
      'dialogue.completed',
    ]
    const positions = expectedOrder.map((name) => events.indexOf(name))
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(events.filter((event) => event === 'dialogue.task.created').length).toBeGreaterThanOrEqual(1)

    // 输出进入共享上下文并被 sender 钩子消费。
    expect(sentOutputs).toEqual(['e2e reply'])

    // trace：刺激段 + 生命段两棵树。
    const traceEvents = events.filter((event) => event === 'runtime.trace.completed')
    expect(traceEvents.length).toBeGreaterThanOrEqual(2)

    await runtime.stop()
  })
})
