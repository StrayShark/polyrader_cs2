# PolyRader CS2 — 设计规范文档

## 1. 设计理念

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| **数据优先** | 界面为数据服务，减少装饰性元素，每个像素都承载信息 |
| **专业克制** | 参考 shadcn/ui 的极简专业风格，避免花哨动效 |
| **即时可读** | 关键指标（价格、偏差、胜率）一眼可见，无需深入交互 |
| **主题自由** | 三套主题覆盖不同使用场景：日间办公、深夜盯盘、极客终端 |

### 1.2 参考产品

| 参考 | 借鉴方向 |
|------|---------|
| **shadcn/ui** | 组件规范、间距体系、圆角系统、语义化颜色 Token、Dark/Light 主题配色 |
| **Codex CLI** | Matrix 主题的终端美学、绿色荧光配色、等宽字体氛围 |
| **PolyTerm** | 终端风格的数据面板、实时数据流展示 |
| **PolyWorld** | 仪表板式市场概览、地址图谱可视化 |

---

## 2. 产品核心模块

### 2.1 模块全景图

```
┌─────────────────────────────────────────────────────────────┐
│  PolyRader CS2                                               │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ 市场总览  │  │ 每日看板  │  │ 比赛分析  │  │ 巨鲸追踪     │  │
│  │ Dashboard│  │ Daily    │  │ Match    │  │ Whales      │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ 赛事分析  │  │ 信号对比  │  │ AI 配置  │  │ AI 胜率统计  │  │
│  │ Esports  │  │ Signals  │  │ AI Config│  │ AI Stats   │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  全局组件：主题切换器 | 通知中心 | 搜索 | 状态栏       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 八大模块定义

#### 模块 1：市场总览 (Dashboard `/`)

**定位**：用户进入后的第一屏，CS2 市场全景快照

**核心组件**：
- **顶部统计卡片行**：活跃市场数、24h 总交易量、今日异常告警数、模型信号数
- **市场列表表格**：可排序、可筛选的 CS2 市场列表（按交易量/价格变动/流动性排序）
- **实时行情 Ticker**：顶部滚动条，显示重点市场的实时价格变动
- **快速筛选栏**：赛事级别（S-Tier/A-Tier）、比赛状态（即将开始/进行中）、时间范围

**数据来源**：Gamma API `/events?tag_id=cs2&active=true`

**交互**：
- 点击市场行 → 跳转比赛分析页
- 表格排序（点击列头）→ 本地重排
- 筛选标签切换 → 重新拉取数据

---

#### 模块 2：每日看板 (Daily `/daily`)

**定位**：每日推荐与高偏差机会一览

**核心组件**：
- **今日推荐**：TOP 3 关注比赛
- **全部比赛列表**：按关注度排序
- **高偏差机会**：模型 vs 市场定价偏差最大的市场
- **快速筛选栏**：赛事级别（S-Tier/A-Tier）、比赛状态（即将开始/进行中）

**数据来源**：Gamma API + 预测模型

**交互**：
- 点击比赛 → 跳转比赛分析页
- 筛选标签切换 → 重新拉取数据

---

#### 模块 3：比赛分析 (Match Detail `/match/:slug`)

**定位**：单场比赛的完整分析面板，整合市场详情、比赛详情与 LLM 分析

**核心组件**：
- **比赛信息头**：两队 Logo、队名、开赛时间、赛事名称、赛制
- **价格走势图**：K 线/折线图，支持 1m/5m/1h/1d 切换
- **订单簿深度图**：买卖盘可视化，实时更新
- **模型预测面板**：5 维预测因子分解，每项显示权重、方向、得分
- **信号偏差指示器**：模型预测 vs 市场定价的偏差仪表盘
- **LLM 分析面板**：多模型并行预测结果
- **选手对位分析**：双方选手 Rating 对比
- **历史交锋时间线**：两队过往交手记录
- **关联市场卡片**：Polymarket 上该比赛的所有市场
- **最近成交流**：实时滚动的成交记录列表
- **巨鲸持仓**：该市场中大户的持仓分布

**数据来源**：CLOB WebSocket（实时）+ CLOB REST（历史）+ HLTV + 预测模型 + Gamma API

**交互**：
- 时间粒度切换 → 图表重绘
- 悬停图表 → Tooltip 显示详细数据
- 预测因子展开 → 查看每项计算细节
- 市场卡片点击 → 跳转对应比赛分析

---

#### 模块 4：巨鲸追踪 (Whales `/whales`)

**定位**：大户行为监控与异常检测总览（含详情面板）

**核心组件**：
- **巨鲸排行榜**：按交易量/可疑度/盈亏排序的地址列表
- **可疑度评分柱状图**：每个地址的 4 维评分分解（时机/金额/频率/关联）
- **实时告警流**：最新异常交易告警的时间线
- **地址关联图谱**：D3.js 力导向图，展示地址间的资金关联
- **地址详情面板**（内嵌）：地址概览、评分分解雷达图、持仓分布饼图、交易历史时间线、关联地址列表、行为模式标签
- **筛选面板**：按市场、时间范围、可疑度阈值筛选

**数据来源**：链上事件 + Data API `/activity/:address`

**交互**：
- 点击地址 → 展开内嵌详情面板
- 图谱节点拖拽/缩放 → 探索关联关系
- 告警点击 → 展开详情面板
- 关联地址点击 → 切换至对应地址详情

---

#### 模块 5：赛事分析 (Esports `/esports`)

**定位**：CS2 赛事与战队数据面板

**核心组件**：
- **赛事列表**：按级别/状态筛选的赛事卡片列表
- **战队排名表**：HLTV 排名、近期战绩、地图胜率
- **战队详情面板**：选手列表、个人数据（Rating/ADR/KAST/Impact）
- **交锋记录表**：两队历史对阵结果
- **地图池分析**：双方各地图胜率对比柱状图

**数据来源**：HLTV 爬虫 + FACEIT API（备用）

**交互**：
- 赛事卡片点击 → 展开关联市场
- 战队点击 → 展开战队详情面板
- 地图对比悬停 → 显示具体胜率数据

---

#### 模块 6：信号对比 (Signals `/signals`)

**定位**：多源信号对比与套利机会扫描

**核心组件**：
- **信号对比表**：所有活跃市场的模型预测 vs 市场定价 vs 社区共识
- **偏差排序**：按偏差幅度排序，高偏差市场高亮
- **套利机会卡片**：跨市场/跨平台套利机会
- **信号历史**：过去信号的准确率统计
- **置信度指示器**：每个信号的置信度评分

**数据来源**：预测模型 + Gamma API + 多平台数据

**交互**：
- 偏差排序切换 → 表格重排
- 套利卡片点击 → 展开详情
- 信号筛选 → 按置信度/偏差幅度过滤

---

#### 模块 7：AI 配置 (AI Config `/ai/config`)

**定位**：LLM API Key 管理、连通性测试与配额监控

**核心组件**：
- **Provider 管理**：6 个 LLM Provider 的 API Key 配置
- **连通性测试**：延迟检测与可用性状态
- **配额监控**：各 Provider 的用量统计与费用概览

**数据来源**：本地配置 + LLM API

**交互**：
- 配置 API Key → 保存至本地
- 测试连通性 → 实时延迟检测
- 查看配额 → 费用统计面板

---

#### 模块 8：AI 胜率统计 (AI Stats `/ai/stats`)

**定位**：LLM 胜率分析与投注统计

**核心组件**：
- **LLM 胜率分析**：按赛事/方向/战队/地图维度的准确率统计
- **校准曲线**：置信度分析
- **趋势图**：30 天走势
- **LLM 排行榜**：ROI/夏普比率/最大回撤
- **用户表现**：总盈亏 vs LLM 基准
- **投注历史**：逐笔明细

**数据来源**：预测模型 + 投注记录

**交互**：
- 维度切换 → 图表重绘
- 排行榜排序 → 按指标排序

---

### 2.3 全局组件

| 组件 | 位置 | 功能 |
|------|------|------|
| **主题切换器** | 右上角 | Dark / Light / Matrix 三主题切换 |
| **通知中心** | 右上角铃铛 | 巨鲸告警、异常检测通知 |
| **全局搜索** | 顶部 Cmd+K | 搜索市场、战队、地址 |
| **侧边栏导航** | 左侧固定 | 8 个页面入口 + 连接状态指示 |
| **状态栏** | 底部 | WebSocket 连接状态、数据更新时间、网络延迟 |

---

## 3. 交互链路

### 3.1 核心用户旅程

```
用户进入
  │
  ├── 市场总览 (/)
  │     ├── 浏览 CS2 市场列表 → 按交易量/变动排序
  │     ├── 筛选赛事级别 → 只看 S-Tier 比赛
  │     └── 点击市场行 → 进入比赛分析
  │
  ├── 每日看板 (/daily)
  │     ├── 查看今日推荐 → TOP 3 关注比赛
  │     ├── 浏览全部比赛 → 按关注度排序
  │     ├── 查看高偏差机会 → 模型 vs 市场
  │     └── 点击比赛 → 进入比赛分析
  │
  ├── 比赛分析 (/match/:slug)
  │     ├── 查看价格走势图 → 切换时间粒度
  │     ├── 查看订单簿深度 → 实时买卖盘
  │     ├── 查看模型预测 → 展开 5 维因子
  │     ├── 发现偏差信号 → 模型 71% vs 市场 62%
  │     └── 触发 LLM 分析 → 多模型并行预测
  │
  ├── 巨鲸追踪 (/whales)
  │     ├── 浏览巨鲸排行榜 → 按可疑度排序
  │     ├── 查看实时告警 → 最新异常交易
  │     └── 点击地址 → 展开内嵌详情面板
  │
  ├── 赛事分析 (/esports)
  │     ├── 浏览赛事列表 → 按级别筛选
  │     ├── 查看战队对比 → 地图池分析
  │     └── 查看 HLTV 排名 → Top 10
  │
  ├── 信号对比 (/signals)
  │     ├── 浏览信号列表 → 按偏差排序
  │     ├── 对比三源信号 → 市场/模型/社区
  │     └── 点击市场 → 进入比赛分析
  │
  ├── AI 配置 (/ai/config)
  │     ├── 配置 API Key → 6 个 Provider
  │     ├── 测试连通性 → 延迟检测
  │     └── 查看配额用量 → 费用统计
  │
  └── AI 胜率统计 (/ai/stats)
        ├── 查看 LLM 胜率 → 赛事/方向/战队/地图
        ├── 查看校准曲线 → 置信度分析
        ├── 查看趋势图 → 30 天走势
        ├── 查看 LLM 排行榜 → ROI/夏普/回撤
        └── 浏览投注历史 → 逐笔明细
