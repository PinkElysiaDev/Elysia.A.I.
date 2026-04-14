export type LifeInstanceStatus = 'inactive' | 'active' | 'archived';
export interface LifeInstance {
    id: string;
    name: string;
    templateId?: string;
    status: LifeInstanceStatus;
    createdAt: number;
    updatedAt: number;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=life.d.ts.map