import { z } from 'zod';
export declare const threadSchema: z.ZodObject<{
    id: z.ZodString;
    lifeInstanceId: z.ZodString;
    habitatId: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: number;
    updatedAt: number;
    lifeInstanceId: string;
    habitatId: string;
    metadata?: Record<string, unknown> | undefined;
    title?: string | undefined;
}, {
    id: string;
    createdAt: number;
    updatedAt: number;
    lifeInstanceId: string;
    habitatId: string;
    metadata?: Record<string, unknown> | undefined;
    title?: string | undefined;
}>;
//# sourceMappingURL=thread.d.ts.map