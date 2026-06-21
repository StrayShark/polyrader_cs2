# PolyRader CS2 — 开发路线图

## 开发原则

- **渐进交付**：每个 Phase 产出可运行、可验证的功能增量
- **Domain 优先**：核心引擎先于 UI，纯 TypeScript 可独立测试
- **垂直切片**：每个 Phase 贯穿 Presentation → Application → Domain → Infrastructure 四层
- **开源优先**：所有代码公开，无需注册/登录，本地可运行

---

## Phase 0：项目脚手架与基础设施（Week 1-2）

### 目标
搭建 Monorepo 骨架，建立开发工作流，确保 CI/CD 就绪。

### 任务清单

| # | 任务 | 包 | 优先级 |
|---|------|-----|--------|
| 0.1 | 初始化 Turborepo + npm workspaces 结构 | root | P0 |
| 0.2 | 配置 TypeScript 5.x（tsconfig base + 各包继承） | all | P0 |
| 0.3 | 配置 ESLint + Prettier（共享 config） | root | P0 |
| 0.4 | 搭建 `packages/core` 空包（纯 TS，零依赖） | core | P0 |
| 0.5 | 搭建 `packages/infra` 空包（数据库/缓存/客户端） | infra | P0 |
| 0.6 | 搭建 `packages/server` 空包（Express + WS） | server | P0 |
| 0.7 | 搭建 `packages/web` 空包（React + Vite + Tailwind） | web | P0 |
| 0.8 | 配置 Docker Compose（PostgreSQL 16 + Redis 7） | root | P0 |
| 0.9 | 配置 GitHub Actions CI（lint + typecheck + test） | root | P1 |
| 0.10 | 编写 `.env.example` 与环境变量校验 | root | P0 |

### 交付物
- `npm run dev` 可启动全部服务（空应用）
- `npm run lint` / `npm run typecheck` 通过
- Docker Compose 一键启动 DB + Redis

---

## Phase 1：Domain 层核心引擎（Week 2-3）

### 目标
实现所有领域分析引擎，纯 TypeScript，可独立单元测试。

### 任务清单

| # | 任务 | 文件 | 优先级 |
|---|------|------|--------|
| 1.1 | 定义共享类型（Market, Match, Team, Player, Whale 等） | `core/src/types/` | P0 |
| 1.2 | 实现 PredictionEngine（5 维加权融合模型） | `core/src/engines/prediction-engine.ts` | P0 |
| 1.3 | 实现 WhaleScoringEngine（4 维可疑度评分） | `core/src/engines/whale-scoring-engine.ts` | P1 |
| 1.4 | 实现 MatchAnalysisEngine（地图池 BO3 模拟） | `core/src/engines/match-analysis-engine.ts` | P0 |
| 1.5 | 实现 SignalComparisonEngine（多源偏差计算） | `core/src/engines/signal-comparison-engine.ts` | P1 |
| 1.6 | 实现 DailyDashboardEngine（关注度评分算法） | `core/src/engines/daily-dashboard-engine.ts` | P1 |
| 1.7 | 实现 PromptEngine（模板渲染 + 数据注入） | `core/src/engines/prompt-engine.ts` | P0 |
| 1.8 | 实现 ResultAggregator（投票 + 加权 + 共识度） | `core/src/engines/result-aggregator.ts` | P0 |
| 1.9 | 实现 StatsEngine + BettingStatsEngine | `core/src/engines/stats-engine.ts` | P1 |
| 1.10 | 实现 SimulatedBettingEngine | `core/src/engines/simulated-betting-engine.ts` | P1 |
| 1.11 | 实现 KeyManager（AES-256-GCM 加解密） | `core/src/engines/key-manager.ts` | P1 |
| 1.12 | 实现 ConnectivityTester + QuotaMonitor | `core/src/engines/` | P1 |
| 1.13 | 编写提示词模板 YAML（System/Context/Data/Output） | `core/src/prompts/` | P0 |
| 1.14 | 编写权重配置（5 因子权重 + 关注度权重） | `core/src/scoring/weights.ts` | P0 |
| 1.15 | 编写所有 Engine 单元测试（覆盖率 > 80%） | `core/src/__tests__/` | P0 |

### 交付物
- 所有 Engine 可独立运行（输入 mock 数据，输出预期结果）
- `npm run test --workspace=packages/core` 全部通过