```

### 3.2 页面间跳转关系

```
                    ┌──────────────┐
                    │  市场总览 /   │
                    └──────┬───────┘
                           │ 点击市场
                           ▼
              ┌────────────────────────┐
              │  比赛分析 /match/:slug  │◄──────────────────┐
              └────────┬───────────────┘                   │
                       │                                   │
    ┌──────────────────┼──────────────────┐               │
    │                  │                  │               │
    ▼                  ▼                  ▼               │
┌──────────┐   ┌──────────────┐   ┌──────────────┐       │
│ 每日看板  │   │  赛事分析     │   │  信号对比     │───────┘
│ /daily   │   │  /esports    │   │  /signals    │  点击市场
└──────────┘   └──────────────┘   └──────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
┌──────────┐   ┌──────────────┐   ┌──────────────┐
│ 巨鲸追踪  │   │  AI 配置      │   │ AI 胜率统计   │
│ /whales  │   │ /ai/config   │   │ /ai/stats    │
└──────────┘   └──────────────┘   └──────────────┘
```

### 3.3 实时数据流交互

```
WebSocket 连接
  │
  ├── 价格变动 → 市场列表实时更新价格颜色（绿涨红跌）
  ├── 大单成交 → 通知中心推送 + 巨鲸告警列表追加
  ├── 异常检测 → 状态栏闪烁 + 相关市场高亮
  └── 连接断开 → 状态栏变红 + 自动重连倒计时
