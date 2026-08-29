import type {
  BrainService,
  CapabilityDiagnostics,
  CoreEventMap,
  PerceptionService,
  Stimulus,
  PerceptionResult,
  EventBus,
} from '@elysia-ai/core'
import { NS_PERCEPTION, STAGE_PERCEPTION } from '@elysia-ai/core'
import { analyzeStimulusWithAi } from './ai-enhanced.js'

export const internalName = 'elysia-ai-perception'

export interface Config {
  maxInputTokens?: number
  enabledIntentClassify: boolean
  enabledEntityExtract: boolean
  enabledSentiment: boolean
  aiEnhanced: boolean
  aiFallbackToRuleBased?: boolean
  aiMinTextLength?: number
  aiModelSlot?: string
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// Plugin apply
// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

type PerceptionLoggerLike = {
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
  warn?(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface PerceptionPluginRuntimeOptions {
  /** pipeline 存在时走阶段钩子装配；缺省回退事件装配（单包测试/旧宿主）。 */
  runtime: { context: { eventBus: EventBus<CoreEventMap>, pipeline?: import('@elysia-ai/core').PipelineRunner<unknown> } }
  brain?: BrainService
  config: Config
  logger: PerceptionLoggerLike
}

export interface PerceptionPluginRuntime {
  service: PerceptionService
  dispose(): void
}

export function createPerceptionPluginRuntime(options: PerceptionPluginRuntimeOptions): PerceptionPluginRuntime {
  const { runtime, brain, config, logger } = options

  logger.info('perception plugin apply started', {
    plugin: 'elysia-ai-perception',
    phase: 'apply',
  })

  const eventBus = runtime.context.eventBus

  const service: PerceptionService = {
    async process(stimulus: Stimulus): Promise<PerceptionResult> {
      return analyzeStimulusWithAi(stimulus, config, brain, logger)
    },
    getDiagnostics(): CapabilityDiagnostics {
      return {
        plugin: 'elysia-ai-perception',
        enabled: true,
        ready: true,
        serviceName: 'elysia.perception',
        metadata: {
          aiEnhanced: config.aiEnhanced,
          hasBrainService: Boolean(brain),
        },
      }
    },
  }

  const disposeStimulus = (() => {
    const handleStimulus = async (stimulus: Stimulus, writeResult?: (result: PerceptionResult) => void): Promise<void> => {
      const stimulusId = stimulus.id
      logger.debug('perception analyzing stimulus', {
        plugin: 'elysia-ai-perception',
        phase: 'perception',
        event: 'stimulus.received',
        stimulusId,
        type: stimulus.type,
        actorId: stimulus.actorId,
      })

      try {
        const result = await service.process(stimulus)

        logger.info('perception completed', {
          plugin: 'elysia-ai-perception',
          phase: 'perception',
          stimulusId,
          intent: result.intent.primary,
          intentConfidence: result.intent.confidence,
          entityCount: result.entities.length,
          sentiment: result.sentiment.label,
          tokenCount: result.context.tokenCount,
          mode: result.metadata?.mode,
          aiRequested: result.metadata?.aiRequested,
          aiSucceeded: result.metadata?.aiSucceeded,
        })

        // 管线模式下把结果写入共享上下文，供下游 cognition/behavior
        // 直接读取（替代各自的私有 BoundedCache 侧信道）。
        writeResult?.(result)

        await eventBus.emit('perception.completed', {
          stimulusId,
          result,
        })
      } catch (error) {
        // service.process 仅在 aiEnhanced 且 aiFallbackToRuleBased=false 的 AI 失败时抛出。
        // 此处显式记录，避免感知失败被静默吞掉、让下游 cognition/behavior 无从感知。
        logger.error('perception failed; downstream cognition/behavior will not receive this stimulus', error, {
          plugin: 'elysia-ai-perception',
          phase: 'perception',
          event: 'stimulus.received',
          stimulusId,
          type: stimulus.type,
          actorId: stimulus.actorId,
        })
      }
    }

    // 钩子装配（kernel 管线阶段）；runtime 上下文无 pipeline 时（单包
    // 测试/旧宿主）回退事件装配，行为不变。
    const pipeline = runtime.context.pipeline
    if (pipeline) {
      return pipeline.registerHook({
        stage: STAGE_PERCEPTION,
        owner: 'elysia-ai-perception',
        async run(pctx) {
          const stimulus = (pctx.core as { stimulus: Stimulus }).stimulus
          await handleStimulus(stimulus, (result) => pctx.write(NS_PERCEPTION, result))
        },
      })
    }
    return eventBus.on('stimulus.received', ({ stimulus }) => handleStimulus(stimulus))
  })()

  return {
    service,
    dispose() {
      disposeStimulus()
      logger.info('perception plugin disposed', {
        plugin: 'elysia-ai-perception',
        phase: 'dispose',
      })
    },
  }
}
