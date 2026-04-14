
import { Context, Schema } from 'koishi'

export const name = 'elysia-ai-model-gateway'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context, config: Config) {
  // 后续在这里挂 gateway 的具体实现
}
