#!/usr/bin/env node
/**
 * scaffold-package.mjs —— Elysia A.I. 插件脚手架。
 *
 * 用法：
 *   node scripts/scaffold-package.mjs <plugin-name> [options]
 *
 * 示例：
 *   node scripts/scaffold-package.mjs elysia-plugin-mood --service elysia.mood
 *   node scripts/scaffold-package.mjs my-adapter --dir examples --no-test
 *
 * 生成内容（在 <dir>/<plugin-name>/，默认 examples/）：
 *   package.json    双格式 exports + koishi.service.implements + private
 *   tsconfig.json   继承 monorepo 根配置 + core/shared 引用
 *   src/index.ts    工厂 v2 骨架：inject + Config + manifest + 阶段钩子示范
 *   src/index.test.ts  createHarness 测试模板（--no-test 跳过）
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')

const args = process.argv.slice(2)
if (args.length === 0 || args[0].startsWith('--')) {
  console.log('用法: node scripts/scaffold-package.mjs <plugin-name> [--service elysia.xxx] [--stage perception] [--dir examples] [--no-test]')
  process.exit(1)
}

function argValue(flag) {
  const index = args.indexOf(flag)
  return index !== -1 ? args[index + 1] : undefined
}

const pluginName = args[0]
const options = {
  service: argValue('--service') ?? `elysia.${pluginName.replace(/^elysia-plugin-/, '').replace(/-([a-z])/g, (_, c) => c)}`,
  stage: argValue('--stage') ?? 'perception',
  dir: argValue('--dir') ?? 'examples',
  withTest: !args.includes('--no-test'),
}

if (!/^elysia-plugin-[a-z0-9-]+$/.test(pluginName)) {
  console.error(`插件名须形如 elysia-plugin-<name>（小写与连字符），收到: ${pluginName}`)
  process.exit(1)
}

const targetDir = join(rootDir, options.dir, pluginName)
if (existsSync(targetDir)) {
  console.error(`目标目录已存在: ${targetDir}`)
  process.exit(1)
}

mkdirSync(join(targetDir, 'src'), { recursive: true })

const shortName = pluginName.replace(/^elysia-plugin-/, '')
const pascal = (value) => value.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('')

// ── package.json ──
writeFileSync(join(targetDir, 'package.json'), JSON.stringify({
  name: pluginName,
  version: '0.1.0',
  private: true,
  description: `${pluginName} —— Elysia A.I. 插件（scaffold 生成，请替换描述）。`,
  type: 'module',
  main: 'lib/index.cjs',
  module: 'lib/index.js',
  types: 'lib/index.d.ts',
  license: 'MIT',
  files: ['lib'],
  scripts: {
    build: 'tsc -p tsconfig.json && esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=lib/index.cjs',
  },
  exports: {
    '.': { types: './lib/index.d.ts', import: './lib/index.js', require: './lib/index.cjs' },
    './package.json': './package.json',
  },
  dependencies: {
    '@elysia-ai/core': 'workspace:*',
    '@elysia-ai/shared': 'workspace:*',
  },
  peerDependencies: { koishi: '^4.18.0' },
  devDependencies: {
    esbuild: '^0.23.1',
    koishi: '^4.18.0',
    typescript: '^5.0.0',
  },
  koishi: {
    description: { en: pluginName, 'zh-CN': pluginName },
    service: { implements: [options.service] },
  },
}, null, 2) + '\n')

// ── tsconfig.json ──
const depth = options.dir.split('/').length + 1
const extendsPath = `${'../'.repeat(depth)}tsconfig.json`
const referencePath = `${'../'.repeat(depth)}packages/@elysia-ai`
writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify({
  extends: extendsPath,
  compilerOptions: { rootDir: 'src', outDir: 'lib', emitDeclarationOnly: false },
  include: ['src'],
  exclude: ['src/**/*.test.ts'],
  references: [
    { path: `${referencePath}/core` },
    { path: `${referencePath}/shared` },
  ],
}, null, 2) + '\n')

