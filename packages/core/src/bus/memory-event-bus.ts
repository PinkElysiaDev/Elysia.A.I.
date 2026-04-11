import type { EventBus } from './event-bus.js'

type EventHandler<Payload> = (payload: Payload) => void | Promise<void>

function debugLog(message: string, meta?: Record<string, any>) {
  if (meta) {
    console.debug(`[elysia-ai-core:event-bus] ${message}`, meta)
    return
  }

  console.debug(`[elysia-ai-core:event-bus] ${message}`)
}

function errorLog(message: string, error: unknown, meta?: Record<string, any>) {
  if (meta) {
    console.error(`[elysia-ai-core:event-bus] ${message}`, meta, error)
    return
  }

  console.error(`[elysia-ai-core:event-bus] ${message}`, error)
}

export class MemoryEventBus<EventMap extends object>
  implements EventBus<EventMap>
{
  private handlers = new Map<keyof EventMap, Set<EventHandler<any>>>()

  async emit<K extends keyof EventMap>(
    event: K,
    payload: EventMap[K]
  ): Promise<void> {
    const handlers = this.handlers.get(event)

    if (!handlers || handlers.size === 0) {
      debugLog('event emitted without listeners', {
        plugin: 'elysia-ai-core',
        phase: 'event-bus',
        event: String(event),
      })
      return
    }

    debugLog('event emitted', {
      plugin: 'elysia-ai-core',
      phase: 'event-bus',
      event: String(event),
      listenerCount: handlers.size,
    })

    for (const handler of Array.from(handlers)) {
      try {
        await handler(payload)
      } catch (error) {
        errorLog('event handler execution failed', error, {
          plugin: 'elysia-ai-core',
          phase: 'event-bus',
          event: String(event),
        })
        throw error
      }
    }
  }

  on<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>
  ): () => void {
    const handlers = this.handlers.get(event) ?? new Set<EventHandler<any>>()

    handlers.add(handler)
    this.handlers.set(event, handlers)

    debugLog('event listener registered', {
      plugin: 'elysia-ai-core',
      phase: 'event-bus',
      event: String(event),
      listenerCount: handlers.size,
    })

    return () => {
      handlers.delete(handler)

      if (handlers.size === 0) {
        this.handlers.delete(event)
        debugLog('event listener removed and event cleared', {
          plugin: 'elysia-ai-core',
          phase: 'event-bus',
          event: String(event),
          listenerCount: 0,
        })
        return
      }

      debugLog('event listener removed', {
        plugin: 'elysia-ai-core',
        phase: 'event-bus',
        event: String(event),
        listenerCount: handlers.size,
      })
    }
  }

  once<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>
  ): () => void {
    let dispose: (() => void) | undefined

    const wrappedHandler: EventHandler<EventMap[K]> = async (payload) => {
      dispose?.()
      await handler(payload)
    }

    dispose = this.on(event, wrappedHandler)

    debugLog('one-time event listener registered', {
      plugin: 'elysia-ai-core',
      phase: 'event-bus',
      event: String(event),
    })

    return dispose
  }
}
