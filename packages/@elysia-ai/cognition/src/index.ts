import type {
  BrainService,
  CapabilityDiagnostics,
  CognitionService,
  CognitionContext,
  CoreEventMap,
  EventBus,
  HomeostasisState,
  PerceptionResult,
  PersonaRegistry,
  ConversationStore,
  Stimulus,
} from '@elysia-ai/core'
import { BoundedCache, createConversationScopeKey, resolveConversationScope } from '@elysia-ai/shared'
import { NS_COGNITION, NS_PERCEPTION, STAGE_COGNITION } from '@elysia-ai/core'
import type { CognitionResult, PipelineRunner } from '@elysia-ai/core'
import { reasonWithAi } from './ai-enhanced.js'

export const internalName = 'elysia-ai-cognition'

export interface Config {
  recentConversationLimit: number
  salienceDirectMentionBonus: number
  salienceDirectMessageBonus: number
  salienceReplyBonus: number
  salienceQuestionBonus: number
  salienceLengthFactor: number
  behaviorThreshold: number
  aiEnhanced?: boolean
  aiFallbackToRuleBased?: boolean
  aiMinSalience?: number
  aiModelSlot?: string
}

function resolveScopeKey(stimulus: Stimulus, lifeId?: string): string {
  // 与 dialogue 写入侧共用 shared 的唯一派生实现（P0-2）：
  // 此前 cognition 用 thread:/channel:/habitat: 前缀而 dialogue 用
  // lifeId:type:key 格式，key 永不匹配导致连续性信号恒为 0。
  return createConversationScopeKey(lifeId, resolveConversationScope(stimulus))
}