```

---

## 4. 主题系统

### 4.1 三主题概述

| 主题 | 适用场景 | 设计语言 |
|------|---------|---------|
| **Dark** | 默认主题，日常使用 | shadcn/ui 暗色主题配色 |
| **Light** | 日间办公、明亮环境 | shadcn/ui 亮色主题配色 |
| **Matrix** | 深夜盯盘、极客风格 | 与 Codex CLI Matrix 一致的终端绿配色 |

### 4.2 Dark 主题（shadcn/ui Dark 配色）

```
配色基于 shadcn/ui 暗色主题设计 Token
```

#### 语义色板

| Token | 色值 | 用途 |
|-------|------|------|
| `--background` | `#0A0A0A` | 主背景色 |
| `--foreground` | `#FAFAFA` | 主文字色 |
| `--sidebar-bg` | `#0A0A0A` | 侧边栏背景 |
| `--sidebar-fg` | `#A1A1AA` | 侧边栏文字 |
| `--panel-bg` | `#18181B` | 面板背景 |
| `--panel-border` | `#27272A` | 面板边框 |
| `--input-bg` | `#18181B` | 输入框背景 |
| `--input-border` | `#27272A` | 输入框边框 |
| `--input-focus` | `#3B82F6` | 输入框聚焦边框 |
| `--button-bg` | `#3B82F6` | 按钮背景 |
| `--button-hover` | `#2563EB` | 按钮悬停 |
| `--button-fg` | `#FFFFFF` | 按钮文字 |
| `--link` | `#3B82F6` | 链接色 |
| `--link-active` | `#2563EB` | 链接激活 |
| `--tab-bg` | `#18181B` | 标签背景 |
| `--tab-active-bg` | `#0A0A0A` | 激活标签背景 |
| `--tab-active-border` | `#3B82F6` | 激活标签上边框 |
| `--statusbar-bg` | `#18181B` | 状态栏背景 |
| `--statusbar-fg` | `#A1A1AA` | 状态栏文字 |
| `--badge-bg` | `#27272A` | 徽章背景 |
| `--scrollbar` | `#27272A` | 滚动条 |
| `--scrollbar-hover` | `#3F3F46` | 滚动条悬停 |
| `--dropdown-bg` | `#18181B` | 下拉菜单背景 |
| `--dropdown-border` | `#27272A` | 下拉菜单边框 |
| `--hover-bg` | `#27272A` | 列表项悬停 |
| `--selection-bg` | `#1E3A5F` | 选中背景 |
| `--line-number` | `#71717A` | 行号/次要文字 |
| `--title-bar` | `#18181B` | 标题栏（非激活） |

#### 功能色

| Token | 色值 | 用途 |
|-------|------|------|
| `--accent` | `#3B82F6` | 主强调色（shadcn 蓝） |
| `--green` | `#22C55E` | 价格上涨/做多/成功 |
| `--red` | `#EF4444` | 价格下跌/做空/错误 |
| `--yellow` | `#EAB308` | 警告/异常/待处理 |
| `--orange` | `#F97316` | 中度告警 |
| `--purple` | `#A855F7` | 模型预测/紫色强调 |
| `--cyan` | `#06B6D4` | 信息/链接 |
| `--blue` | `#3B82F6` | 关键字/数据标签 |

#### 图表色板（用于价格走势、饼图、雷达图）

| 序号 | 色值 | 用途 |
|------|------|------|
| 1 | `#3B82F6` | 系列 1 |
| 2 | `#22C55E` | 系列 2 |
| 3 | `#F97316` | 系列 3 |
| 4 | `#A855F7` | 系列 4 |
| 5 | `#EAB308` | 系列 5 |
| 6 | `#06B6D4` | 系列 6 |

### 4.3 Light 主题（shadcn/ui Light 配色）

```
配色基于 shadcn/ui 亮色主题设计 Token
```

#### 语义色板

| Token | 色值 | 用途 |
|-------|------|------|
| `--background` | `#FFFFFF` | 主背景色 |
| `--foreground` | `#09090B` | 主文字色 |
| `--sidebar-bg` | `#F4F4F5` | 侧边栏背景 |
| `--sidebar-fg` | `#52525B` | 侧边栏文字 |
| `--panel-bg` | `#FFFFFF` | 面板背景 |
| `--panel-border` | `#E4E4E7` | 面板边框 |
| `--input-bg` | `#FFFFFF` | 输入框背景 |
| `--input-border` | `#D4D4D8` | 输入框边框 |
| `--input-focus` | `#2563EB` | 输入框聚焦边框 |
| `--button-bg` | `#2563EB` | 按钮背景 |
| `--button-hover` | `#1D4ED8` | 按钮悬停 |
| `--button-fg` | `#FFFFFF` | 按钮文字 |
| `--link` | `#2563EB` | 链接色 |
| `--link-active` | `#1D4ED8` | 链接激活 |
| `--tab-bg` | `#F4F4F5` | 标签背景 |
| `--tab-active-bg` | `#FFFFFF` | 激活标签背景 |
| `--tab-active-border` | `#2563EB` | 激活标签上边框 |
| `--statusbar-bg` | `#F4F4F5` | 状态栏背景 |
| `--statusbar-fg` | `#52525B` | 状态栏文字 |
| `--badge-bg` | `#E4E4E7` | 徽章背景 |
| `--scrollbar` | `#D4D4D8` | 滚动条 |
| `--scrollbar-hover` | `#A1A1AA` | 滚动条悬停 |
| `--dropdown-bg` | `#FFFFFF` | 下拉菜单背景 |
| `--dropdown-border` | `#E4E4E7` | 下拉菜单边框 |
| `--hover-bg` | `#F4F4F5` | 列表项悬停 |
| `--selection-bg` | `#DBEAFE` | 选中背景 |
| `--line-number` | `#A1A1AA` | 行号/次要文字 |
| `--title-bar` | `#F4F4F5` | 标题栏（非激活） |

