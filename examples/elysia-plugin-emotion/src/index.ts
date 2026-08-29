/**
 * elysia-plugin-emotion —— Elysia A.I. 第三方插件参考实现。
 *
 * 一个插件示范 kernel 通用子框架的全部新机制：
 *
 * 1. 阶段挂载：在 perception 与 cognition 之间插入 'emotion' 阶段
 *    （before/after 声明，顺序与插件加载顺序无关）；
 * 2. 共享上下文：读取上游 perception 结果（父链回溯），写入自身命名空间；
 * 3. 类型化扩展事件：通过声明合并向 CoreEventMap 增加
 *    'emotion.evaluated'，不改 core 发版；
 * 4. manifest 兼容治理：声明身份/服务/阶段/命名空间，runtime.start()
 *    统一校验（依赖存在性 / frameworkApiVersion / 命名空间冲突）；
 * 5. manifest.json extensions 配置：按 configNamespace='emotion' 消费
 *    每生命体的私有配置；
 * 6. getDiagnostics 能力诊断：observatory 的 elysia.status 自动聚合。
 *
 * 结构与官方插件一致的两层拆分：
 * - wireEmotion()：库层装配（宿主无关，测试 harness 直接驱动）；
 * - apply：Koishi 壳（工厂 v2 + manifest + 服务注册）。
 *
 * 事件双轨说明：'emotion.evaluated' 是事实通知（观测者订阅）；
 * 阶段钩子是命令侧处理步骤（编排调度）。二者职责不同、并行存在。
 */

import type { CoreEventMap, EventBus, PerceptionResult, PipelineRunner } from '@elysia-ai/core'
import { NS_PERCEPTION } from '@elysia-ai/core'
import { Schema } from 'koishi'
import { createElysiaPlugin } from '@elysia-ai/shared'

// ─────────────────────────────────────────────────
// 1. 类型化扩展事件（声明合并，无需改 core）
// ─────────────────────────────────────────────────
declare module '@elysia-ai/core' {
  interface CoreEventMap {
    'emotion.evaluated': {
      stimulusId: string
      lifeId?: string
      mood: number
      arousal: number
    }
  }
}

export const name = 'elysia-plugin-emotion'

// 依赖 runtime 服务（cordis 等待就绪后再 apply）。
export const inject = ['elysia.runtime']

export interface Config {
  enabled?: boolean
  arousalDecay?: number
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true).description('启用情绪模块'),
  arousalDecay: Schema.percent().default(0.2).description('唤醒度衰减系数（0-1）'),
}) as Schema<Config>

/** 每生命体情绪状态（内存态；真实插件可用 PersistenceService 持久化）。 */
export interface EmotionState {
  mood: number
  arousal: number
}

export interface EmotionService {
  getMood(lifeId: string): number
  getDiagnostics(): { plugin: string, enabled: boolean, ready: boolean, serviceName: string }
}

export const emotionStageName = 'emotion'

// ─────────────────────────────────────────────────
// 库层装配：宿主无关（kernel 原语 + 事件总线），createHarness 直接驱动。
// ─────────────────────────────────────────────────

export interface WireEmotionOptions {
  pipeline: PipelineRunner<unknown>
  eventBus: EventBus<CoreEventMap>
  config: { enabled?: boolean, arousalDecay?: number }
  logger?: { debug?(...args: unknown[]): void }
}

export interface WireEmotionHandle {
  service: EmotionService
  setLifeConfig(lifeId: string, config: Record<string, unknown>): void
  dispose(): void
}