---

## Phase 2：Infrastructure 层（Week 3-4）

### 目标
实现所有外部 API 客户端、数据库迁移、缓存策略。

### 任务清单

| # | 任务 | 文件 | 优先级 |
|---|------|------|--------|
| 2.1 | 实现 PostgreSQL 连接池 + 迁移脚本 | `infra/src/database/` | P0 |
| 2.2 | 实现 Redis 连接 + 缓存策略 + Pub/Sub | `infra/src/cache/` | P0 |
| 2.3 | 实现 PolymarketGammaClient | `infra/src/clients/polymarket/gamma-client.ts` | P0 |
| 2.4 | 实现 PolymarketClobClient（公开端点） | `infra/src/clients/polymarket/clob-client.ts` | P0 |
| 2.5 | 实现 PolymarketWsClient（Market Channel） | `infra/src/clients/polymarket/ws-client.ts` | P0 |
| 2.6 | 实现 PolygonClient（链上事件查询） | `infra/src/clients/polygon-client.ts` | P1 |
| 2.7 | 实现 LLMClientFactory + 各 Provider 客户端 | `infra/src/clients/llm/` | P0 |
| 2.8 | 实现 HLTV 爬虫（Ranking/Team/Match/Map） | `infra/src/crawlers/` | P0 |
| 2.9 | 实现反爬策略（User-Agent/Proxy/限速） | `infra/src/crawlers/anti-detect.ts` | P1 |
| 2.10 | 实现 Repository 层（Market/Whale/Match/LLM/Stats） | `infra/src/database/repositories/` | P0 |
| 2.11 | 实现 FACEIT + Pandascore 备用客户端 | `infra/src/clients/` | P2 |
| 2.12 | 编写集成测试（Mock 外部 API 响应） | `infra/src/__tests__/` | P1 |

### 交付物
- 所有 Client 可成功调用外部 API（需配置 API Key）
- 数据库迁移脚本可执行，表结构创建成功
- Redis 缓存读写正常

---

## Phase 3：Application 层 — API 服务（Week 4-5）

### 目标
实现所有 REST API 端点和 WebSocket 服务。

### 任务清单

| # | 任务 | 文件 | 优先级 |
|---|------|------|--------|
| 3.1 | 搭建 Express 应用骨架（中间件/路由注册） | `server/src/` | P0 |
| 3.2 | 实现 MarketController + MarketService | `server/src/controllers/market-controller.ts` | P0 |
| 3.3 | 实现 DailyController + DailyService | `server/src/controllers/daily-controller.ts` | P1 |
| 3.4 | 实现 WhaleController + WhaleService | `server/src/controllers/whale-controller.ts` | P1 |
| 3.5 | 实现 EsportsController + EsportsService | `server/src/controllers/esports-controller.ts` | P0 |
| 3.6 | 实现 SignalController + SignalService | `server/src/controllers/signal-controller.ts` | P1 |
| 3.7 | 实现 AiConfigController + AiConfigService | `server/src/controllers/ai-config-controller.ts` | P0 |
| 3.8 | 实现 AiStatsController + AiStatsService | `server/src/controllers/ai-stats-controller.ts` | P0 |
| 3.9 | 实现 WebSocket Server（连接管理/房间/心跳） | `server/src/websocket/` | P0 |
| 3.10 | 实现 Polymarket WS → Redis Pub/Sub → 前端推送 | `server/src/websocket/` | P0 |
| 3.11 | 实现定时任务（HLTV 爬虫调度/预测信号计算） | `server/src/cron/` | P1 |
| 3.12 | 实现错误处理/请求日志/速率限制中间件 | `server/src/middleware/` | P0 |
| 3.13 | 编写 API 集成测试 | `server/src/__tests__/` | P1 |

