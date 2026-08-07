import { Schema, type Context } from 'koishi'
import {
  createModelGatewayPluginRuntime,
  formatGatewayFailures,
  formatGatewayHealth,
  formatGatewayRegistry,
  formatGatewaySlots,
} from '@elysia-ai/model-gateway'
import type { Config as ModelGatewayConfig, DefaultModelGatewayService, GatewayFailureEventSource } from '@elysia-ai/model-gateway'
import type { CoreEventMap, EventBus } from '@elysia-ai/core'
import { combinePreflightResults, createPreflightResult, getOptionalElysiaService, getRequiredElysiaService, issue, registerElysiaService, type PreflightResult } from '@elysia-ai/shared'
export * from '@elysia-ai/model-gateway'

export const name = 'elysia-ai-model-gateway'

// 声明对 runtime 的必需依赖：cordis 会在 elysia.runtime 就绪后再跑本插件 apply，
// 根除“读早于写”的加载竞态（替代旧的 getRequiredElysiaService 降级路径）。
export const inject = ['elysia.runtime']

const ProviderSchema = Schema.object({
  type: Schema.union([
    Schema.const('chat-completions' as const),
    Schema.const('responses' as const),
    Schema.const('gemini' as const),
    Schema.const('anthropic' as const),
  ]).required().description('API 协议类型。'),
  baseURL: Schema.string().required().description('API 基础域名（必填）。'),
  endpoint: Schema.string().description('API 路径前缀（可选，各协议有默认值）。'),
  apiKey: Schema.string().role('secret').required().description('API 密钥。'),
  maxTokens: Schema.number().default(4096).description('最大输出 token 数。'),
  temperature: Schema.number().default(0.7).description('采样温度。'),
  timeoutMs: Schema.number().description('Provider 请求超时时间（毫秒）。'),
}).description('API 服务配置。')

const ProviderSlotSchema = Schema.object({
  provider: Schema.string().required().description('引用的 provider id（来自上方 providers 配置）。'),
  model: Schema.string().required().description('模型名称（必填）。'),
  maxTokens: Schema.number().description('槽位级最大输出 token 数覆盖。'),
  temperature: Schema.number().description('槽位级采样温度覆盖。'),
  timeoutMs: Schema.number().description('槽位级请求超时覆盖。'),
}).description('模型槽位。')

export const Config: Schema<ModelGatewayConfig> = Schema.intersect([
  Schema.object({
    providers: Schema.dict(ProviderSchema).description('API 服务注册表，按 provider id 索引。每个 provider 定义可用的 API 服务（协议类型、域名、密钥等）。'),
  }).description('Provider 配置（API 服务）'),
  Schema.object({
    providerSlots: Schema.dict(ProviderSlotSchema).description('模型槽位，引用 provider id 并指定模型。按用途分配模型（如主力模型、快速模型、推理模型等）。'),
    defaultSlot: Schema.string().description('默认模型槽位名。当请求未指定槽位时使用。'),
  }).description('模型槽位（按用途分配模型）'),
  Schema.object({
    enableRetry: Schema.boolean().default(true).description('启用重试策略。'),
  }).description('重试配置'),
  Schema.union([
    Schema.object({
      enableRetry: Schema.const(true).default(true),
      maxRetries: Schema.number().default(3).description('每个 provider 的最大重试次数。'),
      baseDelayMs: Schema.number().default(500).description('初始重试延迟（毫秒）。'),
      maxDelayMs: Schema.number().default(5000).description('最大重试延迟（毫秒）。'),
    }),
    Schema.object({
      enableRetry: Schema.const(false).required(),
    }),
  ]),
  Schema.object({
    enableCircuitBreaker: Schema.boolean().default(false).description('启用 provider 熔断器。'),
  }).description('熔断配置'),
  Schema.union([
    Schema.object({
      enableCircuitBreaker: Schema.const(true).required(),
      failureThreshold: Schema.number().default(3).description('触发熔断的连续失败次数。'),
      cooldownMs: Schema.number().default(30000).description('熔断冷却时长（毫秒）。'),
    }),
    Schema.object({}),
  ]),
  Schema.object({
    enableFallback: Schema.boolean().default(false).description('启用回退槽位策略。'),
  }).description('回退配置'),
  Schema.union([
    Schema.object({
      enableFallback: Schema.const(true).required().description('启用回退槽位策略。'),
      slots: Schema.dict(Schema.array(String)).description('按源槽位键配置的回退槽位链。'),
      fallbackOnNonRetryable: Schema.boolean().default(false).description('遇到不可重试错误时也回退。'),
    }),
    Schema.object({}),
  ]),
  // schemastery 3.x 类型推断对「union 含 const 字段」会产生字面量类型，与核心库 boolean 类型不兼容，此处断言绕过。
]) as Schema<ModelGatewayConfig>


const PROVIDER_TYPES = new Set(['chat-completions', 'responses', 'gemini', 'anthropic'])

function assertProviderType(providerId: string, type: unknown): asserts type is 'chat-completions' | 'responses' | 'gemini' | 'anthropic' {
  if (typeof type !== 'string' || !PROVIDER_TYPES.has(type)) {
    throw new Error(`elysia-ai-model-gateway: provider "${providerId}" has unknown type "${String(type)}"`)
  }
}

