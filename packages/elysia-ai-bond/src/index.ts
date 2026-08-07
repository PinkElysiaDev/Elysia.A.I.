import { Schema, type Context } from 'koishi'
import { createBondPluginRuntime, MemoryBondRepository, MongoBondRepository } from '@elysia-ai/bond'
import type { Config as BondConfig, BondRepositoryFactoryOptions, MongoBondCollection } from '@elysia-ai/bond'
import type { BondContextProvider, BondRepository, BondService, CoreEventMap, EventBus, PersistenceService } from '@elysia-ai/core'
import {
  getOptionalElysiaService,
  getRequiredElysiaService,
  registerElysiaService,
} from '@elysia-ai/shared'
export * from '@elysia-ai/bond'


type BondPluginConfig = BondConfig & {
  repositoryFactory?: (options: BondRepositoryFactoryOptions) => BondRepository
}


export function createMongoBondRepositoryFactory(
  collection: MongoBondCollection,
  options: { collectionName?: string; ensureIndexes?: boolean } = {},
): (factoryOptions: BondRepositoryFactoryOptions) => BondRepository {
  return ({ logger }) => {
    const repository = new MongoBondRepository(collection, options)
    // 惰性连接：索引建立失败（如 Mongo 不可达）记录而非抛出未捕获 rejection。
    void repository.ensureIndexes().catch((error) => {
      logger.error('failed to ensure mongo indexes', error, { plugin: 'elysia-ai-bond', phase: 'ensure-indexes' })
    })
    return repository
  }
}

export const name = 'elysia-ai-bond'

// 声明对 runtime 的必需依赖：cordis 会在 elysia.runtime 就绪后再跑本插件 apply。
export const inject = ['elysia.runtime']

export const Config: Schema<BondConfig> = Schema.object({
  enabled: Schema.boolean().default(true).description('启用羁绊（关系）能力。'),
  contextLimit: Schema.number().default(5).description('注入对话的羁绊条数上限。'),
})

/**
 * 解析羁绊仓储工厂：
 * 1. 若宿主注入了 repositoryFactory，优先用它（测试/自定义场景）。
 * 2. 否则从 elysia.persistence 服务获取：mongo 模式拿到 collection 句柄 → 建 mongo 仓储；
 *    memory 模式或服务未注册 → 内存降级。
 */
function resolveBondRepositoryFactory(
  config: BondPluginConfig,
  ctx: Context,
  logger: ReturnType<Context['logger']>,
): (options: BondRepositoryFactoryOptions) => BondRepository {
  if (config.repositoryFactory) return config.repositoryFactory

  const persistence = getOptionalElysiaService<PersistenceService>(ctx, {
    formalName: 'elysia.persistence',
    legacyName: 'elysia-ai-persistence',
  })

  const collection = persistence?.getCollection('elysia_bonds')
  if (persistence && collection) {
    logger.info('bond repository resolved from persistence service', {
      plugin: 'elysia-ai-bond',
      phase: 'repository-resolve',
      mode: persistence.mode,
    })
    return createMongoBondRepositoryFactory(collection as unknown as MongoBondCollection, { ensureIndexes: true })
  }

  logger.info('bond repository falling back to in-memory', {
    plugin: 'elysia-ai-bond',
    phase: 'repository-resolve',
    persistenceMode: persistence?.mode ?? 'unavailable',
  })
  return () => new MemoryBondRepository()
}

export function apply(ctx: Context, config: BondPluginConfig) {
  const logger = ctx.logger('elysia-ai-bond')
  const runtime = getRequiredElysiaService<{
    context: { eventBus: EventBus<CoreEventMap> }
    bondRepository?: BondRepository
    bondService?: BondService
    bondContextProvider?: BondContextProvider
  }>(ctx, {
    formalName: 'elysia.runtime',
    legacyName: 'elysia-ai-runtime',
    logger,
    plugin: 'elysia-ai-bond',
    description: 'runtime service',
  })

  if (!runtime?.context?.eventBus) return

  const bondRuntime = createBondPluginRuntime({
    runtime,
    config,
    logger,
    repositoryFactory: resolveBondRepositoryFactory(config, ctx, logger),
  })
  if (!bondRuntime) return

  registerElysiaService(ctx, {
    formalName: 'elysia.bond',
    legacyName: 'elysia-ai-bond',
    service: bondRuntime.service,
    logger,
    plugin: 'elysia-ai-bond',
  })

  runtime.bondRepository = bondRuntime.repository
  runtime.bondService = bondRuntime.bondService
  runtime.bondContextProvider = bondRuntime.contextProvider

  ctx.on('dispose', () => {
    bondRuntime.dispose()
    // 不再 close mongo 连接：持久化连接生命周期由 runtime 的 stateRepository 统一管理。
    if (runtime.bondRepository === bondRuntime.repository) runtime.bondRepository = undefined
    if (runtime.bondService === bondRuntime.bondService) runtime.bondService = undefined
    if (runtime.bondContextProvider === bondRuntime.contextProvider) runtime.bondContextProvider = undefined
  })
}
