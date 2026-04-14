
export type HabitatType = 'private' | 'group' | 'channel'

export interface Habitat {
  id: string
  platform: string
  botId: string
  type: HabitatType
  guildId?: string
  channelId?: string
  userId?: string
  metadata?: Record<string, unknown>
}