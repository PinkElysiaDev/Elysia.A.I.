import { describe, expect, it } from 'vitest'
import type { Stimulus } from '@elysia-ai/core'
import { createConversationScopeKey, resolveConversationScope } from '../packages/@elysia-ai/shared/src/conversation-scope.js'
import { resolveStimulusScope } from '../packages/@elysia-ai/behavior/src/scope.js'

// P0-2 回归：cognition（读）、behavior（决策）、dialogue（写）三条链路
// 必须派生出完全一致的会话 scope key，否则 conversationStore 两端
// key 对不上，"对话连续性"信号恒为 0。

function makeStimulus(overrides: Partial<Stimulus> = {}): Stimulus {
  return {
    id: 's1',
    type: 'message',
    habitatId: 'habitat-1',
    actorId: 'user-1',
    payload: { content: 'hi' },
    timestamp: Date.now(),
    ...overrides,
  } as Stimulus
}

describe('conversation scope 统一派生', () => {
  it('thread 消息：cognition 与 dialogue 写入的 key 一致', () => {
    const stimulus = makeStimulus({ threadId: 't1', lifeId: 'life-1' })
    const cognitionKey = createConversationScopeKey(
      stimulus.lifeId,
      resolveConversationScope(stimulus),
    )
    const behaviorScope = resolveStimulusScope(stimulus, {} as never)
    const dialogueKey = createConversationScopeKey('life-1', behaviorScope)

    expect(cognitionKey).toBe(dialogueKey)
    expect(cognitionKey).toBe('life-1:thread:habitat-1:t1')
  })

  it('无 thread 的用户消息：scope 退化为 user 维度，key 一致', () => {
    const stimulus = makeStimulus({ lifeId: 'life-2' })
    const cognitionKey = createConversationScopeKey(
      stimulus.lifeId,
      resolveConversationScope(stimulus),
    )
    const dialogueKey = createConversationScopeKey(
      'life-2',
      resolveStimulusScope(stimulus, {} as never),
    )

    expect(cognitionKey).toBe(dialogueKey)
    expect(cognitionKey).toBe('life-2:user:habitat-1:user-1')
  })

  it('无 actor 的系统刺激：退化为 life-global，key 一致', () => {
    const stimulus = makeStimulus({ type: 'system', actorId: undefined, lifeId: 'life-3' })
    const cognitionKey = createConversationScopeKey(
      stimulus.lifeId,
      resolveConversationScope(stimulus),
    )
    const dialogueKey = createConversationScopeKey(
      'life-3',
      resolveStimulusScope(stimulus, {} as never),
    )

    expect(cognitionKey).toBe('life-3:life-global:life-global')
    expect(cognitionKey).toBe(dialogueKey)
  })

  it('lifeId 缺失时以 global 兜底', () => {
    const stimulus = makeStimulus()
    expect(createConversationScopeKey(undefined, resolveConversationScope(stimulus)))
      .toBe('global:user:habitat-1:user-1')
  })
})
