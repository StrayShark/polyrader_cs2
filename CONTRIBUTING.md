# Contributing to PolyRader CS2

感谢你对 PolyRader CS2 的兴趣！本文档描述了开发环境搭建、代码规范和提交流程。

## 开发环境要求

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | >= 20.0.0 | 推荐使用 LTS 版本 |
| Rust | >= 1.75 | Tauri 2.x 需要 |
| npm | >= 10 | 随 Node.js 安装 |

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/dutongxue/polyrader_cs2.git
cd polyrader_cs2

# 2. 安装依赖
npm install

# 3. 复制环境变量模板
cp .env.example .env

# 4. 启动 Web 开发模式（浏览器）
npm run dev:web

# 5. 启动 Tauri 桌面开发模式
npm run tauri:dev
```

## 项目结构

```
polyrader_cs2/
├── packages/
│   ├── core/           # 核心引擎层（纯逻辑，无 IO 依赖）
│   │   ├── src/engines/    # 12 个引擎：预测、分析、结算、评分等
│   │   ├── src/prompts/    # YAML 提示词模板
│   │   ├── src/types/      # 共享类型定义
│   │   └── src/scoring/    # 评分权重配置
│   ├── infra/          # 基础设施层（DB、缓存、API 客户端）
│   │   ├── src/cache/      # LRU 缓存 + EventEmitter
│   │   ├── src/clients/    # Polymarket / LLM / Polygon 客户端
│   │   ├── src/database/   # SQLite + 迁移 + Repository
│   │   └── src/crawlers/   # HLTV 爬虫
│   ├── server/         # Express 服务端（Sidecar 模式）
│   │   ├── src/controllers/ # 7 个控制器
│   │   ├── src/services/    # 8 个业务服务
│   │   ├── src/routes.ts    # API 路由注册
│   │   └── src/websocket/   # WebSocket 实时推送
│   └── web/            # React + Vite 前端
│       ├── src/components/  # UI 组件 + shadcn/ui
│       ├── src/pages/       # 10 个页面
│       ├── src/hooks/       # WebSocket / 快捷键 / 巨鲸告警
│       ├── src/stores/      # Zustand 状态管理
│       └── src/styles/      # 3 主题 CSS 变量
├── src-tauri/          # Tauri 桌面应用壳
│   ├── src/lib.rs          # Sidecar 管理 + IPC 命令
│   └── tauri.conf.json     # 窗口 / CSP / 打包配置
└── turbo.json          # Monorepo 任务编排
```

## 常用命令

```bash
# 开发
npm run dev:web          # 仅 Web（浏览器 localhost:5173）
npm run tauri:dev        # Tauri 桌面应用

# 构建
npm run build:web        # 构建 Web 静态文件
npm run tauri:build      # 构建桌面安装包（dmg/msi/AppImage）

# 测试
npm run test             # 运行所有包的测试
npm run test --workspace=packages/core    # 仅 Core 测试

# 类型检查
npm run typecheck        # 所有包 TypeScript 检查

# 代码格式化
npm run format           # Prettier 格式化
npm run lint             # ESLint 检查
```

## 代码规范

### TypeScript

- 使用 `strict` 模式
- 优先使用 `interface` 定义对象类型，`type` 定义联合类型
- 避免 `any`，使用 `unknown` + 类型守卫
- 公共 API 必须有 JSDoc 注释

### React 组件

- 使用函数组件 + Hooks
- Props 接口以 `{ComponentName}Props` 命名
- 使用 `cn()` 工具函数合并 Tailwind 类名
- 使用 3 主题 CSS 变量（`var(--background)` 等），不要硬编码颜色

### 引擎层（core）

- 纯逻辑，无 IO 依赖（不 import fs/http/db）
- 所有外部数据通过参数传入
- 每个引擎必须有对应的 `.test.ts` 测试文件
- 使用 Vitest 编写测试

### 提交规范

使用 Conventional Commits 格式：

```
<type>(<scope>): <subject>

feat(match-analysis): add BO5 veto simulation
fix(websocket): fix reconnection on sidecar restart
refactor(services): extract shared match-helpers
test(prompt-engine): add YAML template loading tests
docs(tauri): add development guide
```

**Type 列表**：`feat` | `fix` | `refactor` | `test` | `docs` | `style` | `chore` | `perf`

### Pull Request 流程

1. 从 `main` 创建功能分支：`git checkout -b feat/your-feature`
2. 编写代码 + 测试
3. 确保通过：`npm run typecheck && npm run test`
4. 提交 PR，描述变更内容和动机

## 3 主题系统

项目支持 3 个主题，通过 `data-theme` 属性切换：

| 主题 | 标识 | 适用场景 |
|------|------|---------|
| Dark | `data-theme="dark"` | 默认，暗色环境 |
| Light | `data-theme="light"` | 明亮环境 |
| Matrix | `data-theme="matrix"` | 绿色终端风格 |

所有颜色必须使用 CSS 变量（定义在 `packages/web/src/styles/themes.css`），禁止硬编码。

## LLM 提示词模板

提示词使用 YAML 模板管理（`packages/core/src/prompts/`）：

| 文件 | 用途 |
|------|------|
| `system.yaml` | 系统角色 + 分析因子 + 指南 |
| `context-template.yaml` | 比赛上下文模板（含 `{{placeholder}}`） |
| `output-schema.yaml` | 输出 JSON 格式定义 |

修改提示词时编辑 YAML 文件，不需要改代码。`PromptEngine` 会自动加载。
