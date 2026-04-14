
export interface EventBus<EventMap extends object> {
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void | Promise<void>
  on<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void | Promise<void>
  ): () => void
  once<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void | Promise<void>
  ): () => void
}
