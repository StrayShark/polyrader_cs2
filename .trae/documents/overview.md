# PolyRader CS2 — 项目总览 (Overview)

## 1. 架构分层总览

PolyRader CS2 采用 **Tauri 桌面应用架构**，React 前端运行在 Tauri WebView 中，Express 后端作为 Tauri sidecar 进程运行。

```
┌──────────────────────────────────────────────────────────────────┐
│                     Tauri Desktop Shell                          │
│               Rust Core (窗口管理 / IPC / Sidecar)                │
├──────────────────────────────────────────────────────────────────┤
│                     Presentation Layer                           │
│                     前端展示层 (web/)                              │
│  React 18 + TypeScript + Vite + Tailwind CSS + Zustand          │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ Layouts  │  Pages   │Features  │Components│  Router  │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
├──────────────────────────────────────────────────────────────────┤
│                     Application Layer                            │
│                     应用服务层 (server/)                          │
│  Express.js 4 + TypeScript + WebSocket (ws)                     │
│  Tauri Sidecar 进程，监听 localhost 随机端口                       │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │Controllers│Services │Middleware│WebSocket │  Routes  │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
├──────────────────────────────────────────────────────────────────┤
│                       Domain Layer                               │
│                     领域逻辑层 (core/)                            │
│  Pure TypeScript — 无框架依赖，可独立测试                         │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ Engines  │  Models  │ Prompts  │ Scoring  │  Types   │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
├──────────────────────────────────────────────────────────────────┤
│                    Infrastructure Layer                          │
│                     基础设施层 (infra/)                           │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ Database │  Cache   │ Clients  │ Crawlers │  Config  │      │
│  │ SQLite   │ LRU Cache│Polymarket│  HLTV    │config.json│     │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
├──────────────────────────────────────────────────────────────────┤
│                   External Services                              │
│                     外部服务层                                    │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │Polymarket│  HLTV    │ OpenAI   │Anthropic │  Google  │      │
│  │CLOB+Gamma│ (Scraper)│  GPT-4o  │ Claude   │ Gemini   │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

### 层级依赖规则

```
Tauri Shell ──▶ Presentation ──▶ Application ──▶ Domain ──▶ Infrastructure ──▶ External
     │                │              │              │              │
     │                │              │              │              │
     └── 不可越级 ────┴──────────────┴──────────────┴──────────────┘
     
     上层可依赖下层，下层不可依赖上层
     Domain 层零框架依赖，纯 TypeScript
     Infrastructure 层是唯一与外部通信的层
     Tauri Shell 通过 IPC 与 Presentation 层通信，通过 Sidecar 管理 Application 层
