/**
 * Scope 桶计数器（P1-7）。
 *
 * buffer 路由依赖 bucketStimulusCount（窗口内到达同 scope 的刺激数）计算
 * bufferPressure；此前该值硬编码为 1，bufferPressure 恒低于 60 阈值，
 * "攒话/缓冲"路由永不可达。本计数器按 scope key 维护时间戳滑动窗口，
 * record() 返回包含当前刺激在内的窗口内计数。
 */
export class ScopeBucketTracker {
  private readonly buckets = new Map<string, number[]>()

  /** 记录一次刺激到达，并返回窗口内（含本次）的刺激数。 */
  record(scopeKey: string, now: number, windowMs: number): number {
    const cutoff = now - Math.max(0, windowMs)
    const timestamps = (this.buckets.get(scopeKey) ?? []).filter((ts) => ts > cutoff)
    timestamps.push(now)
    this.buckets.set(scopeKey, timestamps)
    return timestamps.length
  }

  /** 只读查询窗口内计数（不记录）。 */
  count(scopeKey: string, now: number, windowMs: number): number {
    const cutoff = now - Math.max(0, windowMs)
    return (this.buckets.get(scopeKey) ?? []).filter((ts) => ts > cutoff).length
  }

  clear(): void {
    this.buckets.clear()
  }
}
