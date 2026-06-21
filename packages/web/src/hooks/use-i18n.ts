import { useSyncExternalStore } from 'react';
import { getLocale, setLocale, subscribeLocale, t, type Locale } from '../utils/i18n';

export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);

  return {
    locale,
    setLocale,
    t,
  };
}

export type { Locale };
