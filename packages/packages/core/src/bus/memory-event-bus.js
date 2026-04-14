export class MemoryEventBus {
    handlers = new Map();
    async emit(event, payload) {
        const handlers = this.handlers.get(event);
        if (!handlers || handlers.size === 0) {
            return;
        }
        for (const handler of Array.from(handlers)) {
            await handler(payload);
        }
    }
    on(event, handler) {
        const handlers = this.handlers.get(event) ?? new Set();
        handlers.add(handler);
        this.handlers.set(event, handlers);
        return () => {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.handlers.delete(event);
            }
        };
    }
    once(event, handler) {
        let dispose;
        const wrappedHandler = async (payload) => {
            dispose?.();
            await handler(payload);
        };
        dispose = this.on(event, wrappedHandler);
        return dispose;
    }
}
