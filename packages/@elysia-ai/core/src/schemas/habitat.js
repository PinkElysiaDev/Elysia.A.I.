import { z } from 'zod';
export const HabitatTypeSchema = z.enum([
    'private',
    'group',
    'channel',
]);
export const HabitatSchema = z.object({
    id: z.string(),
    platform: z.string(),
    botId: z.string(),
    type: HabitatTypeSchema,
    guildId: z.string().optional(),
    channelId: z.string().optional(),
    userId: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
});
