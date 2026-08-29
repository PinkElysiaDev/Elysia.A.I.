import { Schema } from 'koishi'
import { createPerceptionPluginRuntime } from '@elysia-ai/perception'
import type { Config as PerceptionConfig } from '@elysia-ai/perception'
import type { BrainService, CoreEventMap, EventBus } from '@elysia-ai/core'
import { createElysiaPlugin, getOptionalElysiaService } from '@elysia-ai/shared'
export * from '@elysia-ai/perception'

export const name = 'elysia-ai-perception'

// 声明对 runtime 的必需依赖：cordis 会在 elysia.runtime 就绪后再跑本插件 apply。
// brain 为可选增强，由 build() 内 getOptionalElysiaService 走降级。
export const inject = ['elysia.runtime']

export const Config: Schema<PerceptionConfig> = Schema.intersect([
  Schema.object({
    enabledIntentClassify: Schema.boolean().default(true)
      .description('启用意图识别（判断对方想做什么）。'),
    enabledEntityExtract: Schema.boolean().default(true)
      .description('启用实体抽取（从消息中提取关键信息）。'),
    enabledSentiment: Schema.boolean().default(true)
      .description('启用情感分析（判断对方情绪倾向）。'),
    aiEnhanced: Schema.boolean().default(false)
      .description('启用 AI 增强感知（需在 model-gateway 配置模型槽位）。'),
  }).description('基础设置'),
  Schema.union([
    Schema.object({
      aiEnhanced: Schema.const(true).required()
        .description('启用 AI 增强感知（需在 model-gateway 配置模型槽位）。'),
      maxInputTokens: Schema.number().default(8192)
        .description('单次感知分析的最大输入 token 数。'),
      aiFallbackToRuleBased: Schema.boolean().default(true)
        .description('AI 感知失败时回退到规则分析。'),
      aiMinTextLength: Schema.number().default(12)
        .description('触发 AI 增强的最短文本长度。'),
      aiModelSlot: Schema.string().default('')
        .description('AI 感知分析使用的模型槽位名（在 model-gateway 中配置），留空则使用默认槽位。'),
    }).description('AI 增强感知'),
    Schema.object({}),
  ]),
  // schemastery 3.x 类型推断对「union 含空分支」会塌缩为空对象，运行时行为正确，此处断言绕过。
]) as Schema<PerceptionConfig>

export const apply = createElysiaPlugin<
  PerceptionConfig,
  { context: { eventBus: EventBus<CoreEventMap> } },
  ReturnType<typeof createPerceptionPluginRuntime>['service']
>({
  name: 'elysia-ai-perception',
  serviceFormalName: 'elysia.perception',
  serviceLegacyName: 'elysia-ai-perception',
  runtimeDescription: 'runtime event bus',
  // kernel 兼容治理：声明身份/服务/挂载阶段，runtime.start() 统一校验。
  manifest: {
    name: 'elysia-ai-perception',
    version: '0.2.0',
    services: { provides: ['elysia.perception'], consumes: ['elysia.runtime'] },
    stages: { hooks: ['perception'] },
    configNamespace: 'perception',
  },
  build({ ctx, runtime, config, logger }) {
    const brain = getOptionalElysiaService<BrainService>(ctx, {
      formalName: 'elysia.brain',
      legacyName: 'elysia-ai-brain',
    })
    return createPerceptionPluginRuntime({ runtime, brain, config, logger })
  },
})
