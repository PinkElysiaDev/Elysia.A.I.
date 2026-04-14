/**
 * Elysia A.I. 插件 Manifest 类型定义
 * 
 * 每个插件必须提供一个 manifest，用于向 runtime 声明自己的身份和能力。
 * 参见插件开发规范文档：docs/elysia-ai-plugin-development-spec.md
 */

/**
 * 插件所属的生命层
 */
export type ElysiaLayer =
  | 'body'
  | 'perception'
  | 'homeostasis'
  | 'cognition'
  | 'persona'
  | 'behavior'
  | 'dialogue'
  | 'runtime'
  | 'observatory'
  | 'brain'
  | 'model-gateway'
  | 'extension'  // 通用扩展，不属于特定生命层

/**
 * 插件 Manifest 接口
 * 
 * 每个插件都必须提供一个实现此接口的 manifest 对象，
 * 用于向 runtime 声明身份、能力与版本兼容性。
 */
export interface ElysiaPluginManifest {
  /**
   * 插件唯一名称
   * 官方格式：@elysia-ai/<name>
   * 第三方格式：<reverse-domain>.<name> 或 elysia-plugin-<name>
   */
  name: string

  /**
   * 插件版本（semver 格式）
   */
  version: string

  /**
   * 此插件兼容的 core API 版本范围（semver range）
   * 例如："^0.1.0"、">=0.1.0 <0.2.0"
   */
  coreApiVersion: string

  /**
   * 插件所属的生命层
   */
  layer: ElysiaLayer

  /**
   * 插件在 extensions 配置中使用的命名空间
   * 必须与 name 一致
   */
  configNamespace: string

  /**
   * 此插件会消费的事件名列表
   */
  consumesEvents?: string[]

  /**
   * 此插件会产出的事件名列表
   */
  producesEvents?: string[]

  /**
   * 依赖的其他插件 name 列表
   */
  dependencies?: string[]

  /**
   * 插件执行优先级（数值越小越先执行，默认 100）
   */
  priority?: number

  /**
   * 插件声明的可选能力标签
   */
  capabilities?: string[]
}
