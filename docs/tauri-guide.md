# Tauri 桌面应用开发指南

本文档描述 PolyRader CS2 桌面应用的开发、调试和打包流程。

## 架构概览

```
┌─────────────────────────────────────────┐
│            Tauri WebView               │
│         (React + Vite 前端)              │
│                                         │
│  ┌───────────┐  ┌──────────────────┐   │
│  │ IPC Bridge │  │ HTTP + WebSocket │   │
│  │ (Tauri)   │  │ (localhost:13001) │   │
│  └─────┬─────┘  └────────┬─────────┘   │
└────────┼─────────────────┼─────────────┘
         │                 │
         ▼                 ▼
┌────────────────┐  ┌──────────────────┐
│  Tauri (Rust)  │  │  Express Sidecar  │
│                │  │                   │
│  - Sidecar 启动│  │  - REST API       │
│  - 系统托盘    │  │  - WebSocket 推送  │
│  - 文件对话框  │  │  - SQLite 数据库   │
│  - 通知推送    │  │  - LRU 缓存       │
│  - config.json│  │  - Polymarket/LLM  │
└────────────────┘  └──────────────────┘
```

### 数据流

1. **启动**：Tauri → 读取 `config.json` → 启动 Express sidecar → 通知前端 `sidecar-ready`
2. **API 请求**：前端 → `http://localhost:{port}/api/*` → Express → Polymarket/LLM/DB
3. **WebSocket**：前端 → `ws://localhost:{port}` → 实时价格/巨鲸交易推送
4. **IPC**：前端 → Tauri `invoke()` → 文件选择、通知、配置管理

## 开发模式

### 启动 Tauri 开发服务器

```bash
npm run tauri:dev
```

此命令会：
1. 启动 Vite dev server（`localhost:5173`）
2. 编译 Rust 代码
3. 启动 Express sidecar（`localhost:13001`）
4. 打开 Tauri 窗口加载 `http://localhost:5173`
5. Vite proxy 将 `/api/*` 和 `/ws` 转发到 sidecar

### 仅 Web 开发（无 Tauri）

```bash
npm run dev:web
```

此模式下前端以浏览器模式运行，API 请求通过 Vite proxy 转发到 `localhost:3001`。

## 首次启动流程

```
用户首次打开应用
  │
  ├── 读取 config.json
  │     └── first_run_completed = false
  │
  ├── 显示 SetupPage
  │     ├── Step 1: 配置 LLM API Key（可选跳过）
  │     ├── Step 2: 确认数据源（全部预配置）
  │     ├── Step 3: 选择数据存储文件夹
  │     └── Step 4: 确认 → 保存 config.json
  │
  ├── 生成加密密钥（AES-256-GCM）
  ├── 启动 Express sidecar
  ├── sidecar-ready 事件 → 显示主界面
  └── 后续启动直接跳过 Setup
```

## 配置文件

### config.json

位置：用户选择的数据文件夹内。

```json
{
  "data_dir": "/Users/username/PolyRader",
  "first_run_completed": true,
  "sidecar_port": 13001,
  "encryption_key": "<base64-encoded-key>"
}
```

### tauri.conf.json

关键配置项：

| 配置 | 说明 |
|------|------|
| `app.windows[0].title` | 窗口标题 |
| `app.windows[0].width/height` | 初始尺寸（1440×900） |
| `app.security.csp` | CSP 白名单（允许 localhost:13001） |
| `bundle.identifier` | 应用唯一标识 |
| `bundle.targets` | 打包目标（dmg/nsis/appimage） |
| `plugins.updater` | 自动更新（需配置公钥后启用） |

## 打包

### 构建桌面安装包

```bash
npm run tauri:build
```

产出文件位于 `src-tauri/target/release/bundle/`：

| 平台 | 产出 |
|------|------|
| macOS | `.dmg` + `.app` |
| Windows | `.msi` + `.exe`（NSIS） |
| Linux | `.AppImage` + `.deb` |

### 启用自动更新

1. 生成签名密钥对：
   ```bash
   npx @tauri-apps/cli signer generate -w ~/.tauri/polyrader-key
   ```
2. 将公钥填入 `tauri.conf.json` 的 `plugins.updater.pubkey`
3. 将 `plugins.updater.active` 改为 `true`
4. 私钥设置到 CI 环境变量 `TAURI_SIGNING_PRIVATE_KEY`
5. 发布时 CI 自动生成 `latest.json` 和签名安装包

## Tauri IPC 命令

前端通过 `@tauri-apps/api` 的 `invoke()` 调用 Rust 端命令：

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_sidecar_port` | — | `number` | 获取 sidecar 端口号 |
| `get_config` | — | `Config` | 读取 config.json |
| `set_data_dir` | `path: string` | `void` | 设置数据目录 |
| `select_folder` | — | `string \| null` | 打开文件夹选择器 |
| `is_first_run` | — | `boolean` | 是否首次启动 |

前端通过 `tauri-bridge.ts` 统一封装，浏览器模式下自动降级。

## 系统托盘

应用关闭窗口时最小化到系统托盘（不退出）：

- 左键点击托盘图标：显示/隐藏窗口
- 右键菜单：显示窗口 / 退出
- 托盘图标：`src-tauri/icons/icon.png`

## 侧边栏快捷键

| 快捷键 | 动作 |
|--------|------|
| `Cmd/Ctrl + 1` | 市场总览 |
| `Cmd/Ctrl + 2` | 每日看板 |
| `Cmd/Ctrl + 3` | 巨鲸追踪 |
| `Cmd/Ctrl + 4` | 赛事分析 |
| `Cmd/Ctrl + 5` | 信号对比 |
| `Cmd/Ctrl + 6` | AI 配置 |
| `Cmd/Ctrl + 7` | AI 统计 |
| `Cmd/Ctrl + ,` | 设置 |

## 调试

### Rust 端日志

Rust 端使用 `eprintln!` 输出日志，在终端中可见。

### 前端 DevTools

Tauri 开发模式下自动启用 DevTools（`Cmd+Option+I`）。

### Sidecar 日志

Sidecar stdout 被 Tauri 捕获，通过 `sidecar-error` 事件转发到前端。

### 数据库

SQLite 数据库位于数据文件夹内 `polyrader.db`，可使用 DB Browser for SQLite 查看。

## 常见问题

### Q: `tauri:dev` 启动失败，提示找不到 Cargo

确保 Rust 已安装：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### Q: Sidecar 端口被占用

修改 `src-tauri/src/lib.rs` 中的默认端口（`13001`），同时更新 `tauri.conf.json` 的 CSP 白名单。

### Q: 打包后应用无法启动

检查 `tauri.conf.json` 的 `bundle.identifier` 是否唯一，CSP 是否包含 sidecar 端口。
