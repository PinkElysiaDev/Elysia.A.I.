import type { ProgramRoutingDecision, StimulusSignal } from './types.js'

export function routeStimulus(signal: StimulusSignal): ProgramRoutingDecision {
  if (
    signal.structuralDeterminability >= 80 &&
    signal.responseNecessity <= 50
  ) {
    if (signal.responseNecessity <= 20) return 'discard'
    return 'internal-update-only'
  }

  if (signal.bufferPressure >= 60 && signal.directness <= 85) {
    return 'buffer'
  }

  if (
    signal.responseNecessity >= 60 &&
    signal.structuralDeterminability <= 50
  ) {
    return 'send-to-ai'
  }

  return 'program-direct'
}