### API 端点清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/markets` | CS2 活跃市场列表 |
| GET | `/api/markets/:conditionId` | 市场详情 |
| GET | `/api/markets/:conditionId/prices` | 历史价格 |
| GET | `/api/daily` | 每日看板数据 |
| POST | `/api/daily/refresh` | 刷新每日分析 |
| GET | `/api/whales` | 巨鲸排行榜 |
| GET | `/api/whales/:address` | 巨鲸详情 |
| GET | `/api/alerts` | 异常告警列表 |
| GET | `/api/esports/events` | 赛事列表 |
| GET | `/api/esports/teams/:teamId` | 战队数据 |
| GET | `/api/signals/:marketId` | 预测信号 |
| POST | `/api/ai/analyze` | 触发 LLM 分析 |
| GET | `/api/ai/analysis/:analysisId` | 获取分析结果 |
| GET | `/api/ai/config/keys` | Key 状态列表 |
| PUT | `/api/ai/config/keys/:providerId` | 设置 API Key |
| POST | `/api/ai/config/test/:providerId` | 连通性测试 |
| GET | `/api/ai/config/usage` | 配额用量汇总 |
| GET | `/api/ai/stats/leaderboard` | LLM 排行榜 |
| GET | `/api/ai/stats/user` | 用户统计 |
| GET | `/api/ai/stats/history` | 投注历史 |
| GET | `/api/ai/stats/calibration/:providerId` | 置信度校准 |

### 交付物
- 所有 API 端点可响应（部分可返回 mock 数据）
- WebSocket 连接可建立，实时推送正常
- `npm run dev` 启动完整后端服务

---

## Phase 4：Presentation 层 — 前端基础（Week 5-6）

### 目标
搭建前端骨架，实现主题系统、布局、路由、基础组件。

### 任务清单

| # | 任务 | 文件 | 优先级 |
|---|------|------|--------|
| 4.1 | 初始化 Vite + React 18 + TypeScript 项目 | `web/` | P0 |
| 4.2 | 配置 Tailwind CSS 3 + shadcn/ui | `web/` | P0 |
| 4.3 | 实现三主题 CSS 变量系统（Dark/Light/Matrix） | `web/src/styles/themes.css` | P0 |
| 4.4 | 实现 ThemeStore（Zustand）+ useTheme Hook | `web/src/stores/theme-store.ts` | P0 |
| 4.5 | 实现 shadcn/ui 基础组件（Button/Card/Table/Badge/Input/Tabs/Dialog/Tooltip/Dropdown/Scrollbar/Skeleton/Progress） | `web/src/components/ui/` | P0 |
| 4.6 | 实现 AppLayout（Sidebar + Content + StatusBar） | `web/src/layouts/app-layout.tsx` | P0 |
| 4.7 | 实现 Sidebar 导航（8 路由 + 分组 + 主题切换） | `web/src/layouts/sidebar.tsx` | P0 |
| 4.8 | 实现 StatusBar（连接状态/更新时间/延迟） | `web/src/layouts/status-bar.tsx` | P0 |
| 4.9 | 实现 createHashRouter + 8 路由配置 | `web/src/router/index.tsx` | P0 |
| 4.10 | 实现通用业务组件（DataTable/StatCard/PriceTag/SignalBadge/AlertItem/FactorCard/ScoreRing） | `web/src/components/` | P0 |
| 4.11 | 实现 useWebSocket Hook（连接/重连/心跳） | `web/src/hooks/use-websocket.ts` | P0 |
| 4.12 | 实现 API 请求封装（fetch wrapper + 错误处理） | `web/src/utils/api.ts` | P0 |

### 交付物
- 前端骨架可运行，三主题可切换
- 8 个路由页面均为占位状态
- Sidebar 导航 + StatusBar 正常工作

---

## Phase 5：页面实现 — 市场与数据（Week 6-8）

### 目标
实现市场总览、每日看板、比赛分析三个核心页面。

### 任务清单

| # | 任务 | 页面 | 优先级 |
|---|------|------|--------|
| 5.1 | 实现 DashboardPage（统计卡片 + Ticker + 筛选 + 表格） | `/` | P0 |
| 5.2 | 实现 MarketTable 组件（排序/筛选/分页） | `/` | P0 |
| 5.3 | 实现 TickerBar 组件（实时价格滚动） | `/` | P1 |
| 5.4 | 实现 DailyPage（概览卡片 + TOP 3 推荐 + 全部列表） | `/daily` | P0 |
| 5.5 | 实现 MatchDetailPage（比赛信息头 + 胜率对比条） | `/match/:slug` | P0 |
| 5.6 | 实现 WinRateBar 组件（双队对比条） | `/match/:slug` | P0 |
| 5.7 | 实现 FactorRing 组件（5 因子环形图） | `/match/:slug` | P0 |
| 5.8 | 实现 LLMConsensusGauge 组件（仪表盘） | `/match/:slug` | P0 |
| 5.9 | 实现 PriceChart 组件（Lightweight Charts K 线） | `/match/:slug` | P0 |
| 5.10 | 实现 OrderBook 组件（买卖盘深度） | `/match/:slug` | P1 |
| 5.11 | 实现 UserDecision 组件（确认/调整/跳过） | `/match/:slug` | P0 |
| 5.12 | 实现 MarketStore（Zustand 市场状态管理） | `web/src/stores/market-store.ts` | P0 |

