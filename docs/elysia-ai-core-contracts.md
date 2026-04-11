# Elysia A.I. Core Contracts

## 文档用途

本文档用于指导 **`packages/core`** 的第一阶段实现。

它的目标不是继续讨论顶层理念，而是把 `core` 包真正落到“可以开始写代码”的程度。  
这份文档主要回答下面几个问题：

- `core` 到底负责什么
- `core` 当前阶段应该做什么、不该做什么
- `core` 第一批要定义哪些类型和接口
- `core` 的推荐目录结构是什么
- `core` 的推荐实现顺序是什么
- 做到什么程度可以认为 `core` 第一阶段完成

本文档适合：

- 你自己直接按文档开发 `packages/core`
- 新开的协作窗口快速理解 `core` 的边界与目标
- 后续检查 `runtime`、`body`、`behavior` 等包是否正确依赖 `core`

---

## 1. `packages/core` 的定位

`packages/core` 是 **Elysia A.I. 的公共协议层**。

它的职责不是实现具体业务，而是定义整个系统的“公共语言”和“基础契约”。

### `core` 负责什么

`core` 负责：

- 核心类型定义
- 对应的运行时 schema
- 事件总线接口
- repository 抽象接口
- `brain` 统一抽象接口
- `model-gateway` 统一抽象接口
- 通用错误类型
- 通用导出入口

你可以把 `core` 理解为：

> 所有其他包都要讲同一种“内部语言”，这套语言就定义在 `core`。

---

## 2. `core` 不负责什么

为了避免后续越写越乱，`core` 的边界必须非常清晰。

### 当前阶段 `core` 不负责：

- 不负责 `runtime` 生命周期逻辑
- 不负责 Koishi 平台接入
- 不负责 MongoDB 的具体读写实现
- 不负责 Redis 的具体缓存逻辑
- 不负责模型 provider 的具体 HTTP 请求
- 不负责具体行为策略
- 不负责具体人格、关系、记忆算法
- 不负责 prompt 构造和回复渲染
- 不负责具体日志实现

### 一句话总结

> `core` 只定义抽象，不实现具体运行逻辑。

---

## 3. 当前阶段 `core` 的实现目标

在当前阶段，`packages/core` 的目标是：

1. 让其他主包开始有稳定依赖目标
2. 让系统的核心对象和命名先统一下来
3. 让运行时校验模型建立起来
4. 让未来的 `runtime / body / behavior / brain / model-gateway` 可以在统一接口上继续开发

### 当前阶段的 `core` 只做四类事

1. **类型定义**
2. **Schema 定义**
3. **接口抽象**
4. **统一导出**

---

## 4. 当前阶段的实现边界

### 现在要做的

- 核心类型
- Zod schema
- Event Bus 接口
- Repository 接口
- Brain 接口
- Model Gateway 接口
- 通用错误类型
- index 导出整理

### 现在不要做的

- 具体实现类
- HTTP client
- Mongo repository 实现
- Redis repository 实现
- 事件总线真实实现
- 复杂工具函数堆积
- 各包内部耦合逻辑

---

## 5. 第一批必须定义的核心对象

下面这些对象，是当前阶段最优先的类型。

---

### 5.1 `LifeInstance`

表示一个虚拟生命体实例，是系统里的核心主语。

### 当前阶段建议包含的最小字段
- `id`
- `name`
- `templateId?`
- `status`
- `createdAt`
- `updatedAt`
- `metadata?`

### 当前阶段目的
先表达“一个生命体实例存在”，不要急着把所有内在状态都塞进去。

---

### 5.2 `Habitat`

表示生命体长期活动的环境。

### 当前阶段建议包含的最小字段
- `id`
- `platform`
- `botId`
- `type`
- `guildId?`
- `channelId?`
- `userId?`
- `metadata?`

### 当前阶段目的
先表达“生命体在哪个环境里活动”。

---

### 5.3 `Bond`

表示生命体与其他主体之间的纽带关系。

### 当前阶段建议包含的最小字段
- `id`
- `lifeInstanceId`
- `targetId`
- `targetType`
- `familiarity`
- `intimacy`
- `trust`
- `updatedAt`

### 当前阶段目的
先建立最小关系结构，不要一开始做过复杂关系图谱。

