
export interface LifeStateRepository<TState = Record<string, unknown>> {
  getByLifeInstanceId(lifeInstanceId: string): Promise<TState | null>
  save(lifeInstanceId: string, state: TState): Promise<void>
}
