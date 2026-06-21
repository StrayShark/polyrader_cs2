# PolyRader CS2 v0.2.0 — Release Notes

**发布日期**: 2026-06-19
**下载**: [GitHub Release](https://github.com/StrayShark/polyrader_cs2/releases/tag/v0.2.0)

---

## 概述

PolyRader CS2 v0.2.0 是一个重大里程碑版本，完成了从 Web 应用到 **Tauri 桌面应用**的全面迁移，新增了 **Prompt A/B 测试框架**、**决策日记系统**和**统计显著性检验**，同时去除了 Node.js 运行时依赖。

---

## 新功能

### Tauri 桌面应用

- 基于 **Tauri 2.x** 的跨平台桌面应用（macOS / Windows / Linux）
- Express server 作为 Tauri sidecar 进程运行，HTTP + WebSocket 复用单端口
- Rust 后端：sidecar 生命周期管理、IPC 桥接、系统托盘、配置管理
- 首次启动引导：原生文件夹选择器，自动生成 AES-256-GCM 加密密钥
- 键盘快捷键：Cmd+1-9 页面导航、Cmd+, 设置
- Tauri Updater 插件自动更新
- 系统托盘：显示/退出菜单，关闭时最小化到托盘

### Prompt A/B 测试框架

- `prompt_variants` 表：支持创建、编辑、启停、流量权重分配
- 加权随机变体选择算法
- 每个 LLM 分析记录关联变体 ID
- A/B 效果对比 API：按变体聚合准确率、PnL、ROI
- 前端管理页面：变体 CRUD + A/B 对比仪表盘
- 统计显著性检验：双比例 z 检验 + 卡方检验（Yates 校正）+ 贝叶斯 Beta-Binomial 模型
- 智能推荐：promote_a / promote_b / insufficient / no_difference

### 决策日记系统

- 每笔模拟投注关联 reasoning 字段
- 独立决策记录表单（脱离 match-detail 依赖）
- 投注历史支持手动结算（won/lost/自定义 PnL）和删除
- UUID 投注 ID

### 跨平台独立二进制

- 使用 `bun build --compile` 将 Express server 打包为独立二进制
- 用户无需预装 Node.js
- 跨平台构建脚本（Node.js API 调用 esbuild，避免 Windows shell quoting 问题）
- CI 矩阵验证：ubuntu / windows / macos 三平台

---

## 改进

### WebSocket 重连优化

- 固定 5s 重连改为**指数退避**（1s~30s）+ 0-1s 随机抖动
- 最大 20 次重连上限
- 连接成功后重置计数器

### 前端交互增强

- 所有页面 E2E 交互测试覆盖（45 个 Playwright 测试）
- 前端金额校验与后端对齐（amount 10-10000，odds 1.01-100）
- A/B 对比下拉自动选中前两个变体

### 基础设施

- Redis → LRU 内存缓存（lru-cache v11），零外部依赖
- Redis Pub/Sub → Node.js EventEmitter
- turbo `packageManager` 字段配置
- CI 跨平台 bun compile 验证（ubuntu / windows / macos）

---

## Bug 修复

- WebSocket `isAlive` 确定性缺陷修复
- i18n 缺失翻译键补全
- ESLint 规则违反修复
- OrderBookChart React StrictMode 双调用 `removeSeries` 崩溃
- `LLMRepository.upsertBet` 补充 `reasoning` + `variant_id` 列
- Windows CI esbuild `--banner:js` 单引号被 cmd.exe 破坏
- Windows CI `spawnSync esbuild ENOENT`

---

## 测试

| 类型 | 数量 |
|------|------|
| Core vitest | 205 |
| Infra vitest | 34 |
| Server vitest | 98 |
| Web vitest | 45 |
| Playwright E2E | 54 |
| **总计** | **436** |

所有测试通过，0 编译错误，0 lint 错误。

---

## 下载

| 平台 | 文件 | 架构 |
|------|------|------|
| macOS (Apple Silicon) | `.dmg` | aarch64 |
| macOS (Intel) | `.dmg` | x86_64 |
| Windows | `.msi` | x86_64 |
| Linux | `.AppImage` | x86_64 |

---

## 技术栈

- **桌面框架**: Tauri 2.x (Rust)
- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + Zustand
- **后端**: Express.js 4 + TypeScript + WebSocket (ws)
- **数据库**: SQLite (better-sqlite3)
- **缓存**: LRU 内存缓存 (lru-cache)
- **AI**: OpenAI / Anthropic / Google / DeepSeek / xAI / Groq
- **图表**: Recharts + Lightweight Charts
- **打包**: bun compile (server) + Tauri Bundler (desktop)

---

## 从 0.1.0 升级

v0.2.0 是全新桌面应用版本，无需从 0.1.0 升级。直接下载安装包即可使用。

首次启动时选择本地数据存储文件夹，所有数据（SQLite 数据库、配置文件、缓存）均存储在该文件夹中。

---

## 开源许可

MIT License — 完全开源，社区驱动迭代。
