import type { Stimulus } from '@elysia-ai/koishi-plugin-core'
import type {
  BehaviorPlanningContext,
  StimulusScope,
  StimulusSignal,
} from './types.js'

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function calculateDirectness(stimulus: Stimulus): number {
  if (stimulus.type === 'addressing') return 100
  if (stimulus.type === 'utterance') return 70
  if (stimulus.type === 'reaction') return 55
  if (stimulus.type === 'appearance') return 20
  if (stimulus.type === 'silence') return 10
  return 0
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
  return clampScore(context.bondAffinity ?? 0)
}

function calculateBufferPressure(
  context: BehaviorPlanningContext,
  scope: StimulusScope
): number {
  const count = context.bucketStimulusCount ?? 1
  const baseFromCount = Math.min(count * 20, 80)

  if (scope.type === 'habitat') return clampScore(baseFromCount + 20)
  if (scope.type === 'thread') return clampScore(baseFromCount + 10)
  if (scope.type === 'user') return clampScore(baseFromCount)
  return clampScore(Math.max(0, baseFromCount - 20))
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

  return clampScore(score)
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
