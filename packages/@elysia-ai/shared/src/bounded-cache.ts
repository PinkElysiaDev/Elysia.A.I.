/**
 * 有界 LRU 缓存：get/set 都会刷新插入序，超过 maxSize 时淘汰最久未访问的条目。
 * 用于 behavior / cognition 等插件缓存最近的 stimulus / perception / cognition 上下文。
 */
export class BoundedCache<K, V> {
  private readonly store = new Map<K, V>()

  constructor(private readonly maxSize = 200) {}

  set(key: K, value: V): void {
    if (this.store.has(key)) this.store.delete(key)
    this.store.set(key, value)
    if (this.store.size > this.maxSize) {
      const firstKey = this.store.keys().next().value
      if (firstKey !== undefined) this.store.delete(firstKey)
    }
  }

  get(key: K): V | undefined {
    const value = this.store.get(key)
    if (value === undefined) return undefined
    this.store.delete(key)
    this.store.set(key, value)
    return value
  }

  delete(key: K): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}
