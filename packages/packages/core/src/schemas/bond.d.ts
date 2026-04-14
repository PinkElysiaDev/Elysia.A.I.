import { z } from 'zod';
export declare const bondTargetTypeSchema: z.ZodEnum<["individual", "collective", "channel"]>;
export declare const bondSchema: z.ZodObject<{
    id: z.ZodString;
    lifeInstanceId: z.ZodString;
    targetId: z.ZodString;
    targetType: z.ZodEnum<["individual", "collective", "channel"]>;
    familiarity: z.ZodNumber;
    intimacy: z.ZodNumber;
    trust: z.ZodNumber;
    updatedAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    updatedAt: number;
    lifeInstanceId: string;
    targetId: string;
    targetType: "channel" | "individual" | "collective";
    familiarity: number;
    intimacy: number;
    trust: number;
}, {
    id: string;
    updatedAt: number;
    lifeInstanceId: string;
    targetId: string;
    targetType: "channel" | "individual" | "collective";
    familiarity: number;
    intimacy: number;
    trust: number;
}>;
//# sourceMappingURL=bond.d.ts.map