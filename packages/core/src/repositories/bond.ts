import type { Bond } from '../types/bond.js'

export interface BondRepository {
  getById(id: string): Promise<Bond | null>
  getByLifeAndTarget(
    lifeInstanceId: string,
    targetId: string,
    targetType?: Bond['targetType']
  ): Promise<Bond | null>
  listByLife(lifeInstanceId: string): Promise<Bond[]>
  save(bond: Bond): Promise<void>
}
