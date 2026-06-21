/**
 * Tauri IPC Bridge — provides sidecar port, data dir, and config to the frontend.
 * Falls back gracefully when running in a regular browser (non-Tauri).
 */

import { t } from './i18n';

interface AppConfig {
  version: string;
  data_dir: string | null;
  encryption_key: string | null;
  sidecar_port: number;
  theme: string;
  language: string;
  auto_start: boolean;
  minimize_to_tray: boolean;
  first_run_completed: boolean;
}

let cachedPort: number | null = null;
let cachedConfig: AppConfig | null = null;
let isTauriEnv = false;

async function isTauri(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  // Check for Tauri API availability
  if ('__TAURI_INTERNALS__' in window) {
    isTauriEnv = true;
    return true;
  }
  return false;
}

export async function getSidecarPort(): Promise<number> {
  if (cachedPort !== null) return cachedPort;

  if (await isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      cachedPort = await invoke<number>('get_sidecar_port');
      return cachedPort;
    } catch {
      // Fallback: try env-based detection
    }
  }

  // Non-Tauri: use Vite proxy (relative paths work)
  cachedPort = 0;
  return cachedPort;
}

export async function getApiBase(): Promise<string> {
  const port = await getSidecarPort();
  if (port > 0) {
    return `http://localhost:${port}/api`;
  }
  // In dev mode with Vite proxy, use relative path
  return '/api';
}

export async function getWsUrl(): Promise<string> {
  const port = await getSidecarPort();
  if (port > 0) {
    return `ws://localhost:${port}`;
  }
  // In dev mode with Vite proxy
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export async function getConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;

  if (await isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      cachedConfig = await invoke<AppConfig>('get_config');
      return cachedConfig;
    } catch {
      // fallback
    }
  }

  cachedConfig = {
    version: '0.2.0',
    data_dir: null,
    encryption_key: null,
    sidecar_port: 0,
    theme: 'dark',
    language: 'zh-CN',
    auto_start: false,
    minimize_to_tray: false,
    first_run_completed: true, // non-Tauri always "completed"
  };
  return cachedConfig;
}

export async function setDataDir(dir: string): Promise<AppConfig> {
  if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    cachedConfig = await invoke<AppConfig>('set_data_dir', { dir });
    return cachedConfig;
  }
  return getConfig();
}

export async function updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    cachedConfig = await invoke<AppConfig>('set_config', { updates });
    return cachedConfig;
  }
  return getConfig();
}

export async function selectFolder(): Promise<string | null> {
  if (await isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: t('tauri.selectDataFolder') });
      return selected as string | null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function isFirstRun(): Promise<boolean> {
  const config = await getConfig();
  return !config.first_run_completed;
}

/**
 * Restart the sidecar process. Used after changing data directory or encryption key.
 * Returns the new port, or 0 if not in Tauri environment.
 */
export async function restartSidecar(): Promise<number> {
  if (await isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    cachedPort = null; // Invalidate cached port
    const port = await invoke<number>('restart_sidecar');
    cachedPort = port;
    return port;
  }
  return 0;
}

export function isTauriEnvironment(): boolean {
  return isTauriEnv;
}

/**
 * Listen for Tauri events from the Rust backend.
 */
export async function onTauriEvent<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (await isTauri()) {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<T>(event, (e) => handler(e.payload));
    return unlisten;
  }
  return () => {};
}
