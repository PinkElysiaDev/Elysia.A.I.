/**
 * 内存事件总线实现：具名订阅 + onAny 通配符 + 监听者错误隔离。
 * 移植自 @elysia-ai/core 的 MemoryEventBus，补齐 onAny。
 */

import type { EventBus } from './event-bus.js'

type EventHandler<Payload> = (payload: Payload) => void | Promise<void>
type AnyEventHandler<EventMap extends object> = (event: keyof EventMap & string, payload: unknown) => void

function debugLog(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.debug(`[elysia-ai-kernel:event-bus] ${message}`, meta)
    return
  }
  console.debug(`[elysia-ai-kernel:event-bus] ${message}`)
}

function errorLog(message: string, error: unknown, meta?: Record<string, unknown>) {
  if (meta) {
    console.error(`[elysia-ai-kernel:event-bus] ${message}`, meta, error)
    return
  }
  console.error(`[elysia-ai-kernel:event-bus] ${message}`, error)
}

export class MemoryEventBus<EventMap extends object> implements EventBus<EventMap> {
  private handlers = new Map<keyof EventMap, Set<EventHandler<unknown>>>()
  private anyHandlers = new Set<AnyEventHandler<EventMap>>()

  async emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): Promise<void> {
    const handlers = this.handlers.get(event)
    const anyHandlers = this.anyHandlers
    if ((!handlers || handlers.size === 0) && anyHandlers.size === 0) {
      debugLog('event emitted without listeners', {
        plugin: 'elysia-ai-kernel',
        phase: 'event-bus',
        event: String(event),
      })
      return
    }

    debugLog('event emitted', {
      plugin: 'elysia-ai-kernel',
      phase: 'event-bus',
      event: String(event),
      listenerCount: handlers?.size ?? 0,
      anyListenerCount: anyHandlers.size,
    })

    // 通配符订阅同样受监听者隔离保护。
    for (const handler of Array.from(anyHandlers)) {
      try {
        handler(event as keyof EventMap & string, payload)
      } catch (error) {
        errorLog('any-event handler execution failed', error, {
          plugin: 'elysia-ai-kernel',
          phase: 'event-bus',
          event: String(event),
        })
      }
    }

    for (const handler of Array.from(handlers ?? [])) {
      try {
        await handler(payload)
      } catch (error) {
        // 监听者隔离：失败记录在此，其余 listener 继续，不向 emit 调用方重抛。
        errorLog('event handler execution failed', error, {
          plugin: 'elysia-ai-kernel',
          phase: 'event-bus',
          event: String(event),
        })
      }
    }
  }

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    const handlers = this.handlers.get(event) ?? new Set<EventHandler<unknown>>()
    handlers.add(handler as EventHandler<unknown>)
    this.handlers.set(event, handlers)
    return () => {
      handlers.delete(handler as EventHandler<unknown>)
      if (handlers.size === 0) {
        this.handlers.delete(event)
      }
    }
  }

  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    let dispose: (() => void) | undefined
    const wrappedHandler: EventHandler<EventMap[K]> = async (payload) => {
      dispose?.()
      await handler(payload)
    }
    dispose = this.on(event, wrappedHandler)
    return dispose
  }

  onAny(handler: AnyEventHandler<EventMap>): () => void {
    this.anyHandlers.add(handler)
    return () => {
      this.anyHandlers.delete(handler)
    }
  }
}
