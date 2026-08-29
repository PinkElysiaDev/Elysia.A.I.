import { describe, expect, it } from 'vitest'
import { createDefaultRuntime } from '../runtime.js'
import type { RuntimeLogger } from '../context/index.js'

/**
 * Phase 43（P4）验收：manifest.json 的 extensions 命名空间与
 * manifest 注册表对齐——未知键在 start() 时告警（unknown-config-namespace），
 * 内置命名空间（projection/persona）与已注册 configNamespace 不告警。
 */

function spyLogger(): RuntimeLogger & { warns: Array<{ message: string, meta?: Record<string, unknown> }> } {
  const warns: Array<{ message: string, meta?: Record<string, unknown> }> = []
  return {
    warns,
    info() {},
    debug() {},
    warn(message, meta) {
      warns.push({ message, meta })
    },
    error() {},
  }
}

describe('extensions 命名空间对齐校验', () => {
  it('未知 extensions 键触发 unknown-config-namespace 告警', async () => {
    const logger = spyLogger()
    const runtime = createDefaultRuntime(logger)
    await runtime.loadManifest({
      version: '1.0',
      lifeInstances: [{
        id: 'life-1',
        type: 'elysia-default',
        extensions: {
          // 拼写错误演示：emotoin ≠ emotion
          'emotoin': { mood: 0.5 },
          'persona': { systemPrompt: 'x' },
          'projection': {},
        },
      }],
    })
    await runtime.start()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await runtime.stop()

    const unknown = logger.warns.filter((entry) => entry.meta?.['code'] === 'unknown-config-namespace')
    expect(unknown).toHaveLength(1)
    expect(unknown[0].meta?.['namespace']).toBe('emotoin')
    // 内置命名空间不告警。
    expect(logger.warns.some((entry) => entry.meta?.['namespace'] === 'persona')).toBe(false)
    expect(logger.warns.some((entry) => entry.meta?.['namespace'] === 'projection')).toBe(false)
  })

  it('已注册插件的 configNamespace 不告警', async () => {
    const logger = spyLogger()
    const runtime = createDefaultRuntime(logger)
    runtime.context.manifests?.register({
      name: 'elysia-plugin-emotion',
      version: '0.1.0',
      services: { provides: ['elysia.emotion'], consumes: ['elysia.runtime'] },
      configNamespace: 'emotion',
    })
    await runtime.loadManifest({
      version: '1.0',
      lifeInstances: [{
        id: 'life-2',
        type: 'elysia-default',
        extensions: { 'emotion': { mood: 0.5 } },
      }],
    })
    await runtime.start()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await runtime.stop()

    expect(logger.warns.filter((entry) => entry.meta?.['code'] === 'unknown-config-namespace')).toHaveLength(0)
  })
})
