# PolyRader CS2 — 项目规范

## 技术栈

- **Monorepo**: npm workspaces + turbo
- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + Tauri 2
- **后端**: Express + TypeScript + better-sqlite3
- **核心引擎**: 纯 TypeScript（无外部依赖），packages/core
- **测试**: vitest（单元/集成）+ Playwright（E2E）
- **桌面打包**: Tauri 2（Rust + esbuild sidecar bundle）

## 包结构

```
packages/
  core/    — 纯 TS 引擎（预测、评分、分析、状态机等）
  infra/   — API 客户端（Polymarket/Polygon）、DB 仓库、迁移
  server/  — Express API、cron 定时任务、WebSocket、SSE
  web/     — React SPA + Tauri 前端
src-tauri/ — Rust 桌面壳
```

## 开发规范

### 命令

| 任务 | 命令 |
|------|------|
| 运行全部单元测试 | `npm run test` |
| 运行单个包测试 | `cd packages/<pkg> && npx vitest run` |
| 运行 E2E 测试 | `cd packages/web && npx playwright test` |
| 类型检查 | `npm run typecheck` |
| Lint | `npm run lint` |
| 构建前端 | `npm run build:web` |
| 构建 server bundle | `npm run build:server` |
| Tauri 开发模式 | `npm run tauri:dev` |
| Tauri 打包 | `npm run tauri:build` |

### 代码规范

- **strict TypeScript**: `tsconfig.base.json` 开启 `strict`、`noUnusedLocals`、`noUnusedParameters`，禁止 `any`（warn）
- **错误处理**: 所有 async 边界必须 try/catch；不得吞掉错误（空 catch 必须有注释说明原因）
- **DB 查询**: 必须使用参数化查询（`?` 占位符），禁止字符串拼接 SQL
- **null 安全**: 使用 `??` 处理 null/undefined；用 `Number.isFinite()` 守卫 NaN；不要用 `?? 0` 兜底可能为 NaN 的 parseFloat 结果
- **前端防御性渲染**: 对可选字段使用 `?.` + `?? '--'`；不要对可能为 undefined 的数值直接调 `.toFixed()`
- **i18n**: 所有用户可见文本必须通过 `t('key')` 调用，zh + en 字典同步维护

### 提交规范

- 仅在用户明确要求时才创建 commit
- 不要 commit `.env`、`credentials.json` 等敏感文件
- 不要执行 `git push --force`（除非用户明确要求）

---

## 强制：任务完成后自动审查与下一步建议

**每次完成开发任务后，必须执行以下流程：**

### 1. 运行验证

完成代码修改后，必须运行以下命令验证（根据改动范围选择）：

```bash
# 改动了 core/infra/server
cd packages/<pkg> && npx vitest run

# 改动了 web（单元测试）
cd packages/web && npx vitest run

# 改动了 web 页面/组件
cd packages/web && npx playwright test --reporter=line

# 改动了 Rust 代码
cd src-tauri && cargo check

# 全量验证
npm run test && cd packages/web && npx playwright test --reporter=line
```

### 2. 生成进度审查

验证通过后，输出一份简明的进度审查报告，格式如下：

```
## 任务完成审查

### 本次完成
- [简述完成的任务]

### 测试状态
| 测试类型 | 数量 | 状态 |
|----------|------|------|
| core vitest | N | ✅/❌ |
| infra vitest | N | ✅/❌ |
| server vitest | N | ✅/❌ |
| web vitest | N | ✅/❌ |
| Playwright E2E | N | ✅/❌ |
| Rust cargo check | — | ✅/❌ |

### 修改的文件
- file1.ts — 简述改动
- file2.rs — 简述改动
```

### 3. 给出下一步建议

在进度审查报告之后，必须基于当前项目状态给出下一步建议。建议格式：

```
### 下一步建议

按优先级排列：

1. **[优先级]** [任务名] — [简述原因]
2. **[优先级]** [任务名] — [简述原因]
3. **[优先级]** [任务名] — [简述原因]
```

判断下一步建议时，检查以下维度：

- **确定性缺陷**: tsc 编译错误、ESLint error、运行时崩溃
- **测试缺口**: 无测试的核心模块、E2E 未覆盖的关键页面
- **数据正确性**: 数据丢失、ID 不匹配、NaN 传播
- **资源泄漏**: 定时器/连接/内存未清理
- **安全**: 信息泄漏、输入未验证
- **分发就绪**: Tauri 打包完整性、CI 配置
- **功能完整度**: PRD 中标注但未实现的功能

优先级标记：
- **P0-必须**: 编译失败、运行时崩溃、数据丢失
- **P1-高**: 测试缺口（核心模块无测试）、安全问题
- **P2-中**: E2E 覆盖不足、体验优化、lint 违规
- **P3-低**: 增强功能、未来规划
