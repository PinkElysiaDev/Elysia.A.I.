# Elysia A.I. 插件开发规范

## 文档用途

本文档用于约束 **Elysia A.I. 插件生态的当前有效开发规则**。  
它的目标不是一次性定义未来所有扩展协议细节，而是回答下面几个实际问题：

- 当前什么样的包可以被视为 Elysia A.I. 插件
- 插件在工程上应遵守哪些最基本的边界
- 配置、命名空间、生命周期接入和扩展数据应如何组织
- 哪些内容已经形成正式约束，哪些仍属于后续待收口范围

**本文件正文只保留当前可以指导实际开发的规则。**  
尚未在代码与 runtime 中正式落地的扩展协议，只保留为“后续待正式化事项”，不再写成看似已经完全定型的规范。

---

## 一、什么是插件

在 Elysia A.I. 语境下，插件指的是：

> **向系统某一层注入能力、配置或处理逻辑的扩展单元。**

插件可以是：

- 官方主包插件
  - 例如 `runtime`、`body`、`behavior`
- 官方能力扩展
  - 例如未来某个 `brain-*`、`model-gateway-*`
- 第三方扩展
  - 例如自定义 persona、memory、filter、tool 适配器
- 调试或辅助工具
  - 例如 observability、配置生成器、调试工具

插件不是“系统控制器”，而是系统主链上的：

- 能力提供者
- 行为扩展点
- 配置消费方
- 生命周期参与者

---

## 二、当前有效的插件边界

## 2.1 插件必须服从主包分层
插件必须明确属于某个层，或明确作为通用扩展存在。  
当前长期保留的主包层包括：

- `body`
- `perception`
- `homeostasis`
- `cognition`
- `persona`
- `behavior`
- `dialogue`
- `runtime`
- `observatory`
- `brain`
- `model-gateway`
- `extension`（通用扩展）

---

## 2.2 插件不能绕过主链契约
插件接入系统时，必须优先使用已经在 `core` 中定义的正式对象和事件，例如：

- `Stimulus`
- `ResponsePlan`
- `DialogueTask`
- `DialogueResult`
- `BrainRequest / BrainResponse`
- `ModelGatewayRequest / Response`
- `CoreEventMap`

也就是说：

> **插件不应重新发明自己的内部语言。**

---

## 2.3 插件不能越层承担不属于自己的职责
例如：

- `body` 插件不应混入行为判断
- `behavior` 插件不应直接变成 sender
- `dialogue` 插件不应直接承担 provider routing
- `brain` 插件不应直接变成 model-gateway
- `model-gateway` 插件不应反向承担高层 dialogue 语义组织

---

## 三、命名与包组织规范

## 3.1 官方插件命名
官方包仍使用：

```txt
@elysia-ai/<name>
```

例如：
- `@elysia-ai/core`
- `@elysia-ai/runtime`
- `@elysia-ai/body`

---

## 3.2 第三方插件命名
第三方插件建议使用具备清晰来源前缀的名称，例如：

```txt
elysia-plugin-<name>
```

或带组织前缀的 scoped package。

重点不是一定采用某一种名字，而是：

- 名称稳定
- 来源清晰
- 不与官方包混淆

---

## 3.3 宿主入口包与内部库包要区分
如果一个插件包会被 Koishi 直接加载，那么它属于：

- **宿主入口包**

如果一个包只被其他包依赖，不直接挂入宿主，则属于：

- **内部库包**

这两类包的要求不同：
- 宿主入口包遵守 Koishi 插件交付规范
- 内部库包重点保证类型、导出与 workspace 边界稳定

---

## 四、配置规范

## 4.1 配置必须使用命名空间隔离
插件配置应放入统一的扩展配置区，而不是平铺到顶层。

推荐结构：

```json
{
  "extensions": {
    "@elysia-ai/persona": {},
    "@elysia-ai/dialogue": {},
    "elysia-plugin-example": {}
  }
}
```

