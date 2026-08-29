import type { Stimulus } from '@elysia-ai/core'
import { resolveConversationScope } from '@elysia-ai/shared'
import type { BehaviorPlanningContext, StimulusScope } from './types.js'

function resolveThreadId(
  stimulus: Stimulus,
  context: BehaviorPlanningContext
): string | undefined {
  if (stimulus.threadId) return stimulus.threadId

  const payloadThreadId =
    typeof stimulus.payload?.threadId === 'string'
      ? (stimulus.payload.threadId as string)
      : undefined

  if (payloadThreadId) return payloadThreadId
  if (context.threadId) return context.threadId
  return undefined
}

export function resolveStimulusScope(
  stimulus: Stimulus,
  context: BehaviorPlanningContext
): StimulusScope {
  // 委托 shared 的唯一派生实现，保证与 cognition 读、dialogue 写的会话
  // scope key 完全一致（P0-2）。
  return resolveConversationScope(stimulus, resolveThreadId(stimulus, context))
}
