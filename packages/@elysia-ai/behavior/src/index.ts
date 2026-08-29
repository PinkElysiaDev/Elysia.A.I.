import type {
  BehaviorExecutionInstruction,
  BehaviorExecutionService,
  BehaviorService,
  CapabilityDiagnostics,
  CognitionResult,
  CoreEventMap,
  EventBus,
  HomeostasisState,
  PerceptionResult,
  Persona,
  Stimulus,
} from '@elysia-ai/core'
import { BoundedCache, clampPercent } from '@elysia-ai/shared'
import { NS_BEHAVIOR, NS_COGNITION, NS_PERCEPTION, STAGE_BEHAVIOR_DECIDE, STAGE_BEHAVIOR_EXECUTE } from '@elysia-ai/core'
import { resolveStimulusScope } from './scope.js'
import { calculateStimulusSignal } from './signals.js'
import { routeStimulus } from './router.js'
import type { ProgramRoutingDecision } from './types.js'
import { buildInstruction } from './action-builder.js'
import { ScopeBucketTracker } from './bucket.js'
import {
  createResponsePlanFromCandidate,
  generateBehaviorCandidates,
  selectBehaviorCandidate,
} from './candidates.js'
import { applyPersonaToSignal } from './persona-signal.js'
import { createBehaviorExecutionPlan } from './execution-plan.js'
import type {
  BehaviorPlanningContext,
  BehaviorPlannedEventPayload,
} from './types.js'

export const internalName = 'elysia-ai-behavior'

export interface Config {
  enableReply: boolean
  directWindowMs: number
  userBufferedWindowMs: number
  threadBufferedWindowMs: number
  habitatBufferedWindowMs: number
}

/** enableReply 关闭时压制一切出声路由（P1-13）：只允许观察与内部状态更新。 */
function suppressReplyIfDisabled(decision: ProgramRoutingDecision, config: Config): ProgramRoutingDecision {
  if (config.enableReply !== false) return decision
  if (decision === 'send-to-ai' || decision === 'program-direct') return 'internal-update-only'
  return decision
}

export function createPlanningContext(
  stimulus: Stimulus,
  config: Config,
  options: {
    lifeId?: string
    perception?: PerceptionResult
    cognition?: CognitionResult
    homeostasis?: HomeostasisState
    persona?: Persona
    bucketStimulusCount?: number
  } = {},
): BehaviorPlanningContext {
  return {
    directWindowMs: config.directWindowMs,
    userBufferedWindowMs: config.userBufferedWindowMs,
    threadBufferedWindowMs: config.threadBufferedWindowMs,
    habitatBufferedWindowMs: config.habitatBufferedWindowMs,
    lifeId: options.lifeId,
    perception: options.perception,
    cognition: options.cognition,
    homeostasis: options.homeostasis,
    persona: options.persona,
    threadId: stimulus.threadId,
    now: Date.now(),
    bucketStimulusCount: options.bucketStimulusCount ?? 1,
  }
}

/** 按 scope 类型取对应的缓冲窗口时长。 */
function bufferedWindowMsFor(scopeType: 'thread' | 'user' | 'habitat' | 'life-global', config: Config): number {
  if (scopeType === 'thread') return config.threadBufferedWindowMs
  if (scopeType === 'user') return config.userBufferedWindowMs
  return config.habitatBufferedWindowMs
}

function getCognitionForLife(
  cache: BoundedCache<string, Map<string, CognitionResult>>,
  stimulusId: string,
  lifeId: string,
): CognitionResult | undefined {
  return cache.get(stimulusId)?.get(lifeId)
}

function shouldSkipByCognition(cognition?: CognitionResult): boolean {
  return cognition ? !cognition.shouldEnterBehavior : false
}

function applyLifeStateToSignal(
  signal: ReturnType<typeof calculateStimulusSignal>,
  context: BehaviorPlanningContext,
): ReturnType<typeof calculateStimulusSignal> {
  const perception = context.perception
  const cognition = context.cognition
  const homeostasis = context.homeostasis

  let responseNecessity = signal.responseNecessity
  let continuity = signal.continuity
  let directness = signal.directness

  if (perception?.intent.primary === 'greet') responseNecessity += 10
  if (perception?.intent.primary === 'question') responseNecessity += 20
  if (perception?.intent.primary === 'command') responseNecessity += 15
  if (perception?.sentiment.label === 'negative') responseNecessity += 10

  if (cognition) {
    responseNecessity += cognition.salience * 20
    continuity += cognition.continuity * 20
  }

  if (homeostasis) {
    const willingness = 1 - homeostasis.responseThreshold
    responseNecessity += (willingness - 0.5) * 30
    directness += (homeostasis.sociability - 0.5) * 10
  }

  return {
    ...signal,
    directness: clampPercent(directness),
    continuity: clampPercent(continuity),
    responseNecessity: clampPercent(responseNecessity),
  }
}

