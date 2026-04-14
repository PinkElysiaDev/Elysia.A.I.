import { describe, it, expect } from 'vitest'
import { createPipelineContext, writePluginExt } from '../plugin/pipeline-context'

describe('PipelineContext', () => {
  describe('createPipelineContext()', () => {
    it('should create context with correct structure', () => {
      const core = { stimulusId: 'test-1' }
      const ctx = createPipelineContext(core, 'stimulus.received')

      expect(ctx.core).toEqual(core)
      expect(ctx.ext).toEqual({})
      expect(ctx.trace).toEqual([])
    })

    it('should make core readonly', () => {
      const core = { value: 42 }
      const ctx = createPipelineContext(core, 'test-stage')

      // core 应该保持原始引用但类型为 Readonly
      expect(ctx.core.value).toBe(42)
    })
  })

  describe('writePluginExt()', () => {
    it('should write data to plugin namespace', () => {
      const ctx = createPipelineContext({}, 'stimulus.received')

      writePluginExt(ctx, '@elysia-ai/test-plugin', 'stimulus.received', {
        result: 'hello',
      })

      expect(ctx.ext['@elysia-ai/test-plugin']).toEqual({ result: 'hello' })
    })

    it('should merge data into existing namespace', () => {
      const ctx = createPipelineContext({}, 'stimulus.received')

      writePluginExt(ctx, '@elysia-ai/test-plugin', 'stage1', { a: 1 })
      writePluginExt(ctx, '@elysia-ai/test-plugin', 'stage1', { b: 2 })

      expect(ctx.ext['@elysia-ai/test-plugin']).toEqual({ a: 1, b: 2 })
    })

    it('should isolate different plugin namespaces', () => {
      const ctx = createPipelineContext({}, 'stimulus.received')

      writePluginExt(ctx, '@elysia-ai/plugin-a', 'stage', { x: 1 })
      writePluginExt(ctx, '@elysia-ai/plugin-b', 'stage', { y: 2 })

      expect(ctx.ext['@elysia-ai/plugin-a']).toEqual({ x: 1 })
      expect(ctx.ext['@elysia-ai/plugin-b']).toEqual({ y: 2 })
    })

    it('should add trace entry on write', () => {
      const ctx = createPipelineContext({}, 'stimulus.received')

      writePluginExt(ctx, '@elysia-ai/test-plugin', 'stimulus.received', {
        data: 'test',
      })

      expect(ctx.trace).toHaveLength(1)
      const entry = ctx.trace[0]
      expect(entry.plugin).toBe('@elysia-ai/test-plugin')
      expect(entry.stage).toBe('stimulus.received')
      expect(entry.action).toBe('write')
      expect(entry.at).toBeGreaterThan(0)
    })

    it('should support custom action description in trace', () => {
      const ctx = createPipelineContext({}, 'stimulus.received')

      writePluginExt(
        ctx,
        '@elysia-ai/test-plugin',
        'stimulus.received',
        { data: 'test' },
        'custom-action'
      )

      expect(ctx.trace[0].action).toBe('custom-action')
    })
  })
})
