import { z } from 'zod';
export declare const lifeInstanceStatusSchema: z.ZodEnum<["inactive", "active", "archived"]>;
export declare const lifeInstanceSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    templateId: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["inactive", "active", "archived"]>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: "inactive" | "active" | "archived";
    createdAt: number;
    updatedAt: number;
    templateId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    id: string;
    name: string;
    status: "inactive" | "active" | "archived";
    createdAt: number;
    updatedAt: number;
    templateId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
//# sourceMappingURL=life.d.ts.map