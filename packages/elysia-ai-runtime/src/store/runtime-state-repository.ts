import type { HomeostasisState, LifeStateRepository } from '@elysia-ai/core'
import type { RuntimeLogger } from '../context/index.js'
import { MemoryStateRepository } from './memory-state-repository.js'
import { MongoStateRepository, type MongoStateCollection } from './mongo-state-repository.js'
import { connectMongo, type MongoConnection, type MongoClientLike, type MongoConnectorDependencies } from '@elysia-ai/shared'

export type RuntimeStateRepositoryType = 'memory' | 'mongo'

export interface RuntimeStateRepositoryConfig {
  stateRepository?: RuntimeStateRepositoryType
  uri?: string
  database?: string
  collection?: string
  stateType?: string
  failFast?: boolean
}

export interface RuntimeStateRepositorySetup {
  repository: LifeStateRepository<HomeostasisState>
  /** mongo 模式下共享的 Mongo 连接（供 persistence 服务暴露给 memory/bond 等）；memory 模式为 undefined */
  mongoConnection?: MongoConnection
  dispose(): Promise<void>
}

export interface RuntimeStateRepositoryDependencies {
  /** 注入点：测试或自定义场景下替换真实 MongoClient 构造（与 shared.MongoClientLike 对齐）。 */
  createMongoClient?(uri: string): MongoClientLike
}

const DEFAULT_MONGO_DATABASE = 'elysia_ai'
const DEFAULT_MONGO_COLLECTION = 'life_states'
const DEFAULT_MONGO_STATE_TYPE = 'homeostasis'

function createMemorySetup(): RuntimeStateRepositorySetup {
  return {
    repository: new MemoryStateRepository<HomeostasisState>(),
    async dispose() {
      // Memory repository has no external resources.
    },
  }
}

async function createMongoSetup(
  config: RuntimeStateRepositoryConfig,
  logger: RuntimeLogger,
  dependencies: RuntimeStateRepositoryDependencies,
): Promise<RuntimeStateRepositorySetup> {
  if (!config.uri) {
    throw new Error('Mongo state repository requires uri')
  }

  const connectorDependencies: MongoConnectorDependencies = dependencies.createMongoClient
    ? { createMongoClient: dependencies.createMongoClient }
    : {}

  const connection = await connectMongo(
    { uri: config.uri, database: config.database },
    connectorDependencies,
  )

  const database = config.database ?? DEFAULT_MONGO_DATABASE
  const collectionName = config.collection ?? DEFAULT_MONGO_COLLECTION
  const stateType = config.stateType ?? DEFAULT_MONGO_STATE_TYPE
  // connection.collection 要求 TDoc extends { id: string }，但 HomeostasisState 无 id 字段。
  // 实际 collection 句柄是裸 mongodb driver，对文档形状无强制要求，用 cast 放宽。
  const collection = (connection as { collection(name: string): unknown }).collection(collectionName) as unknown as MongoStateCollection<HomeostasisState>
  const repository = new MongoStateRepository<HomeostasisState>(collection, {
    stateType,
  })

  await repository.ensureIndexes()

  logger.info('mongo state repository initialized', {
    plugin: 'elysia-ai-runtime',
    phase: 'state-repository',
    database,
    collection: collectionName,
    stateType,
  })

  return {
    repository,
    mongoConnection: connection,
    async dispose() {
      await connection.close()
      logger.info('mongo state repository disposed', {
        plugin: 'elysia-ai-runtime',
        phase: 'state-repository',
      })
    },
  }
}

export async function createRuntimeStateRepository(
  config: RuntimeStateRepositoryConfig | undefined,
  logger: RuntimeLogger,
  dependencies: RuntimeStateRepositoryDependencies = {},
): Promise<RuntimeStateRepositorySetup> {
  const type = config?.stateRepository ?? 'memory'

  if (type === 'memory') {
    logger.debug('memory state repository selected', {
      plugin: 'elysia-ai-runtime',
      phase: 'state-repository',
    })
    return createMemorySetup()
  }

  if (type !== 'mongo') {
    throw new Error(`Unsupported runtime state repository type: ${String(type)}`)
  }

  try {
    return await createMongoSetup(config ?? {}, logger, dependencies)
  } catch (error) {
    logger.error('failed to initialize mongo state repository', error, {
      plugin: 'elysia-ai-runtime',
      phase: 'state-repository',
      failFast: Boolean(config?.failFast),
    })

    if (config?.failFast) {
      throw error
    }

    logger.info('falling back to memory state repository', {
      plugin: 'elysia-ai-runtime',
      phase: 'state-repository',
    })
    return createMemorySetup()
  }
}
