import type { WsStatus } from '../hooks/use-websocket';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '@/utils/cn';

interface ConnectionStatusProps {
  status: WsStatus;
  showText?: boolean;
}

const dotConfig: Record<WsStatus, { bg: string; pulse: boolean }> = {
  connected: { bg: 'bg-green', pulse: false },
  connecting: { bg: 'bg-yellow', pulse: true },
  disconnected: { bg: 'bg-red', pulse: false },
};

export function ConnectionStatus({ status, showText = true }: ConnectionStatusProps) {
  const { t } = useI18n();
  const config = dotConfig[status];

  return (
    <span className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              config.bg,
            )}
          />
        )}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', config.bg)} />
      </span>
      {showText && (
        <span className="text-[10px] md:text-[11px] text-status-bar-foreground">
          {t(`connectionStatus.${status}`)}
        </span>
      )}
    </span>
  );
}