### 交付物
- 市场总览页可展示真实数据
- 每日看板可展示当日比赛推荐
- 比赛分析页可展示完整预测分析

---

## Phase 6：页面实现 — 分析与追踪（Week 8-9）

### 目标
实现巨鲸追踪、赛事分析、信号对比页面。

### 任务清单

| # | 任务 | 页面 | 优先级 |
|---|------|------|--------|
| 6.1 | 实现 WhalesPage（排行榜 + 告警流 + 评分面板） | `/whales` | P1 |
| 6.2 | 实现 WhaleTable 组件（地址/交易量/可疑度/盈亏） | `/whales` | P1 |
| 6.3 | 实现 AlertList 组件（实时告警时间线） | `/whales` | P1 |
| 6.4 | 实现 ScoreRing 组件（可疑度环形图） | `/whales` | P1 |
| 6.5 | 实现 EsportsPage（战队对比 + 地图池 + 排名表） | `/esports` | P0 |
| 6.6 | 实现 TeamCompare 组件（双方数据对比） | `/esports` | P0 |
| 6.7 | 实现 MapPoolBar 组件（地图胜率柱状图） | `/esports` | P0 |
| 6.8 | 实现 RankingTable 组件（HLTV 排名） | `/esports` | P1 |
| 6.9 | 实现 SignalsPage（信号对比表 + 偏差分析） | `/signals` | P1 |
| 6.10 | 实现 SignalTable 组件（多源对比） | `/signals` | P1 |
| 6.11 | 实现 DeviationChart 组件（偏差分布） | `/signals` | P1 |
| 6.12 | 实现 WhaleStore + EsportsStore | `web/src/stores/` | P1 |

### 交付物
- 巨鲸追踪页可展示地址排行和告警
- 赛事分析页可展示战队数据和地图对比
- 信号对比页可展示多源信号偏差

---

## Phase 7：页面实现 — AI 模块（Week 9-10）

### 目标
实现 AI 配置和 AI 胜率统计页面。

### 任务清单

| # | 任务 | 页面 | 优先级 |
|---|------|------|--------|
| 7.1 | 实现 AiConfigPage（Key 管理 + 连通性测试 + 配额） | `/ai/config` | P0 |
| 7.2 | 实现 KeyTable 组件（Provider/状态/掩码Key/操作） | `/ai/config` | P0 |
| 7.3 | 实现 ConnectivityLog 组件（测试结果列表） | `/ai/config` | P1 |
| 7.4 | 实现 QuotaCard 组件（用量/费用/速率限制） | `/ai/config` | P0 |
| 7.5 | 实现 AiStatsPage（排行榜 + 用户统计 + 校准 + 历史） | `/ai/stats` | P0 |
| 7.6 | 实现 LeaderboardTable 组件（LLM 排行） | `/ai/stats` | P0 |
| 7.7 | 实现 PerformancePanel 组件（用户表现） | `/ai/stats` | P0 |
| 7.8 | 实现 CalibrationChart 组件（置信度校准曲线） | `/ai/stats` | P0 |
| 7.9 | 实现 HistoryTable 组件（投注历史记录） | `/ai/stats` | P1 |
| 7.10 | 实现 EquityCurve 组件（盈亏曲线） | `/ai/stats` | P1 |
| 7.11 | 实现 LLMStore（Zustand LLM 状态管理） | `web/src/stores/llm-store.ts` | P0 |

### 交付物
- AI 配置页可管理 API Key、测试连通性、查看配额
- AI 胜率统计页可查看 LLM 排行榜、用户表现、校准曲线

---

## Phase 8：多 LLM 并行分析（Week 10-11）

### 目标
实现完整的多 LLM 并行调用、结果聚合、资金分配分析。

### 任务清单

