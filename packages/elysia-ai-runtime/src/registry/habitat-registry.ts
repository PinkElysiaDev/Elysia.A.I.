
import type { Habitat } from '@elysia-ai/koishi-plugin-core'

export interface HabitatRegistry {
  register(habitat: Habitat): void
  getById(id: string): Habitat | undefined
  getAll(): Habitat[]
}