---

### 5.4 `Thread`

表示事件线 / 主题线 / 剧情线。

### 当前阶段建议包含的最小字段
- `id`
- `lifeInstanceId`
- `habitatId`
- `type`
- `title?`
- `status`
- `createdAt`
- `updatedAt`

### 当前阶段目的
先有“连续事件”的容器抽象。

---

### 5.5 `Projection`

表示某个生命体在某个身体节点 / 环境中的投射。

### 当前阶段建议包含的最小字段
- `id`
- `lifeInstanceId`
- `habitatId`
- `botId`
- `enabled`
- `profile?`
- `createdAt`
- `updatedAt`

### 当前阶段目的
支持多 Bot / 多 Habitat / 多投射。

---

### 5.6 `Stimulus`

表示系统感知到的刺激。

### 当前阶段建议至少包含
- `id`
- `type`
- `lifeInstanceId?`
- `habitatId`
- `actorId?`
- `timestamp`
- `payload`
- `metadata?`

### 当前阶段目的
作为未来 perception 的统一输入。

`Stimulus` 是当前阶段最关键的对象之一，必须定义得足够清晰。

---

### 5.7 `DialogueTask`

表示从 behavior / planner 流向 dialogue 层的正式任务对象。

### 当前阶段建议包含的最小字段
- `lifeId?`
- `habitatId?`
- `scope`
- `sourceStimulusIds`
- `mode`
- `messages`
- `metadata?`

### 当前阶段目的
作为 `behavior -> dialogue` 的正式桥梁对象，避免后续 dialogue 层重新发明输入模型。

---

### 5.8 `DialogueResult`

表示 dialogue 层返回的正式结果对象。

### 当前阶段建议包含的最小字段
- `taskId?`
- `output`
- `messages?`
- `metadata?`

### 当前阶段目的
作为后续 sender / observability / trace 的统一输出对象。

---

### 5.9 `BehaviorCandidate`

表示候选行为。

### 当前阶段建议包含的最小字段
- `type`
- `priority`
- `reason?`
- `target?`
- `payload?`

### 当前阶段目的
作为未来 behavior 选择器的输入对象。

---

### 5.10 `BehaviorDecision`

表示最终选中的行为决定。

### 当前阶段建议包含的最小字段
- `selected`
- `type`
- `reason?`
- `payload?`

### 当前阶段目的
作为 behavior → dialogue / output 的桥梁对象。

---

### 5.11 `VitalState`

表示最小生命体征状态。

### 当前阶段建议包含的最小字段
- `energy`
- `socialDrive`
- `loneliness`
- `stress`
- `curiosity`

### 当前阶段目的
为后续 homeostasis 留出统一状态结构。

---

### 5.12 `RhythmState`

表示节律状态。

### 当前阶段建议包含的最小字段
- `awake`
- `circadianPhase`
- `activityTrend`
- `lastInteractionAt`

### 当前阶段目的
为后续 rhythm / proactive / schedule 奠定结构基础。

---

## 6. 类型设计原则

### 6.1 先保守，不贪字段
当前阶段先定义最小字段集合。  
只要能支撑后续包继续开发即可。

### 6.2 统一使用 `string` 作为主 ID 类型
不要现在把数据库 ObjectId 直接带进核心类型。

### 6.3 所有顶层核心对象都保留 `metadata?`
这样可以支持未来平滑扩展，而不至于一开始就加太多字段。

### 6.4 类型名称尽量稳定
当前阶段定下来的名字尽量不要轻易改，否则后续所有包都会抖动。

---

## 7. Schema 设计要求

`core` 中每个核心对象都需要有对应的 Zod schema。

### 为什么必须有 schema
因为后面要同时面对：

- YAML 配置输入
- MongoDB 文档写入前校验
- 运行时数据校验
- 多窗口协作时的结构约束

### 当前要求
- 每个核心类型都有对应 schema
- schema 文件名和 type 文件名保持一致
- type 和 schema 语义要同步维护

### 当前阶段不要做的事
- 不要为了 schema 灵活性牺牲类型可读性
- 不要在 schema 里提前加太多未来字段
- 不要写和核心语义无关的 transform 魔法

---

## 8. Event Bus 抽象

