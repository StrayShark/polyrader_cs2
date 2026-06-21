import { type ReactNode } from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';

interface Props {
  children: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  emptyIcon?: ReactNode;
  emptyAction?: { label: string; onClick: () => void };
  error?: string | null;
  onRetry?: () => void;
  /** Custom skeleton layout (uses Skeleton component). If provided, shown during loading instead of spinner */
  skeleton?: ReactNode;
}

export function DataState({
  children,
  isLoading,
  isEmpty,
  emptyText,
  emptyIcon,
  emptyAction,
  error,
  onRetry,
  skeleton,
}: Props) {
  const { t } = useI18n();
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red/10">
          <AlertCircle className="h-6 w-6 text-red" />
        </div>
        <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t('common.retry')}
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    if (skeleton) return <>{skeleton}</>;
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {emptyIcon ?? <Inbox className="h-6 w-6 text-muted-foreground" />}
        </div>
        <p className="text-sm text-muted-foreground">{emptyText ?? t('common.noData')}</p>
        {emptyAction && (
          <Button variant="outline" size="sm" onClick={emptyAction.onClick}>
            {emptyAction.label}
          </Button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
