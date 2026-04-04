# Elysia A.I. Koishi 集成指南

## 文档用途

本文档记录了如何将 Elysia A.I. 的 monorepo 包正确配置为可在 Koishi 中加载运行的插件。

它解决的核心问题是：

> 我们用 **Turborepo** 管理 monorepo，Koishi 用 Node.js 模块系统加载插件，两者如何兼容？

---

## 一、Koishi 插件的加载机制

Koishi 通过标准的 **Node.js 模块解析**找到并加载插件：

1. 用户在 `koishi.yml` 中声明插件名
2. Koishi 按包名在 node_modules 中找到对应目录
3. 读取该包的 `package.json` 中的 `main` 字段（默认 `lib/index.js`）
4. 加载插件，调用 `apply()` 函数

**重要结论：**
- Koishi 不关心你用什么 build 工具（yakumo / turbo / tsc 直接调用均可）
- 只要最终产物在 `lib/index.js`，插件就能被加载
- Turborepo + tsc 是完全兼容的方案

---

## 二、Turborepo + TypeScript 的正确 build 方案

### 为什么最初的“只用 tsc 输出单 ESM”不够

之前的集成尝试采用了：

- `tsc`
- `type: module`
- `main: lib/index.js`
- NodeNext / `.js` 显式扩展名

这套方案可以让源码更接近原生 Node ESM，但在真实 Koishi 宿主环境中已经验证出一个问题：

> **单一 ESM 产物并不能稳定满足 Koishi Loader 的加载路径。**

已经真实出现过：

- `ERR_UNSUPPORTED_DIR_IMPORT`
- `ERR_MODULE_NOT_FOUND`
- `TypeError: Class extends value #<Object> is not a constructor or null`

这些错误说明：

- 源码层的 Node ESM 兼容只是第一步
- **发布层仍必须遵守 Koishi 生态的标准插件交付形态**
- 也就是：**双产物（CJS + ESM）**

---

### 正式推荐方案

对于 `runtime` / `body` 这类 **Koishi 宿主入口包**，推荐采用：

- `tsc`：负责类型检查与 `.d.ts`
- `esbuild` / `tsup`：负责输出：
  - `lib/index.cjs`
  - `lib/index.mjs`

也就是说：

> Turborepo 仍然可以保留，但每个 Koishi 入口包的 build 脚本不能只做 `tsc -p`，而要进一步输出双产物。

---

### 配置要求（修正版）

每个 **要被 Koishi 直接加载的入口包** 必须满足：

#### 1. package.json 必须有双入口字段

```json
{
  "main": "lib/index.cjs",
  "module": "lib/index.mjs",
  "typings": "lib/index.d.ts",
  "type": "module"
}
```

#### 2. package.json 必须有标准 exports

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

#### 3. package.json 建议补齐 files / koishi / peerDependencies

```json
{
  "files": ["lib"],
  "peerDependencies": {
    "koishi": "^4.18.0"
  },
  "koishi": {
    "description": {
      "zh": "...",
      "en": "..."
    }
  }
}
```

#### 4. 源码 tsconfig 继续使用 NodeNext 规则

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]
}
```

#### 5. 源码中的相对导入必须写成 Node ESM 兼容形式

例如：

```ts
import { createDefaultRuntime } from './runtime.js'
import { KoishiBodyAdapter } from './adapters/koishi/index.js'
```

#### 6. Turborepo 只负责任务编排，不替代插件打包契约

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

重点是：

> **turbo 只决定“先构建谁、后构建谁”，不决定最终插件产物是否符合 Koishi 规范。**

---

### 一句话总结

- **Turborepo 可以继续用**
- **NodeNext 规则仍然需要**
- **但 Koishi 宿主入口包必须输出 CJS + ESM 双产物**
- 不能再把“单个 `lib/index.js`”视为最终完成形态

---

## 三、Koishi 插件的额外要求

### 3.1 peerDependencies 声明

使用了 `koishi` API 的包（如 `runtime`、`body`）必须声明 koishi 为 peerDependency：

```json
{
  "peerDependencies": {
    "koishi": "^4.18.0"
  },
  "devDependencies": {
    "koishi": "^4.18.0"
  }
}
```

**说明：**
- `peerDependencies`：声明运行时需要宿主环境提供 koishi（由 koishi-app 提供）
- `devDependencies`：开发和编译时使用的 koishi 类型定义

### 3.2 插件包名

Koishi 插件的包名有约定：

- 官方格式：`@koishijs/plugin-*`
- 第三方格式：`koishi-plugin-*`

我们的包名（如 `@elysia-ai/runtime`）不符合 `koishi-plugin-*` 格式，因此在 `koishi.yml` 中需要写完整包名：

```yaml
plugins:
  "@elysia-ai/runtime": {}
  "@elysia-ai/body": {}