`core` 需要先定义 **事件总线接口**，但不需要实现具体总线。

### 当前阶段需要定义什么
- `EventBus` 接口
- `EventMap` / 事件类型映射
- 事件命名规范

### 当前推荐事件命名风格
统一采用：

```txt
domain.action
```

例如：
- `stimulus.received`
- `perception.completed`
- `homeostasis.updated`
- `behavior.selected`
- `dialogue.generated`

### 当前阶段建议先定义的事件
- `stimulus.received`
- `perception.completed`
- `homeostasis.updated`
- `cognition.completed`
- `behavior.selected`
- `dialogue.started`
- `dialogue.generated`
- `dialogue.completed`
- `dialogue.failed`
- `brain.requested`
- `brain.completed`
- `brain.failed`
- `gateway.requested`
- `gateway.responded`
- `gateway.failed`

### 当前阶段不要做什么
- 不要写进程内 EventEmitter 实现
- 不要接 Redis Pub/Sub
- 不要写复杂事件中间件

这些属于 `runtime` 的实现问题，不属于 `core`。

---

## 9. Repository 抽象

`core` 里只定义 repository 接口，不实现具体 Mongo/Redis 逻辑。

### 当前阶段建议先定义的 repository
- `LifeRepository`
- `ProjectionRepository`
- `LifeStateRepository`
- `StimulusRepository`
- `BondRepository`
- `TraceRepository`

### 后续可扩展但当前不必优先
- `ThreadRepository`
- `MemoryRepository`
- `HabitatRepository`

### 当前阶段设计原则
- 只定义最小必要接口
- 不要把 Mongo 查询细节写进接口名里
- 尽量按领域对象抽象，而不是按数据库操作细节抽象

例如应优先考虑：
- `getById`
- `save`
- `listByLifeInstance`

而不是：
- `findOneAndUpdateRaw`
- `aggregateProjectionState` 这类偏实现细节的命名

---

## 10. Brain 抽象与 Model Gateway 抽象

这是当前阶段最容易混的地方，必须在文档里写清楚。

---

### 10.1 `Brain` 的职责

`brain` 负责：

- 统一认知请求抽象
- 统一认知响应抽象
- 对上层暴露统一模型能力接口

可以理解为：

> Brain 负责“我要问什么”。

### 当前阶段在 `core` 中需要定义的内容
- `BrainRequest`
- `BrainResponse`
- `BrainCapability`
- `BrainService` 接口

其中当前正式方向应至少支持：
- `task`
- `lifeId`
- `habitatId`
- `capability`
- `messages`
- `metadata`

并允许 `BrainResponse` 返回：
- `output`
- `messages?`
- `capability?`
- `metadata?`

### 当前阶段不要做的事
- 不要写 OpenAI / Gemini / Claude 的 HTTP 客户端
- 不要管理 provider 配置
- 不要管理 endpoint
- 不要管理 routing

---

### 10.2 `Model Gateway` 的职责

`model-gateway` 负责：

- 管理模型配置
- 管理 provider / endpoint
- 管理 routing
- 真正发出模型请求
- 屏蔽 provider 差异

可以理解为：

> Model Gateway 负责“这个请求到底怎么发给哪个模型”。

### 当前阶段在 `core` 中需要定义的内容
- `ModelGatewayRequest`
- `ModelGatewayResponse`
- `ProviderDescriptor`
- `RoutingResult`
- `ModelUsage`
- `ModelGatewayService` 接口

其中当前正式方向应至少支持：
- 请求侧：
  - `task`
  - `lifeId`
  - `habitatId`
  - `providerId`
  - `model`
  - `messages`
  - `metadata`
- 响应侧：
  - `output`
  - `messages?`
  - `provider?`
  - `usage?`
  - `finishReason?`
  - `metadata?`

### 当前阶段不要做的事
- 不要实现具体 provider channel
- 不要接 `elysia-api`
- 不要写真实 provider 请求逻辑

这些是 `packages/model-gateway` 的工作，不是 `core` 的工作。

---

### 10.3 `Dialogue` 服务抽象

当前阶段在 `core` 中应补入：

- `DialogueTask`
- `DialogueResult`
- `DialogueService`

其职责是：

- 接收来自 behavior / planner 的正式对话任务
- 组织进入认知层前的对话执行入口
- 为 sender / observability / trace 提供统一结果对象

