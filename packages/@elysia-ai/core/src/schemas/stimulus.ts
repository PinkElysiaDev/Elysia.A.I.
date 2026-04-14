import { z } from 'zod'

export const stimulusTypeSchema = z.enum([
  'utterance',
  'addressing',
  'appearance',
  'reaction',
  'silence',
  'system',
])

export const stimulusSchema = z.object({
  id: z.string(),
  type: stimulusTypeSchema,
  timestamp: z.number(),

  habitatId: z.string(),
  actorId: z.string().optional(),
  targetId: z.string().optional(),
  threadId: z.string().optional(),
  projectionId: z.string().optional(),
  lifeId: z.string().optional(),

  platform: z.string().optional(),
  botId: z.string().optional(),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  messageId: z.string().optional(),
  replyToMessageId: z.string().optional(),

  isDirectMessage: z.boolean().optional(),
  isMentioned: z.boolean().optional(),
  isReply: z.boolean().optional(),
  isSystemEvent: z.boolean().optional(),

  payload: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