```

---

## 四、标准 Koishi monorepo 的工程基线（新增）

结合 Koishi 官方开发文档与 cookbook 中 workspace / testing 的实践，可以把“标准 Koishi monorepo 项目”抽象为以下几个工程基线：

### 4.1 根 workspace 必须稳定覆盖全部包

根 `package.json` 通常应使用：

```json
"workspaces": [
  "packages/*"
]
```

而不是只枚举当前已经接入构建链的个别包。  
原因是：

- 新增包不应反复修改根 workspace 配置
- monorepo 的 build graph 应由统一 glob 管理
- 工具链（lint / test / build / publish）对整个 packages 目录的认知应保持一致

---

### 4.2 必须区分“宿主入口包”和“内部库包”

在 Koishi monorepo 中，不是所有包都承担同样角色。

#### 宿主入口包
会被 Koishi Loader 直接加载，例如：

- `runtime`
- `body`

这些包必须满足：
- 标准 Koishi 插件命名
- `main/module/typings/exports`
- `peerDependencies.koishi`
- `koishi` 元信息
- 双产物（CJS + ESM）

#### 内部库包
只作为 workspace 内部依赖，例如：

- `core`
- `shared`
- 未来的部分能力包

这些包不一定都要变成 Koishi 插件，但至少要有稳定的：
- 类型入口
- 导出边界
- workspace 消费方式

---

### 4.3 build 必须分为“源码层”和“交付层”

#### 源码层
保证 TypeScript / NodeNext 语义正确：
- `.js` 显式扩展名
- 禁止目录导入省略 `index.js`
- 测试文件与正式构建分离

#### 交付层
保证 Koishi Loader 能稳定加载：
- `index.cjs`
- `index.mjs`
- `index.d.ts`
- `exports.require/import/types`

标准 monorepo 不能只停留在“源码层通过”。

---

### 4.4 测试不仅要测函数，还要测宿主接入

Koishi cookbook 的 testing 实践意味着，最终不应只满足：

- unit test
- 类型检查
- build 成功

还应包含：
- 插件入口 `apply()` 行为验证
- 宿主级集成测试
- `koishi start` 下的实际加载验证

---

## 五、koishi-app workspace 配置

koishi-app 的 `package.json` 已包含：

```json
"workspaces": [
  "external/*",
  "external/*/packages/*"
]
```

这意味着 `external/elysia-ai/packages/*` 可以被根应用侧 workspace 识别。  
但这**不等于** `elysia-ai` 自己已经是标准 monorepo 根。

`koishi-app` 识别你，不代表你内部工程规范已经完全收口。

---

## 六、当前配置差距（修正版）

| 项目 | 当前状态 | 说明 |
|------|---------|------|
| `packages/core/package.json` | 已补基础 build 脚本 | 作为内部库可先保持单产物 |
| `packages/runtime/package.json` | 已补基础字段，但**仍需双产物导出** | 当前仍不满足最终 Koishi 插件交付标准 |
| `packages/body/package.json` | 已补基础字段，但**仍需双产物导出** | 当前仍不满足最终 Koishi 插件交付标准 |
| `packages/core/tsconfig.json` | 已补 rootDir/outDir | 后续继续按 NodeNext 规则维护 |
| `packages/runtime/tsconfig.json` | 已补 rootDir/outDir，并排除测试 | 已开始向 NodeNext 兼容调整 |
| `packages/body/tsconfig.json` | 已补 rootDir/outDir，并排除测试 | 已开始向 NodeNext 兼容调整 |
| `turbo.json` | 已配置 build 流水线 | 只负责任务编排，不等同于 Koishi 插件打包完成 |
| `koishi.yml` | 已添加插件声明 | 插件名需与标准 Koishi 插件包名一致 |
| runtime/body 源码相对导入 | 已开始修成 `.js` / `index.js` | 这是源码层修复，不代表发布层已经完成 |
| runtime/body 双产物构建 | **尚未完成** | 这是当前最关键的缺口 |

---

## 七、标准化整改方案（新增）

下面这部分是将 `elysia-ai` 对齐为更标准 Koishi monorepo 项目的具体整改方案。

### P0：宿主入口包收口（最高优先级）

#### 目标
让 `runtime` / `body` 真正成为标准 Koishi 插件入口包。

#### 必须完成
1. 输出双产物：
   - `lib/index.cjs`
   - `lib/index.mjs`
   - `lib/index.d.ts`
2. `package.json` 标准化：
   - `main`
   - `module`
   - `typings`
   - `exports`
   - `koishi`
3. `koishi start` 实际加载成功

#### 为什么是 P0
因为这是“宿主能不能真正加载”的直接前提。

---

### P1：根 workspace 标准化

#### 当前问题
根 `workspaces` 只列出少数包，会导致：
- build graph 不完整
- 新包接入成本高
- 工具链对全仓感知不一致

#### 整改目标
改成：

```json
"workspaces": [
  "packages/*"
]
```

#### 影响
- monorepo 更符合标准 workspace 预期
- 后续 perception / cognition / persona 等包能自然进入工程图谱

---

### P1：定义双模板包规范

#### 宿主入口包模板
适用于：
- `runtime`
- `body`

要求：
- `koishi-plugin-*` 命名
- 双产物
- `exports`
- `peerDependencies.koishi`
- `koishi` 元信息

#### 内部库包模板
适用于：
- `core`
- `shared`
- 其他暂不直接挂入 `koishi.yml` 的能力包

要求：
- 清晰 `types`
- 稳定 `exports`
- 明确是否允许外部消费

---

### P1：统一 build 策略

建议正式固定为：

- 内部库包：`tsc`
- 宿主入口包：`tsc --emitDeclarationOnly + esbuild`
- `turbo`：统一编排，不负责替代打包契约

这样既保留当前 monorepo 结构，又对齐 Koishi 插件的宿主要求。

---

### P2：补宿主集成测试

建议新增至少三类验证：

1. **包级单元测试**
2. **插件入口测试**
   - `apply(ctx)` 是否正常挂载
3. **宿主级验证**
   - `koishi start` 实际加载成功

如果只停留在 unit test 和 build 成功，仍不算完成宿主适配。

---

### P2：补全根仓库与包元信息

包括但不限于：

- `repository`
- `homepage`
- `bugs`
- `files`
- 更清晰的包分类说明

这不仅影响可读性，也会影响 clone / scaffolding / publish / tooling 的行为一致性。

---

## 八、执行 build 的命令

### 源码层 build（当前可用）
在 elysia-ai 目录下：

```bash
cd external/elysia-ai
yarn build
```

这一步当前的意义是：

- 验证 monorepo 内部依赖顺序是否正确
- 验证 TypeScript / NodeNext 源码层是否成立
- 验证 `lib/` 是否生成

### 注意
这一步**不再被视为最终 Koishi 插件交付验证**。  
因为对 `runtime/body` 来说，最终验收还必须包括：

- `lib/index.cjs`
- `lib/index.mjs`
- `lib/index.d.ts`
- `exports.require/import/types` 正确

### 在 koishi-app 根目录下 build

```bash
yarn build
```

根目录 build 仍会触发仓库里其他插件和前端资源构建（包括 vite / client pipeline），  
因此不能用它单独判断 `elysia-ai` 的宿主兼容性。

应优先使用：

```bash
cd external/elysia-ai
yarn build
```

验证 `elysia-ai` 自身源码层与打包层。

---

## 九、验证（修正版）

### 第一步：源码层验证
build 完成后，先检查最基础产物：

- `external/elysia-ai/packages/core/lib/index.js`
- `external/elysia-ai/packages/runtime/lib/index.js`
- `external/elysia-ai/packages/body/lib/index.js`

并确认源码层没有以下问题：

- 目录导入
- 无扩展名相对导入
- 测试文件参与正式包构建

### 第二步：宿主插件产物验证
对 `runtime/body`，最终应检查：

- `external/elysia-ai/packages/runtime/lib/index.cjs`
- `external/elysia-ai/packages/runtime/lib/index.mjs`
- `external/elysia-ai/packages/body/lib/index.cjs`
- `external/elysia-ai/packages/body/lib/index.mjs`

以及：

- `package.json` 的 `main/module/typings/exports` 是否和这些产物一致

### 第三步：Koishi 宿主验证
然后运行：

```bash
yarn start
```

并确认：

1. Koishi 能解析插件包名
2. Loader 能成功加载插件
3. 没有：
   - `ERR_UNSUPPORTED_DIR_IMPORT`
   - `ERR_MODULE_NOT_FOUND`
   - `Class extends value #<Object> is not a constructor`

### 最终验收标准
`runtime/body` 只有在下面三项同时满足时，才算真正“可作为 Koishi 插件交付”：

1. monorepo build 成功
2. 双产物（CJS + ESM）输出完整
3. `koishi start` 时实际加载成功
