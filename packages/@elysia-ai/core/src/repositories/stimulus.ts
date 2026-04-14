import type { Stimulus } from '../types/stimulus.js'

export interface StimulusQuery {
  habitatId?: string
  actorId?: string
  threadId?: string
  lifeId?: string
  type?: Stimulus['type']
  since?: number
  until?: number
  limit?: number
}

export interface StimulusRepository {
  save(stimulus: Stimulus): Promise<void>
  getById(id: string): Promise<Stimulus | null>
  query(query: StimulusQuery): Promise<Stimulus[]>
}
