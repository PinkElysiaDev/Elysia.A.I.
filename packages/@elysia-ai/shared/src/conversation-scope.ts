import type { Stimulus } from '@elysia-ai/core'

/**
 * 会话 scope 的唯一派生实现（P0-2）。
 *
 * cognition（读会话历史）与 dialogue（写会话历史）必须使用完全一致的
 * scope 派生与 key 拼接规则，否则 conversationStore 两端 key 对不上，
 * "对话连续性"信号会静默失效。behavior 的 resolveStimulusScope 也委托
 * 本实现，保证三条链路（cognition 读 / behavior 决策 / dialogue 写）同源。
 */

export type ConversationScopeType = 'thread' | 'user' | 'habitat' | 'life-global'

export interface ConversationScope {
  type: ConversationScopeType
  key: string
}

export function resolveConversationScope(
  stimulus: Stimulus,
  threadIdOverride?: string,
): ConversationScope {
  const threadId = threadIdOverride ?? stimulus.threadId

  if (threadId) {
    return {
      type: 'thread',
      key: `${stimulus.habitatId}:${threadId}`,
    }
  }

  if (stimulus.actorId) {
    return {
      type: 'user',
      key: `${stimulus.habitatId}:${stimulus.actorId}`,
    }
  }

  if (stimulus.type === 'system' || stimulus.type === 'silence') {
    return {
      type: 'life-global',
      key: 'life-global',
    }
  }

  return {
    type: 'habitat',
    key: stimulus.habitatId,
  }
}

export function createConversationScopeKey(
  lifeId: string | undefined,
  scope: { type: string; key: string },
): string {
  return `${lifeId ?? 'global'}:${scope.type}:${scope.key}`
}
