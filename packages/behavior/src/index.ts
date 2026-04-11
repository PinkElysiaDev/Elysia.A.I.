import { Context, Schema } from 'koishi'
import type { Stimulus, CoreEventMap, EventBus } from '@elysia-ai/core'
import { resolveStimulusScope } from './scope.js'
import { calculateStimulusSignal } from './signals.js'
import { routeStimulus } from './router.js'
import { createResponsePlan } from './plan.js'
import type {
  BehaviorLogger,
  BehaviorPlanningContext,
  BehaviorPlannedEventPayload,
} from './types.js'

export const name = 'elysia-ai-behavior'

export interface Config {
  enableReply: boolean
  directWindowMs: number
  userBufferedWindowMs: number
  threadBufferedWindowMs: number
  habitatBufferedWindowMs: number
}

export const Config: Schema<Config> = Schema.object({
  enableReply: Schema.boolean().default(true),
  directWindowMs: Schema.number().default(1500),
  userBufferedWindowMs: Schema.number().default(2500),
  threadBufferedWindowMs: Schema.number().default(3500),
  habitatBufferedWindowMs: Schema.number().default(5000),
})

declare module 'koishi' {
  interface Context {
    'elysia-ai-runtime'?: {
      context: {
        eventBus: EventBus<CoreEventMap>
      }
    }
  }
}

function createBehaviorLogger(ctx: Context): BehaviorLogger {
  const logger = ctx.logger('elysia-ai-behavior')

  return {
    info(message, meta) {
      logger.info(message, meta)
    },
    debug(message, meta) {
      logger.debug(message, meta)
    },
    error(message, error, meta) {
      if (meta && error) {
        logger.error(message, meta, error)
        return
      }
      if (error) {
        logger.error(message, error)
        return
      }
      if (meta) {
        logger.error(message, meta)
        return
      }
      logger.error(message)
    },
  }
}

function createPlanningContext(
  stimulus: Stimulus,
  config: Config
): BehaviorPlanningContext {
  return {
    directWindowMs: config.directWindowMs,
    userBufferedWindowMs: config.userBufferedWindowMs,
    threadBufferedWindowMs: config.threadBufferedWindowMs,
    habitatBufferedWindowMs: config.habitatBufferedWindowMs,
    threadId: stimulus.threadId,
    now: Date.now(),
    bucketStimulusCount: 1,
  }
}

export function apply(ctx: Context, config: Config) {
  const logger = createBehaviorLogger(ctx)
  const runtime = ctx['elysia-ai-runtime']

  logger.info('behavior plugin apply started', {
    plugin: 'elysia-ai-behavior',
    phase: 'apply',
  })

  if (!runtime?.context?.eventBus) {
    logger.error('runtime event bus not found; behavior plugin cannot continue', {
      plugin: 'elysia-ai-behavior',
      phase: 'apply',
    })
    return
  }

  const eventBus = runtime.context.eventBus

  const dispose = eventBus.on('stimulus.received', async ({ stimulusId, stimulus }) => {
    logger.debug('behavior planning triggered', {
      plugin: 'elysia-ai-behavior',
      phase: 'planning',
      event: 'stimulus.received',
      stimulusId,
      habitatId: stimulus.habitatId,
      actorId: stimulus.actorId,
      type: stimulus.type,
    })

    const planningContext = createPlanningContext(stimulus, config)
    const scope = resolveStimulusScope(stimulus, planningContext)
    const signal = calculateStimulusSignal(stimulus, scope, planningContext)
    const decision = routeStimulus(signal)
    const plan = createResponsePlan(scope, stimulus.id, decision)

    logger.info('behavior planned', {
      plugin: 'elysia-ai-behavior',
      phase: 'planning',
      stimulusId: stimulus.id,
      scope: scope.type,
      decision,
      shouldEnterDialogue: plan.shouldEnterDialogue,
    })

    logger.debug('behavior planning details', {
      plugin: 'elysia-ai-behavior',
      phase: 'planning',
      stimulusId: stimulus.id,
      scope,
      signal,
      plan,
    })

    const payload: BehaviorPlannedEventPayload = {
      stimulusId: stimulus.id,
      scope,
      decision,
      plan,
      signal,
    }

    await eventBus.emit('behavior.selected', payload)

    logger.debug('behavior.selected emitted', {
      plugin: 'elysia-ai-behavior',
      phase: 'planning',
      stimulusId: payload.stimulusId,
      decision: payload.decision,
      scope: payload.scope.type,
      shouldEnterDialogue: payload.plan.shouldEnterDialogue,
    })
  })

  ctx.on('dispose', () => {
    dispose()
    logger.info('behavior plugin disposed', {
      plugin: 'elysia-ai-behavior',
      phase: 'dispose',
    })
  })
}
