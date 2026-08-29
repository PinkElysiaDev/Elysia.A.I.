import type { EventBus } from '@elysia-ai/core'
import type { CoreEventMap } from '@elysia-ai/core'
import type { PipelineRunner, PluginManifestRegistry, RequestContextStore } from '@elysia-ai/core'

export interface RuntimeLogger {
  info(message: string, meta?: Record<string, any>): void
  debug(message: string, meta?: Record<string, any>): void
  warn?(message: string, meta?: Record<string, any>): void
  error(message: string, error?: unknown, meta?: Record<string, any>): void
}

export interface RuntimeContext {
  eventBus: EventBus<CoreEventMap>
  logger: RuntimeLogger
  /**
   * 阶段化管线调度器（kernel）。DefaultRuntime 构造时自动补齐并注册
   * ELYSIA_PIPELINE_STAGES；裸上下文（单包测试）可缺省，能力包在
   * 缺省时回退事件装配（迁移期兼容）。
   */
  pipeline?: PipelineRunner<unknown>
  /** 请求级上下文存储（按 stimulusId 键；刺激段为父、生命段为子）。 */
  contexts?: RequestContextStore
  /** 插件 manifest 注册表（兼容治理：依赖/版本/命名空间校验，告警式）。 */
  manifests?: PluginManifestRegistry
}
