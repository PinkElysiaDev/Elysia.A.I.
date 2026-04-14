import { z } from 'zod';
export declare const stimulusTypeSchema: z.ZodEnum<["utterance", "addressing", "appearance", "reaction", "silence", "system"]>;
export declare const stimulusSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["utterance", "addressing", "appearance", "reaction", "silence", "system"]>;
    habitatId: z.ZodString;
    actorId: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodNumber;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "utterance" | "addressing" | "appearance" | "reaction" | "silence" | "system";
    habitatId: string;
    timestamp: number;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown> | undefined;
    actorId?: string | undefined;
}, {
    id: string;
    type: "utterance" | "addressing" | "appearance" | "reaction" | "silence" | "system";
    habitatId: string;
    timestamp: number;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown> | undefined;
    actorId?: string | undefined;
}>;
//# sourceMappingURL=stimulus.d.ts.map