import { Context, Schema } from 'koishi'
import { createDefaultRuntime, type Runtime } from './runtime.js'
import { loadManifestFromFile } from './manifest/loader.js'
import type { RuntimeLogger } from './context/index.js'
import type { PersistenceMode, PersistenceService } from '@elysia-ai/core'
import { registerElysiaService } from '@elysia-ai/shared'
import {
  createRuntimeStateRepository,
  type RuntimeStateRepositoryConfig,
  type RuntimeStateRepositorySetup,
} from './store/runtime-state-repository.js'
import { DefaultPersistenceService } from './persistence-service.js'

export const name = 'elysia-ai-runtime'

export interface Config extends RuntimeStateRepositoryConfig {
  /**
   * 生命体清单 JSON 文件路径。留空则不加载预设生命体。
   */
  manifestPath?: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    manifestPath: Schema.string()
      .description('生命体清单 JSON 文件路径。留空则不加载预设生命体。'),
    stateRepository: Schema.union(['memory', 'mongo'])
      .default('memory')
      .description('生命状态仓储类型：memory 为内存仓储（重启即丢），mongo 为 MongoDB 持久化。'),
  }).description('基础设置'),
  Schema.union([
    Schema.object({
      stateRepository: Schema.const('mongo').required(),
      uri: Schema.string()
        .role('secret')
        .required()
        .description('MongoDB 连接 URI。'),
      database: Schema.string()
        .default('elysia_ai')
        .description('MongoDB 数据库名。'),
      collection: Schema.string()
        .default('life_states')
        .description('MongoDB 集合名。'),
      stateType: Schema.string()
        .default('homeostasis')
        .description('状态类型分区键。'),
      failFast: Schema.boolean()
        .default(false)
        .description('Mongo 初始化失败时是否中止 runtime 插件加载。'),
    }).description('MongoDB 持久化').collapse(),
    Schema.object({}),
  ]),
  // schemastery 3.x 类型推断对「union 含空分支」会塌缩为空对象，运行时行为正确，此处断言绕过。
]) as Schema<Config>
export * from './context/index.js'
export * from './runtime.js'
export * from './registry/life-registry.js'
export * from './registry/habitat-registry.js'
export * from './registry/memory-life-registry.js'
export * from './registry/memory-habitat-registry.js'
export * from './registry/memory-persona-registry.js'
export * from './store/memory-conversation-store.js'
export * from './store/memory-state-repository.js'
export * from './store/mongo-state-repository.js'
export * from './store/runtime-state-repository.js'
export * from './scheduler/index.js'
export * from './scheduler/mongo-scheduled-task-repository.js'
export * from './behavior-execution/index.js'
export * from './homeostasis/index.js'
export * from './lifecycle/index.js'
export * from './manifest/index.js'
export * from './projection/registry.js'
export * from './projection/default-resolver.js'
export * from './projection/memory-projection-rule-repository.js'
export * from './projection/mongo-projection-rule-repository.js'
export * from './projection/projection-rule-service.js'
export * from './persistence-service.js'

// Extend Koishi Context with runtime compatibility field.
declare module 'koishi' {
  interface Context {
    'elysia.runtime'?: Runtime
    'elysia-ai-runtime'?: Runtime
    'elysia.persistence'?: PersistenceService
    'elysia-ai-persistence'?: PersistenceService
  }
}

export async function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('elysia-ai-runtime')

  logger.info('runtime plugin apply started', {
    plugin: 'elysia-ai-runtime',
    phase: 'apply',
    hasManifestPath: Boolean(config.manifestPath),
    stateRepositoryType: config.stateRepository ?? 'memory',
  })

  const runtimeLogger: RuntimeLogger = {
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
  }

  let stateRepositorySetup: RuntimeStateRepositorySetup
  try {
    stateRepositorySetup = await createRuntimeStateRepository(config, runtimeLogger)
  } catch (error) {
    logger.error('failed to initialize runtime state repository', error, {
      plugin: 'elysia-ai-runtime',
      phase: 'state-repository',
    })
    return
  }

  const runtime = createDefaultRuntime({
    logger: runtimeLogger,
    stateRepository: stateRepositorySetup.repository,
  })

  registerElysiaService(ctx, {
    formalName: 'elysia.runtime',
    legacyName: 'elysia-ai-runtime',
    service: runtime,
    logger: runtimeLogger,
    plugin: 'elysia-ai-runtime',
  })

  // 将持久化方式公开为独立服务 elysia.persistence：
  // memory/bond 等消费方注入此服务，根据 mode 与 getCollection 自行选择仓储实现。
  // mode 以实际建立的 mongo 连接为准（mongo 连接失败回退内存时，mode 应为 memory）。
  const persistenceMode: PersistenceMode = stateRepositorySetup.mongoConnection ? 'mongo' : 'memory'
  const persistenceService: PersistenceService = new DefaultPersistenceService(
    persistenceMode,
    stateRepositorySetup.mongoConnection,
  )
  registerElysiaService(ctx, {
    formalName: 'elysia.persistence',
    legacyName: 'elysia-ai-persistence',
    service: persistenceService,
    logger: runtimeLogger,
    plugin: 'elysia-ai-runtime',
  })

  logger.debug('runtime instance attached to context', {
    plugin: 'elysia-ai-runtime',
    phase: 'apply',
  })

  // 闂備礁鎲￠崙褰掑垂閻楀牊鍙?runtime
  try {
    await runtime.start()
  } catch (error) {
    logger.error('failed to start runtime', error)
    try {
      await stateRepositorySetup.dispose()
    } catch (disposeError) {
      logger.error('failed to dispose state repository after runtime start failure', disposeError, {
        plugin: 'elysia-ai-runtime',
        phase: 'dispose',
      })
    }
    return
  }

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

  ctx.on('dispose', async () => {
    try {
      await runtime.stop()
    } catch (error) {
      logger.error('failed to stop runtime', error, {
        plugin: 'elysia-ai-runtime',
        phase: 'dispose',
      })
    }

    try {
      await stateRepositorySetup.dispose()
    } catch (error) {
      logger.error('failed to dispose state repository', error, {
        plugin: 'elysia-ai-runtime',
        phase: 'dispose',
      })
    }
  })
}
