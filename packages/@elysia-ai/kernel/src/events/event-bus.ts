/**
 * 类型化事件总线接口（kernel 层，宿主无关）。
 *
 * 与 cordis 裸事件的差异——本接口解决 Koishi 生态的三个短板：
 * 1. 事件载荷类型化：EventMap 以 interface 声明，`emit/on` 的键与载荷
 *    都有编译期约束；宿主（elysia-ai core 的 CoreEventMap）或第三方
 *    可通过 **声明合并**（declaration merging）扩展自己的事件，
 *    无需修改本包发版：
 *
 *    ```ts
 *    declare module '@elysia-ai/kernel' { }
 *    // 实际合并发生在宿主的事件表上，例如：
 *    declare module '@elysia-ai/core' {
 *      interface CoreEventMap {
 *        'my-plugin.custom': { lifeId: string }
 *      }
 *    }
 *    ```
 *
 * 2. 监听者隔离：单个 listener 抛错必须被实现捕获并记录，不得中断
 *    其余 listener，也不得向 emit 调用方冒泡（事件是"已发生的事实"，
 *    一个观察者失败不应让其他订阅者丢事实）。
 *
 * 3. 通配符订阅：`onAny` 让观测类消费者（observatory/trace）不必
 *    手工枚举全部事件名。
 */

export interface EventBus<EventMap extends object> {
  /** 向所有订阅者派发事件（事实通知）。 */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void | Promise<void>

  on<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void | Promise<void>,
  ): () => void

  once<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void | Promise<void>,
  ): () => void

  /**
   * 通配符订阅：任意事件派发时都会回调（事件名 + 未定型的载荷）。
   * 用于观测/审计/trace 类消费者。与具名订阅同样保证监听者隔离。
   * 返回取消订阅函数。
   */
  onAny(handler: (event: keyof EventMap & string, payload: unknown) => void): () => void
}
