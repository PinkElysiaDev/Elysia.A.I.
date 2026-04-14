export interface CoreEventMap {
    'stimulus.received': {
        stimulusId: string;
    };
    'perception.completed': {
        stimulusId: string;
    };
    'homeostasis.updated': {
        lifeInstanceId: string;
    };
    'behavior.selected': {
        lifeInstanceId: string;
    };
    'dialogue.generated': {
        lifeInstanceId: string;
    };
}
//# sourceMappingURL=event-map.d.ts.map