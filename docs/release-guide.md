# Release & Auto-Update Guide

## CI/CD Overview

### CI Pipeline (`.github/workflows/ci.yml`)

Triggered on every push to `main` and every PR:

| Job | Description |
|-----|-------------|
| **Lint** | ESLint check on all packages |
| **Type Check** | TypeScript strict mode check |
| **Test** | Vitest tests (Core + Server + Web + E2E) |
| **Build Web** | Vite production build |
| **Cargo Check** | Rust compilation check for Tauri |

### Release Pipeline (`.github/workflows/release.yml`)

Triggered on tag push (`v*`):

| Step | Description |
|------|-------------|
| 1. Test | Run typecheck + test before releasing |
| 2. Build Tauri | Cross-compile for 4 targets |
| 3. Publish | Upload installers + `latest.json` to GitHub Release |

## How to Release

### 1. Set up signing keys (one-time)

```bash
# Generate signing key pair
npx @tauri-apps/cli signer generate -w ~/.tauri/polyrader-key

# Output:
# Public Key: <PUBKEY>
# Private Key written to: ~/.tauri/polyrader-key
```

### 2. Add GitHub secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/polyrader-key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you chose (empty if none) |

### 3. Enable updater in tauri.conf.json

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "<PUBKEY from step 1>"
    }
  }
}
```

### 4. Create a release

```bash
# Tag and push
git tag v0.2.0
git push origin v0.2.0

# CI will automatically:
# 1. Run tests
# 2. Build for macOS (ARM + Intel), Windows, Linux
# 3. Sign installers
# 4. Create GitHub Release with all assets
# 5. Upload latest.json for auto-updater
```

### 5. Verify release

Check the release page: `https://github.com/dutongxue/polyrader_cs2/releases`

Assets should include:
- `PolyRader-CS2_0.2.0_aarch64.dmg` (macOS Apple Silicon)
- `PolyRader-CS2_0.2.0_x64.dmg` (macOS Intel)
- `PolyRader-CS2_0.2.0_x64-setup.msi` (Windows)
- `PolyRader-CS2_0.2.0_amd64.AppImage` (Linux)
- `latest.json` (auto-updater manifest)

## Build Targets

| Platform | Target | Runner | Output |
|----------|--------|--------|--------|
| macOS ARM | `aarch64-apple-darwin` | `macos-latest` | `.dmg` |
| macOS Intel | `x86_64-apple-darwin` | `macos-latest` | `.dmg` |
| Windows | `x86_64-pc-windows-msvc` | `windows-latest` | `.msi` |
| Linux | `x86_64-unknown-linux-gnu` | `ubuntu-22.04` | `.AppImage` |

## Auto-Update Flow

```
App starts
  → checks https://github.com/.../releases/latest/download/latest.json
  → compares version with current
  → if newer: downloads signed installer
  → verifies signature with pubkey
  → prompts user to update
  → installs and restarts
```

## Troubleshooting

### Q: Release build fails with "TAURI_SIGNING_PRIVATE_KEY not set"

The `TAURI_SIGNING_PRIVATE_KEY` secret is required for signed builds. Without it, `latest.json` won't be generated and auto-update won't work.

### Q: macOS build fails with code signing error

For development releases, macOS builds are unsigned. Users need to right-click → Open to bypass Gatekeeper. For distribution, configure Apple Developer certificates.

### Q: Linux build fails on missing libraries

The workflow installs `libwebkit2gtk-4.1-dev` and other deps. If the Ubuntu image changes, update the `apt-get install` line.
