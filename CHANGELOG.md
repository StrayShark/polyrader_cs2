# Changelog

All notable changes to PolyRader CS2.

## [0.2.0] — 2026-06-18

### Tauri Desktop Migration
- Tauri 2.x desktop application framework (Rust + React WebView)
- Express server as Tauri sidecar process (HTTP + WebSocket on single port)
- Rust backend: sidecar lifecycle management, IPC bridge, system tray, config.json management
- First-run setup: native folder picker for data directory, auto-generated AES-256-GCM encryption key
- Keyboard shortcuts: Cmd+1-7 page navigation, Cmd+, settings
- Tauri Updater plugin for automatic updates
- Native notifications via Tauri notification plugin
- System tray with Show/Quit menu, minimize-to-tray support

### Infrastructure Changes
- **BREAKING**: Redis → LRU in-memory cache (lru-cache v11)
- **BREAKING**: Redis Pub/Sub → Node.js EventEmitter
- Database path: POLYRADER_DATA_DIR env (set by Tauri) or fallback to DATABASE_URL/cwd
- KeyManager: supports both hex and base64 encryption keys
- Encryption key source: POLYRADER_ENCRYPTION_KEY (Tauri) or ENCRYPTION_KEY (.env)
- Health check: removed Redis dependency, added LRU cache stats
- Migration runner: fixed chicken-and-egg _migrations table issue

### Frontend Changes
- Tauri IPC bridge: dynamic API/WS URL resolution based on sidecar port
- Setup page: first-run folder selection and initialization
- Sidecar-ready event listener: wait for backend before showing UI
- WS connection limits relaxed for single-user desktop mode (20/20 vs 100/10)

### Removed
- Docker Compose configuration
- Multi-stage Dockerfiles (server + web)
- .dockerignore
- Redis dependency (redis package)
- VITE_API_URL and VITE_WS_URL from .env.example

## [0.1.0] — 2025-06-17

### Core
- 6-factor prediction model: HLTV rank (20%), recent form (15%), lineup (20%), map pool (15%), head-to-head (10%), market sentiment (20%)
- LineupEngine: 5-dimension lineup evaluation (avgRating, impactScore, synergyScore, standinPenalty, roleCompleteness)
- PromptEngine: 4-layer prompt architecture (System/Context/Data/Output) with lineup data injection
- ResultAggregator: multi-LLM voting, weighted confidence, consensus detection (strong/moderate/weak/divergent)
- Kelly Criterion fund allocation with fractional Kelly (0.5x) and consensus-adjusted cap
- SettlementEngine: auto-settle bets after Polymarket market resolution
- StatsEngine: LLM accuracy, calibration curves (ECE), provider ranking
- SimulatedBettingEngine: 100 USDC per recommendation, auto-settlement
- WhaleScoringEngine: 4-dimension suspicious scoring (volume/timing/pattern/correlation)
- SignalComparisonEngine: multi-source deviation analysis, arbitrage detection, Brier score
- DailyDashboardEngine: 5-factor attention scoring (confidence/deviation/volume/whale/tier)
- KeyManager: AES-256-GCM encryption for API key storage

### Infrastructure
- SQLite database with 16 tables and 28 indexes
- Redis 7 caching with Pub/Sub
- Polymarket Gamma API client (market discovery)
- Polymarket CLOB API client (orderbook/trading)
- Polymarket WebSocket client (real-time prices)
- 6 LLM provider clients: OpenAI GPT-4o, Anthropic Claude 3.5, Google Gemini 2.0, DeepSeek V3, xAI Grok 2, Groq Llama 3.3
- HLTV crawler: rankings, matches, team data, map pool, lineups
- Anti-detection strategies for HLTV scraping

### API
- 20+ REST endpoints across 7 controllers
- WebSocket server with channel subscriptions, heartbeat, broadcast
- Cron jobs: Polymarket refresh (30min), HLTV pipeline (2h), rankings (6h), daily dashboard (00:05), settlement check (10min)

### Frontend
- 8 pages: Market Overview, Daily Dashboard, Match Analysis, Whale Tracking, Esports Analysis, Signal Comparison, AI Config, AI Stats
- 3 themes: Dark+ (shadcn/ui), Light+ (shadcn/ui), Matrix (Codex CLI)
- shadcn/ui components with Lucide icons
- Hash-based routing with React.lazy code splitting (17 chunks)
- Zustand stores: market, daily, whale, LLM
- WebSocket hook: 4-state connection, exponential backoff reconnection, auto-resubscribe
- ErrorBoundary + ToastProvider (4 types, auto-dismiss)
- Price flash animations (green/red) + whale pulse notification
- StatusBar with real-time connection state and latency

### DevOps
- Turborepo monorepo with npm workspaces
- Docker Compose: server + web + redis
- Multi-stage Dockerfiles (build + production)
- 41 unit tests across 7 engine test files
- TypeScript strict mode, zero type errors
