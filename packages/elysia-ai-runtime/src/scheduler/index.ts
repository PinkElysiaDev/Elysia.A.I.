
export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}
