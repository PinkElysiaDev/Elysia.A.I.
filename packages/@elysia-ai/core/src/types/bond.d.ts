export type BondTargetType = 'individual' | 'collective' | 'channel';
export interface Bond {
    id: string;
    lifeInstanceId: string;
    targetId: string;
    targetType: BondTargetType;
    familiarity: number;
    intimacy: number;
    trust: number;
    updatedAt: number;
}
//# sourceMappingURL=bond.d.ts.map