#### 功能色

| Token | 色值 | 用途 |
|-------|------|------|
| `--accent` | `#2563EB` | 主强调色（shadcn 蓝） |
| `--green` | `#16A34A` | 价格上涨/做多/成功 |
| `--red` | `#DC2626` | 价格下跌/做空/错误 |
| `--yellow` | `#CA8A04` | 警告/异常/待处理 |
| `--orange` | `#EA580C` | 中度告警 |
| `--purple` | `#9333EA` | 模型预测/紫色强调 |
| `--cyan` | `#0891B2` | 信息/链接 |
| `--blue` | `#2563EB` | 关键字/数据标签 |

#### 图表色板

| 序号 | 色值 | 用途 |
|------|------|------|
| 1 | `#2563EB` | 系列 1 |
| 2 | `#16A34A` | 系列 2 |
| 3 | `#EA580C` | 系列 3 |
| 4 | `#9333EA` | 系列 4 |
| 5 | `#CA8A04` | 系列 5 |
| 6 | `#0891B2` | 系列 6 |

### 4.4 Matrix 主题（Codex CLI Matrix 配色）

```
配色完全对齐 Codex CLI 的 Matrix 终端主题
基于 OKLCH 色彩空间，确保感知亮度均匀
```

#### 语义色板

| Token | 色值 (Hex) | 色值 (OKLCH) | 用途 |
|-------|-----------|-------------|------|
| `--background` | `#0d1117` | `oklch(0.15 0.02 240)` | 主背景色（深蓝黑） |
| `--foreground` | `#00ff41` | `oklch(0.70 0.15 145)` | 主文字色（荧光绿） |
| `--sidebar-bg` | `#0a0e13` | `oklch(0.12 0.02 240)` | 侧边栏背景 |
| `--sidebar-fg` | `#00cc34` | `oklch(0.62 0.14 145)` | 侧边栏文字 |
| `--panel-bg` | `#0d1117` | `oklch(0.15 0.02 240)` | 面板背景 |
| `--panel-border` | `#1a3a1a` | `oklch(0.25 0.06 145)` | 面板边框（暗绿） |
| `--input-bg` | `#0a0e13` | `oklch(0.12 0.02 240)` | 输入框背景 |
| `--input-border` | `#1a4a1a` | `oklch(0.30 0.08 145)` | 输入框边框 |
| `--input-focus` | `#00ff41` | `oklch(0.70 0.15 145)` | 输入框聚焦边框 |
| `--button-bg` | `#006400` | `oklch(0.35 0.12 145)` | 按钮背景 |
| `--button-hover` | `#008f11` | `oklch(0.45 0.14 145)` | 按钮悬停 |
| `--button-fg` | `#00ff41` | `oklch(0.70 0.15 145)` | 按钮文字 |
| `--link` | `#00ff41` | `oklch(0.70 0.15 145)` | 链接色 |
| `--link-active` | `#00cc34` | `oklch(0.62 0.14 145)` | 链接激活 |
| `--tab-bg` | `#0a1a0a` | `oklch(0.18 0.04 145)` | 标签背景 |
| `--tab-active-bg` | `#0d1117` | `oklch(0.15 0.02 240)` | 激活标签背景 |
| `--tab-active-border` | `#00ff41` | `oklch(0.70 0.15 145)` | 激活标签上边框 |
| `--statusbar-bg` | `#006400` | `oklch(0.35 0.12 145)` | 状态栏背景 |
| `--statusbar-fg` | `#00ff41` | `oklch(0.70 0.15 145)` | 状态栏文字 |
| `--badge-bg` | `#1a3a1a` | `oklch(0.25 0.06 145)` | 徽章背景 |
| `--scrollbar` | `#1a3a1a` | `oklch(0.25 0.06 145)` | 滚动条 |
| `--scrollbar-hover` | `#2a5a2a` | `oklch(0.35 0.08 145)` | 滚动条悬停 |
| `--dropdown-bg` | `#0a0e13` | `oklch(0.12 0.02 240)` | 下拉菜单背景 |
| `--dropdown-border` | `#1a4a1a` | `oklch(0.30 0.08 145)` | 下拉菜单边框 |
| `--hover-bg` | `#0a1a0a` | `oklch(0.18 0.04 145)` | 列表项悬停 |
| `--selection-bg` | `#1a4a1a` | `oklch(0.30 0.08 145)` | 选中背景 |
| `--line-number` | `#2a5a2a` | `oklch(0.35 0.08 145)` | 行号/次要文字 |
| `--title-bar` | `#0a0e13` | `oklch(0.12 0.02 240)` | 标题栏 |

#### 功能色

| Token | 色值 (Hex) | 色值 (OKLCH) | 用途 |
|-------|-----------|-------------|------|
| `--accent` | `#00ff41` | `oklch(0.70 0.15 145)` | 主强调色（荧光绿） |
| `--green` | `#00ff41` | `oklch(0.70 0.15 145)` | 价格上涨/做多/成功 |
| `--green-dim` | `#008f11` | `oklch(0.45 0.14 145)` | 绿色暗调 |
| `--red` | `#ff3333` | `oklch(0.65 0.22 25)` | 价格下跌/做空/错误 |
| `--yellow` | `#ffcc00` | `oklch(0.80 0.15 95)` | 警告/异常/待处理 |
| `--orange` | `#ff8800` | `oklch(0.70 0.18 65)` | 中度告警 |
| `--purple` | `#cc44cc` | `oklch(0.55 0.20 320)` | 模型预测/紫色强调 |
| `--cyan` | `#00cccc` | `oklch(0.65 0.12 200)` | 信息/链接 |
| `--blue` | `#4488ff` | `oklch(0.55 0.18 265)` | 关键字/数据标签 |

