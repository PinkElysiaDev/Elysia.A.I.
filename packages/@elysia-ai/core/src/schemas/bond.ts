
import { z } from 'zod'

export const bondTargetTypeSchema = z.enum([
  'individual',
  'collective',
  'channel',
])

export const bondSchema = z.object({
  id: z.string(),
  lifeInstanceId: z.string(),
  targetId: z.string(),
  targetType: bondTargetTypeSchema,
  familiarity: z.number(),
  intimacy: z.number(),
  trust: z.number(),
  updatedAt: z.number(),
})
