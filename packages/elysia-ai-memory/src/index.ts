import { Schema, type Context } from 'koishi'
import { createMemoryPluginRuntime, MemoryMemoryRepository, MongoMemoryRepository } from '@elysia-ai/memory'
import type { Config as MemoryConfig, MemoryRepositoryFactoryOptions, MongoMemoryCollection } from '@elysia-ai/memory'
import type { CoreEventMap, EventBus, MemoryContextProvider, MemoryRepository, MemoryService, PersistenceService } from '@elysia-ai/core'
import {
  getOptionalElysiaService,
  getRequiredElysiaService,
  registerElysiaService,
} from '@elysia-ai/shared'
export * from '@elysia-ai/memory'


type MemoryPluginConfig = MemoryConfig & {
  repositoryFactory?: (options: MemoryRepositoryFactoryOptions) => MemoryRepository
}


export function createMongoMemoryRepositoryFactory(
  collection: MongoMemoryCollection,
  options: { collectionName?: string; ensureIndexes?: boolean } = {},
): (factoryOptions: MemoryRepositoryFactoryOptions) => MemoryRepository {
  return ({ logger }) => {
    const repository = new MongoMemoryRepository(collection, options)
    // 惰性连接：索引建立失败（如 Mongo 不可达）记录而非抛出未捕获 rejection。
    void repository.ensureIndexes().catch((error) => {
      logger.error('failed to ensure mongo indexes', error, { plugin: 'elysia-ai-memory', phase: 'ensure-indexes' })
    })
    return repository
  }
}

export const name = 'elysia-ai-memory'

// 声明对 runtime 的必需依赖：cordis 会在 elysia.runtime 就绪后再跑本插件 apply。
export const inject = ['elysia.runtime']

export const Config: Schema<MemoryConfig> = Schema.object({
  enabled: Schema.boolean().default(true).description('启用记忆能力。'),
  contextLimit: Schema.number().default(5).description('注入对话的记忆条数上限。'),
  maxEntriesPerLife: Schema.number().description('每个生命体的记忆条数上限（留空不限制）。'),
})

/**
 * 解析记忆仓储工厂：
 * 1. 若宿主注入了 repositoryFactory，优先用它（测试/自定义场景）。
 * 2. 否则从 elysia.persistence 服务获取：mongo 模式拿到 collection 句柄 → 建 mongo 仓储；
 *    memory 模式或服务未注册 → 内存降级。
 */
function resolveMemoryRepositoryFactory(
  config: MemoryPluginConfig,
  ctx: Context,
  logger: ReturnType<Context['logger']>,
): (options: MemoryRepositoryFactoryOptions) => MemoryRepository {
  if (config.repositoryFactory) return config.repositoryFactory

  const persistence = getOptionalElysiaService<PersistenceService>(ctx, {
    formalName: 'elysia.persistence',
    legacyName: 'elysia-ai-persistence',
  })

  const collection = persistence?.getCollection('elysia_memories')
  if (persistence && collection) {
    logger.info('memory repository resolved from persistence service', {
      plugin: 'elysia-ai-memory',
      phase: 'repository-resolve',
      mode: persistence.mode,
    })
    return createMongoMemoryRepositoryFactory(collection as unknown as MongoMemoryCollection, { ensureIndexes: true })
  }

  logger.info('memory repository falling back to in-memory', {
    plugin: 'elysia-ai-memory',
    phase: 'repository-resolve',
    persistenceMode: persistence?.mode ?? 'unavailable',
  })
  return () => new MemoryMemoryRepository()
}

export function apply(ctx: Context, config: MemoryPluginConfig) {
  const logger = ctx.logger('elysia-ai-memory')
  const runtime = getRequiredElysiaService<{
    context: { eventBus: EventBus<CoreEventMap> }
    memoryRepository?: MemoryRepository
    memoryService?: MemoryService
    memoryContextProvider?: MemoryContextProvider
  }>(ctx, {
    formalName: 'elysia.runtime',
    legacyName: 'elysia-ai-runtime',
    logger,
    plugin: 'elysia-ai-memory',
    description: 'runtime service',
  })

  if (!runtime?.context?.eventBus) return

  const memoryRuntime = createMemoryPluginRuntime({
    runtime,
    config,
    logger,
    repositoryFactory: resolveMemoryRepositoryFactory(config, ctx, logger),
  })
  if (!memoryRuntime) return

  registerElysiaService(ctx, {
    formalName: 'elysia.memory',
    legacyName: 'elysia-ai-memory',
    service: memoryRuntime.service,
    logger,
    plugin: 'elysia-ai-memory',
  })

  runtime.memoryRepository = memoryRuntime.repository
  runtime.memoryService = memoryRuntime.memoryService
  runtime.memoryContextProvider = memoryRuntime.contextProvider

  ctx.on('dispose', () => {
    memoryRuntime.dispose()
    // 不再 close mongo 连接：持久化连接生命周期由 runtime 的 stateRepository 统一管理。
    if (runtime.memoryRepository === memoryRuntime.repository) runtime.memoryRepository = undefined
    if (runtime.memoryService === memoryRuntime.memoryService) runtime.memoryService = undefined
    if (runtime.memoryContextProvider === memoryRuntime.contextProvider) runtime.memoryContextProvider = undefined
  })
}
