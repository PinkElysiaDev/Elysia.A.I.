
import type { LifeInstance } from '../types/life.js'

export interface LifeRepository {
  getById(id: string): Promise<LifeInstance | null>
  save(life: LifeInstance): Promise<void>
}
