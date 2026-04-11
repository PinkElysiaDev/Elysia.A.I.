import type { DialogueMessage } from '../types/dialogue.js'

export type BrainCapability =
  | 'dialogue-generation'
  | 'dialogue-rewrite'
  | 'semantic-interpretation'
  | 'planning-support'
  | 'memory-extraction'
  | 'summarization'

export interface BrainRequest {
  task?: string
  lifeId?: string
  habitatId?: string
  capability?: BrainCapability
  messages: DialogueMessage[]
  metadata?: Record<string, unknown>
}

export interface BrainResponse {
  output: string
  messages?: DialogueMessage[]
  capability?: BrainCapability
  metadata?: Record<string, unknown>
}

export interface BrainService {
  execute(request: BrainRequest): Promise<BrainResponse>
}
