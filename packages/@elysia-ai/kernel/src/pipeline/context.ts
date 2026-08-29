/**
 * 请求级上下文（RequestContext）与上下文存储。
 *
 * 解决 Koishi "一次处理中插件共享数据只能靠全局变量或反复查库"的短板：
 * 一次管线运行（例如一条 stimulus 的处理）持有同一个上下文，
 * 上游阶段写入命名空间数据，下游阶段直接读取，无需私搭缓存。
 *
 * 设计要点：
 * - core：本次处理的主对象（对插件只读）。
 * - 命名空间读写：read 可读任意命名空间（含父链回溯），write 记录 trace。
 * - 父链：per-life 子上下文可回溯 per-stimulus 父上下文（感知结果共享）。
 * - stop：任一钩子可终止后续阶段（低显著性丢弃 / 不值得回复）。
 * - TTL：由存储统一清扫，防泄漏。
 */

import type { TraceRecorder } from '../trace/trace.js'
import { TraceRecorder as TraceRecorderClass } from '../trace/trace.js'
export interface RequestContext<TCore = unknown> {
  readonly id: string
  /** 本次处理的主对象（stimulus / 自定义载体），对插件只读。 */
  readonly core: Readonly<TCore>
  /** 命名空间读取；本上下文未命中时沿父链回溯。 */
  read<T>(namespace: string): T | undefined
  /** 命名空间写入（整值替换），记录 trace。 */
  write<T>(namespace: string, value: T, action?: string): void
  /** 以自身命名空间为前缀的便捷视图（读写均限定该命名空间）。 */
  forNamespace(namespace: string): NamespacedView
  /** 终止后续阶段执行；已完成的写入保留。 */
  stop(reason?: string): void
  readonly stopped: boolean
  readonly stopReason?: string
  readonly trace: TraceRecorder
  readonly createdAt: number
  /** 父上下文（per-life 子上下文回溯 per-stimulus 数据）。 */
  readonly parent?: RequestContext<unknown>
}

export interface NamespacedView {
  get<T>(): T | undefined
  set<T>(value: T, action?: string): void
}

class RequestContextImpl<TCore> implements RequestContext<TCore> {
  readonly id: string
  readonly core: Readonly<TCore>
  readonly createdAt = Date.now()
  readonly trace: TraceRecorder
  readonly parent?: RequestContext<unknown>
  private readonly data = new Map<string, unknown>()
  private stoppedFlag = false
  private reason?: string

  constructor(options: {
    id: string
    core: TCore
    trace: TraceRecorder
    parent?: RequestContext<unknown>
  }) {
    this.id = options.id
    this.core = options.core
    this.trace = options.trace
    this.parent = options.parent
  }

  get stopped(): boolean {
    return this.stoppedFlag
  }

  get stopReason(): string | undefined {
    return this.reason
  }

  read<T>(namespace: string): T | undefined {
    if (this.data.has(namespace)) {
      return this.data.get(namespace) as T | undefined
    }
    return this.parent?.read<T>(namespace)
  }

  write<T>(namespace: string, value: T, action = 'write'): void {
    this.data.set(namespace, value)
    this.trace.record({
      kind: 'context-write',
      namespace,
      action,
    })
  }

  forNamespace(namespace: string): NamespacedView {
    return {
      get: <T>() => this.read<T>(namespace),
      set: <T>(value: T, action?: string) => this.write(namespace, value, action),
    }
  }

  stop(reason?: string): void {
    this.stoppedFlag = true
    this.reason = reason
    this.trace.record({ kind: 'pipeline-stop', reason: reason ?? '' })
  }
}

export interface RequestContextStoreOptions {
  /** 上下文最大存活时长（ms），sweep 时超龄清理。默认 10 分钟。 */
  maxAgeMs?: number
}

export class RequestContextStore {
  private readonly contexts = new Map<string, RequestContextImpl<unknown>>()
  private readonly maxAgeMs: number

  constructor(options: RequestContextStoreOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? 10 * 60 * 1000
  }

  create<TCore>(options: {
    id: string
    core: TCore
    /** 缺省时内部新建独立 TraceRecorder。 */
    trace?: TraceRecorder
    parent?: RequestContext<unknown>
  }): RequestContext<TCore> {
    const context = new RequestContextImpl<TCore>({
      id: options.id,
      core: options.core,
      trace: options.trace ?? new TraceRecorderClass(),
      parent: options.parent,
    })
    this.contexts.set(options.id, context as RequestContextImpl<unknown>)
    return context
  }

  get<TCore = unknown>(id: string): RequestContext<TCore> | undefined {
    return this.contexts.get(id) as RequestContext<TCore> | undefined
  }

  delete(id: string): boolean {
    return this.contexts.delete(id)
  }

  get size(): number {
    return this.contexts.size
  }

  /** 清扫超龄上下文，返回清理数量。管线正常完成时应主动 delete，sweep 兜底。 */
  sweep(now = Date.now()): number {
    let removed = 0
    for (const [id, context] of this.contexts) {
      if (now - context.createdAt > this.maxAgeMs) {
        this.contexts.delete(id)
        removed++
      }
    }
    return removed
  }
}

/** 便捷构造：创建带独立 TraceRecorder 的请求上下文。 */
export function createRequestContext<TCore>(options: {
  id: string
  core: TCore
  parent?: RequestContext<unknown>
  onTraceFinished?: (root: import('../trace/trace.js').TraceSpan) => void
}): RequestContext<TCore> {
  const trace = new TraceRecorderClass((root) => options.onTraceFinished?.(root))
  return new RequestContextImpl<TCore>({
    id: options.id,
    core: options.core,
    trace,
    parent: options.parent,
  })
}