| # | 任务 | 优先级 |
|---|------|--------|
| 8.1 | 实现 LLMRegistry（Provider 注册/启用管理） | P0 |
| 8.2 | 实现 ParallelInvoker（并行调用/超时/重试/降级） | P0 |
| 8.3 | 实现 PromptEngine 完整渲染管线（4 层模板） | P0 |
| 8.4 | 实现 ResultAggregator 完整聚合（投票/加权/共识） | P0 |
| 8.5 | 实现 Kelly Criterion 资金分配算法 | P1 |
| 8.6 | 实现蒙特卡洛回撤模拟 | P2 |
| 8.7 | 实现 LLM 分析结果前端展示（各 LLM 卡片 + 共识面板） | P0 |
| 8.8 | 实现用户决策 → 下单流程（确认/调整/跳过） | P0 |
| 8.9 | 实现赛后自动结算（更新 LLM 统计 + 用户统计） | P1 |
| 8.10 | 实现 A/B 测试框架（提示词版本对比） | P2 |

### 交付物
- 用户可选择比赛 → 触发多 LLM 并行分析 → 查看聚合结果 → 确认下单
- 赛后自动结算，更新胜率统计

---

## Phase 9：实时数据与优化（Week 11-12）

### 目标
完善实时数据流、性能优化、错误处理。

### 任务清单

| # | 任务 | 优先级 |
|---|------|--------|
| 9.1 | 完善 WebSocket 实时推送（价格/成交/告警） | P0 |
| 9.2 | 实现价格变动闪烁动画 | P1 |
| 9.3 | 实现大单成交通知推送 | P1 |
| 9.4 | 实现连接断开自动重连 + 状态指示 | P0 |
| 9.5 | 前端性能优化（虚拟滚动/懒加载/代码分割） | P1 |
| 9.6 | 后端性能优化（数据库索引/查询优化/缓存策略） | P1 |
| 9.7 | 错误边界 + 全局错误处理 | P0 |
| 9.8 | 响应式适配（平板/移动端基础支持） | P2 |
| 9.9 | 可访问性优化（键盘导航/屏幕阅读器/对比度） | P2 |
| 9.10 | 减弱动效支持（prefers-reduced-motion） | P2 |

### 交付物
- 实时数据推送流畅，断线自动重连
- 核心页面性能指标达标（LCP < 2s, FID < 100ms）

---

## Phase 10：部署与文档（Week 12-13）

### 目标
完善部署方案、编写用户文档、发布首个版本。

### 任务清单

| # | 任务 | 优先级 |
|---|------|--------|
| 10.1 | 完善 Docker Compose 一键部署 | P0 |
| 10.2 | 编写 README.md（项目介绍/快速开始/配置说明） | P0 |
| 10.3 | 编写 CONTRIBUTING.md（贡献指南） | P1 |
| 10.4 | 编写 API 文档（OpenAPI/Swagger） | P1 |
| 10.5 | 配置 VPS 自托管部署方案（Nginx + PM2） | P1 |
| 10.6 | 配置 GitHub Actions CD（自动构建 Docker 镜像） | P2 |
| 10.7 | 编写 CHANGELOG.md | P1 |
| 10.8 | 发布 v0.1.0 首个版本 | P0 |

### 交付物
- Docker Compose 一键启动全部服务
- README 完整，新用户可按文档自行部署
- v0.1.0 版本发布

---

## 优先级说明

| 级别 | 含义 |
|------|------|
| **P0** | 核心功能，必须完成才能进入下一 Phase |
| **P1** | 重要功能，当前 Phase 内完成 |
| **P2** | 增强功能，可延后到后续版本 |

---

## 依赖关系

```
Phase 0 (脚手架)
  └── Phase 1 (Domain 引擎)
        └── Phase 2 (Infrastructure)
              └── Phase 3 (API 服务)
                    └── Phase 4 (前端基础)
                          ├── Phase 5 (市场与数据页面)
                          ├── Phase 6 (分析与追踪页面)
                          └── Phase 7 (AI 模块页面)
                                └── Phase 8 (多 LLM 并行分析)
                                      └── Phase 9 (实时数据与优化)
                                            └── Phase 10 (部署与文档)
                                                  └── Phase 11 (Tauri 桌面应用迁移)
```

Phase 5/6/7 可部分并行开发（不同开发者负责不同页面）。

---

## Phase 11：Tauri 桌面应用迁移

