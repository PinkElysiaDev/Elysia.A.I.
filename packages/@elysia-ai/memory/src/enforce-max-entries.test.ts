import { describe, expect, it } from 'vitest'
import type { MemoryEntry, MemoryUpdateRequest } from '@elysia-ai/core'
import {
  DefaultMemoryService,
  MemoryMemoryRepository,
} from './index.js'

// P0-4 回归：maxEntriesPerLife 只约束 active 记忆。
// archived 记忆不占上限；archived 数量达到/超过上限后，新建记忆
// 不得把 active 记忆成批归档（此前的行为等于逐步清空活跃记忆）。

function createRepositoryWithEntries(lifeId: string, entries: Array<Partial<MemoryEntry>>): MemoryMemoryRepository {
  const repository = new MemoryMemoryRepository()
  let index = 0
  for (const partial of entries) {
    index += 1
    void repository.save({
      id: partial.id ?? `entry-${index}`,
      lifeId,
      scope: 'global',
      kind: 'semantic',
      actorId: 'user-1',
      status: partial.status ?? 'active',
      content: partial.content ?? `content-${index}`,
      importance: partial.importance ?? 0.5,
      confidence: 0.9,
      visibility: 'private',
      createdAt: partial.createdAt ?? index * 1000,
      updatedAt: partial.updatedAt ?? index * 1000,
      source: { stimulusId: `stim-${index}`, decisionSummary: 'test' },
    } as unknown as MemoryEntry)
  }
  return repository
}

function newsRequest(lifeId: string, content: string): MemoryUpdateRequest {
  return {
    id: `request-${content}`,
    type: 'news',
    lifeId,
    content,
    stimulusId: `stim-${content}`,
    decisionSummary: 'test',
    createdAt: Date.now(),
  } as unknown as MemoryUpdateRequest
}

function createService(repository: MemoryMemoryRepository, maxEntriesPerLife: number) {
  const eventBus = {
    on: () => () => {},
    emit: async () => {},
  } as never
  return new DefaultMemoryService(repository, eventBus, undefined, { maxEntriesPerLife })
}

describe('enforceMaxEntries 只统计 active 记忆（P0-4）', () => {
  it('archived 数量达到上限后，新建记忆不会归档任何 active 记忆', async () => {
    const lifeId = 'life-p0-4'
    const repository = createRepositoryWithEntries(lifeId, [
      { status: 'archived', importance: 0.1 },
      { status: 'archived', importance: 0.1 },
    ])
    const service = createService(repository, 2)

    await service.update(newsRequest(lifeId, 'new active entry'))

    const active = await repository.listByLifeId(lifeId, { status: 'active' })
    const archived = await repository.listByLifeId(lifeId, { status: 'archived' })
    expect(active).toHaveLength(1)
    expect(archived).toHaveLength(2)
  })

  it('active 超过上限时仍按重要性归档最不重要的 active 记忆', async () => {
    const lifeId = 'life-p0-4-evict'
    const repository = createRepositoryWithEntries(lifeId, [
      { id: 'important', importance: 0.9, createdAt: 1000 },
      { id: 'boring', importance: 0.2, createdAt: 2000 },
      { id: 'middle', importance: 0.5, createdAt: 3000 },
      { status: 'archived', id: 'already-archived', importance: 0.1, createdAt: 4000 },
    ])
    const service = createService(repository, 3)

    await service.update(newsRequest(lifeId, 'overflow entry'))

    const activeIds = (await repository.listByLifeId(lifeId, { status: 'active' }))
      .map((entry) => entry.id)
    // boring 因重要性最低被归档，上限 3 生效；already-archived 不参与、不再被触碰
    expect(activeIds).toHaveLength(3)
    expect(activeIds).not.toContain('boring')
    const boring = await repository.getById('boring')
    expect(boring?.status).toBe('archived')
    const alreadyArchived = await repository.getById('already-archived')
    expect(alreadyArchived?.status).toBe('archived')
    expect(alreadyArchived?.metadata).toBeUndefined()
  })
})
