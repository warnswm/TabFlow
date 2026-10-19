/**
 * Interface language: Russian or English. Texts live next to the code that shows them, as
 * `localized({ ru, en })` — TypeScript checks that the English texts have the same shape.
 *
 * One current language per page (and one in the background). The settings page offers «Как в
 * Chrome» (default: Russian for a Russian Chrome, English for any other), «Русский», «English»;
 * a page remounts when it changes (`LanguageRoot`), the background redraws the menu and the badge.
 */

export const LANGUAGES = ['ru', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** What the settings page stores: a language, or `auto` — the language of Chrome. */
export const LANGUAGE_SETTINGS = ['auto', 'ru', 'en'] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

export function parseLanguageSetting(value: unknown): LanguageSetting {
  return LANGUAGE_SETTINGS.includes(value as LanguageSetting) ? (value as LanguageSetting) : 'auto';
}

/** `auto`: Russian for a Russian Chrome (`ru`, `ru-RU`), English for any other. */
export function resolveLanguage(setting: LanguageSetting, browserLanguage: string): Language {
  if (setting !== 'auto') return setting;
  return browserLanguage.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

let current: Language = 'ru';
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  if (language === current) return;
  current = language;
  for (const listener of listeners) listener();
}

/** Calls back when the language changes; returns the unsubscribe function. */
export function onLanguageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Texts in both languages; the returned function gives the texts of the current language. */
export function localized<T>(texts: { ru: T; en: NoInfer<T> }): () => T {
  return () => texts[current];
}