#### 图表色板

| 序号 | 色值 | 用途 |
|------|------|------|
| 1 | `#00ff41` | 系列 1（荧光绿） |
| 2 | `#00cccc` | 系列 2（青色） |
| 3 | `#ffcc00` | 系列 3（黄色） |
| 4 | `#cc44cc` | 系列 4（紫色） |
| 5 | `#4488ff` | 系列 5（蓝色） |
| 6 | `#ff8800` | 系列 6（橙色） |

#### Matrix 主题特殊效果

| 效果 | 说明 |
|------|------|
| 文字发光 | 关键数据（价格、偏差）使用 `text-shadow: 0 0 8px var(--foreground)` |
| 边框发光 | 聚焦输入框使用 `box-shadow: 0 0 4px var(--accent)` |
| 扫描线 | 可选开启 CRT 扫描线效果（`background: repeating-linear-gradient`） |
| 闪烁光标 | 终端风格块状光标 `|` 闪烁动画 |
| 字体 | 全局使用等宽字体 `JetBrains Mono` / `Fira Code` |

---

## 5. shadcn/ui 组件规范

### 5.1 设计 Token 体系

基于 shadcn/ui 的 CSS 变量体系，扩展三主题：

```css
@theme {
  /* === 基础 === */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--panel-bg);
  --color-card-foreground: var(--foreground);
  --color-popover: var(--dropdown-bg);
  --color-popover-foreground: var(--foreground);
  --color-primary: var(--accent);
  --color-primary-foreground: #ffffff;
  --color-secondary: var(--tab-bg);
  --color-secondary-foreground: var(--foreground);
  --color-muted: var(--hover-bg);
  --color-muted-foreground: var(--line-number);
  --color-accent: var(--accent);
  --color-accent-foreground: #ffffff;
  --color-destructive: var(--red);
  --color-destructive-foreground: #ffffff;
  --color-success: var(--green);
  --color-warning: var(--yellow);
  --color-border: var(--panel-border);
  --color-input: var(--input-bg);
  --color-ring: var(--input-focus);

  /* === 圆角 === */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* === 阴影 === */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);

  /* === 字体 === */
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
}
```

### 5.2 字体系统

| 层级 | 大小 | 行高 | 字重 | Tailwind | 用途 |
|------|------|------|------|----------|------|
| H1 | 36px | 40px | 600 | `text-4xl` | 页面标题 |
| H2 | 24px | 32px | 600 | `text-2xl` | 区块标题 |
| H3 | 20px | 28px | 600 | `text-xl` | 面板标题 |
| H4 | 16px | 24px | 600 | `text-lg` | 卡片标题 |
| Body | 16px | 24px | 400 | `text-base` | 正文/表格 |
| Caption | 12px | 16px | 400 | `text-xs` | 辅助文字/标签 |
| Mono | 13px | 20px | 400 | `text-sm font-mono` | 数字/地址/代码 |

**规则**：
- 仅使用 4 种字号 + 2 种字重（Regular 400 / Semibold 600）
- 数字类数据（价格、百分比、金额）统一使用 `font-mono tabular-nums`（等宽数字）
- 地址/Token ID 使用 `font-mono` 等宽字体
- Matrix 主题全局使用 `font-mono`

### 5.3 间距系统（8px 网格）

| 间距名 | 值 | Tailwind | 用途 |
|--------|-----|----------|------|
| xs | 4px | `p-1` / `gap-1` | 图标与文字间距、紧凑元素 |
| sm | 8px | `p-2` / `gap-2` | 紧密相关元素间距 |
| md | 16px | `p-4` / `gap-4` | 组件内边距、卡片内边距 |
| lg | 24px | `p-6` / `gap-6` | 区块间距、面板内边距 |
| xl | 32px | `p-8` / `gap-8` | 大区块间距 |
| 2xl | 48px | `p-12` / `gap-12` | 页面级间距 |
| 3xl | 64px | `p-16` / `gap-16` | 首页 Hero 区域 |

**规则**：所有间距必须为 4 或 8 的倍数。禁止使用 5px/7px/11px/13px 等非标准间距。

主内容区使用 `p-8 px-10`（32px 上下，40px 左右）作为默认内边距。

### 5.4 圆角系统

| 级别 | 值 | Tailwind | 用途 |
|------|-----|----------|------|
| sm | 4px | `rounded-sm` | 输入框、标签、徽章 |
| md | 6px | `rounded-md` | 按钮、下拉菜单 |
| lg | 8px | `rounded-lg` | 卡片、面板 |
| xl | 12px | `rounded-xl` | 大卡片、模态框 |
| full | 9999px | `rounded-full` | 头像、状态指示器 |

### 5.5 组件规范

#### Button（按钮）

```
尺寸：
  sm: h-8 px-3 text-xs  (32px)
  md: h-9 px-4 text-sm  (36px) ← 默认
  lg: h-10 px-6 text-sm (40px)

变体：
  default:    bg-primary text-primary-foreground hover:opacity-90
  secondary:  bg-secondary text-secondary-foreground hover:bg-muted
  ghost:      hover:bg-muted hover:text-foreground
  destructive: bg-destructive text-destructive-foreground hover:opacity-90
  outline:    border border-border bg-transparent hover:bg-muted

状态：
  disabled: opacity-50 cursor-not-allowed
  loading:  显示 Spinner + 禁用点击

圆角：rounded-md (6px)
```

#### Card（卡片）

```
结构：
  <Card>
    <CardHeader>   → px-6 pt-6 pb-0
    <CardContent>  → px-6 py-4
    <CardFooter>   → px-6 pb-6 pt-0

样式：
  bg-card border border-border rounded-lg
  无阴影（使用边框而非阴影来区分层次）
```

