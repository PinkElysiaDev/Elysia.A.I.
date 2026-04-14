
import type { LifeInstance } from '@elysia-ai/koishi-plugin-core'

export interface LifeRegistry {
  register(life: LifeInstance): void
  getById(id: string): LifeInstance | undefined
  getAll(): LifeInstance[]
}
