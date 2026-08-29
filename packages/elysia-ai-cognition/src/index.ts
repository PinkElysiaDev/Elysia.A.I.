import { Schema } from 'koishi'
import { createCognitionPluginRuntime } from '@elysia-ai/cognition'
import type { Config as CognitionConfig } from '@elysia-ai/cognition'
import type { BrainService, CognitionService, ConversationStore, CoreEventMap, EventBus, PersonaRegistry } from '@elysia-ai/core'
import { createElysiaPlugin, getOptionalElysiaService } from '@elysia-ai/shared'
export * from '@elysia-ai/cognition'

type CognitionSalienceConfig = Pick<CognitionConfig, 'recentConversationLimit' | 'salienceDirectMentionBonus' | 'salienceDirectMessageBonus' | 'salienceReplyBonus' | 'salienceQuestionBonus' | 'salienceLengthFactor'>
type CognitionPluginConfig = Omit<CognitionConfig, keyof CognitionSalienceConfig> & {
  salience?: CognitionSalienceConfig
}

export const name = 'elysia-ai-cognition'

// 声明对 runtime 的必需依赖：cordis 会在 elysia.runtime 就绪后再跑本插件 apply。
// brain 为可选增强（AI 认知推理），由 build() 内 getOptionalElysiaService 走降级。
export const inject = ['elysia.runtime']

export const Config: Schema<CognitionPluginConfig> = Schema.intersect([
  Schema.object({
    behaviorThreshold: Schema.number().default(0.35)
      .description('回应意愿阈值：显著性高于此值才会进入行为决策。越低越话痨，越高越沉默。'),
    salience: Schema.object({
      recentConversationLimit: Schema.number().default(12)
        .description('参与显著性判断的最近对话条数。'),
      salienceDirectMentionBonus: Schema.number().default(0.35)
        .description('被 @ 点名时提升的回应意愿。'),
      salienceDirectMessageBonus: Schema.number().default(0.25)
        .description('私聊场景提升的回应意愿。'),
      salienceReplyBonus: Schema.number().default(0.2)
        .description('消息是对本体的回复时提升的回应意愿。'),
      salienceQuestionBonus: Schema.number().default(0.15)
        .description('消息是疑问句时提升的回应意愿。'),
      salienceLengthFactor: Schema.number().default(0.001)
        .description('消息长度对回应意愿的加权系数。'),
    }).description('高级：认知处理').collapse(),
    aiEnhanced: Schema.boolean().default(false)
      .description('启用 AI 增强认知推理（需在 model-gateway 配置模型槽位）。'),
  }),
  Schema.union([
    Schema.object({
      aiEnhanced: Schema.const(true).required(),
      aiFallbackToRuleBased: Schema.boolean().default(true)
        .description('AI 推理失败时回退到规则判断。'),
      aiMinSalience: Schema.number().default(0.2)
        .description('触发 AI 增强的最低显著性门槛。'),
      aiModelSlot: Schema.string().default('')
        .description('AI 认知推理使用的模型槽位名（在 model-gateway 中配置），留空则使用默认槽位。'),
    }).description('AI 增强'),
    Schema.object({}),
  ]),
]) as Schema<CognitionPluginConfig>

export const apply = createElysiaPlugin<
  CognitionPluginConfig,
  {
    context: { eventBus: EventBus<CoreEventMap> }
    personaRegistry?: PersonaRegistry
    conversationStore?: ConversationStore
  },
  CognitionService
>({
  name: 'elysia-ai-cognition',
  serviceFormalName: 'elysia.cognition',
  serviceLegacyName: 'elysia-ai-cognition',
  // kernel 兼容治理：声明身份/服务/挂载阶段，runtime.start() 统一校验。
  manifest: {
    name: 'elysia-ai-cognition',
    version: '0.2.0',
    services: { provides: ['elysia.cognition'], consumes: ['elysia.runtime'] },
    stages: { hooks: ['cognition'] },
    configNamespace: 'cognition',
  },
  build({ ctx, runtime, config, logger }) {
    const brain = getOptionalElysiaService<BrainService>(ctx, {
      formalName: 'elysia.brain',
      legacyName: 'elysia-ai-brain',
    })
    if (!runtime.personaRegistry || !runtime.conversationStore) {
      logger.error('runtime registries not found; cognition plugin cannot continue', undefined, {
        plugin: 'elysia-ai-cognition',
        phase: 'apply',
      })
      return undefined
    }
    const { salience, ...baseConfig } = config
    return createCognitionPluginRuntime({
      runtime: {
        context: runtime.context,
        personaRegistry: runtime.personaRegistry,
        conversationStore: runtime.conversationStore,
      },
      brain,
      config: { ...baseConfig, ...salience } as CognitionConfig,
      logger,
    })
  },
})
