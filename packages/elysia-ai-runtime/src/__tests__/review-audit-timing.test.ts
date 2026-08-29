import { describe, expect, it } from 'vitest'
import { createDefaultRuntime } from '../runtime.js'
import type { RuntimeLogger } from '../context/index.js'

/**
 * Review BUG-2 回归：兼容审计的时机。
 * 真实时序下其余插件在 runtime.start() 之后才注册 manifest——
 * 延迟审计（下一宏任务）必须：① 不对后注册的合法命名空间假阳性告警；
 * ② 能捕获延迟注册的问题 manifest（如假依赖）。
 */

function spyLogger() {
  const warns: Array<{ message: string, meta?: Record<string, unknown> }> = []
  const logger: RuntimeLogger = {
    info() {},
    debug() {},
    warn(message, meta) {
      warns.push({ message, meta })
    },
    error() {},
  }
  return { warns, logger }
}

function flushTimers(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

describe('Review BUG-2：审计时机', () => {
  it('延迟审计不对 start 后注册的合法 configNamespace 假阳性', async () => {
    const { warns, logger } = spyLogger()
    const runtime = createDefaultRuntime(logger)

    await runtime.loadManifest({
      version: '1.0',
      lifeInstances: [{
        id: 'life-t1',
        type: 'elysia-default',
        extensions: { 'emotion': { mood: 0.5 } },
      }],
    })
    await runtime.start()

    // 真实时序：start 之后，emotion 插件才 apply 并注册 manifest。
    runtime.context.manifests?.register({
      name: 'elysia-plugin-emotion',
      version: '0.1.0',
      services: { provides: ['elysia.emotion'], consumes: ['elysia.runtime'] },
      configNamespace: 'emotion',
    })

    // 即时审计（start 内）此刻看不到 emotion manifest —— 但延迟审计必须看到。
    await flushTimers()
    await runtime.stop()

    const falsePositives = warns.filter(
      (entry) => entry.meta?.['code'] === 'unknown-config-namespace' && entry.meta?.['namespace'] === 'emotion',
    )
    expect(falsePositives).toHaveLength(0)
  })

  it('延迟审计捕获 start 后注册的假依赖 manifest', async () => {
    const { warns, logger } = spyLogger()
    const runtime = createDefaultRuntime(logger)
    await runtime.start()

    runtime.context.manifests?.register({
      name: 'elysia-plugin-broken',
      version: '0.1.0',
      dependencies: ['elysia-plugin-not-installed'],
    })

    await flushTimers()
    await runtime.stop()

    const missing = warns.filter(
      (entry) => entry.meta?.['code'] === 'missing-dependency' && entry.meta?.['plugin'] === 'elysia-plugin-broken',
    )
    expect(missing.length).toBeGreaterThanOrEqual(1)
  })

  it('auditCompatibility 公开方法可直接调用并返回结果', async () => {
    const runtime = createDefaultRuntime({ info() {}, debug() {}, warn() {}, error() {} })
    await runtime.start()
    runtime.context.manifests?.register({
      name: 'elysia-plugin-lonely',
      version: '0.1.0',
      dependencies: ['ghost'],
    })
    const findings = runtime.auditCompatibility()
    expect(findings.some((finding) => finding.plugin === 'elysia-plugin-lonely' && finding.code === 'missing-dependency')).toBe(true)
    await runtime.stop()
  })
})
