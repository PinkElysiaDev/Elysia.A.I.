/**
 * 事件总线接口 —— 已上收到 @elysia-ai/kernel（通用子框架内核）。
 *
 * kernel 版本在原契约上补齐：
 * - onAny 通配符订阅（观测类消费者不再手工枚举事件名）；
 * - 声明合并扩展文档化（第三方不改 core 加类型化事件）。
 *
 * 此文件保留为转发 shim，@elysia-ai/core 的存量导入路径不变。
 */
export type { EventBus } from '@elysia-ai/kernel'
