import type { BrainRequest, BrainResponse } from '../brain/brain.js'
import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
} from '../brain/model-gateway.js'
import type { DialogueResult, DialogueTask } from '../types/dialogue.js'
import type { Stimulus } from '../types/stimulus.js'

export interface CoreEventMap {
  // Runtime 生命周期事件
  'runtime.starting': { timestamp: number }
  'runtime.started': { timestamp: number }
  'runtime.stopping': { timestamp: number }
  'runtime.stopped': { timestamp: number }

  // Life 实例事件
  'life.loaded': {
    /** 生命体 id */
    lifeId: string
    /** 生命体类型 */
    type: string
    /** 完整的原始配置（供其他插件读取 extensions） */
    config: unknown
  }

  // Stimulus / 状态事件
  'stimulus.received': { stimulusId: string; stimulus: Stimulus }
  'perception.completed': { stimulusId: string }
  'homeostasis.updated': { lifeInstanceId: string }

  // Behavior 事件
  'behavior.selected': {
    stimulusId: string
    scope: {
      type: 'user' | 'thread' | 'habitat' | 'life-global'
      key: string
    }
    decision:
      | 'discard'
      | 'buffer'
      | 'internal-update-only'
      | 'program-direct'
      | 'send-to-ai'
    plan: {
      scope: {
        type: 'user' | 'thread' | 'habitat' | 'life-global'
        key: string
      }
      sourceStimulusIds: string[]
      mode:
        | 'discard'
        | 'buffer'
        | 'internal-update-only'
        | 'program-direct'
        | 'send-to-ai'
      plannerSource: 'program' | 'ai' | 'hybrid'
      shouldEnterDialogue: boolean
      shouldUpdateMemory: boolean
      shouldUpdateBond: boolean
      shouldUpdateHomeostasis: boolean
      shouldScheduleFollowup: boolean
      reason: string
    }
    signal: {
      directness: number
      continuity: number
      bondAffinity: number
      bufferPressure: number
      responseNecessity: number
      structuralDeterminability: number
    }
  }

  // Dialogue 事件
  'dialogue.started': { task: DialogueTask }
  'dialogue.generated': { task: DialogueTask; result: DialogueResult }
  'dialogue.completed': { task: DialogueTask; result: DialogueResult }
  'dialogue.failed': { task: DialogueTask; error: unknown }

  // Brain 事件
  'brain.requested': { request: BrainRequest }
  'brain.completed': { request: BrainRequest; response: BrainResponse }
  'brain.failed': { request: BrainRequest; error: unknown }

  // Gateway 事件
  'gateway.requested': { request: ModelGatewayRequest }
  'gateway.responded': {
    request: ModelGatewayRequest
    response: ModelGatewayResponse
  }
  'gateway.failed': { request: ModelGatewayRequest; error: unknown }
}