### 目标
将 PolyRader CS2 从 Web 应用迁移为 Tauri 桌面应用，移除云部署依赖，实现本地化运行。

### 背景
当前项目定位为 Web 应用，依赖 PostgreSQL + Redis + Docker Compose 部署。迁移到 Tauri 桌面应用需要：
- Express 后端作为 Tauri sidecar 进程运行
- PostgreSQL → SQLite 本地数据库
- Redis → LRU 内存缓存
- 移除 Docker 部署，改为 Tauri 打包分发
- LLM API Key 从环境变量改为本地加密存储

### 任务清单

| # | 任务 | 包 | 优先级 |
|---|------|-----|--------|
| 11.1 | 创建 `src-tauri/` 项目（`cargo init` + Tauri CLI） | root | P0 |
| 11.2 | 配置 `tauri.conf.json`（窗口、Sidecar、CSP、Updater） | src-tauri | P0 |
| 11.3 | 实现 Rust 端 Sidecar 进程管理（启动/停止/端口分配） | src-tauri | P0 |
| 11.4 | 实现 Tauri IPC 桥接（获取 sidecar 端口、数据文件夹路径） | src-tauri + web | P0 |
| 11.5 | 实现首次启动文件夹选择器（Tauri dialog API） | src-tauri | P0 |
| 11.6 | 实现 config.json 读写（Rust 端管理配置） | src-tauri | P0 |
| 11.7 | 替换 PostgreSQL → SQLite（DDL 迁移 + Repository 适配） | infra | P0 |
| 11.8 | 替换 Redis → LRU 内存缓存（lru-cache） | infra | P0 |
| 11.9 | 替换 Redis Pub/Sub → Node.js EventEmitter | server | P0 |
| 11.10 | 修改 KeyManager：从 process.env → config.json 读取密钥 | server | P0 |
| 11.11 | 修改 API 基础 URL：相对路径 → `http://localhost:{port}/api/` | web | P0 |
| 11.12 | 修改 WebSocket URL：相对路径 → `ws://localhost:{port}` | web | P0 |
| 11.13 | 简化 CORS 中间件（仅允许 localhost） | server | P1 |
| 11.14 | 移除 helmet 中间件 | server | P1 |
| 11.15 | 移除速率限制中间件 | server | P1 |
| 11.16 | 实现系统托盘（最小化到托盘、托盘菜单） | src-tauri | P1 |
| 11.17 | 实现 Tauri Updater（自动检测新版本） | src-tauri | P1 |
| 11.18 | 实现原生通知（异常告警推送） | src-tauri | P1 |
| 11.19 | 移除 Docker Compose / Dockerfile | root | P1 |
| 11.20 | 移除 .env 依赖，清理环境变量引用 | all | P1 |
| 11.21 | 配置 Tauri 打包（.dmg / .msi / .AppImage） | src-tauri | P0 |
| 11.22 | 编写 Tauri 开发/构建文档 | root | P1 |
| 11.23 | 端到端测试（安装 → 首次启动 → 配置 → 使用） | all | P0 |

### 交付物
- `npm run tauri dev` 可启动 Tauri 开发环境
- `npm run tauri build` 可生成平台安装包
- 首次启动弹出文件夹选择器，数据存储在用户指定位置
- LLM API Key 通过 UI 配置，本地加密存储
- 系统托盘 + 原生通知可用
- 所有现有功能在桌面应用中正常运行

---

## 技术栈速查

| 层 | 技术 | 用途 |
|----|------|------|
| Presentation | React 18 + TypeScript + Vite | SPA 前端 |
| Presentation | Tailwind CSS 3 + shadcn/ui | 样式与组件 |
| Presentation | Zustand | 状态管理 |
| Presentation | React Router v6 (Hash) | 路由 |
| Presentation | Recharts + Lightweight Charts | 图表 |
| Application | Express.js 4 + TypeScript | REST API |
| Application | ws | WebSocket |
| Domain | Pure TypeScript | 分析引擎 |
| Infrastructure | SQLite (better-sqlite3) | 持久化 |
| Infrastructure | LRU Cache (lru-cache) | 内存缓存 |
| Infrastructure | Cheerio + node-cron | 爬虫 |
| Infrastructure | ethers.js v6 | 链上交互 |
| DevOps | Turborepo | Monorepo |
| DevOps | Tauri Bundler | 桌面应用打包 |
