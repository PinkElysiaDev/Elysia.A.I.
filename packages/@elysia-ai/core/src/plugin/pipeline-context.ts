/**
 * Elysia A.I. 流水线上下文（统一容器）
 * 
 * 在生命处理流水线的每个阶段，所有插件通过 PipelineContext 传递数据。
 * 
 * 三区设计：
 * - core：当前阶段的核心数据（原则上只读）
 * - ext：插件扩展数据区（按命名空间隔离）
 * - trace：操作追踪区（自动记录每个插件的行为）
 */

/**
 * 流水线操作追踪记录
 */
export interface PipelineTraceEntry {
  /** 操作发生的插件名（configNamespace） */
  plugin: string
  /** 操作发生的处理阶段 */
  stage: string
  /** 操作描述 */
  action: string
  /** 时间戳（Unix ms） */
  at: number
}

/**
 * 统一流水线上下文
 * 
 * @typeParam TCore 当前处理阶段的核心数据类型
 */
export interface PipelineContext<TCore = unknown> {
  /**
   * 核心数据区
   * 持有当前处理阶段的核心对象（如 Stimulus、LifeInstance 等）
   * 原则上对插件只读，防止插件随意破坏系统主语
   */
  core: Readonly<TCore>

  /**
   * 扩展数据区
   * 按插件 configNamespace 隔离，每个插件只能读写自己命名空间的数据
   * 下游插件可以读取上游插件的结果，但不能修改
   * 
   * 写入示例：ctx.ext['@elysia-ai/my-plugin'] = { key: value }
   */
  ext: Record<string, Record<string, unknown>>

  /**
   * 操作追踪区
   * 自动记录每个插件在哪个阶段做了什么
   * 为 observatory 的可解释性提供基础
   */
  trace: PipelineTraceEntry[]
}

/**
 * 创建一个最小的 PipelineContext
 */
export function createPipelineContext<TCore>(
  core: TCore,
  stage: string
): PipelineContext<TCore> {
  return {
    core: core as Readonly<TCore>,
    ext: {},
    trace: [],
  }
}

/**
 * 向 PipelineContext 写入扩展数据（插件专用）
 * 同时自动记录 trace
 */
export function writePluginExt(
  ctx: PipelineContext<unknown>,
  pluginNamespace: string,
  stage: string,
  data: Record<string, unknown>,
  action = 'write'
): void {
  ctx.ext[pluginNamespace] = {
    ...(ctx.ext[pluginNamespace] ?? {}),
    ...data,
  }
  ctx.trace.push({
    plugin: pluginNamespace,
    stage,
    action,
    at: Date.now(),
  })
}
