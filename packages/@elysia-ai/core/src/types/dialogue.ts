export type DialogueRole = 'system' | 'user' | 'assistant' | 'tool'

export interface DialogueMessage {
  role: DialogueRole
  content: string
  name?: string
  metadata?: Record<string, unknown>
}

export type DialogueMode =
  | 'reply-now'
  | 'defer'
  | 'silent-update'
  | 'internal-update-only'

export interface DialogueTask {
  lifeId?: string
  habitatId?: string
  scope: {
    type: 'user' | 'thread' | 'habitat' | 'life-global'
    key: string
  }
  sourceStimulusIds: string[]
  mode: DialogueMode
  messages: DialogueMessage[]
  metadata?: Record<string, unknown>
}

export interface DialogueResult {
  taskId?: string
  output: string
  messages?: DialogueMessage[]
  metadata?: Record<string, unknown>
}
