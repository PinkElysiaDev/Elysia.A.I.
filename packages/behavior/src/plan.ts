import type {
  PlannerSource,
  ProgramRoutingDecision,
  ResponsePlan,
  StimulusScope,
} from './types.js'

export function createResponsePlan(
  scope: StimulusScope,
  stimulusId: string,
  mode: ProgramRoutingDecision,
  plannerSource: PlannerSource = 'program'
): ResponsePlan {
  return {
    scope,
    sourceStimulusIds: [stimulusId],
    mode,
    plannerSource,
    shouldEnterDialogue: mode === 'program-direct' || mode === 'send-to-ai',
    shouldUpdateMemory: mode === 'send-to-ai',
    shouldUpdateBond:
      mode === 'program-direct' || mode === 'send-to-ai' || mode === 'internal-update-only',
    shouldUpdateHomeostasis: mode !== 'discard',
    shouldScheduleFollowup: mode === 'buffer',
    reason: mode,
  }
}
