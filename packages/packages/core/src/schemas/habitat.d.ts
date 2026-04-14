import { z } from 'zod';
export declare const HabitatTypeSchema: z.ZodEnum<["private", "group", "channel"]>;
export declare const HabitatSchema: z.ZodObject<{
    id: z.ZodString;
    platform: z.ZodString;
    botId: z.ZodString;
    type: z.ZodEnum<["private", "group", "channel"]>;
    guildId: z.ZodOptional<z.ZodString>;
    channelId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "private" | "group" | "channel";
    platform: string;
    botId: string;
    metadata?: Record<string, unknown> | undefined;
    guildId?: string | undefined;
    channelId?: string | undefined;
    userId?: string | undefined;
}, {
    id: string;
    type: "private" | "group" | "channel";
    platform: string;
    botId: string;
    metadata?: Record<string, unknown> | undefined;
    guildId?: string | undefined;
    channelId?: string | undefined;
    userId?: string | undefined;
}>;
//# sourceMappingURL=habitat.d.ts.map