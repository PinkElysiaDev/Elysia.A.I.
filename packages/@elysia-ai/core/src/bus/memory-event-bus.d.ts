import type { EventBus } from './event-bus';
type EventHandler<Payload> = (payload: Payload) => void | Promise<void>;
export declare class MemoryEventBus<EventMap extends Record<string, unknown>> implements EventBus<EventMap> {
    private handlers;
    emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): Promise<void>;
    on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void;
    once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void;
}
export {};
//# sourceMappingURL=memory-event-bus.d.ts.map