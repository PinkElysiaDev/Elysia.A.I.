# Elysia A.I. Koishi 集成指南

## 文档用途

本文档用于说明 **Elysia A.I. 在 Koishi 宿主中的当前正式集成要求**。  
它回答的核心问题是：

- 哪些包属于 Koishi 宿主入口包
- 这些包应如何构建与发布
- Koishi Loader 对插件包的最低要求是什么
- 如何验证一个包已经达到“可被 Koishi 稳定加载”的标准

**本文件正文只保留当前有效的集成规范。**  
历史踩坑、试错路线和旧方案说明，统一保留在文末“经验附录”中。

---

## 一、文档适用范围

本文档主要适用于以下两类包：

### 1. 宿主入口包
会被 Koishi Loader 直接加载的包，例如：

- `runtime`
- `body`

### 2. 内部库包
不会直接被 Koishi Loader 加载，但会被宿主入口包依赖的包，例如：

- `core`
- `shared`
- 未来部分能力包

这两类包的工程要求不同，不能混为一谈。

---

## 二、当前有效结论

### 2.1 Koishi 只认“最终交付形态”
Koishi 并不关心你内部使用的是：

- Turborepo
- tsc
- esbuild
- tsup
- yakumo

它真正关心的是：

> **最终插件包能否以标准 Node 模块形态被成功解析、加载并执行 `apply()`。**

因此，对 Koishi 集成来说，最终验收标准不是“源码能编译”，而是：

- 包可被解析
- 包入口正确
- Loader 能稳定加载
- 插件能在宿主中正常启动

---

### 2.2 宿主入口包必须按 Koishi 插件包处理
对于 `runtime` / `body` 这类入口包，当前正式要求是：

- 具备标准插件元信息
- 具备稳定的 `exports`
- 具备可被 Koishi Loader 使用的入口产物
- 满足宿主环境下的加载要求

也就是说：

> **宿主入口包不是普通 workspace 内部包，而是正式插件交付物。**

---

### 2.3 内部库包与宿主入口包必须分开治理
当前应明确区分：

#### 宿主入口包
特点：
- 会被 Koishi 直接加载
- 需要宿主兼容
- 需要交付级产物规范

#### 内部库包
特点：
- 只作为 workspace 内部依赖
- 重点是稳定导出与类型边界
- 不直接承担 Loader 兼容责任

---

## 三、当前推荐的工程策略

## 3.1 monorepo 可以继续使用
Turborepo / Yarn workspace 可以继续保留。  
它们负责的是：

- workspace 管理
- 构建顺序
- 任务编排

但要明确：

> **monorepo 工具只负责编排，不替代插件交付规范。**

---

## 3.2 源码层与交付层必须分开看待

### 源码层
目标：
- TypeScript 正确
- NodeNext 兼容
- 跨包引用清晰
- 相对导入合法

当前要求包括：
- `.js` 显式扩展名
- 避免目录导入歧义
- 测试文件不参与正式构建

### 交付层
目标：
- 产物能被 Koishi Loader 稳定加载
- `package.json` 的入口字段与产物匹配
- 发布形态满足宿主消费要求

**源码层通过 ≠ 宿主可交付。**

---

## 四、宿主入口包的正式要求

下面这部分是当前应遵守的正式规范。

### 4.1 `package.json` 入口字段
宿主入口包应明确提供：

```json
{
  "main": "lib/index.cjs",
  "module": "lib/index.mjs",
  "typings": "lib/index.d.ts"
}
```

---

### 4.2 `exports` 应明确声明
推荐形式：

```json
{
  "exports": {
    ".": {
      "types": "./lib/index.d.ts",
      "require": "./lib/index.cjs",
      "import": "./lib/index.mjs"
    },
    "./package.json": "./package.json"
  }
}
```

---

### 4.3 `peerDependencies` 应正确声明 `koishi`
对使用 Koishi API 的宿主入口包，应声明：

```json
{
  "peerDependencies": {
    "koishi": "^4.18.0"
  }
}
```

通常也会在 `devDependencies` 中保留 `koishi`，用于开发与类型支持。

---

### 4.4 `files` 与 `koishi` 元信息应补齐
推荐至少包含：

```json
{
  "files": ["lib"],
  "koishi": {
    "description": {
      "zh": "...",
      "en": "..."
    }
  }
}
```

---

### 4.5 产物应与入口字段严格一致
宿主入口包最终应至少产出：

- `lib/index.cjs`
- `lib/index.mjs`
- `lib/index.d.ts`

并确保：

- `main` 指向 CJS
- `module` 指向 ESM
- `typings` 指向声明文件
- `exports` 与三者一致

