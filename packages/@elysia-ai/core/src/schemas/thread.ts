
import { z } from 'zod'

export const threadSchema = z.object({
  id: z.string(),
  lifeInstanceId: z.string(),
  habitatId: z.string(),
  title: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.unknown()).optional(),
})
