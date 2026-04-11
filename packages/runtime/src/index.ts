
import { Context, Schema } from 'koishi'
import { createDefaultRuntime, type Runtime } from './runtime.js'
import { loadManifestFromFile } from './manifest/loader.js'

export const name = 'elysia-ai-runtime'

export interface Config {
  /**
   * 生命体实例声明配置文件路径（JSON 格式）
   * 留空则不加载任何预设生命体
   */
  manifestPath?: string
}

export const Config: Schema<Config> = Schema.object({
  manifestPath: Schema.string()
    .description('生命体实例声明配置文件路径（JSON 格式），留空则不加载预设生命体'),
})

export * from './context/index.js'
export * from './runtime.js'
export * from './registry/life-registry.js'
export * from './registry/habitat-registry.js'
export * from './registry/memory-life-registry.js'
export * from './registry/memory-habitat-registry.js'
export * from './scheduler/index.js'
export * from './lifecycle/index.js'
export * from './manifest/index.js'

// 扩展 Context 类型，添加 runtime 属性
declare module 'koishi' {
  interface Context {
    'elysia-ai-runtime'?: Runtime
  }
}

export async function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('elysia-ai-runtime')

  logger.info('runtime plugin apply started', {
    plugin: 'elysia-ai-runtime',
    phase: 'apply',
    hasManifestPath: Boolean(config.manifestPath),
  })

  // 创建默认 runtime 实例
  const runtime = createDefaultRuntime({
    info(message, meta) {
      logger.info(message, meta)
    },
    debug(message, meta) {
      logger.debug(message, meta)
    },
    error(message, error, meta) {
      if (meta && error) {
        logger.error(message, meta, error)
        return
      }
      if (error) {
        logger.error(message, error)
        return
      }
      if (meta) {
        logger.error(message, meta)
        return
      }
      logger.error(message)
    },
  })

  // 将 runtime 挂载到 ctx 上，供其他插件使用
  ctx['elysia-ai-runtime'] = runtime

  logger.debug('runtime instance attached to context', {
    plugin: 'elysia-ai-runtime',
    phase: 'apply',
  })

  // 启动 runtime
  try {
    await runtime.start()
  } catch (error) {
    logger.error('failed to start runtime', error)
    return
  }

  // 加载 manifest 配置（如果配置了 manifestPath）
  if (config.manifestPath) {
    try {
      logger.info('manifest loading requested', {
        plugin: 'elysia-ai-runtime',
        phase: 'manifest',
        manifestPath: config.manifestPath,
      })

      const manifest = await loadManifestFromFile(config.manifestPath)
      await runtime.loadManifest(manifest)
      logger.info('manifest loading completed', {
        plugin: 'elysia-ai-runtime',
        phase: 'manifest',
        lifeInstanceCount: manifest.lifeInstances.length,
      })
    } catch (error) {
      logger.error('failed to load manifest', error, {
        plugin: 'elysia-ai-runtime',
        phase: 'manifest',
        manifestPath: config.manifestPath,
      })
    }
  }

  // 插件卸载时停止 runtime
  ctx.on('dispose', async () => {
    try {
      await runtime.stop()
    } catch (error) {
      logger.error('failed to stop runtime', error, {
        plugin: 'elysia-ai-runtime',
        phase: 'dispose',
      })
    }
  })
}
