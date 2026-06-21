import { Component, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { t } from '../utils/i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: { componentStack: string } | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
    this.setState({ errorInfo: info });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[300px] items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red/10">
              <AlertCircle className="h-8 w-8 text-red" />
            </div>
            <div>
              <div className="text-lg font-semibold">{t('error.title')}</div>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                {this.state.error?.message ?? t('error.unknown')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('common.retry')}
              </button>
              <button
                onClick={this.handleReload}
                className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
              >
                {t('error.reloadPage')}
              </button>
            </div>
            {this.state.errorInfo?.componentStack && (
              <details className="mt-2 max-w-2xl w-full text-left">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {t('error.viewDetails')}
                </summary>
                <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  {this.state.error?.stack}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
