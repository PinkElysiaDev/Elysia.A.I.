import { describe, it, expect } from 'vitest'
import { MemoryLifeRegistry } from '../registry/memory-life-registry'
import { MemoryHabitatRegistry } from '../registry/memory-habitat-registry'

function makeLife(id: string) {
  return {
    id,
    name: `Life ${id}`,
    status: 'active' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('MemoryLifeRegistry', () => {
  it('should register and retrieve a life instance by id', () => {
    const registry = new MemoryLifeRegistry()
    const life = makeLife('life-1')

    registry.register(life)

    expect(registry.getById('life-1')).toEqual(life)
  })

  it('should return undefined for unknown id', () => {
    const registry = new MemoryLifeRegistry()
    expect(registry.getById('nonexistent')).toBeUndefined()
  })

  it('should return all registered life instances', () => {
    const registry = new MemoryLifeRegistry()
    const life1 = makeLife('life-1')
    const life2 = makeLife('life-2')

    registry.register(life1)
    registry.register(life2)

    const all = registry.getAll()
    expect(all).toHaveLength(2)
    expect(all).toContainEqual(life1)
    expect(all).toContainEqual(life2)
  })

  it('should overwrite existing life with same id', () => {
    const registry = new MemoryLifeRegistry()
    const life1 = makeLife('life-1')
    const life2 = { ...makeLife('life-1'), name: 'Updated Name' }

    registry.register(life1)
    registry.register(life2)

    expect(registry.getById('life-1')?.name).toBe('Updated Name')
    expect(registry.getAll()).toHaveLength(1)
  })
})

describe('MemoryHabitatRegistry', () => {
  function makeHabitat(id: string) {
    return {
      id,
      platform: 'qq',
      botId: 'bot-1',
      type: 'group' as const,
      guildId: 'guild-1',
    }
  }

  it('should register and retrieve a habitat by id', () => {
    const registry = new MemoryHabitatRegistry()
    const habitat = makeHabitat('habitat-1')

    registry.register(habitat)

    expect(registry.getById('habitat-1')).toEqual(habitat)
  })

  it('should return undefined for unknown id', () => {
    const registry = new MemoryHabitatRegistry()
    expect(registry.getById('nonexistent')).toBeUndefined()
  })

  it('should return all registered habitats', () => {
    const registry = new MemoryHabitatRegistry()
    const h1 = makeHabitat('habitat-1')
    const h2 = makeHabitat('habitat-2')

    registry.register(h1)
    registry.register(h2)

    expect(registry.getAll()).toHaveLength(2)
  })
})
