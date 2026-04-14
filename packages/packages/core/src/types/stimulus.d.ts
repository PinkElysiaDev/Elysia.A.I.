export type StimulusType = 'utterance' | 'addressing' | 'appearance' | 'reaction' | 'silence' | 'system';
export interface Stimulus {
    id: string;
    type: StimulusType;
    habitatId: string;
    actorId?: string;
    timestamp: number;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=stimulus.d.ts.map