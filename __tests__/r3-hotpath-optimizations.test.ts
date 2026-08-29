/**
 * R3 热路径优化回归：
 * - behavior 必须消费 Stimulus.isMentioned / isDirectMessage / isReply
 * - cognition continuity 必须对无空格中文生效
 * - BoundedCache 按 LRU 淘汰，而不是 FIFO
 */

import { describe, expect, it } from 'vitest'
import { calculateStimulusSignal } from '../packages/@elysia-ai/behavior/src/signals.js'
import { reasonAboutContext } from '../packages/@elysia-ai/cognition/src/ai-enhanced.js'
import { BoundedCache } from '../packages/@elysia-ai/shared/src/bounded-cache.js'
import type { Config as CognitionConfig } from '../packages/@elysia-ai/cognition/src/index.js'
import type { CognitionContext } from '../packages/@elysia-ai/core/src/index.js'
import type { Stimulus } from '../packages/@elysia-ai/core/src/index.js'
import type { BehaviorPlanningContext, StimulusScope } from '../packages/@elysia-ai/behavior/src/types.js'

const userScope: StimulusScope = { type: 'user', key: 'habitat-r3:actor-r3' }

const planningContext: BehaviorPlanningContext = {
  directWindowMs: 1500,
  userBufferedWindowMs: 2500,
  threadBufferedWindowMs: 3500,
  habitatBufferedWindowMs: 5000,
  now: Date.now(),
  bucketStimulusCount: 1,
}

function utterance(overrides: Partial<Stimulus> = {}): Stimulus {
  return {
    id: 'r3-stim',
    type: 'utterance',
    timestamp: Date.now(),
    habitatId: 'habitat-r3',
    actorId: 'actor-r3',
    payload: { content: '你好，今天天气不错' },
    ...overrides,
  }
}

const cognitionConfig: CognitionConfig = {
  recentConversationLimit: 12,
  salienceDirectMentionBonus: 0.35,
  salienceDirectMessageBonus: 0.25,
  salienceReplyBonus: 0.2,
  salienceQuestionBonus: 0.15,
  salienceLengthFactor: 0.001,
  behaviorThreshold: 0.35,
  aiEnhanced: false,
}

describe('R3 behavior 消费结构化寻址事实', () => {
  it('普通群聊 utterance 保持原基线', () => {
    const signal = calculateStimulusSignal(utterance(), userScope, planningContext)
    expect(signal.directness).toBe(70)
    expect(signal.responseNecessity).toBe(50)
  })

  it('@本 bot 提升 directness 与 responseNecessity', () => {
    const signal = calculateStimulusSignal(
      utterance({ isMentioned: true }),
      userScope,
      planningContext,
    )
    expect(signal.directness).toBe(90)
    expect(signal.responseNecessity).toBe(70)
  })

  it('私聊提升 directness 与 responseNecessity', () => {
    const signal = calculateStimulusSignal(
      utterance({ isDirectMessage: true }),
      userScope,
      planningContext,
    )
    expect(signal.directness).toBe(85)
    expect(signal.responseNecessity).toBe(65)
  })

  it('回复提升 directness 与 responseNecessity', () => {
    const signal = calculateStimulusSignal(
      utterance({ isReply: true }),
      userScope,
      planningContext,
    )
    expect(signal.directness).toBe(80)
    expect(signal.responseNecessity).toBe(60)
  })
})

describe('R3 cognition 中文 continuity', () => {
  it('无空格中文复述近期对话时 continuity > 0', () => {
    const context: CognitionContext = {
      stimulusId: 'r3-cjk-1',
      habitatId: 'habitat-r3',
      actorId: 'actor-r3',
      scopeKey: 'habitat:habitat-r3',
      stimulus: utterance({ payload: { content: '今天下午去公园散步' } }),
      recentConversation: [{
        role: 'user',
        content: '下午一起去公园吧',
        timestamp: Date.now() - 1000,
        scopeKey: 'habitat:habitat-r3',
      }],
    }

    const result = reasonAboutContext(context, cognitionConfig)
    expect(result.continuity).toBeGreaterThan(0.3)
  })

  it('英文空格分词路径不回归', () => {
    const context: CognitionContext = {
      stimulusId: 'r3-en-1',
      habitatId: 'habitat-r3',
      actorId: 'actor-r3',
      scopeKey: 'habitat:habitat-r3',
      stimulus: utterance({ payload: { content: 'let us go to the park this afternoon' } }),
      recentConversation: [{
        role: 'user',
        content: 'shall we go to the park',
        timestamp: Date.now() - 1000,
        scopeKey: 'habitat:habitat-r3',
      }],
    }

    const result = reasonAboutContext(context, cognitionConfig)
    expect(result.continuity).toBeGreaterThan(0.3)
  })
})

describe('R3 BoundedCache LRU', () => {
  it('访问命中会推迟淘汰', () => {
    const cache = new BoundedCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1)
    cache.set('c', 3)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })
})