function buildCognitionContext(
  stimulus: Stimulus,
  personaRegistry: PersonaRegistry,
  conversationStore: ConversationStore,
  config: Config,
  perception?: PerceptionResult,
  homeostasis?: HomeostasisState,
): CognitionContext {
  const lifeId = stimulus.lifeId
  const scopeKey = resolveScopeKey(stimulus, lifeId)
  const persona = lifeId ? personaRegistry.getByLifeId(lifeId) : undefined
  const recentConversation = conversationStore.getRecent(scopeKey, config.recentConversationLimit)

  return {
    stimulusId: stimulus.id,
    lifeId,
    habitatId: stimulus.habitatId,
    actorId: stimulus.actorId,
    threadId: stimulus.threadId,
    scopeKey,
    stimulus,
    persona,
    perception,
    homeostasis,
    recentConversation,
  }
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// Plugin apply
// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

type CognitionLoggerLike = {
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
  warn?(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface CognitionPluginRuntimeOptions {
  runtime: {
    /** pipeline 存在时走阶段钩子装配；缺省回退事件装配。 */
    context: { eventBus: EventBus<CoreEventMap>, pipeline?: PipelineRunner<unknown> }
    personaRegistry: PersonaRegistry
    conversationStore: ConversationStore
  }
  brain?: BrainService
  config: Config
  logger: CognitionLoggerLike
}

export interface CognitionPluginRuntime {
  service: CognitionService
  dispose(): void
}

export function createCognitionPluginRuntime(options: CognitionPluginRuntimeOptions): CognitionPluginRuntime {
  const { runtime, brain, config, logger } = options

  logger.info('cognition plugin apply started', {
    plugin: 'elysia-ai-cognition',
    phase: 'apply',
  })

  const eventBus = runtime.context.eventBus
  const service: CognitionService = {
    async reason(context: CognitionContext) {
      return reasonWithAi(context, config, brain, logger)
    },
    getDiagnostics(): CapabilityDiagnostics {
      return {
        plugin: 'elysia-ai-cognition',
        enabled: true,
        ready: true,
        serviceName: 'elysia.cognition',
        metadata: {
          aiEnhanced: config.aiEnhanced,
          hasBrainService: Boolean(brain),
        },
      }
    },
  }
  const stimulusCache = new BoundedCache<string, Stimulus>()
  const perceptionCache = new BoundedCache<string, PerceptionResult>()
  const homeostasisCache = new Map<string, HomeostasisState>()

  // homeostasis 是跨刺激的生命状态（非管线数据），两种装配下都用事件缓存。
  const disposeHomeostasis = eventBus.on('homeostasis.updated', ({ lifeInstanceId, state }) => {
    homeostasisCache.set(lifeInstanceId, state)
  })

  // 单生命推理：钩子装配（单生命一次）与事件装配（循环 lifeIds）共用。
  const reasonForLife = async (
    stimulus: Stimulus,
    lifeId: string,
    perception: PerceptionResult | undefined,
    stimulusId: string,
    writeResult?: (result: CognitionResult) => void,
  ): Promise<void> => {
    const lifeStimulus: Stimulus = { ...stimulus, lifeId }
    const homeostasis = homeostasisCache.get(lifeId)

    logger.debug('cognition reasoning started', {
      plugin: 'elysia-ai-cognition',
      phase: 'cognition',
      event: 'projection.routed',
      stimulusId,
      lifeId,
      type: stimulus.type,
      actorId: stimulus.actorId,
      hasPerception: Boolean(perception),
      hasHomeostasis: Boolean(homeostasis),
    })

    const cognitionContext = buildCognitionContext(
      lifeStimulus,
      runtime.personaRegistry,
      runtime.conversationStore,
      config,
      perception,
      homeostasis,
    )

    try {
      await eventBus.emit('cognition.reasoning', {
        stimulusId,
        lifeId: cognitionContext.lifeId,
        scopeKey: cognitionContext.scopeKey,
      })

      const result = await service.reason(cognitionContext)

      logger.info('cognition completed', {
        plugin: 'elysia-ai-cognition',
        phase: 'cognition',
        stimulusId,
        lifeId: result.lifeId,
        scopeKey: result.scopeKey,
        salience: result.salience,
        continuity: result.continuity,
        shouldEnterBehavior: result.shouldEnterBehavior,
        reason: result.reason,
        mode: result.metadata?.mode,
      })

      // 管线模式下写入共享上下文，供 behavior 阶段直接读取。
      writeResult?.(result)

      await eventBus.emit('cognition.completed', result)
    } catch (error) {
      logger.error('cognition failed for life; remaining lives will still be processed', error, {
        plugin: 'elysia-ai-cognition',
        phase: 'cognition',
        event: 'projection.routed',
        stimulusId,
        lifeId,
        type: stimulus.type,
        actorId: stimulus.actorId,
      })
    }
  }

  // ── 装配：钩子优先，事件兜底（单包测试/旧宿主无 pipeline 时）──
  const pipeline = runtime.context.pipeline
  const disposers: Array<() => void> = []

  if (pipeline) {
    disposers.push(pipeline.registerHook({
      stage: STAGE_COGNITION,
      owner: 'elysia-ai-cognition',
      async run(pctx) {
        const { stimulus, lifeId } = pctx.core as { stimulus: Stimulus, lifeId: string }
        // 感知结果经父链从刺激段上下文读取。
        const perception = pctx.read<PerceptionResult>(NS_PERCEPTION)
        await reasonForLife(stimulus, lifeId, perception, stimulus.id, (result) => {
          pctx.write(NS_COGNITION, result)
        })
      },
    }))
  } else {
    const disposeStimulus = eventBus.on('stimulus.received', ({ stimulusId, stimulus }) => {
      stimulusCache.set(stimulusId, stimulus)
    })

    const disposePerception = eventBus.on('perception.completed', ({ stimulusId, result }) => {
      perceptionCache.set(stimulusId, result)
    })

    const disposeProjection = eventBus.on('projection.routed', async ({ stimulusId, routing }) => {
      const stimulus = stimulusCache.get(stimulusId)

      if (!stimulus) {
        logger.error('stimulus not found in cache for cognition reasoning', {
          plugin: 'elysia-ai-cognition',
          phase: 'cognition',
          stimulusId,
        })
        return
      }

      if (routing.lifeIds.length === 0) {
        logger.debug('no life matched for stimulus, skipping cognition reasoning', {
          plugin: 'elysia-ai-cognition',
          phase: 'cognition',
          stimulusId,
          reason: routing.reason,
        })
        return
      }

      const perception = perceptionCache.get(stimulusId)

      for (const lifeId of routing.lifeIds) {
        await reasonForLife(stimulus, lifeId, perception, stimulusId)
      }
    })

    disposers.push(disposeStimulus, disposePerception, disposeProjection)
  }
  disposers.push(disposeHomeostasis)

  return {
    service,
    dispose() {
      for (const dispose of disposers) dispose()
      stimulusCache.clear()
      perceptionCache.clear()
      homeostasisCache.clear()
      logger.info('cognition plugin disposed', {
        plugin: 'elysia-ai-cognition',
        phase: 'dispose',
      })
    },
  }
}
