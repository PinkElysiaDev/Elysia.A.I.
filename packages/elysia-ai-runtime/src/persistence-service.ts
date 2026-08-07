import type { PersistenceCollectionLike, PersistenceMode, PersistenceService } from '@elysia-ai/core'
import type { MongoConnection } from '@elysia-ai/shared'

/**
 * 默认持久化服务实现：由 runtime 注册为 elysia.persistence。
 *
 * 持久化方式由 runtime 统一决定（stateRepository 配置），
 * 通过此服务对外公开 mode 与 collection 句柄。
 * memory/bond 等消费方根据 mode 与 getCollection 自行选择仓储实现：
 * - memory 模式 / 服务未注册 → 回退内存仓储
 * - mongo 模式 → getCollection 返回句柄，建 mongo 仓储
 *
 * 连接生命周期归 runtime 的 stateRepositorySetup 管，本服务不 close。
 */
export class DefaultPersistenceService implements PersistenceService {
  constructor(
    private readonly _mode: PersistenceMode,
    private readonly connection?: MongoConnection,
  ) {}

  get mode(): PersistenceMode {
    return this._mode
  }

  getCollection<TDoc>(name: string) {
    // connection.collection 要求 TDoc extends { id: string }，但持久化服务的调用方
    // （memory/bond）各自定义文档类型，不一定都有 id 字段。用 cast 放宽约束，
    // 实际 collection 句柄是裸 mongodb driver，对文档形状无强制要求。
    type LooseConnection = { collection(name: string): unknown }
    const conn = this.connection as LooseConnection | undefined
    return conn?.collection(name) as PersistenceCollectionLike<TDoc> | undefined
  }
}