可以理解为：

> Dialogue 负责“把计划转成正式对话任务，并产出可发送结果”。

当前阶段不要做的事：
- 不要直接接 provider
- 不要直接做模型路由
- 不要把 dialogue 写成 sender 本身

---

## 11. 推荐目录与文件清单

当前阶段，`packages/core/src/` 推荐采用下面这套结构：

```txt
packages/core/src/
  index.ts

  types/
    life.ts
    habitat.ts
    bond.ts
    thread.ts
    projection.ts
    stimulus.ts
    behavior.ts
    state.ts

  schemas/
    life.ts
    habitat.ts
    bond.ts
    thread.ts
    projection.ts
    stimulus.ts
    behavior.ts
    state.ts

  bus/
    event-map.ts
    event-bus.ts

  repositories/
    bond.ts
    life.ts
    projection.ts
    state.ts
    stimulus.ts
    trace.ts

  dialogue/
    dialogue.ts

  brain/
    brain.ts
    model-gateway.ts

  types/
    dialogue.ts

  errors/
    index.ts
```

---

## 12. 每个目录当前应该放什么

### `types/`
放核心对象类型定义。

### `schemas/`
放与 `types/` 一一对应的 Zod schema。

### `bus/`
放事件总线接口与事件映射，不放具体实现。

### `repositories/`
放领域 repository 接口，不放 Mongo 实现。

### `brain/`
放 `Brain` 和 `ModelGateway` 的抽象接口。

### `errors/`
放核心公共错误类型与错误代码。

---

## 13. 推荐实现顺序

当前阶段建议严格按下面顺序推进：

### Step 1：先写 `types/`
因为所有后续设计都依赖类型语义。

### Step 2：再写 `schemas/`
确保类型和运行时校验结构同步建立。

### Step 3：再写 `bus/`
这时事件载荷结构已经有类型基础。

### Step 4：再写 `repositories/`
因为 repository 的返回类型和输入参数会依赖前面的类型定义。

### Step 5：最后写 `brain/`
因为它需要依赖上面的核心对象和统一命名。

### Step 6：最后整理 `index.ts`
把已经稳定的内容统一导出。

---

## 14. 当前阶段验收标准

当 `packages/core` 第一阶段完成时，应该满足下面这些条件：

1. 第一批核心类型已经定义完成
2. 第一批核心 schema 已定义完成
3. Event Bus 接口已定义完成
4. Repository 接口已定义完成
5. `Brain` / `ModelGateway` 抽象接口已定义完成
6. `src/index.ts` 已完成统一导出
7. 其他包已经可以开始依赖 `core` 开发，而无需自己再定义基础类型

---

## 15. 当前阶段禁止事项

为了防止 `core` 被写成“大杂烩”，当前阶段必须遵守这些限制：

### 禁止项 1
禁止在 `core` 中写 MongoDB 具体实现。

### 禁止项 2
禁止在 `core` 中写 Koishi 平台逻辑。

### 禁止项 3
禁止在 `core` 中写 OpenAI / Gemini / Claude 的具体请求代码。

### 禁止项 4
禁止把大量工具函数塞进 `core`，把它写成“超级工具包”。

### 禁止项 5
禁止让 `core` 依赖 `runtime`、`body`、`cognition`、`behavior` 等上层包。

### 禁止项 6
禁止在当前阶段为了“以后可能需要”而加入过多字段和复杂泛型。

---

## 16. 后续协作建议

如果后续协作窗口要接手 `core` 开发，请优先遵守下面这条顺序：

1. 先看 `elysia-ai-top-level-design.md`
2. 再看 `elysia-ai-development-roadmap.md`
3. 最后按本文件实现 `packages/core`

### 只有在下面这几个条件同时满足后
才应该进入下一步：
- `types` 已稳定
- `schemas` 已稳定
- `bus` 已稳定
- `brain` 抽象已稳定

然后才应该进入：
- `runtime`

---

## 17. 一句话总结

`packages/core` 当前阶段的唯一目标是：

> **把 Elysia A.I. 的公共语言、运行时校验模型和基础抽象接口先定义清楚。**

只要这一点没完成，后面任何包的实现都不应该过快推进。
