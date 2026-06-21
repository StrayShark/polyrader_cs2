import { useState } from 'react';
import { selectFolder, setDataDir } from '../utils/tauri-bridge';
import { isTauriEnvironment } from '../utils/tauri-bridge';
import { useI18n } from '../hooks/use-i18n';

interface SetupPageProps {
  onComplete: () => void;
}

export function SetupPage({ onComplete }: SetupPageProps) {
  const [selectedDir, setSelectedDir] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  const handleSelectFolder = async () => {
    setError(null);
    const dir = await selectFolder();
    if (dir) {
      setSelectedDir(dir);
    }
  };

  const handleStart = async () => {
    if (!selectedDir) return;
    setLoading(true);
    setError(null);
    try {
      await setDataDir(selectedDir);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('setup.failed'));
    } finally {
      setLoading(false);
    }
  };

  const isTauri = isTauriEnvironment();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Logo / Title */}
        <div className="space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <svg
              className="h-8 w-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">PolyRader CS2</h1>
          <p className="text-sm text-muted-foreground">
            {t('setup.appTitle')}
          </p>
        </div>

        {/* Setup card */}
        <div className="rounded-lg border border-border bg-card p-6 text-left space-y-4">
          <h2 className="text-lg font-semibold">{t('setup.firstSetup')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('setup.description')}
          </p>

          {/* Folder selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('setup.dataFolder')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={selectedDir || (isTauri ? t('setup.selectFolderPlaceholder') : '~/Documents/PolyRader')}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground"
                placeholder={t('setup.selectFolderButton')}
              />
              {isTauri && (
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
                >
                  {t('setup.select')}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={loading || (isTauri && !selectedDir)}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? t('setup.initializing') : t('setup.start')}
          </button>

          {!isTauri && (
            <p className="text-xs text-muted-foreground text-center">
              {t('setup.browserMode')}
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground">
          {t('setup.tagline')}
        </p>
      </div>
    </div>
  );
}
