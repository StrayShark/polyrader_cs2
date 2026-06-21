# PolyRader CS2

> Open-source Polymarket CS2 esports prediction analysis tool — Tauri Desktop App.
> 开源 Polymarket CS2 电竞预测分析工具 — Tauri 桌面应用。

**No registration. No login. No payment. All features free. Download and run.**

---

## Features

| Module | Description |
|--------|-------------|
| **Market Overview** | Real-time Polymarket CS2 market data, volume, liquidity, price tracking |
| **Daily Dashboard** | Auto-scanned matches with attention scoring, TOP 3 recommendations |
| **Match Analysis** | 6-factor prediction (HLTV rank, recent form, lineup, map pool, H2H, market sentiment) |
| **Multi-LLM Analysis** | Parallel invocation of 6 LLM providers (GPT-4o, Claude 3.5, Gemini 2.0, DeepSeek V3, Grok 2, Llama 3.3) |
| **Lineup Evaluation** | Same team, different lineup = independent strength assessment |
| **Kelly Criterion** | Optimal fund allocation based on LLM consensus |
| **Whale Tracking** | On-chain address monitoring with 4-dimension suspicious scoring |
| **Signal Comparison** | Multi-source prediction signal deviation analysis |
| **AI Stats** | LLM leaderboard, calibration curves, simulated betting history |
| **AI Config** | API key management, connectivity testing, quota monitoring |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Tauri 2.x (Rust) |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| State | Zustand |
| Routing | React Router v6 (Hash) |
| Backend | Express.js 4 + WebSocket (ws) — Tauri Sidecar |
| Domain | Pure TypeScript (zero dependencies) |
| Database | SQLite (better-sqlite3) — local file |
| Cache | LRU Cache (in-memory) |
| Monorepo | Turborepo + npm workspaces |
| LLM | OpenAI / Anthropic / Google / DeepSeek / xAI / Groq |
| Data | Polymarket Gamma API + CLOB API + WebSocket |

## Quick Start

### Prerequisites

- Node.js >= 20
- npm >= 10
- Rust (for Tauri) — [rustup.rs](https://rustup.rs)

### 1. Clone & Install

```bash
git clone https://github.com/dutongxue/polyrader_cs2.git
cd polyrader-cs2
npm install
```

### 2. Start Development

```bash
npm run tauri dev
```

This starts the Tauri development environment with:
- **WebView**: React SPA with hot reload
- **Sidecar**: Express API server on a random localhost port
- **Database**: SQLite auto-created in project `data/` directory

### 3. Build for Production

```bash
npm run tauri build
```

Generates platform-specific installers:
- **macOS**: `PolyRader_CS2_x64.dmg`
- **Windows**: `PolyRader_CS2_x64.msi`
- **Linux**: `PolyRader_CS2_amd64.AppImage`

### 4. Configure LLM API Keys (Optional)

Open the app, navigate to **AI Config** page, and enter your API keys. Keys are encrypted with AES-256-GCM and stored locally in your data folder.

## Project Structure

```
polyrader_cs2/
├── packages/
│   ├── core/          # Domain layer — Pure TypeScript engines
│   │   ├── src/types/         # 30+ type definitions
│   │   └── src/engines/       # 12 analysis engines
│   │   └── src/scoring/       # Weight configurations
│   ├── infra/         # Infrastructure layer
│   │   ├── src/database/      # SQLite + repositories
│   │   ├── src/cache/         # LRU in-memory cache
│   │   ├── src/clients/       # Polymarket + LLM clients
│   │   └── src/crawlers/      # HLTV crawler
│   ├── server/        # Application layer (Tauri Sidecar)
│   │   ├── src/controllers/   # 7 controllers
│   │   ├── src/services/      # 10 services
│   │   ├── src/cron/          # Scheduled jobs
│   │   └── src/websocket/     # WebSocket server
│   └── web/           # Presentation layer (Tauri WebView)
│       ├── src/pages/         # 10 page components
│       ├── src/stores/        # Zustand stores
│       ├── src/components/    # Shared UI components
│       └── src/styles/        # 3 themes (Dark+/Light+/Matrix)
├── src-tauri/         # Tauri Rust backend
│   ├── src/main.rs
│   ├── src/lib.rs
│   ├── tauri.conf.json
│   └── icons/
└── .env.example
```

## Architecture

```
Tauri Desktop App
├── WebView (React + shadcn/ui)
│   ↕ IPC (invoke/event)
├── Tauri Rust Core
│   ├── Window management
│   ├── System tray
│   ├── Sidecar lifecycle
│   └── Updater
│   ↕ Sidecar management
├── Express Sidecar (localhost:{port})
│   ↕ Service calls
├── Domain (Pure TypeScript Engines)
│   ↕ Repository pattern
└── Infrastructure (SQLite + LRU Cache + API Clients)
```

### 6-Factor Prediction Model

| Factor | Weight | Data Source |
|--------|--------|-------------|
| HLTV Rank | 20% | HLTV World Ranking |
| Recent Form | 15% | Last 10 matches |
| Lineup | 20% | Starting roster + standins |
| Map Pool | 15% | Map-specific win rates |
| Head-to-Head | 10% | Historical matchups |
| Market Sentiment | 20% | Polymarket prices |

### Multi-LLM Analysis Pipeline

```
User triggers analysis
  → PromptEngine builds 4-layer prompt (System/Context/Data/Output)
  → 6 LLMs invoked in parallel (30s timeout, 2 retries, exponential backoff)
  → ResultAggregator: voting + weighted confidence + consensus detection
  → Kelly Criterion fund allocation
  → User confirms bet
  → SettlementEngine auto-settles after match resolution
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/markets` | Active CS2 markets |
| GET | `/api/markets/:id` | Market detail |
| GET | `/api/markets/:id/prices` | Price history |
| GET | `/api/daily` | Daily dashboard |
| POST | `/api/daily/refresh` | Refresh dashboard |
| GET | `/api/whales` | Whale leaderboard |
| GET | `/api/whales/:address` | Whale detail |
| GET | `/api/alerts` | Anomaly alerts |
| GET | `/api/esports/events` | Match events |
| GET | `/api/esports/teams/:id` | Team data |
| GET | `/api/signals/:marketId` | Signal comparison |
| POST | `/api/ai/analyze` | Trigger LLM analysis |
| GET | `/api/ai/analysis/:id` | Get analysis result |
| GET | `/api/ai/config/keys` | Key status list |
| PUT | `/api/ai/config/keys/:provider` | Set API key |
| POST | `/api/ai/config/test/:provider` | Test connectivity |
| GET | `/api/ai/config/usage` | Quota usage |
| GET | `/api/ai/stats/leaderboard` | LLM leaderboard |
| GET | `/api/ai/stats/user` | User stats |
| GET | `/api/ai/stats/history` | Betting history |
| GET | `/api/ai/stats/calibration/:provider` | Calibration data |

## Themes

- **Dark+** — shadcn/ui dark (`#0A0A0A` background)
- **Light+** — shadcn/ui light (`#FFFFFF` background)
- **Matrix** — Codex CLI green-on-black

## License

MIT

---

**PolyRader CS2** — Predict smarter. Bet wiser.