#### Table（表格）

```
结构：
  <Table>
    <TableHeader>  → sticky top-0 bg-muted
    <TableBody>    → divide-y divide-border
    <TableRow>     → hover:bg-muted/50 transition-colors

样式：
  表头：text-xs font-medium text-muted-foreground uppercase tracking-wider h-12
  单元格：text-sm py-3 px-4
  数字列：text-right font-mono tabular-nums
  排序列头：可点击，hover:text-foreground，排序图标
```

#### Input（输入框）

```
尺寸：
  sm: h-8 text-xs  (32px)
  md: h-9 text-sm  (36px) ← 默认
  lg: h-10 text-sm (40px)

样式：
  bg-input border border-border rounded-sm
  focus:border-ring focus:ring-1 focus:ring-ring
  placeholder:text-muted-foreground

搜索框特殊样式：
  Cmd+K 风格，左侧搜索图标 + 右侧快捷键提示
```

#### Badge（徽章/标签）

```
变体：
  default:    bg-primary/10 text-primary
  secondary:  bg-secondary text-secondary-foreground
  success:    bg-success/10 text-success
  destructive: bg-destructive/10 text-destructive
  warning:    bg-warning/10 text-warning
  outline:    border border-border text-foreground

尺寸：
  sm: px-2 py-0.5 text-xs
  md: px-2.5 py-0.5 text-xs ← 默认

圆角：rounded-sm (4px)
```

#### Tabs（标签页）

```
样式（shadcn 风格）：
  标签列表：flex border-b border-border
  标签项：px-4 py-2 text-sm text-muted-foreground border-b-2 border-transparent
  激活态：text-foreground border-accent bg-transparent
  悬停态：text-foreground

无背景色变化，仅底部边框指示激活状态
```

#### Dialog / Modal（对话框）

```
样式：
  bg-card border border-border rounded-xl
  shadow-lg
  宽度：sm:max-w-md md:max-w-lg lg:max-w-2xl

遮罩：
  bg-black/50 backdrop-blur-sm
```

#### Tooltip（提示框）

```
样式：
  bg-popover text-popover-foreground text-xs
  px-3 py-1.5 rounded-md
  shadow-md border border-border

延迟：hover 500ms 后显示
```

#### Dropdown Menu（下拉菜单）

```
样式：
  bg-popover border border-border rounded-md
  shadow-md min-w-[180px] p-1

菜单项：
  px-2 py-1.5 text-sm rounded-sm
  hover:bg-muted
  危险操作：text-destructive hover:bg-destructive/10
```

#### Scrollbar（滚动条）

```
样式（shadcn 风格，始终可见的细滚动条）：
  宽度：6px（Dark/Light）/ 8px（Matrix）
  轨道：transparent
  滑块：bg-scrollbar rounded-full
  悬停：bg-scrollbar-hover
```

#### Skeleton（骨架屏）

```
样式：
  bg-muted animate-pulse rounded-md
  用于数据加载中的占位
```

#### Progress（进度条）

```
样式：
  轨道：bg-muted rounded-full h-2
  进度：bg-primary rounded-full transition-all
  不确定状态：animate-indeterminate（渐变移动）
```

#### 数据展示专用组件

```
StatCard（统计卡片）：
  上标签：text-xs text-muted-foreground uppercase tracking-wider
  主数值：text-2xl font-mono font-semibold tabular-nums
  变化率：text-xs font-mono（绿涨红跌，带箭头图标）
  底部描述：text-xs text-muted-foreground

PriceTag（价格标签）：
  价格：font-mono tabular-nums text-sm
  变动：font-mono text-xs（绿涨红跌，带百分比）
  闪烁动画：价格变动时短暂闪烁背景色

WhaleScore（巨鲸评分）：
  总分：text-2xl font-mono font-semibold
  进度环：圆形进度条，颜色从绿→黄→红（0→100）
  维度分解：4 条进度条，带标签和分值

SignalBadge（信号徽章）：
  偏差方向：BUY/SELL 标签
  偏差幅度：百分比数字
  置信度：星级或百分比
  颜色：绿色（看涨）/ 红色（看跌）/ 黄色（中性）

AlertItem（告警条目）：
  严重度图标：🔴高 / 🟡中 / 🔵低
  时间戳：text-xs text-muted-foreground
  标题：text-sm font-medium
  描述：text-xs text-muted-foreground
  悬停：bg-muted/50
```

---

## 6. 布局系统

### 6.1 整体布局（Sidebar + Content + StatusBar）

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Sidebar  │  主内容区 (Content Area)                      │
│  (240px)  │                                              │
│           │  ┌────────────────────────────────────────┐  │
│  ┌──────┐ │  │  页面标题 + 面包屑                       │  │
│  │ Nav  │ │  ├────────────────────────────────────────┤  │
│  │      │ │  │                                        │  │
│  │      │ │  │  页面内容                               │  │
│  │      │ │  │                                        │  │
│  └──────┘ │  └────────────────────────────────────────┘  │
│           │                                              │
├───────────┴──────────────────────────────────────────────┤
│  状态栏: 🟢 Connected | 数据更新: 2s ago | 延迟: 45ms     │
└──────────────────────────────────────────────────────────┘
```

### 6.2 侧边栏规范

```
宽度：240px（固定，不可折叠）
背景：--sidebar-bg

导航结构：
  - 8 个导航项，带图标和文字标签
  - 导航分组：
    Markets: 市场总览、每日看板
    Analysis: 巨鲸追踪、赛事分析、信号对比
    AI: AI 配置、AI 胜率统计
  - 激活态：bg-muted 高亮
  - 底部：主题切换按钮