export function wireEmotion(options: WireEmotionOptions): WireEmotionHandle | undefined {
  if (options.config.enabled === false) return undefined
  const { pipeline, eventBus } = options
  const logger = options.logger
  const states = new Map<string, EmotionState>()
  const perLifeConfig = new Map<string, Record<string, unknown>>()

  // 声明 'emotion' 阶段：位于 perception 之后、cognition 之前。
  // 第三方阶段通过 before/after 进入 DAG，与插件加载顺序无关。
  const unregisterStage = pipeline.registerStage({
    name: emotionStageName,
    after: ['perception'],
    before: ['cognition'],
  })

  // 阶段钩子：读上游共享上下文（父链回溯 perception 结果），
  // 写自身命名空间，并发事实事件。
  const unregisterHook = pipeline.registerHook({
    stage: emotionStageName,
    owner: 'elysia-plugin-emotion',
    async run(pctx) {
      const core = pctx.core as { stimulus: { id: string }, lifeId?: string }
      const perception = pctx.read<PerceptionResult>(NS_PERCEPTION)
      const sentiment = perception?.sentiment
      // 情绪效价映射：正面 +0.3，负面 -0.4，中性 0。
      const valence = sentiment?.label === 'positive' ? 0.3
        : sentiment?.label === 'negative' ? -0.4
        : 0

      const lifeId = core.lifeId ?? ''
      const previous = states.get(lifeId) ?? { mood: 0, arousal: 0 }
      const decay = Number(perLifeConfig.get(lifeId)?.['arousalDecay'] ?? options.config.arousalDecay ?? 0.2)
      const next: EmotionState = {
        mood: clamp(previous.mood * 0.9 + valence, -1, 1),
        arousal: clamp(previous.arousal * (1 - decay) + Math.abs(valence), 0, 1),
      }
      states.set(lifeId, next)
      pctx.write('emotion', next)

      // 类型化扩展事件：emit 键与载荷都有编译期约束。
      await eventBus.emit('emotion.evaluated', {
        stimulusId: core.stimulus.id,
        lifeId: core.lifeId,
        mood: next.mood,
        arousal: next.arousal,
      })
      logger?.debug?.('emotion evaluated', {
        plugin: name,
        phase: 'emotion',
        stimulusId: core.stimulus.id,
        lifeId,
        mood: next.mood,
        arousal: next.arousal,
      })
    },
  })

  const service: EmotionService = {
    getMood(lifeId: string) {
      return states.get(lifeId)?.mood ?? 0
    },
    getDiagnostics() {
      return { plugin: name, enabled: true, ready: true, serviceName: 'elysia.emotion' }
    },
  }

  return {
    service,
    setLifeConfig(lifeId, config) {
      perLifeConfig.set(lifeId, config)
    },
    dispose() {
      unregisterHook()
      unregisterStage()
      states.clear()
      perLifeConfig.clear()
    },
  }
}

// ─────────────────────────────────────────────────
// Koishi 壳：工厂 v2 + manifest 兼容治理 + 服务注册。
// ─────────────────────────────────────────────────

export const apply = createElysiaPlugin<Config,
  {
    context: {
      eventBus: EventBus<CoreEventMap>
      pipeline: PipelineRunner<unknown>
    }
  },
  EmotionService
>({
  name: 'elysia-plugin-emotion',
  serviceFormalName: 'elysia.emotion',
  runtimeDescription: 'runtime pipeline',
  manifest: {
    name: 'elysia-plugin-emotion',
    version: '0.1.0',
    services: { provides: ['elysia.emotion'], consumes: ['elysia.runtime'] },
    stages: { hooks: ['emotion'] },
    configNamespace: 'emotion',
  },
  build({ runtime, config, logger }) {
    // manifest.json extensions['emotion'] 按生命体下发：
    // 订阅 life.loaded 事实事件，转交给库层配置表。
    const handle = wireEmotion({
      pipeline: runtime.context.pipeline,
      eventBus: runtime.context.eventBus,
      config,
      logger,
    })
    if (!handle) return undefined
    const offLifeLoaded = runtime.context.eventBus.on('life.loaded', ({ lifeId, config: lifeConfig }) => {
      const extensions = (lifeConfig as { extensions?: Record<string, Record<string, unknown>> } | undefined)?.extensions
      const own = extensions?.['emotion']
      if (own) handle.setLifeConfig(lifeId, own)
    })
    return {
      service: handle.service,
      dispose() {
        offLifeLoaded()
        handle.dispose()
      },
    }
  },
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