---

## 4.2 插件只应消费自己的命名空间配置
插件应只读取：

- `extensions[自己的命名空间]`

不应依赖：
- 其他插件的私有配置区
- 顶层未声明的隐式字段
- 没有命名空间隔离的散乱配置

---

## 4.3 配置文件不应承载业务执行逻辑
配置应该描述：

- 生命周期存在方式
- 启用状态
- 扩展参数
- 行为偏好
- 能力开关

配置不应该直接变成：
- 运行时脚本
- 大段执行逻辑
- 无边界的临时数据池

---

## 五、事件与扩展数据规范

## 5.1 当前正式扩展点应优先围绕事件与服务接口组织
插件接入当前系统，优先使用两类稳定入口：

1. **事件**
   - 通过 `CoreEventMap` 约定事件载荷
2. **服务接口**
   - 通过 `DialogueService`、`BrainService`、`ModelGatewayService` 等正式抽象组织调用边界

---

## 5.2 插件扩展数据必须可追踪
如果插件需要在主链上传递额外数据，应该满足：

- 有明确归属
- 有明确阶段边界
- 不污染核心对象语义
- 后续可被 observability / trace 追踪

---

## 5.3 不要假设扩展协议已经完全稳定
当前仍有一些扩展协议处于设计推进中，例如：

- 更完整的 plugin manifest
- 更完整的 pipeline context
- 更细粒度的 hook stage
- 更正式的 mutate API / capability declaration

这些内容未来会继续收口，但**当前不应假装它们已经完全定型**。

---

## 六、当前推荐的插件开发方式

## 6.1 优先依赖 `core` 的正式契约
开发插件时，优先检查：

- `packages/core/src/types`
- `packages/core/src/bus/event-map.ts`
- `packages/core/src/dialogue`
- `packages/core/src/brain`
- `packages/core/src/repositories`

如果 `core` 已经有正式对象，就不要在插件内部重新定义。

---

## 6.2 优先通过正式边界接入
例如：
- 监听正式事件，而不是直接抓别的包的内部实例
- 依赖正式 service 接口，而不是穿透调用实现细节
- 写入扩展数据时保持命名空间和职责清晰

---

## 6.3 插件应该尽量“单职责”
每个插件最好回答一个清晰问题：

- 这是输入适配插件？
- 这是行为规划插件？
- 这是对话执行插件？
- 这是模型路由插件？
- 这是状态更新插件？
- 这是调试/观测插件？

不要把多个层的职责混在一个插件里。

---

## 七、当前最低开发检查清单

开发一个 Elysia A.I. 插件时，至少应检查：

### 必须项
- [ ] 插件所属层清晰
- [ ] 不绕过 `core` 正式契约
- [ ] 配置使用独立命名空间
- [ ] 不跨层承担不属于自己的职责
- [ ] 不直接依赖其他包的内部实现细节
- [ ] 对外暴露的接口或事件有清晰边界

### 推荐项
- [ ] 有 README 或最小使用说明
- [ ] 有最小测试或最小验证路径
- [ ] 有日志字段与阶段标识
- [ ] 能被 observability / trace 追踪

---

## 八、后续待正式化事项

以下内容仍然有价值，但当前不应继续写成“已经完全定型的正式规范”：

- 完整 plugin manifest 结构
- 完整 pipeline context 标准
- 完整 hook stage 列表
- 统一 mutate API
- capabilities 的正式注册与校验机制
- runtime 对插件兼容性和依赖的自动校验模型

这些内容应在：
- 代码真实落地
- core 契约稳定
- runtime 装配逻辑明确

之后再升级为正式规范。

---

## 九、一句话总结

这份文档当前的核心作用是：

> **约束 Elysia A.I. 插件开发时必须遵守的现行边界，而不是提前把尚未落地的未来扩展协议写成看似已经定型的完整标准。**
