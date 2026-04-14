export type StimulusType =
  | 'utterance'
  | 'addressing'
  | 'appearance'
  | 'reaction'
  | 'silence'
  | 'system'

export interface Stimulus {
  id: string
  type: StimulusType
  timestamp: number

  // 作用域与参与者
  habitatId: string
  actorId?: string
  targetId?: string
  threadId?: string
  projectionId?: string
  lifeId?: string

  // 平台结构事实
  platform?: string
  botId?: string
  guildId?: string
  channelId?: string
  messageId?: string
  replyToMessageId?: string

  // 结构化特征
  isDirectMessage?: boolean
  isMentioned?: boolean
  isReply?: boolean
  isSystemEvent?: boolean

  // 扩展信息
  payload: Record<string, unknown>
  metadata?: Record<string, unknown>
}