---

## 五、源码层要求

### 5.1 相对导入必须 Node ESM 兼容
例如：

```ts
import { createDefaultRuntime } from './runtime.js'
import { KoishiBodyAdapter } from './adapters/koishi/index.js'
```

---

### 5.2 测试文件必须排除出正式构建
`tsconfig` 中应显式排除：

- `src/**/*.test.ts`
- `src/**/__tests__/**`

---

### 5.3 NodeNext 规则必须被一致执行
源码层必须遵守统一规则，不应一部分按 NodeNext 写，一部分继续依赖模糊导入或目录解析。

---

## 六、构建策略建议

## 6.1 内部库包
推荐：
- `tsc`

重点：
- 类型
- 导出边界
- workspace 内部消费

---

## 6.2 宿主入口包
推荐：
- `tsc --emitDeclarationOnly`
- `esbuild` 或 `tsup` 输出运行时产物

重点：
- 双入口产物
- 与 `exports` 对齐
- 宿主加载稳定

---

## 6.3 turbo 的角色
`turbo` 应继续只负责任务编排，例如：

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["lib/**"]
    }
  }
}
```

它解决的是：

- 谁先 build
- 谁后 build
- 哪些产物缓存

它不直接决定插件包是否符合 Koishi 交付规范。

---

## 七、workspace 组织要求

### 7.1 根 workspace 应覆盖全部包
根 workspace 更推荐写为：

```json
"workspaces": [
  "packages/*"
]
```

目的：
- 所有能力包进入统一图谱
- 避免新增包时频繁手改根配置
- 保持工具链对工程边界的统一认知

---

### 7.2 应建立“宿主入口包 / 内部库包”双模板
建议在工程规范层明确两套模板：

#### 宿主入口包模板
适用于：
- `runtime`
- `body`

#### 内部库包模板
适用于：
- `core`
- `shared`
- 暂不直接写入 `koishi.yml` 的包

这样能避免：
- package.json 风格混乱
- 构建规则混乱
- 发布边界混乱

---

## 八、验证与验收

### 8.1 源码层验证
先验证：
- TypeScript 构建通过
- 相对导入合法
- 无测试文件混入产物
- `lib/` 产物生成

---

### 8.2 交付层验证
再验证：
- `lib/index.cjs`
- `lib/index.mjs`
- `lib/index.d.ts`

以及：
- `package.json` 的入口字段是否与产物一致

---

### 8.3 宿主验证
最后验证：
- Koishi 能找到包
- Loader 能成功加载
- 插件启动成功
- 不出现宿主兼容性错误

---

### 8.4 当前最终验收标准
宿主入口包只有在下面三项同时满足时，才算真正完成：

1. monorepo / TypeScript 构建通过
2. 交付产物完整且入口字段匹配
3. Koishi 宿主中实际加载成功

---

## 九、当前最重要的整改方向

按当前状态，优先级应为：

1. **宿主入口包交付收口**
2. **workspace 范围标准化**
3. **双模板包规范**
4. **统一 build 策略**
5. **宿主集成测试**
6. **根仓库与包元信息补齐**

---

## 十、经验附录：保留的历史试错信息

本节保留有价值但不应继续污染正文主线的试错经验。

### 10.1 为什么不能只看“单个 `lib/index.js`”
历史上曾采用过：

- `tsc`
- `type: module`
- `main: lib/index.js`
- NodeNext / `.js` 显式扩展名

这套方案说明了：
- 源码层 ESM 兼容是必要的
- 但它不足以保证 Koishi Loader 稳定加载

因此不能再把：
- “能产出一个 `lib/index.js`”
- “源码层能编译通过”

视为宿主接入完成。

---

### 10.2 真实踩坑保留
曾经真实出现过以下报错：

- `ERR_UNSUPPORTED_DIR_IMPORT`
- `ERR_MODULE_NOT_FOUND`
- `TypeError: Class extends value #<Object> is not a constructor or null`

这些经验仍有保留价值，因为它们说明：

- 相对导入规则不能放松
- Loader 与发布层兼容不能只靠源码层修复
- 插件交付形态必须独立考虑

---

### 10.3 经验保留方式
后续如果再出现类似“某方案试过但不推荐”的情况，建议写入附录，而不是回填到正文主线。

这样可以保证：
- 正文只表达“现在该怎么做”
- 附录解释“为什么我们这么做”

---

## 十一、一句话总结

这份文档的核心作用不是保存所有集成历史，而是：

> **明确 Elysia A.I. 在 Koishi 宿主中的当前正式集成要求，并将仍有价值的历史试错经验降级保存为附录。**
