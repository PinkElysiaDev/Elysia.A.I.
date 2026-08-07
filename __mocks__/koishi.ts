/**
 * Koishi 测试 Mock
 * 
 * 在 vitest 测试环境中，使用此 mock 替代真实的 koishi 模块，
 * 避免 Koishi 尝试启动完整的运行时环境。
 */

export { default as Schema } from 'schemastery'

export class Context {
  logger(_name: string) {
    return {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
    }
  }
  on(_event: string, _handler: (...args: unknown[]) => unknown) {
    return () => {}
  }
}

export const App = Context
