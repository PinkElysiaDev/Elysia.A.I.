import { describe, expect, it, vi } from 'vitest'
import { asCordisContext } from 'koishi'
import {
  getOptionalElysiaService,
  getRequiredElysiaService,
  registerElysiaService,
} from '../packages/@elysia-ai/shared/src/service-registry.js'

function createFakeContext() {
  const listeners: Record<string, (() => void)[]> = {}
  const ctx = {
    on(event: string, listener: () => void) {
      listeners[event] ||= []
      listeners[event].push(listener)
      return () => {
        listeners[event] = listeners[event].filter((item) => item !== listener)
      }
    },
    emitDispose() {
      for (const listener of listeners.dispose ?? []) listener()
    },
  }
  return asCordisContext(ctx) as typeof ctx & Record<string, unknown>
}

describe('Elysia Koishi service registry helper', () => {
  it('registers formal and legacy aliases and clears them on dispose', () => {
    const ctx = createFakeContext()
    const service = { id: 'runtime' }

    const dispose = registerElysiaService(ctx as any, {
      formalName: 'elysia.runtime',
      legacyName: 'elysia-ai-runtime',
      service,
    })

    expect(ctx['elysia.runtime']).toBe(service)
    expect(ctx['elysia-ai-runtime']).toBe(service)
    expect(getOptionalElysiaService(ctx as any, { formalName: 'elysia.runtime' })).toBe(service)

    dispose()

    expect(ctx['elysia.runtime']).toBeUndefined()
    expect(ctx['elysia-ai-runtime']).toBeUndefined()
  })

  it('compat dispose clears the current registration（不再保留"较新"注册）', () => {
    // cordis 迁移后的语义：服务销毁由 effect 机制按插件作用域托管，
    // registerElysiaService 返回的 dispose 句柄仅向后兼容——它直接把服务名置空，
    // 不再实现旧属性赋值时代"dispose 旧句柄不得误删新注册"的守卫
    //（重注册本身在真实 cordis 中会因非空覆盖抛错而被跳过）。
    const ctx = createFakeContext()
    const first = { id: 'first' }
    const second = { id: 'second' }

    const disposeFirst = registerElysiaService(ctx as any, {
      formalName: 'elysia.brain',
      legacyName: 'elysia-ai-brain',
      service: first,
    })
    expect(() => {
      registerElysiaService(ctx as any, {
        formalName: 'elysia.brain',
        legacyName: 'elysia-ai-brain',
        service: second,
      })
    }).not.toThrow()

    disposeFirst()

    expect(ctx['elysia.brain']).toBeUndefined()
    expect(ctx['elysia-ai-brain']).toBeUndefined()
  })

  it('prefers formal aliases and falls back to legacy aliases', () => {
    const ctx = createFakeContext()
    const legacyService = { id: 'legacy' }
    const formalService = { id: 'formal' }

    ctx['elysia-ai-model-gateway'] = legacyService
    expect(
      getOptionalElysiaService(ctx as any, {
        formalName: 'elysia.modelGateway',
        legacyName: 'elysia-ai-model-gateway',
      }),
    ).toBe(legacyService)

    ctx['elysia.modelGateway'] = formalService
    expect(
      getOptionalElysiaService(ctx as any, {
        formalName: 'elysia.modelGateway',
        legacyName: 'elysia-ai-model-gateway',
      }),
    ).toBe(formalService)
  })

  it('logs a dependency gate error for missing required services', () => {
    const ctx = createFakeContext()
    const logger = { error: vi.fn() }

    const service = getRequiredElysiaService(ctx as any, {
      formalName: 'elysia.brain',
      legacyName: 'elysia-ai-brain',
      logger,
      plugin: 'elysia-ai-dialogue',
      description: 'brain service',
    })

    expect(service).toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(
      'brain service not found; plugin cannot continue',
      undefined,
      expect.objectContaining({
        plugin: 'elysia-ai-dialogue',
        formalName: 'elysia.brain',
        legacyName: 'elysia-ai-brain',
      }),
    )
  })
})