// ── src/index.ts ──
writeFileSync(join(targetDir, 'src', 'index.ts'), `/**
 * ${pluginName} —— 由 scaffold 生成。
 * 完整开发说明见 docs/elysia-ai-plugin-development-guide.md；
 * 参考实现见 examples/elysia-plugin-emotion。
 */

import type { CoreEventMap, EventBus, PipelineRunner } from '@elysia-ai/core'
import { Schema } from 'koishi'
import { createElysiaPlugin } from '@elysia-ai/shared'

// 类型化扩展事件（声明合并，无需改 core）：
// declare module '@elysia-ai/core' {
//   interface CoreEventMap {
//     '${shortName}.happened': { detail: string }
//   }
// }

export const name = '${pluginName}'
export const inject = ['elysia.runtime']

export interface Config {
  enabled?: boolean
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true).description('启用本插件'),
}) as Schema<Config>

export interface ${pascal(shortName)}Service {
  getDiagnostics(): { plugin: string, enabled: boolean, ready: boolean, serviceName: string }
}

export const apply = createElysiaPlugin<Config,
  { context: { eventBus: EventBus<CoreEventMap>, pipeline: PipelineRunner<unknown> } },
  ${pascal(shortName)}Service
>({
  name: '${pluginName}',
  serviceFormalName: '${options.service}',
  manifest: {
    name: '${pluginName}',
    version: '0.1.0',
    services: { provides: ['${options.service}'], consumes: ['elysia.runtime'] },
    stages: { hooks: ['${options.stage}'] },
    configNamespace: '${shortName}',
  },
  build({ runtime, config, logger }) {
    if (config.enabled === false) return undefined
    const { pipeline } = runtime.context

    // 阶段钩子：读写共享上下文，发事实事件。
    const unregisterHook = pipeline.registerHook({
      stage: '${options.stage}',
      owner: '${pluginName}',
      async run(pctx) {
        const perception = pctx.read<{ intent: { primary: string } }>('perception')
        pctx.write('${shortName}', { seen: true, intent: perception?.intent.primary })
        logger.debug('${shortName} stage hook ran', { plugin: name, phase: '${shortName}' })
      },
    })

    const service: ${pascal(shortName)}Service = {
      getDiagnostics() {
        return { plugin: name, enabled: true, ready: true, serviceName: '${options.service}' }
      },
    }

    return {
      service,
      dispose() {
        unregisterHook()
      },
    }
  },
})

`)

// ── src/index.test.ts ──
if (options.withTest) {
  writeFileSync(join(targetDir, 'src', 'index.test.ts'), `import { describe, expect, it } from 'vitest'
import type { CoreEventMap } from '@elysia-ai/core'
import { ELYSIA_PIPELINE_STAGES, createHarness } from '@elysia-ai/core'

describe('${pluginName}（createHarness，无需 Koishi app）', () => {
  it('阶段挂载并可运行', () => {
    const harness = createHarness<CoreEventMap>()
    for (const stage of ELYSIA_PIPELINE_STAGES) {
      harness.runner.registerStage(stage)
    }
    // TODO: 用 harness.runner.registerHook / harness.bus.on 断言本插件行为。
    expect(harness.runner.getStageOrder()).toContain('${options.stage}')
  })
})
`)
}

// ── 注册提示与后续步骤 ──
const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
const covered = rootPkg.workspaces.some((glob) => glob === `${options.dir}/*` || glob === options.dir)
console.log(`已生成 ${join(options.dir, pluginName)}`)
if (!covered) {
  console.log(`注意: 根 package.json workspaces 未覆盖 ${options.dir}/*，请手动添加后 yarn install。`)
}
console.log('后续步骤：')
console.log('  1. 在 monorepo 根目录执行 yarn install')
console.log('  2. 运行测试：npx vitest run ' + shortName)
console.log('  3. 阅读 docs/elysia-ai-plugin-development-guide.md 完成业务逻辑')
