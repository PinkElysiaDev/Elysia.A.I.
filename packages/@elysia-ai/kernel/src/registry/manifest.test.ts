import { describe, expect, it } from 'vitest'
import { PluginManifestRegistry } from './manifest.js'
import { satisfiesRange } from './semver.js'

describe('satisfiesRange（迷你 semver）', () => {
  it.each([
    ['0.1.3', '^0.1.0', true],
    ['0.2.0', '^0.1.0', false],
    ['0.1.5', '~0.1.0', true],
    ['0.2.0', '~0.1.0', false],
    ['1.2.0', '^1.0.0', true],
    ['2.0.0', '^1.0.0', false],
    ['0.1.0', '>=0.1.0 <0.2.0', true],
    ['0.2.0', '>=0.1.0 <0.2.0', false],
    ['0.1.0', '0.1.0', true],
    ['0.1.1', '0.1.0', false],
    ['0.3.0', '^0.1.0 || ^0.3.0', true],
    ['0.2.0', '^0.1.0 || ^0.3.0', false],
  ])('satisfiesRange(%s, %s) === %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected)
  })
})

describe('PluginManifestRegistry', () => {
  it('依赖缺失报 error；未知服务/阶段报 warn；版本不匹配报 warn', () => {
    const registry = new PluginManifestRegistry()
    registry.register({
      name: 'elysia-ai-brain',
      version: '0.1.5',
      frameworkApiVersion: '^99.0.0',
      dependencies: ['elysia-ai-runtime'],
      services: { consumes: ['elysia.nonexistent'] },
      stages: { hooks: ['totally.unknown.stage'] },
    })
    const issues = registry.validate({
      knownServices: ['elysia.runtime'],
      knownStages: ['perception'],
    })
    const codes = issues.map((issue) => issue.code)
    expect(codes).toContain('missing-dependency')
    expect(codes).toContain('framework-version-mismatch')
    expect(codes).toContain('unknown-service')
    expect(codes).toContain('unknown-stage')
    expect(issues.find((issue) => issue.code === 'missing-dependency')?.severity).toBe('error')
  })

  it('configNamespace 冲突报 error；findByNamespace 可查回', () => {
    const registry = new PluginManifestRegistry()
    registry.register({ name: 'a', version: '1.0.0', configNamespace: 'persona' })
    registry.register({ name: 'b', version: '1.0.0', configNamespace: 'persona' })
    const conflicts = registry.validate().filter((issue) => issue.code === 'namespace-conflict')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].plugin).toBe('b')
    expect(registry.findByNamespace('persona')?.name).toBe('a')
  })

  it('健康注册无问题', () => {
    const registry = new PluginManifestRegistry()
    registry.register({
      name: 'runtime',
      version: '0.1.5',
      services: { provides: ['elysia.runtime'] },
    })
    registry.register({
      name: 'perception',
      version: '0.1.5',
      dependencies: ['runtime'],
      services: { consumes: ['elysia.runtime'] },
      stages: { hooks: ['perception'] },
      configNamespace: 'perception',
    })
    expect(registry.validate({
      knownServices: ['elysia.runtime'],
      knownStages: ['perception'],
    })).toEqual([])
  })
})
