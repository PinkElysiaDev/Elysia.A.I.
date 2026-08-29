import { describe, expect, it } from 'vitest'
import type { ResponsePlan } from '@elysia-ai/core'
import { buildInstruction } from './action-builder.js'

// P1-6 回归：behavior 构造的 DialogueTask 必须携带 actor/habitat/thread 维度，
// 否则 dialogue 侧 memory/bond 上下文检索退化为全局召回。

function plan(overrides: Partial<ResponsePlan> = {}): ResponsePlan {
  return {
    scope: { type: 'user', key: 'habitat-1:user-1' },
    sourceStimulusIds: ['s1'],
    mode: 'send-to-ai',
    plannerSource: 'rule',
    shouldEnterDialogue: true,
    shouldUpdateMemory: true,
    shouldUpdateBond: true,
    shouldUpdateHomeostasis: true,
    shouldScheduleFollowup: false,
    reason: 'direct question',
    ...overrides,
  } as ResponsePlan
}

describe('buildInstruction 携带来源维度（P1-6）', () => {
  it('dialogue task 填充 habitatId 与 metadata.actorId/threadId', () => {
    const instruction = buildInstruction(
      'life-1',
      's1',
      plan(),
      '今天天气如何？',
      { actorId: 'user-1', habitatId: 'habitat-1', threadId: 'thread-9' },
    )

    expect(instruction.actions).toHaveLength(1)
    const action = instruction.actions[0]
    if (action.type !== 'dialogue') throw new Error('expected dialogue action')
    expect(action.task.habitatId).toBe('habitat-1')
    expect(action.task.metadata?.actorId).toBe('user-1')
    expect(action.task.metadata?.threadId).toBe('thread-9')
  })

  it('未提供来源维度时不产生 undefined 覆盖（字段可选）', () => {
    const instruction = buildInstruction('life-1', 's1', plan(), 'hi')
    const action = instruction.actions[0]
    if (action.type !== 'dialogue') throw new Error('expected dialogue action')
    expect(action.task.habitatId).toBeUndefined()
    expect(action.task.metadata?.actorId).toBeUndefined()
  })
})
