import { Languages } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { Button } from './ui';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-xs"
      onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
      title={t('lang.switch')}
    >
      <Languages className="h-3.5 w-3.5" />
      {locale === 'zh' ? 'EN' : '中文'}
    </Button>
  );
}
