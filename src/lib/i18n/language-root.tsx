import { type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { getLanguage, onLanguageChange } from './index';

/**
 * Renders the page in the current language and remounts it when the language changes, so every
 * text is read again. The language changes rarely (settings page), the state of the page is cheap.
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(onLanguageChange, getLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <LanguageScope key={language}>{children}</LanguageScope>;
}

function LanguageScope({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
