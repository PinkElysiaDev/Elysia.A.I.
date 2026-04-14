/**
 * elysia-ai-body Koishi 插件入口
 *
 * 此文件是 body 插件的 Koishi 集成入口，包含有 Koishi 依赖的代码。
 * 纯逻辑函数（如 handlePlatformMessage）已拆分到 message-handler.ts，
 * 可在不依赖 Koishi 的情况下直接导入和测试。
 */

import { Context, Schema } from 'koishi'
import type { Runtime } from 'koishi-plugin-elysia-ai-runtime'
import { KoishiBodyAdapter } from './adapters/koishi/index.js'

export const name = 'elysia-ai-body'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

// 扩展 Context 类型，添加 runtime 属性
declare module 'koishi' {
  interface Context {
    'elysia-ai-runtime'?: Runtime
  }
}

// 重导出纯逻辑函数，保持外部使用兼容性
export { handlePlatformMessage } from './message-handler.js'
export * from './types/index.js'
export * from './normalize/session-to-stimulus.js'
export * from './sender/index.js'
export * from './adapters/koishi/index.js'

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('elysia-ai-body')

  logger.info('body plugin apply started', {
    plugin: 'elysia-ai-body',
    phase: 'apply',
  })

  // 获取 runtime 实例
  // 注意：需要 runtime 插件先被加载
  const runtime = ctx['elysia-ai-runtime']
  
  if (!runtime) {
    logger.error('runtime not found; body plugin cannot continue', {
      plugin: 'elysia-ai-body',
      phase: 'apply',
    })
    return
  }

  logger.debug('runtime dependency resolved for body plugin', {
    plugin: 'elysia-ai-body',
    phase: 'apply',
  })

  // 创建并注册 Koishi 适配器
  const adapter = new KoishiBodyAdapter(ctx, runtime, config)
  adapter.registerListeners()
  
  logger.info('body adapter registered', {
    plugin: 'elysia-ai-body',
    phase: 'adapter',
  })

  // 插件卸载时清理
  ctx.on('dispose', () => {
    adapter.removeListeners()
    logger.info('body adapter disposed', {
      plugin: 'elysia-ai-body',
      phase: 'dispose',
    })
  })
}
