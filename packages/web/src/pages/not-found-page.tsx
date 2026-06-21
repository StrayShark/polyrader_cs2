import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <FileQuestion className="h-16 w-16 text-muted-foreground" />
      <h1 className="mt-6 text-2xl font-semibold">404</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('notFound.title')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('notFound.description')}</p>
      <Link
        to="/"
        className="mt-6 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('notFound.backHome')}
      </Link>
    </div>
  );
}