type BehaviorLoggerLike = {
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
  warn?(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface BehaviorPluginRuntimeOptions {
  runtime: {
    /** pipeline 存在时走阶段钩子装配；缺省回退事件装配。 */
    context: { eventBus: EventBus<CoreEventMap>, pipeline?: import('@elysia-ai/core').PipelineRunner<unknown> }
    personaRegistry?: { getByLifeId(lifeId: string): Persona | undefined }
    behaviorExecution?: BehaviorExecutionService
  }
  config: Config
  logger: BehaviorLoggerLike
  /**
   * cognition 插件是否已安装（P1-10）。behavior 通过旁路缓存读取 cognition
   * 结果，依赖 cognition 先注册；当已安装却读不到结果（插件顺序颠倒 /
   * cognition 处理失败）时保守跳过该 life，而不是绕过认知门控直接回复。
   * 未安装 cognition 的部署（undefined/false）维持原行为：无门控直接评估。
   */
  cognitionAvailable?: boolean
}

export interface BehaviorPluginRuntime {
  service: BehaviorService
  dispose(): void
}

export function createBehaviorPluginRuntime(options: BehaviorPluginRuntimeOptions): BehaviorPluginRuntime {
  const { runtime, config, logger } = options
  const cognitionAvailable = options.cognitionAvailable === true

  logger.info('behavior plugin apply started', {
    plugin: 'elysia-ai-behavior',
    phase: 'apply',
  })

  const eventBus = runtime.context.eventBus
  const service: BehaviorService = {
    async decide(stimulus, signalOverride = {}) {
      const context = createPlanningContext(stimulus, config, {})
      const scope = resolveStimulusScope(stimulus, context)
      const calculatedSignal = calculateStimulusSignal(stimulus, scope, context)
      const signal = { ...calculatedSignal, ...signalOverride }
      const decision = suppressReplyIfDisabled(routeStimulus(signal), config)
      const candidates = generateBehaviorCandidates(scope, stimulus.id, decision, signal)
      return selectBehaviorCandidate(stimulus.id, candidates, signal)
    },
    createResponsePlan(decision) {
      const fallbackMode = typeof decision.selected.metadata?.mode === 'string'
        ? decision.selected.metadata.mode as any
        : 'program-direct'
      return createResponsePlanFromCandidate(decision.selected, fallbackMode)
    },
    getDiagnostics(): CapabilityDiagnostics {
      return {
        plugin: 'elysia-ai-behavior',
        enabled: true,
        ready: true,
        serviceName: 'elysia.behavior',
        metadata: {
          enableReply: config.enableReply,
        },
      }
    },
  }
  // 缂撳瓨鏈€杩戠殑 stimulus 涓庣敓鍛界姸鎬佷笂涓嬫枃锛屼緵 projection.routed 鍥炴煡
  const stimulusCache = new BoundedCache<string, Stimulus>()
  const perceptionCache = new BoundedCache<string, PerceptionResult>()
  const cognitionCache = new BoundedCache<string, Map<string, CognitionResult>>()
  const homeostasisCache = new Map<string, HomeostasisState>()
  const bucketTracker = new ScopeBucketTracker()

  // homeostasis 是跨刺激生命状态：两种装配下都用事件缓存。
  const disposeHomeostasis = eventBus.on('homeostasis.updated', ({ lifeInstanceId, state }) => {
    homeostasisCache.set(lifeInstanceId, state)
  })

  // 单生命规划：钩子装配（单生命一次）与事件装配（循环 lifeIds）共用。
  // decide/execute 阶段拆分的交接工件（库内私有，不进 core 契约）。
  interface BehaviorPlanArtifact {
    executionPlan: ReturnType<typeof createBehaviorExecutionPlan>
    stimulus: Stimulus
    lifeId: string
    plan: ReturnType<typeof createResponsePlanFromCandidate>
    userContent: string | undefined
  }

  const planForLife = async (
    stimulus: Stimulus,
    lifeId: string,
    projectionReason: string,
    perception: PerceptionResult | undefined,
    cognition: CognitionResult | undefined,
  ): Promise<BehaviorPlanArtifact | undefined> => {
    try {
      const homeostasis = homeostasisCache.get(lifeId)
      const persona = runtime.personaRegistry?.getByLifeId(lifeId)
      const planningContext = createPlanningContext(stimulus, config, {
        lifeId,
        perception,
        cognition,
        homeostasis,
        persona,
      })

      if (shouldSkipByCognition(cognition)) {
        logger.debug('cognition gate rejected behavior planning', {
          plugin: 'elysia-ai-behavior',
          phase: 'planning',
          stimulusId: stimulus.id,
          lifeId,
          salience: cognition?.salience,
          continuity: cognition?.continuity,
          reason: cognition?.reason,
        })
        return undefined
      }

      // P1-10：cognition 已安装却读不到结果，说明插件注册顺序颠倒或
      // cognition 处理失败——保守跳过，避免绕过认知门控变成"每条消息
      // 都评估回复"。
      if (cognitionAvailable && !cognition) {
        logger.warn?.('cognition result missing for life; skipping conservatively (check plugin load order: cognition must load before behavior)', {
          plugin: 'elysia-ai-behavior',
          phase: 'planning',
          stimulusId: stimulus.id,
          lifeId,
        })
        return undefined
      }

      const scope = resolveStimulusScope(stimulus, planningContext)
      // 记录 scope 桶计数（P1-7）：窗口内同 scope 刺激数驱动 bufferPressure，
      // 使 buffer（攒话）路由真正可达。
      planningContext.bucketStimulusCount = bucketTracker.record(
        `${lifeId}:${scope.type}:${scope.key}`,
        planningContext.now ?? Date.now(),
        bufferedWindowMsFor(scope.type, config),
      )
      const signal = calculateStimulusSignal(stimulus, scope, planningContext)
      const lifeAdjustedSignal = applyLifeStateToSignal(signal, planningContext)
      const adjustedSignal = applyPersonaToSignal(lifeAdjustedSignal, persona)
      const decision = suppressReplyIfDisabled(routeStimulus(adjustedSignal), config)
      const candidates = generateBehaviorCandidates(scope, stimulus.id, decision, adjustedSignal)
      const behaviorDecision = selectBehaviorCandidate(stimulus.id, candidates, adjustedSignal)
      const plan = createResponsePlanFromCandidate(behaviorDecision.selected, decision)

      await eventBus.emit('behavior.candidates.generated', {
        stimulusId: stimulus.id,
        scope,
        candidates,
        signal: adjustedSignal,
      })

      logger.info('behavior planned', {
        plugin: 'elysia-ai-behavior',
        phase: 'planning',
        stimulusId: stimulus.id,
        lifeId,
        scope: scope.type,
        decision,
        selectedCandidate: behaviorDecision.selected.type,
        candidateCount: candidates.length,
        shouldEnterDialogue: plan.shouldEnterDialogue,
        perceptionIntent: perception?.intent.primary,
        cognitionSalience: cognition?.salience,
        homeostasisThreshold: homeostasis?.responseThreshold,
        personaName: persona?.name,
        personaTraits: persona?.traits,
      })

      const payload: BehaviorPlannedEventPayload = {
        stimulusId: stimulus.id,
        lifeId,
        scope,
        decision: plan.mode,
        plan,
        signal: adjustedSignal,
        candidates,
        behaviorDecision,
      }

      await eventBus.emit('behavior.selected', payload)

      const userContent = typeof stimulus.payload?.content === 'string'
        ? stimulus.payload.content
        : undefined

      const executionPlan = createBehaviorExecutionPlan({
        stimulus,
        lifeId,
        plan,
        behaviorDecision,
        selectedCandidate: behaviorDecision.selected,
        currentUserContent: userContent,
        metadata: {
          source: 'elysia-ai-behavior',
          projectionReason,
        },
      })

      await eventBus.emit('behavior.execution.plan.created', {
        planId: executionPlan.id,
        plan: executionPlan,
      })

      return {
        executionPlan,
        stimulus,
        lifeId,
        plan,
        userContent,
      }
    } catch (error) {
      logger.error('behavior planning failed for life; remaining lives will still be processed', error, {
        plugin: 'elysia-ai-behavior',
        phase: 'planning',
        event: 'projection.routed',
        stimulusId: stimulus.id,
        lifeId,
        type: stimulus.type,
        actorId: stimulus.actorId,
      })
      return undefined
    }
  }

  // 执行段：调 behaviorExecution 并产出 instruction（decide/execute 阶段
  // 拆分后由 execute 钩子调用；事件兜底路径在 planForLife 后顺序调用，
  // 对外事件顺序与拆分前完全一致）。
  const executeForLife = async (
    artifact: NonNullable<Awaited<ReturnType<typeof planForLife>>>,
    writeInstruction?: (instruction: BehaviorExecutionInstruction) => void,
  ): Promise<void> => {
    const { executionPlan, stimulus, lifeId, plan, userContent } = artifact

    if (runtime.behaviorExecution) {
      await runtime.behaviorExecution.execute(executionPlan)
    }

    const instruction = buildInstruction(
      lifeId,
      stimulus.id,
      plan,
      userContent,
      {
        actorId: stimulus.actorId,
        habitatId: stimulus.habitatId,
        threadId: stimulus.threadId,
      },
    )

    logger.debug('emitting behavior.instruction', {
      plugin: 'elysia-ai-behavior',
      phase: 'planning',
      stimulusId: instruction.stimulusId,
      lifeId: instruction.lifeId,
      actionCount: instruction.actions.length,
      actionTypes: instruction.actions.map((a) => a.type),
    })

    // 管线模式下写入共享上下文：dialogue 阶段直接读取（钩子装配），
    // 事件消费者（观测/旧装配）继续走 behavior.instruction 事件。
    writeInstruction?.(instruction)

    await eventBus.emit('behavior.instruction', { instruction })
  }

  // ── 装配：钩子优先（decide/execute 双阶段拆分），事件兜底 ──
  const NS_BEHAVIOR_ARTIFACT = 'behavior.plan-artifact'
  const pipeline = runtime.context.pipeline
  const disposers: Array<() => void> = []

  if (pipeline) {
    disposers.push(pipeline.registerHook({
      stage: STAGE_BEHAVIOR_DECIDE,
      owner: 'elysia-ai-behavior',
      async run(pctx) {
        const { stimulus, lifeId, routing } = pctx.core as {
          stimulus: Stimulus
          lifeId: string
          routing: { reason?: string }
        }
        const perception = pctx.read<PerceptionResult>(NS_PERCEPTION)
        const cognition = pctx.read<CognitionResult>(NS_COGNITION)
        const artifact = await planForLife(stimulus, lifeId, routing.reason ?? '', perception, cognition)
        if (artifact) pctx.write(NS_BEHAVIOR_ARTIFACT, artifact)
      },
    }))
    disposers.push(pipeline.registerHook({
      stage: STAGE_BEHAVIOR_EXECUTE,
      owner: 'elysia-ai-behavior',
      async run(pctx) {
        const artifact = pctx.read<BehaviorPlanArtifact>(NS_BEHAVIOR_ARTIFACT)
        if (!artifact) return
        await executeForLife(artifact, (instruction) => {
          pctx.write(NS_BEHAVIOR, instruction)
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

    const disposeCognition = eventBus.on('cognition.completed', (result) => {
      if (!result.lifeId) return

      const byLife = cognitionCache.get(result.stimulusId) ?? new Map<string, CognitionResult>()
      byLife.set(result.lifeId, result)
      cognitionCache.set(result.stimulusId, byLife)
    })

    const disposeProjection = eventBus.on('projection.routed', async ({ stimulusId, routing }) => {
      const stimulus = stimulusCache.get(stimulusId)
      if (!stimulus) {
        logger.error('stimulus not found in cache for projection.routed', {
          plugin: 'elysia-ai-behavior',
          phase: 'planning',
          stimulusId,
        })
        return
      }

      // 鏃犲尮閰?life 鏃惰烦杩?behavior planning
      if (routing.lifeIds.length === 0) {
        logger.debug('no life matched for stimulus, skipping behavior planning', {
          plugin: 'elysia-ai-behavior',
          phase: 'planning',
          stimulusId,
          reason: routing.reason,
        })
        return
      }

      logger.debug('behavior planning triggered via projection.routed', {
        plugin: 'elysia-ai-behavior',
        phase: 'planning',
        event: 'projection.routed',
        stimulusId,
        habitatId: stimulus.habitatId,
        actorId: stimulus.actorId,
        type: stimulus.type,
        lifeIds: routing.lifeIds,
      })

      const perception = perceptionCache.get(stimulus.id)

      // 涓烘瘡涓尮閰嶇殑 life 鐙珛瑙勫垝
      for (const lifeId of routing.lifeIds) {
        const cognition = getCognitionForLife(cognitionCache, stimulus.id, lifeId)
        // 事件兜底：decide+execute 顺序执行（与拆分前行为一致）。
        const artifact = await planForLife(stimulus, lifeId, routing.reason, perception, cognition)
        if (artifact) await executeForLife(artifact)
      }
    })

    disposers.push(disposeStimulus, disposePerception, disposeCognition, disposeProjection)
  }
  disposers.push(disposeHomeostasis)

  const dispose = () => {
    for (const disposeOne of disposers) disposeOne()
    stimulusCache.clear()
    perceptionCache.clear()
    cognitionCache.clear()
    homeostasisCache.clear()
  }

  return {
    service,
    dispose() {
      dispose()
      logger.info('behavior plugin disposed', {
        plugin: 'elysia-ai-behavior',
        phase: 'dispose',
      })
    },
  }
}