function collectConfiguredSlots(config: ModelGatewayConfig): Set<string> {
  return new Set(Object.keys(config.providerSlots ?? {}))
}

export function validateModelGatewayConfig(config: ModelGatewayConfig): void {
  for (const [providerId, provider] of Object.entries(config.providers ?? {})) {
    assertProviderType(providerId, provider.type)

    if (!provider.apiKey) {
      throw new Error(`elysia-ai-model-gateway: provider "${providerId}" requires apiKey`)
    }

    if (!provider.baseURL) {
      throw new Error(`elysia-ai-model-gateway: provider "${providerId}" requires baseURL`)
    }
  }

  for (const [slotName, slot] of Object.entries(config.providerSlots ?? {})) {
    if (!config.providers?.[slot.provider]) {
      throw new Error(`elysia-ai-model-gateway: slot "${slotName}" references unknown provider "${slot.provider}"`)
    }
  }

  const slots = collectConfiguredSlots(config)
  for (const [sourceSlot, fallbackSlots] of Object.entries(config.slots ?? {})) {
    if (!slots.has(sourceSlot)) {
      throw new Error(`elysia-ai-model-gateway: fallback source slot "${sourceSlot}" is not configured`)
    }
    for (const fallbackSlot of fallbackSlots as string[]) {
      if (!slots.has(fallbackSlot)) {
        throw new Error(`elysia-ai-model-gateway: fallback slot "${fallbackSlot}" is not configured`)
      }
    }
  }
}


export function preflightModelGatewayConfig(config: ModelGatewayConfig): PreflightResult {
  try {
    validateModelGatewayConfig(config)
    return createPreflightResult([], {
      plugin: 'elysia-ai-model-gateway',
      providerCount: Object.keys(config.providers ?? {}).length,
      slotCount: Object.keys(config.providerSlots ?? {}).length,
      fallbackEnabled: config.enableFallback === true,
    })
  } catch (error) {
    return createPreflightResult([
      issue('elysia-ai-model-gateway', 'gateway.invalid-config', 'error', error instanceof Error ? error.message : String(error)),
    ], { plugin: 'elysia-ai-model-gateway' })
  }
}

export function runElysiaPreflight(configs: {
  modelGateway?: ModelGatewayConfig
  memory?: { preflight?: () => PreflightResult }
  bond?: { preflight?: () => PreflightResult }
}): PreflightResult {
  const results: PreflightResult[] = []
  if (configs.modelGateway) results.push(preflightModelGatewayConfig(configs.modelGateway))
  if (configs.memory?.preflight) results.push(configs.memory.preflight())
  if (configs.bond?.preflight) results.push(configs.bond.preflight())
  return combinePreflightResults(results)
}

type CommandLike = {
  action(handler: (...args: unknown[]) => unknown): unknown
}

function registerDebugCommands(ctx: Context, service: DefaultModelGatewayService, config: ModelGatewayConfig) {
  const command = (ctx as unknown as { command?: (...args: unknown[]) => CommandLike }).command
  if (typeof command !== 'function') return

  command.call(ctx, 'elysia.gateway.slots', 'Elysia Model Gateway 模型槽位', { authority: 4 })
    .action(() => formatGatewaySlots(service, config.defaultSlot))

  command.call(ctx, 'elysia.gateway.registry', 'Elysia Model Gateway provider 注册表', { authority: 4 })
    .action(() => formatGatewayRegistry(service))

  command.call(ctx, 'elysia.gateway.health [providerId:string]', 'Elysia Model Gateway provider 健康状态', { authority: 4 })
    .action((_argv: unknown, providerId?: unknown) => formatGatewayHealth(service, providerId as string | undefined))

  command.call(ctx, 'elysia.gateway.failures [limit:number]', 'Elysia Model Gateway 最近失败记录', { authority: 4 })
    .action((_argv: unknown, limit?: unknown) => {
      const observatory = getOptionalElysiaService<{ service?: GatewayFailureEventSource } & GatewayFailureEventSource>(ctx, {
        formalName: 'elysia.observatory',
        legacyName: 'elysia-ai-observatory',
        plugin: 'elysia-ai-model-gateway',
      })
      return formatGatewayFailures(observatory?.service ?? observatory, (limit as number | undefined) ?? 10)
    })
}

export function apply(ctx: Context, config: ModelGatewayConfig) {
  if (!config) {
    ctx.logger('elysia-ai-model-gateway').warn('model-gateway config is null, skipping initialization')
    return
  }

  const logger = ctx.logger('elysia-ai-model-gateway')
  const runtime = getRequiredElysiaService<{ context: { eventBus: EventBus<CoreEventMap> } }>(ctx, {
    formalName: 'elysia.runtime',
    legacyName: 'elysia-ai-runtime',
    logger,
    plugin: 'elysia-ai-model-gateway',
    description: 'runtime event bus',
  })

  if (!runtime?.context?.eventBus) return

  validateModelGatewayConfig(config)

  const gatewayRuntime = createModelGatewayPluginRuntime({ runtime, config, logger })

  registerElysiaService(ctx, {
    formalName: 'elysia.modelGateway',
    legacyName: 'elysia-ai-model-gateway',
    service: gatewayRuntime.service,
    logger,
    plugin: 'elysia-ai-model-gateway',
  })

  registerDebugCommands(ctx, gatewayRuntime.service, config)
  ctx.on('dispose', () => gatewayRuntime.dispose())
}
