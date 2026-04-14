
import { z } from 'zod'

export const lifeInstanceStatusSchema = z.enum([
  'inactive',
  'active',
  'archived',
])

export const lifeInstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  templateId: z.string().optional(),
  status: lifeInstanceStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.unknown()).optional(),
})