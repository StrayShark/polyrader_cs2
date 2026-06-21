/**
 * Check for app updates via Tauri updater plugin.
 * In non-Tauri environments, this is a no-op.
 */

import { isTauriEnvironment } from './tauri-bridge';

let checked = false;

export async function checkForUpdates(): Promise<void> {
  if (!isTauriEnvironment() || checked) return;
  checked = true;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (update?.available) {
      console.log(`[Updater] Update available: ${update.version}`);
      // The Tauri updater dialog (configured with dialog: true) will handle
      // showing the update prompt automatically. This hook is for logging
      // and future programmatic update flows.
    } else {
      console.log('[Updater] App is up to date');
    }
  } catch (err) {
    // Silently fail — update check is non-critical
    console.warn('[Updater] Failed to check for updates:', err);
  }
}
