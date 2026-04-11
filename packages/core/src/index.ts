// ─────────────────────────────────────────────────────────────────────────────
// 核心领域类型（LifeInstance / Habitat / Bond / Thread / Stimulus 等）
// ─────────────────────────────────────────────────────────────────────────────
export * from './types/life.js'
export * from './types/habitat.js'
export * from './types/bond.js'
export * from './types/thread.js'
export * from './types/stimulus.js'
export * from './types/dialogue.js'

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schema（运行时校验，与上方类型一一对应）
// ─────────────────────────────────────────────────────────────────────────────
export * from './schemas/life.js'
export * from './schemas/habitat.js'
export * from './schemas/bond.js'
export * from './schemas/thread.js'
export * from './schemas/stimulus.js'

// ─────────────────────────────────────────────────────────────────────────────
// 事件总线（接口 + 事件类型映射 + 默认内存实现）
// ─────────────────────────────────────────────────────────────────────────────
export * from './bus/event-bus.js'
export * from './bus/event-map.js'
export * from './bus/memory-event-bus.js'

// ─────────────────────────────────────────────────────────────────────────────
// Repository 抽象接口（只有接口定义，不含 MongoDB/Redis 实现）
// ─────────────────────────────────────────────────────────────────────────────
export * from './repositories/bond.js'
export * from './repositories/life.js'
export * from './repositories/state.js'
export * from './repositories/stimulus.js'
export * from './repositories/trace.js'

// ─────────────────────────────────────────────────────────────────────────────
// Dialogue / Brain / Model Gateway 抽象接口
// ─────────────────────────────────────────────────────────────────────────────
export * from './dialogue/dialogue.js'
export * from './brain/brain.js'
export * from './brain/model-gateway.js'

// ─────────────────────────────────────────────────────────────────────────────
// 通用错误类型
// ─────────────────────────────────────────────────────────────────────────────
export * from './errors/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// 插件标准接口（Manifest / PipelineContext / Hooks）
// 参见：docs/elysia-ai-plugin-development-spec.md
// ─────────────────────────────────────────────────────────────────────────────
export * from './plugin/index.js'
