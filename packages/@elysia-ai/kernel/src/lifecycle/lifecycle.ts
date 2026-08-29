/**
 * 生命周期相位管理。
 *
 * 解决 cordis "apply/dispose 两态" 的粒度问题：
 * constructed → ready → started，以及 started → stopped → disposed。
 * 相位处理器按注册顺序执行，单个处理器失败记录后继续（相位到达是事实，
 * 不因个别处理器失败而回滚），但 transition 会汇总错误抛出给宿主决定。
 */

export type KernelLifecyclePhase = 'constructed' | 'ready' | 'started' | 'stopped' | 'disposed'

const FORWARD_ORDER: KernelLifecyclePhase[] = ['constructed', 'ready', 'started', 'stopped', 'disposed']

export class LifecycleManager {
  private phase: KernelLifecyclePhase = 'constructed'
  private readonly handlers = new Map<KernelLifecyclePhase, Array<(phase: KernelLifecyclePhase) => void | Promise<void>>>()
  private transitioning: Promise<void> | undefined

  get currentPhase(): KernelLifecyclePhase {
    return this.phase
  }

  /** 注册相位处理器；若目标相位已越过，立即以当前相位回调（迟到者补票）。 */
  onPhase(phase: KernelLifecyclePhase, handler: (phase: KernelLifecyclePhase) => void | Promise<void>): () => void {
    if (FORWARD_ORDER.indexOf(this.phase) >= FORWARD_ORDER.indexOf(phase)) {
      void Promise.resolve(handler(this.phase)).catch(() => {})
      return () => {}
    }
    const list = this.handlers.get(phase) ?? []
    list.push(handler)
    this.handlers.set(phase, list)
    return () => {
      const current = this.handlers.get(phase)
      if (!current) return
      const index = current.indexOf(handler)
      if (index !== -1) current.splice(index, 1)
    }
  }

  /**
   * 迁移到目标相位（逐相位推进，不得跳跃/回退）。
   * 并发调用真正链式排队（Review F5：此前 transitioning 被并发覆盖，
   * 两个 transition 可能交错修改 phase）。
   */
  async transition(target: KernelLifecyclePhase): Promise<void> {
    const previous = this.transitioning ?? Promise.resolve()
    const next = previous.catch(() => {}).then(() => this.doTransition(target))
    // 吞掉 previous 的错误使链条不断；next 自身的错误交给调用方。
    this.transitioning = next.then(() => undefined, () => undefined)
    return next
  }

  private async doTransition(target: KernelLifecyclePhase): Promise<void> {
    let from = FORWARD_ORDER.indexOf(this.phase)
    const to = FORWARD_ORDER.indexOf(target)
    if (to <= from) {
      throw new Error(`lifecycle cannot transition backwards or stay: ${this.phase} -> ${target}`)
    }
    const errors: Array<{ phase: KernelLifecyclePhase, error: unknown }> = []
    for (from += 1; from <= to; from++) {
      const next = FORWARD_ORDER[from]
      this.phase = next
      for (const handler of [...(this.handlers.get(next) ?? [])]) {
        try {
          await handler(next)
        } catch (error) {
          errors.push({ phase: next, error })
        }
      }
      this.handlers.delete(next)
    }
    if (errors.length > 0) {
      const error = new Error(`lifecycle transition to ${target} completed with ${errors.length} handler failure(s)`)
      ;(error as Error & { details?: unknown }).details = errors
      throw error
    }
  }
}
