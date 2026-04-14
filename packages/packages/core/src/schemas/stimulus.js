import { z } from 'zod';
export const stimulusTypeSchema = z.enum([
    'utterance',
    'addressing',
    'appearance',
    'reaction',
    'silence',
    'system',
]);
export const stimulusSchema = z.object({
    id: z.string(),
    type: stimulusTypeSchema,
    habitatId: z.string(),
    actorId: z.string().optional(),
    timestamp: z.number(),
    payload: z.record(z.unknown()),
    metadata: z.record(z.unknown()).optional(),
});
