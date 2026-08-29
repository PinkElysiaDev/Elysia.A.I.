/**
 * Trace 记录器：span 树 + 结构化事件。
 *
 * 解决 Koishi "插件行为无法追踪，出问题靠翻日志"的短板：
 * 管线每次运行为请求上下文挂一个 TraceRecorder，阶段/钩子/gateway
 * 调用自动成 span，observatory 通过 onTraceFinished 汇聚全链路视图。
 *
 * 嵌套规则：span 必须在返回前 await 完毕（顺序执行模型下栈式嵌套
 * 即为正确树）。并发兄弟 span 由调用方各自 await 保证。
 */

export type TraceSpanStatus = 'running' | 'ok' | 'error'

export interface TraceSpan {
  name: string
  meta?: Record<string, unknown>
  startedAt: number
  endedAt?: number
  status: TraceSpanStatus
  error?: string
  children: TraceSpan[]
}

export interface TraceEventRecord {
  kind: 'context-write' | 'pipeline-stop' | 'custom'
  namespace?: string
  action?: string
  reason?: string
  at: number
}

export class TraceRecorder {
  readonly root: TraceSpan
  private readonly stack: TraceSpan[]
  private readonly events: TraceEventRecord[] = []
  private readonly onFinished?: (root: TraceSpan, events: TraceEventRecord[]) => void
  private finished = false

  constructor(onFinished?: (root: TraceSpan, events: TraceEventRecord[]) => void) {
    this.root = { name: 'root', startedAt: Date.now(), status: 'running', children: [] }
    this.stack = [this.root]
    this.onFinished = onFinished
  }

  /** 在当前栈顶 span 下执行函数，自动计时与状态标记。 */
  async span<T>(name: string, fn: () => Promise<T> | T, meta?: Record<string, unknown>): Promise<T> {
    const parent = this.stack[this.stack.length - 1] ?? this.root
    const span: TraceSpan = { name, meta, startedAt: Date.now(), status: 'running', children: [] }
    parent.children.push(span)
    this.stack.push(span)
    try {
      const result = await fn()
      span.status = 'ok'
      span.endedAt = Date.now()
      return result
    } catch (error) {
      span.status = 'error'
      span.endedAt = Date.now()
      span.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      const index = this.stack.lastIndexOf(span)
      if (index !== -1) this.stack.splice(index, 1)
    }
  }

  /** 记录结构化事件（上下文写入 / 管线终止 / 自定义）。 */
  record(event: Omit<TraceEventRecord, 'at'>): void {
    this.events.push({ ...event, at: Date.now() })
  }

  /** 结束根 span 并回调汇聚方；幂等。 */
  finish(): void {
    if (this.finished) return
    this.finished = true
    if (this.root.status === 'running') {
      this.root.status = 'ok'
      this.root.endedAt = Date.now()
    }
    this.onFinished?.(this.root, [...this.events])
  }

  /** 以 error 状态结束根 span；幂等。 */
  fail(error: unknown): void {
    if (this.finished) return
    this.finished = true
    this.root.status = 'error'
    this.root.endedAt = Date.now()
    this.root.error = error instanceof Error ? error.message : String(error)
    this.onFinished?.(this.root, [...this.events])
  }

  getRecords(): TraceEventRecord[] {
    return [...this.events]
  }
}
