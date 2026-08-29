import { Schema } from 'koishi'
import { createBehaviorPluginRuntime } from '@elysia-ai/behavior'
import type { Config as BehaviorConfig } from '@elysia-ai/behavior'
import type { BehaviorExecutionService, BehaviorService, CoreEventMap, EventBus, Persona } from '@elysia-ai/core'
import { createElysiaPlugin, getOptionalElysiaService } from '@elysia-ai/shared'
export * from '@elysia-ai/behavior'

type BehaviorTimingConfig = Pick<BehaviorConfig, 'directWindowMs' | 'userBufferedWindowMs' | 'threadBufferedWindowMs' | 'habitatBufferedWindowMs'>
type BehaviorPluginConfig = Omit<BehaviorConfig, keyof BehaviorTimingConfig> & {
  timing?: BehaviorTimingConfig
}

export const name = 'elysia-ai-behavior'

// 声明对 runtime 的必需依赖：cordis 会在 elysia.runtime 就绪后再跑本插件 apply。
export const inject = ['elysia.runtime']

export const Config: Schema<BehaviorPluginConfig> = Schema.object({
  enableReply: Schema.boolean().default(true)
    .description('是否允许主动回复消息。关闭后生命体只观察、更新内部状态，但不出声。'),
  timing: Schema.object({
    directWindowMs: Schema.number().default(1500)
      .description('被直接点名（@/ 私聊）后，多久内的后续消息合并为一次回应（毫秒）。越大越倾向凑齐再回。'),
    userBufferedWindowMs: Schema.number().default(2500)
      .description('同一用户连续发言的攒话窗口（毫秒）。'),
    threadBufferedWindowMs: Schema.number().default(3500)
      .description('同一话题串的攒话窗口（毫秒）。'),
    habitatBufferedWindowMs: Schema.number().default(5000)
      .description('整个群聊场景的攒话窗口（毫秒）。'),
  }).description('高级：行为节奏调参').collapse(),
})

export const apply = createElysiaPlugin<
  BehaviorPluginConfig,
  {
    context: { eventBus: EventBus<CoreEventMap> }
    personaRegistry?: { getByLifeId(lifeId: string): Persona | undefined }
    behaviorExecution?: BehaviorExecutionService
  },
  BehaviorService
>({
  name: 'elysia-ai-behavior',
  serviceFormalName: 'elysia.behavior',
  serviceLegacyName: 'elysia-ai-behavior',
  // kernel 兼容治理：声明身份/服务/挂载阶段，runtime.start() 统一校验。
  manifest: {
    name: 'elysia-ai-behavior',
    version: '0.2.0',
    services: { provides: ['elysia.behavior'], consumes: ['elysia.runtime'] },
    stages: { hooks: ['behavior.decide'] },
    configNamespace: 'behavior',
  },
  build({ ctx, runtime, config, logger }) {
    const { timing, ...baseConfig } = config
    // 探测 cognition 插件是否安装（P1-10）：behavior 在 projection.routed 里
    // 读 cognition 的旁路缓存，依赖 cognition 先于 behavior 注册；若 cognition
    // 已安装但缓存缺失（插件顺序颠倒 / cognition 失败），behavior 将保守跳过
    // 而不是绕过认知门控直接回复。
    const cognition = getOptionalElysiaService<unknown>(ctx, {
      formalName: 'elysia.cognition',
      legacyName: 'elysia-ai-cognition',
    })
    return createBehaviorPluginRuntime({
      runtime,
      config: { ...baseConfig, ...timing } as BehaviorConfig,
      logger,
      cognitionAvailable: Boolean(cognition),
    })
  },
})
