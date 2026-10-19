/**
 * Words used all over the interface: counted nouns («3 вкладки» / “3 tabs”), quotes, untitled,
 * the default space. Russian has three plural forms, English two.
 */
import { localized } from './index';

/** Russian plural: 1 вкладка, 2 вкладки, 5 вкладок. */
export function pluralRu(n: number, [one, few, many]: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** English plural: 1 tab, 2 tabs. */
export function pluralEn(n: number, [one, other]: readonly [string, string]): string {
  return n === 1 ? one : other;
}

const ru = (forms: [string, string, string]) => (n: number) => `${n} ${pluralRu(n, forms)}`;
const en = (forms: [string, string]) => (n: number) => `${n} ${pluralEn(n, forms)}`;

/** The name of the default space in either language: it follows the language unless renamed. */
export const INBOX_NAMES = ['Входящие', 'Inbox'] as const;

export const words = localized({
  ru: {
    tabs: ru(['вкладка', 'вкладки', 'вкладок']),
    /** The noun alone, after a number shown apart: «вкладки». */
    tabNoun: (n: number) => pluralRu(n, ['вкладка', 'вкладки', 'вкладок']),
    groups: ru(['группа', 'группы', 'групп']),
    links: ru(['ссылка', 'ссылки', 'ссылок']),
    videos: (n: number) => `${n} видео`,
    spaces: ru(['пространство', 'пространства', 'пространств']),
    layouts: ru(['раскладка', 'раскладки', 'раскладок']),
    sites: ru(['сайт', 'сайта', 'сайтов']),
    /** «Учёба» in the language's quotes. */
    quote: (text: string) => `«${text}»`,
    untitled: 'Без названия',
    inbox: 'Входящие',
    /** Joins a list: «#1, #2 и #3». */
    and: 'и',
  },
  en: {
    tabs: en(['tab', 'tabs']),
    tabNoun: (n: number) => pluralEn(n, ['tab', 'tabs']),
    groups: en(['group', 'groups']),
    links: en(['link', 'links']),
    videos: en(['video', 'videos']),
    spaces: en(['space', 'spaces']),
    layouts: en(['layout', 'layouts']),
    sites: en(['site', 'sites']),
    quote: (text: string) => `“${text}”`,
    untitled: 'Untitled',
    inbox: 'Inbox',
    and: 'and',
  },
});
