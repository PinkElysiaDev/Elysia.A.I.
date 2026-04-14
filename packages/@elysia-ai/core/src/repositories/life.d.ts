import type { LifeInstance } from '../types/life';
export interface LifeRepository {
    getById(id: string): Promise<LifeInstance | null>;
    save(life: LifeInstance): Promise<void>;
}
//# sourceMappingURL=life.d.ts.map