```

---

## 2. 各层核心模块

### 2.1 Presentation Layer — 前端展示层 (`packages/web`)

| 模块 | 路径 | 职责 |
|------|------|------|
| **Layouts** | `src/layouts/` | AppLayout（Sidebar + Content + StatusBar 三栏布局）、AuthLayout |
| **Pages** | `src/pages/` | 8 个页面组件，每个对应一条路由 |
| **Features** | `src/features/` | 按业务领域拆分的功能模块（markets/whales/esports/signals/ai） |
| **Components** | `src/components/` | 通用 UI 组件（DataTable/StatBox/Panel/Chart/Ticker/Badge） |
| **Router** | `src/router/` | React Router v6 hash-based 路由配置 |
| **Stores** | `src/stores/` | Zustand 全局状态（market/whale/llm/theme） |
| **Hooks** | `src/hooks/` | 自定义 Hooks（useMarket/useWhale/useLLM/useWebSocket） |
| **Types** | `src/types/` | 前端专用类型定义 |

**Features 子模块**：

| Feature | 包含的 Pages | 包含的 Components |
|---------|-------------|-------------------|
| `features/markets/` | DashboardPage, DailyPage, MarketDetailPage | MarketTable, TickerBar, FactorCard, OrderBook |
| `features/whales/` | WhalesPage, WhaleDetailPage | WhaleTable, AlertList, ScoreRing, AddressGraph |
| `features/esports/` | EsportsPage, MatchDetailPage | TeamCompare, MapPoolBar, RankingTable |
| `features/signals/` | SignalsPage | SignalRow, DeviationChart, ArbitrageCard |
| `features/ai/` | AiConfigPage, AiStatsPage | KeyTable, QuotaCard, CalibrationChart, LeaderboardTable, PerformancePanel, HistoryTable |

### 2.2 Application Layer — 应用服务层 (`packages/server`)

| 模块 | 路径 | 职责 |
|------|------|------|
| **Controllers** | `src/controllers/` | 请求处理、参数校验、响应格式化 |
| **Services** | `src/services/` | 业务编排，调用 Domain 层引擎 + Infra 层客户端 |
| **Middleware** | `src/middleware/` | 错误处理、请求日志、CORS、速率限制 |
| **WebSocket** | `src/websocket/` | WS 连接管理、房间广播、心跳检测 |
| **Routes** | `src/routes/` | REST API 路由注册 |

**Controllers 清单**：

| Controller | 路由前缀 | 职责 |
|-----------|---------|------|
| `MarketController` | `/api/markets` | 市场列表、详情、价格历史 |
| `DailyController` | `/api/daily` | 每日看板数据、刷新触发 |
| `WhaleController` | `/api/whales` | 巨鲸列表、详情、告警 |
| `EsportsController` | `/api/esports` | 赛事列表、战队数据、排名 |
| `SignalController` | `/api/signals` | 信号对比、偏差分析 |
| `AiConfigController` | `/api/ai/config` | Key管理、连通性测试、配额 |
| `AiStatsController` | `/api/ai/stats` | LLM统计、投注统计、校准 |

**Services 清单**：

| Service | 依赖的 Domain 引擎 | 依赖的 Infra 客户端 |
|---------|-------------------|-------------------|
| `MarketService` | `PredictionEngine` | `PolymarketClient`, `RedisCache` |
| `DailyService` | `DailyDashboardEngine`, `PredictionEngine` | `HLTVCrawler`, `LLMClient` |
| `WhaleService` | `WhaleScoringEngine` | `PolygonClient`, `PolymarketClient` |
| `EsportsService` | `MatchAnalysisEngine` | `HLTVCrawler` |
| `SignalService` | `SignalComparisonEngine` | `PolymarketClient` |
| `AiConfigService` | `KeyManager`, `ConnectivityTester`, `QuotaMonitor` | `LLMClient` |
| `AiStatsService` | `StatsEngine`, `BettingStatsEngine`, `SimulatedBettingEngine` | `Database` |

### 2.3 Domain Layer — 领域逻辑层 (`packages/core`)

**零框架依赖，纯 TypeScript，可独立单元测试。**

| 模块 | 路径 | 职责 |
|------|------|------|
| **Engines** | `src/engines/` | 核心分析引擎 |
| **Models** | `src/models/` | 领域实体与值对象 |
| **Prompts** | `src/prompts/` | LLM 提示词模板（YAML） |
| **Scoring** | `src/scoring/` | 评分算法与权重配置 |
| **Types** | `src/types/` | 跨层共享类型定义 |

**Engines 清单**：

| Engine | 核心算法 | 输入 | 输出 |
|--------|---------|------|------|
| `PredictionEngine` | 5 维加权融合 | Team A/B 数据 | 胜率预测 + 因子分解 |
| `WhaleScoringEngine` | 4 维可疑度评分 | 地址交易数据 | 可疑度分数 + 标签 |
| `DailyDashboardEngine` | 关注度评分算法 | 当日比赛列表 | TOP N 推荐 |
| `MatchAnalysisEngine` | 地图池 BO3 模拟 | 两队地图胜率 | 系列赛胜率 |
| `SignalComparisonEngine` | 多源偏差计算 | 市场价 + 模型预测 | 偏差信号 |
| `PromptEngine` | 模板渲染 + 数据注入 | 比赛数据 + 模板 | 完整 Prompt |
| `ResultAggregator` | 投票 + 加权 + 共识度 | 多个 LLM 结果 | 聚合预测 |
| `StatsEngine` | 准确率/ROI/夏普/回撤 | 预测历史 | 统计指标 |
| `BettingStatsEngine` | 投注盈亏结算 | 模拟投注记录 | 盈亏统计 |
| `SimulatedBettingEngine` | 自动生成模拟投注 | LLM 预测结果 | 模拟投注记录 |
| `KeyManager` | AES-256-GCM 加解密 | API Key 明文 | 加密 Key + 掩码 |
| `ConnectivityTester` | 最小化 ping 请求 | Provider 配置 | 延迟 + 状态 |
| `QuotaMonitor` | Token 用量统计 | API 调用记录 | 费用估算 |

**Models 清单**：

| Model | 核心字段 |
|-------|---------|
| `Market` | conditionId, slug, question, outcomes, volume, liquidity |
| `Match` | matchId, teamA, teamB, tournament, tier, status, startTime |
| `Team` | teamId, name, hltvRank, recentForm, mapPool |
| `Player` | playerId, name, teamId, rating, adr, kast |
| `Whale` | address, label, volume, pnl, score, patterns |
| `LLMPrediction` | id, matchId, providerId, prediction, confidence, timestamp |
| `SimulatedBet` | id, predictionId, direction, amount, outcome, pnl |
| `LLMStats` | providerId, totalPredictions, accuracy, roi, sharpe, maxDrawdown |
| `UserStats` | totalPredictions, accuracy, totalPnl, sharpe, maxDrawdown |
| `DailyDashboard` | date, matches, topPicks, highDeviation, whaleActivity |

### 2.4 Infrastructure Layer — 基础设施层 (`packages/infra`)

| 模块 | 路径 | 职责 |
|------|------|------|
| **Database** | `src/database/` | PostgreSQL 连接池、迁移脚本、Repository |
| **Cache** | `src/cache/` | Redis 连接、缓存策略、Pub/Sub |
| **Clients** | `src/clients/` | 外部 API 客户端封装 |
| **Crawlers** | `src/crawlers/` | HLTV 爬虫、反爬策略 |
| **Config** | `src/config/` | 环境变量加载、配置校验 |

**Clients 清单**：

| Client | 封装的服务 | 主要方法 |
|--------|----------|---------|
| `PolymarketGammaClient` | Gamma API | `getEvents()`, `getMarkets()`, `getPrices()` |
| `PolymarketClobClient` | CLOB REST API | `getOrderBook()`, `getPrices()`, `getTrades()` |
| `PolymarketWsClient` | CLOB WebSocket | `subscribe()`, `onMessage()`, `reconnect()` |
| `PolygonClient` | Polygon RPC | `getEvents()`, `getTransactions()`, `getBalance()` |
| `LLMClient` | OpenAI / Anthropic / Google / DeepSeek | `chat()`, `ping()`, `getUsage()` |
| `FaceitClient` | FACEIT API v4 | `getPlayerStats()`, `getMatchHistory()` |
| `PandascoreClient` | Pandascore API | `getMatches()`, `getTeams()`, `getPlayers()` |

**Crawlers 清单**：

| Crawler | 目标站点 | 爬取内容 | 频率 |
|---------|---------|---------|------|
| `HLTVRankingCrawler` | hltv.org/ranking | 战队排名、积分 | 每 6h |
| `HLTVTeamCrawler` | hltv.org/team/:id | 近期战绩、地图胜率 | 每 1h |
| `HLTVMatchCrawler` | hltv.org/results | 历史交锋记录 | 按需 |
| `HLTVMapCrawler` | hltv.org/stats/teams/maps | 地图池统计 | 每 6h |

---

## 3. 目录结构

```
polyrader-cs2/
│
├── packages/
│   │
│   ├── web/                          # ── Presentation Layer ──
│   │   ├── src/
│   │   │   ├── components/           # 通用 UI 组件
│   │   │   │   ├── ui/               #   shadcn/ui 基础组件
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   ├── card.tsx
│   │   │   │   │   ├── table.tsx
│   │   │   │   │   ├── badge.tsx
│   │   │   │   │   ├── input.tsx
│   │   │   │   │   ├── tabs.tsx
│   │   │   │   │   ├── dialog.tsx
│   │   │   │   │   ├── tooltip.tsx
│   │   │   │   │   ├── dropdown.tsx
│   │   │   │   │   ├── scrollbar.tsx
│   │   │   │   │   ├── skeleton.tsx
│   │   │   │   │   └── progress.tsx
│   │   │   │   ├── data-table.tsx     #   数据表格
│   │   │   │   ├── stat-box.tsx       #   统计卡片
│   │   │   │   ├── panel.tsx          #   面板容器
│   │   │   │   ├── chart-area.tsx     #   图表区域
│   │   │   │   ├── ticker-bar.tsx     #   实时行情条
│   │   │   │   ├── filter-pills.tsx   #   筛选药丸
│   │   │   │   ├── factor-card.tsx    #   因子卡片
│   │   │   │   ├── map-bar.tsx        #   地图胜率条
│   │   │   │   ├── score-ring.tsx     #   评分环形图
│   │   │   │   ├── signal-row.tsx     #   信号行
│   │   │   │   └── alert-item.tsx     #   告警条目
│   │   │   │
│   │   │   ├── features/             # 按业务领域拆分
│   │   │   │   ├── markets/          #   市场模块
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── market-table.tsx
│   │   │   │   │   │   ├── order-book.tsx
│   │   │   │   │   │   ├── price-chart.tsx
│   │   │   │   │   │   └── prediction-panel.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   │
│   │   │   │   ├── whales/           #   巨鲸模块
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── whale-table.tsx
│   │   │   │   │   │   ├── alert-list.tsx
│   │   │   │   │   │   ├── score-panel.tsx
│   │   │   │   │   │   └── address-graph.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   │
│   │   │   │   ├── esports/          #   赛事模块
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── team-compare.tsx
│   │   │   │   │   │   ├── map-pool-panel.tsx
│   │   │   │   │   │   └── ranking-table.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   │
│   │   │   │   ├── signals/          #   信号模块
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── signal-table.tsx
│   │   │   │   │   │   └── deviation-chart.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   │
│   │   │   │   └── ai/                #   AI 模块
│   │   │   │       ├── components/
│   │   │   │       │   ├── key-table.tsx
│   │   │   │       │   ├── quota-card.tsx
│   │   │   │       │   ├── calibration-chart.tsx
│   │   │   │       │   ├── leaderboard-table.tsx
│   │   │   │       │   ├── performance-panel.tsx
│   │   │   │       │   └── history-table.tsx
│   │   │   │       └── index.ts
│   │   │   │
│   │   │   ├── layouts/              # 布局组件
│   │   │   │   ├── app-layout.tsx     #   Sidebar + Content + StatusBar 三栏布局
│   │   │   │   ├── sidebar.tsx
│   │   │   │   └── status-bar.tsx
│   │   │   │
│   │   │   ├── pages/                # 页面组件（路由入口）
│   │   │   │   ├── dashboard-page.tsx
│   │   │   │   ├── daily-page.tsx
│   │   │   │   ├── match-detail-page.tsx
│   │   │   │   ├── whales-page.tsx
│   │   │   │   ├── esports-page.tsx
│   │   │   │   ├── signals-page.tsx
│   │   │   │   ├── ai-config-page.tsx
│   │   │   │   └── ai-stats-page.tsx
│   │   │   │
│   │   │   ├── router/
│   │   │   │   └── index.tsx          #   createHashRouter 配置
│   │   │   │
│   │   │   ├── stores/               # Zustand 全局状态
│   │   │   │   ├── market-store.ts
│   │   │   │   ├── whale-store.ts
│   │   │   │   ├── llm-store.ts
│   │   │   │   └── theme-store.ts
│   │   │   │
│   │   │   ├── hooks/                # 自定义 Hooks
│   │   │   │   ├── use-market.ts
│   │   │   │   ├── use-whale.ts
│   │   │   │   ├── use-llm.ts
│   │   │   │   ├── use-websocket.ts
│   │   │   │   └── use-theme.ts
│   │   │   │
│   │   │   ├── types/                # 前端类型
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   └── utils/                # 工具函数
│   │   │       ├── format.ts
│   │   │       └── cn.ts
│   │   │
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── server/                       # ── Application Layer ──
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   │   ├── market-controller.ts
│   │   │   │   ├── daily-controller.ts
│   │   │   │   ├── whale-controller.ts
│   │   │   │   ├── esports-controller.ts
│   │   │   │   ├── signal-controller.ts
│   │   │   │   ├── ai-config-controller.ts
│   │   │   │   └── ai-stats-controller.ts
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── market-service.ts
│   │   │   │   ├── daily-service.ts
│   │   │   │   ├── whale-service.ts
│   │   │   │   ├── esports-service.ts
│   │   │   │   ├── signal-service.ts
│   │   │   │   ├── ai-config-service.ts
│   │   │   │   └── ai-stats-service.ts
│   │   │   │
│   │   │   ├── middleware/
│   │   │   │   ├── error-handler.ts
│   │   │   │   ├── request-logger.ts
│   │   │   │   └── rate-limiter.ts
│   │   │   │
│   │   │   ├── websocket/
│   │   │   │   ├── ws-server.ts       #   WS 服务端
│   │   │   │   ├── connection-manager.ts
│   │   │   │   └── room-manager.ts
│   │   │   │
│   │   │   └── routes/
│   │   │       └── index.ts           #   路由注册
│   │   │
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── core/                         # ── Domain Layer ──
│   │   ├── src/
│   │   │   ├── engines/
│   │   │   │   ├── prediction-engine.ts
│   │   │   │   ├── whale-scoring-engine.ts
│   │   │   │   ├── daily-dashboard-engine.ts
│   │   │   │   ├── match-analysis-engine.ts
│   │   │   │   ├── signal-comparison-engine.ts
│   │   │   │   ├── prompt-engine.ts
│   │   │   │   ├── result-aggregator.ts
│   │   │   │   ├── stats-engine.ts
│   │   │   │   ├── betting-stats-engine.ts
│   │   │   │   ├── simulated-betting-engine.ts
│   │   │   │   ├── key-manager.ts
│   │   │   │   ├── connectivity-tester.ts
│   │   │   │   └── quota-monitor.ts
│   │   │   │
│   │   │   ├── models/
│   │   │   │   ├── market.ts
│   │   │   │   ├── match.ts
│   │   │   │   ├── team.ts
│   │   │   │   ├── player.ts
│   │   │   │   ├── whale.ts
│   │   │   │   ├── llm-prediction.ts
│   │   │   │   ├── simulated-bet.ts
│   │   │   │   ├── llm-stats.ts
│   │   │   │   ├── user-stats.ts
│   │   │   │   └── daily-dashboard.ts
│   │   │   │
│   │   │   ├── prompts/              # LLM 提示词模板
│   │   │   │   ├── system.yaml        #   角色定义
│   │   │   │   ├── context.yaml       #   上下文模板
│   │   │   │   ├── data-injection.yaml #  数据注入规则
│   │   │   │   └── output-constraint.yaml # 输出约束
│   │   │   │
│   │   │   ├── scoring/              # 评分算法
│   │   │   │   ├── whale-scoring.ts   #   巨鲸可疑度评分
│   │   │   │   ├── attention-scoring.ts # 关注度评分
│   │   │   │   └── weights.ts         #   权重配置
│   │   │   │
│   │   │   └── types/                # 跨层共享类型
│   │   │       ├── api.ts
│   │   │       ├── events.ts
│   │   │       └── index.ts
│   │   │
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── infra/                        # ── Infrastructure Layer ──
│       ├── src/
│       │   ├── database/
│       │   │   ├── connection.ts      #   PostgreSQL 连接池
│       │   │   ├── migrations/        #   数据库迁移
│       │   │   │   ├── 001_create_markets.sql
│       │   │   │   ├── 002_create_matches.sql
│       │   │   │   ├── 003_create_whales.sql
│       │   │   │   ├── 004_create_llm_predictions.sql
│       │   │   │   ├── 005_create_simulated_bets.sql
│       │   │   │   ├── 006_create_llm_stats.sql
│       │   │   │   ├── 007_create_llm_api_keys.sql
│       │   │   │   └── 008_create_usage_records.sql
│       │   │   └── repositories/      #   数据访问层
│       │   │       ├── market-repository.ts
│       │   │       ├── match-repository.ts
│       │   │       ├── whale-repository.ts
│       │   │       ├── llm-repository.ts
│       │   │       └── stats-repository.ts
│       │   │
│       │   ├── cache/
│       │   │   ├── redis.ts           #   Redis 连接
│       │   │   ├── cache-strategy.ts  #   缓存策略
│       │   │   └── pubsub.ts          #   Pub/Sub 消息
│       │   │
│       │   ├── clients/
│       │   │   ├── polymarket/
│       │   │   │   ├── gamma-client.ts
│       │   │   │   ├── clob-client.ts
│       │   │   │   └── ws-client.ts
│       │   │   ├── polygon-client.ts
│       │   │   ├── llm/
│       │   │   │   ├── openai-client.ts
│       │   │   │   ├── anthropic-client.ts
│       │   │   │   ├── google-client.ts
│       │   │   │   ├── deepseek-client.ts
│       │   │   │   └── llm-client-factory.ts
│       │   │   ├── faceit-client.ts
│       │   │   └── pandascore-client.ts
│       │   │
│       │   ├── crawlers/
│       │   │   ├── hltv-ranking-crawler.ts
│       │   │   ├── hltv-team-crawler.ts
│       │   │   ├── hltv-match-crawler.ts
│       │   │   ├── hltv-map-crawler.ts
│       │   │   └── anti-detect.ts     #   反爬策略
│       │   │
│       │   └── config/
│       │       ├── env.ts             #   环境变量加载
│       │       └── constants.ts       #   常量定义
│       │
│       ├── tsconfig.json
│       └── package.json
│
├── docker-compose.yml
├── Dockerfile
├── package.json                       # monorepo root
├── turbo.json                         # Turborepo 配置
├── .env.example
├── .gitignore
└── README.md
```

---

## 4. 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  External Services                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │Polymarket│  │  HLTV    │  │ OpenAI   │  │Anthropic │  ...   │
│  │CLOB+Gamma│  │ (Scraper)│  │ GPT-4o   │  │ Claude   │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │             │             │              │
│       ▼              ▼             ▼             ▼              │
│  ┌────────────────────────────────────────────────────┐        │
│  │              Infrastructure Layer                   │        │
│  │  Clients (API封装) + Crawlers (爬虫)                │        │
│  │         │                                           │        │
│  │         ▼                                           │        │
│  │  ┌──────────┐  ┌──────────┐                        │        │
│  │  │PostgreSQL│  │  Redis   │                        │        │
│  │  └──────────┘  └──────────┘                        │        │
│  └──────────────────────┬─────────────────────────────┘        │
│                         │                                       │
│                         ▼                                       │
│  ┌────────────────────────────────────────────────────┐        │
│  │                Domain Layer                         │        │
│  │  Engines (分析引擎) + Models (领域模型)              │        │
│  │  ┌──────────────┐  ┌──────────────┐                │        │
│  │  │PredictionEng │  │WhaleScoring  │  ...           │        │
│  │  └──────────────┘  └──────────────┘                │        │
│  └──────────────────────┬─────────────────────────────┘        │
│                         │                                       │
│                         ▼                                       │
│  ┌────────────────────────────────────────────────────┐        │
│  │               Application Layer                     │        │
│  │  Controllers → Services → (编排 Domain + Infra)     │        │
│  │         │                                           │        │
│  │         ├── REST API (JSON)                         │        │
│  │         └── WebSocket (实时推送)                     │        │
│  └──────────────────────┬─────────────────────────────┘        │
│                         │                                       │
│                         ▼                                       │
│  ┌────────────────────────────────────────────────────┐        │
│  │               Presentation Layer                    │        │
│  │  Pages → Features → Components                     │        │
│  │  Zustand Stores ← HTTP/WS                          │        │
│  └────────────────────────────────────────────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Monorepo 方案 | Turborepo + npm workspaces | 4 个 package 共享类型，统一构建 |
| Domain 层零依赖 | 纯 TypeScript | 可独立测试，不被框架锁定 |
| 前端状态管理 | Zustand | 比 Redux 轻量，适合中等复杂度应用 |
| 后端框架 | Express.js | 生态成熟，中间件丰富，适合 API 服务 |
| 实时通信 | 原生 ws 库 | 轻量，无需 Socket.IO 的额外抽象 |
| 数据库 | PostgreSQL | 时序数据 + JSON 字段，适合分析场景 |
| 缓存 | Redis | Pub/Sub 消息分发 + 热数据缓存 |
| LLM 调用 | 统一 Client 接口 | 6 个 Provider 通过工厂模式统一调用 |
| 提示词管理 | YAML 文件 | 版本控制友好，非技术人员可维护 |
| 爬虫 | Cheerio + node-cron | 轻量 HTML 解析 + 定时调度 |

---

## 6. 技术栈总览

| 类别 | 技术 | 版本 |
|------|------|------|
| 语言 | TypeScript | 5.x |
| 构建工具 | Vite (web) / tsc (server/core/infra) | 5.x |
| 前端框架 | React | 18.x |
| 样式 | Tailwind CSS | 3.x |
| UI 组件 | shadcn/ui | latest |
| 图表 | Recharts + Lightweight Charts | latest |
| 图可视化 | D3.js | 7.x |
| 状态管理 | Zustand | 4.x |
| 路由 | React Router DOM | 6.x |
| 后端框架 | Express.js | 4.x |
| WebSocket | ws | 8.x |
| 数据库 | PostgreSQL | 16 |
| 缓存 | Redis | 7 |
| 链上交互 | ethers.js | 6.x |
| 爬虫 | Cheerio | 1.x |
| 定时任务 | node-cron | 3.x |
| Monorepo | Turborepo | latest |
| 部署 | Docker Compose | latest |