图标 + 文字标签并排显示
当前页面高亮背景（bg-muted）
```

### 6.3 响应式断点

| 断点 | 宽度 | 布局变化 |
|------|------|---------|
| Base | < 768px | 侧边栏隐藏，顶部汉堡菜单，单列布局 |
| md | ≥ 768px | 侧边栏显示（240px），双列布局 |
| lg | ≥ 1024px | 主内容区最大宽度 1200px |
| xl | ≥ 1280px | 主内容区最大宽度 1400px，支持双面板并排 |

### 6.4 面板分割（参考编辑器布局）

```
比赛分析页布局（双面板）：

┌────────────────────────────────────────────────────┐
│  价格走势图（上方面板，高度 50%）                      │
│  [1m] [5m] [1h] [1d]                               │
│  ┌──────────────────────────────────────────────┐  │
│  │  K 线图 / 折线图                              │  │
│  └──────────────────────────────────────────────┘  │
├──────────────────────┬─────────────────────────────┤
│  订单簿深度（左下）    │  模型预测面板（右下）          │
│  买卖盘可视化         │  5 维因子分解 + 偏差指示      │
│  实时更新             │                             │
├──────────────────────┴─────────────────────────────┤
│  最近成交流（底部滚动列表）                           │
└────────────────────────────────────────────────────┘

面板可拖拽调整大小
```

---

## 7. 动效规范

### 7.1 动效原则

| 原则 | 说明 |
|------|------|
| **克制** | 动效服务于信息传递，不分散注意力 |
| **快速** | 过渡动画 ≤ 200ms，不拖慢操作节奏 |
| **一致** | 同类元素使用相同的动效曲线 |
| **可禁用** | 提供 `prefers-reduced-motion` 支持 |

### 7.2 动效定义

| 场景 | 动效 | 时长 | 缓动 |
|------|------|------|------|
| 页面切换 | 淡入 + 轻微上移 (4px) | 150ms | `ease-out` |
| 列表项出现 | 依次淡入 (stagger 30ms) | 150ms | `ease-out` |
| 价格变动 | 背景色闪烁（绿/红 → 透明） | 600ms | `ease-out` |
| 数值变化 | 数字滚动/翻转效果 | 300ms | `ease-out` |
| 悬停状态 | 背景色/边框色过渡 | 150ms | `ease-in-out` |
| 下拉菜单 | 展开：淡入 + 下滑 (4px) | 150ms | `ease-out` |
| 模态框 | 淡入 + 缩放 (0.95→1) | 200ms | `ease-out` |
| 侧边栏展开 | 宽度过渡 | 200ms | `ease-in-out` |
| 告警通知 | 从右侧滑入 | 300ms | `ease-out` |
| 加载骨架屏 | 脉冲动画 | 持续 | `animate-pulse` |
| 实时数据闪烁 | 边框发光脉冲 | 2s 循环 | `ease-in-out` |

### 7.3 Matrix 主题特殊动效

| 效果 | 说明 |
|------|------|
| 文字输入光标 | 块状光标闪烁，500ms 间隔 |
| 数据刷新 | 短暂绿色荧光闪烁（`box-shadow` 脉冲） |
| 扫描线 | 可选 CRT 扫描线效果（`repeating-linear-gradient` 缓慢下移） |
| 终端打字 | 告警通知以打字机效果逐字显示 |

---

## 8. 图标系统

### 8.1 图标库

使用 **Lucide Icons**（shadcn/ui 默认图标库）

### 8.2 图标规格

| 属性 | 值 |
|------|-----|
| 尺寸 | 16px（行内）/ 20px（独立）/ 24px（大图标） |
| 描边宽度 | 2px |
| 颜色 | 继承父元素文字颜色 |

### 8.3 导航图标映射

| 页面 | 图标 |
|------|------|
| 市场总览 | `LayoutDashboard` |
| 每日看板 | `CalendarDays` |
| 比赛分析 | `Swords` |
| 巨鲸追踪 | `Fish` |
| 赛事分析 | `Gamepad2` |
| 信号对比 | `Activity` |
| AI 配置 | `Settings2` |
| AI 胜率 | `BarChart3` |
| 主题切换 | `Sun` / `Moon` / `Terminal` |
| 通知 | `Bell` |
| 搜索 | `Search` |
| 设置 | `Settings` |

---

## 9. CSS 变量实现

### 9.1 主题切换实现

```css
/* 默认 Dark 主题 */
:root,
[data-theme="dark"] {
  --background: #0A0A0A;
  --foreground: #FAFAFA;
  --sidebar-bg: #0A0A0A;
  /* ... 完整 Dark 变量 */
}

/* Light 主题 */
[data-theme="light"] {
  --background: #FFFFFF;
  --foreground: #09090B;
  --sidebar-bg: #F4F4F5;
  /* ... 完整 Light 变量 */
}

/* Matrix 主题 */
[data-theme="matrix"] {
  --background: #0d1117;
  --foreground: #00ff41;
  --sidebar-bg: #0a0e13;
  /* ... 完整 Matrix 变量 */
  --font-sans: "JetBrains Mono", "Fira Code", monospace;
}
```

### 9.2 主题持久化

```typescript
// 主题存储
const THEME_KEY = "polyrader-theme";

type Theme = "dark" | "light" | "matrix";

function getTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) || "dark";
}

function setTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
}

// 初始化时跟随系统偏好（仅 dark/light）
function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
```

---

## 10. 可访问性

| 要求 | 标准 |
|------|------|
| 文字对比度 | WCAG AA（普通文字 ≥ 4.5:1，大文字 ≥ 3:1） |
| 键盘导航 | 所有交互元素支持 Tab/Enter/Escape |
| 焦点指示 | 可见的聚焦环（2px accent 色） |
| 屏幕阅读器 | 语义化 HTML + aria-label |
| 减弱动效 | 支持 `prefers-reduced-motion: reduce` |
| 色盲友好 | 功能色不单独依赖颜色传达信息（配合图标/文字） |

---

## 附录 A：配色说明

本设计现已采用 **shadcn/ui** 设计 Token 体系，Dark/Light 主题颜色不再参考 Cursor IDE 配色。Matrix 主题仍参考 Codex CLI 终端美学。

## 附录 B：与 Codex CLI Matrix 的配色对照

| Codex CLI 元素 | Codex 色值 | PolyRader Token |
|---------------|-----------|-----------------|
| Primary text | `#00ff41` (荧光绿) | `--foreground` |
| Background | `#0d1117` (深蓝黑) | `--background` |
| Success/Additions | `#00ff41` | `--green` |
| Errors/Deletions | `#ff3333` | `--red` |
| Codex identity | `#cc44cc` (品红) | `--purple` |
| User input | `#00cccc` (青色) | `--cyan` |
| Dimmed text | `#008f11` (暗绿) | `--line-number` |

