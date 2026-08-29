import type { Stimulus } from '@elysia-ai/core'
import { clampPercent } from '@elysia-ai/shared'
import type {
  BehaviorPlanningContext,
  StimulusScope,
  StimulusSignal,
} from './types.js'

function calculateDirectness(stimulus: Stimulus): number {
  let score = 0
  if (stimulus.type === 'addressing') score = 100
  else if (stimulus.type === 'utterance') score = 70
  else if (stimulus.type === 'reaction') score = 55
  else if (stimulus.type === 'appearance') score = 20
  else if (stimulus.type === 'silence') score = 10

  // body 已把结构化寻址事实写进 Stimulus；这里必须消费，
  // 否则群聊 @本 bot / 私聊 / 回复在行为层与普通闲聊无差。
  if (stimulus.isMentioned) score += 20
  if (stimulus.isDirectMessage) score += 15
  if (stimulus.isReply) score += 10

  return clampPercent(score)
}

function calculateContinuity(
  scope: StimulusScope,
  context: BehaviorPlanningContext
): number {
  if (scope.type === 'thread') return 100
  if (scope.type === 'user') return 65
  if (scope.type === 'habitat') return 35
  if (scope.type === 'life-global') return 15
  return context.threadId ? 60 : 20
}

function calculateBondAffinity(context: BehaviorPlanningContext): number {
  return clampPercent(context.bondAffinity ?? 0)
}

function calculateBufferPressure(
  context: BehaviorPlanningContext,
  scope: StimulusScope
): number {
  const count = context.bucketStimulusCount ?? 1
  const baseFromCount = Math.min(count * 20, 80)

  if (scope.type === 'habitat') return clampPercent(baseFromCount + 20)
  if (scope.type === 'thread') return clampPercent(baseFromCount + 10)
  if (scope.type === 'user') return clampPercent(baseFromCount)
  return clampPercent(Math.max(0, baseFromCount - 20))
}

function calculateResponseNecessity(
  stimulus: Stimulus,
  scope: StimulusScope
): number {
  let score = 0

  if (stimulus.type === 'addressing') score += 60
  if (stimulus.type === 'utterance') score += 35
  if (stimulus.type === 'reaction') score += 15

  if (scope.type === 'thread') score += 20
  if (scope.type === 'user') score += 15
  if (scope.type === 'habitat') score += 5

  if (stimulus.isMentioned) score += 20
  if (stimulus.isDirectMessage) score += 15
  if (stimulus.isReply) score += 10

  return clampPercent(score)
}

function calculateStructuralDeterminability(
  stimulus: Stimulus,
  scope: StimulusScope
): number {
  if (stimulus.type === 'system') return 100
  if (stimulus.type === 'silence') return 95
  if (stimulus.type === 'appearance') return 90
  if (stimulus.type === 'reaction') return 80
  if (stimulus.type === 'addressing') return 75
  if (scope.type === 'thread') return 65
  if (scope.type === 'habitat') return 35
  return 50
}

export function calculateStimulusSignal(
  stimulus: Stimulus,
  scope: StimulusScope,
  context: BehaviorPlanningContext
): StimulusSignal {
  return {
    directness: calculateDirectness(stimulus),
    continuity: calculateContinuity(scope, context),
    bondAffinity: calculateBondAffinity(context),
    bufferPressure: calculateBufferPressure(context, scope),
    responseNecessity: calculateResponseNecessity(stimulus, scope),
    structuralDeterminability: calculateStructuralDeterminability(
      stimulus,
      scope
    ),
  }
}