---

## 11. Tauri 桌面应用 UI 适配

### 11.1 窗口管理

| 特性 | 说明 |
|------|------|
| 窗口标题 | 动态标题 `PolyRader CS2 — {当前页面名称}` |
| 最小窗口尺寸 | 1024 × 680px |
| 默认窗口尺寸 | 1440 × 900px |
| 窗口状态记忆 | 关闭时记住窗口位置和大小，下次启动恢复 |
| 原生标题栏 | 使用 Tauri 原生标题栏（或自定义无边框窗口 + 拖拽区域） |
| 窗口控制 | 最小化 / 最大化 / 关闭，与操作系统原生行为一致 |

### 11.2 系统托盘

```
┌─────────────────┐
│ 🎯 PolyRader CS2 │
├─────────────────┤
│ 显示主窗口       │
│ ─────────────── │
│ 暂停数据更新     │
│ ─────────────── │
│ 退出            │
└─────────────────┘
```

| 功能 | 说明 |
|------|------|
| 托盘图标 | 应用 Logo 缩略图（16×16 / 32×32） |
| 托盘菜单 | 显示主窗口 / 暂停数据更新 / 退出 |
| 最小化到托盘 | 关闭窗口时最小化到系统托盘（可配置） |
| 托盘通知 | 异常告警时托盘图标闪烁或显示角标 |

### 11.3 原生通知

| 场景 | 通知内容 |
|------|---------|
| 巨鲸异常交易 | "检测到 {地址} 大额买入 {市场}，金额 ${amount}" |
| 价格剧烈变动 | "{市场} 价格 5 分钟内变动 {change}%" |
| 比赛即将开始 | "{比赛} 将在 30 分钟后开始" |
| LLM 分析完成 | "{比赛} 的多 LLM 分析已完成" |
| 新版本可用 | "PolyRader CS2 v{version} 已发布，点击更新" |

### 11.4 原生对话框

| 场景 | 对话框类型 |
|------|-----------|
| 首次启动选择数据文件夹 | Tauri 原生文件夹选择器 |
| 确认退出 | Tauri 原生确认对话框 |
| 导出数据 | Tauri 原生保存文件对话框 |
| 导入数据 | Tauri 原生打开文件对话框 |
| 关于 | 自定义关于窗口（应用版本、GitHub 链接） |

### 11.5 离线状态处理

| 状态 | UI 表现 |
|------|--------|
| 网络连接正常 | 状态栏显示绿色圆点 + "在线" |
| 网络断开 | 状态栏显示红色圆点 + "离线"，数据区域显示最后缓存时间 |
| 外部 API 不可达 | 对应数据区域显示 "数据源暂不可用" 提示，保留历史数据 |
| Sidecar 进程异常 | 显示错误页面 + "后端服务异常，请重启应用" 按钮 |

### 11.6 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + ,` | 打开设置 |
| `Cmd/Ctrl + R` | 刷新当前页面数据 |
| `Cmd/Ctrl + 1-8` | 快速切换到对应页面 |
| `Cmd/Ctrl + Shift + N` | 切换主题（Dark → Light → Matrix） |
| `Cmd/Ctrl + W` | 关闭当前窗口（最小化到托盘） |
| `Cmd/Ctrl + Q` | 退出应用 |

### 11.7 应用菜单栏 (macOS)

```
PolyRader CS2  文件  编辑  视图  帮助
├── 关于 PolyRader CS2
├── 设置...  (Cmd+,)
├── ───────────────
├── 检查更新...
├── ───────────────
├── 隐藏 PolyRader CS2
├── 隐藏其他
├── 显示全部
├── ───────────────
└── 退出 PolyRader CS2 (Cmd+Q)
```

### 11.8 首次启动引导

```
┌─────────────────────────────────────────────┐
│                                             │
│         Welcome to PolyRader CS2            │
│                                             │
│     [App Logo]                              │
│                                             │
│  选择数据存储位置：                           │
│  ┌─────────────────────────────────────┐    │
│  │ /Users/xxx/Documents/PolyRader   [📁]│    │
│  └─────────────────────────────────────┘    │
│                                             │
│  所有数据（数据库、配置、缓存）将存储在此文件夹。 │
│                                             │
│              [开始使用]                       │
│                                             │
└─────────────────────────────────────────────┘
```

### 11.9 与 Web 应用的设计差异

| 方面 | Web 应用设计 | Tauri 桌面应用设计 |
|------|-------------|-------------------|
| 响应式 | 支持平板/移动端断点 | 仅桌面窗口缩放，最小 1024×680px |
| 导航 | Sidebar + 面包屑 | 同 Web，增加键盘快捷键 |
| 对话框 | 自定义 React 组件 | 优先使用 Tauri 原生对话框 |
| 通知 | 页面内 Toast | 页面内 Toast + 系统原生通知 |
| 数据刷新 | 手动刷新 / 自动轮询 | 同 Web，增加 Cmd+R 快捷键 |
| 主题切换 | 按钮切换 | 按钮切换 + Cmd+Shift+N 快捷键 |
| 窗口控制 | 浏览器标签页 | 原生标题栏 + 系统托盘 |
| 离线处理 | 无特殊处理 | 离线状态指示 + 缓存数据展示 |
| 更新 | 刷新浏览器 | Tauri Updater 自动检测 + 提示 |
