/** Dates and relative times in the interface language, local time. */
import type { Timestamp } from '../db/models';
import { localized } from '../i18n';
import { pluralRu } from '../i18n/words';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const text = localized({
  ru: {
    months: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
    /** «16 окт» */
    day: (day: number, month: string) => `${day} ${month}`,
    /** «16 окт 2025» */
    dayInYear: (day: string, year: number) => `${day} ${year}`,
    justNow: 'только что',
    minutesAgo: (n: number) => `${n} мин назад`,
    hoursAgo: (n: number) => `${n} ч назад`,
    yesterday: 'вчера',
    daysAgo: (n: number) => `${n} ${pluralRu(n, ['день', 'дня', 'дней'])} назад`,
  },
  en: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    day: (day: number, month: string) => `${month} ${day}`,
    dayInYear: (day: string, year: number) => `${day}, ${year}`,
    justNow: 'just now',
    minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} h ago`,
    yesterday: 'yesterday',
    daysAgo: (n: number) => `${n} ${n === 1 ? 'day' : 'days'} ago`,
  },
});

/** «16 окт» / “Oct 16” — day and month only. */
export function dayAndMonth(time: Timestamp): string {
  const date = new Date(time);
  const { months, day } = text();
  return day(date.getDate(), months[date.getMonth()] ?? '');
}

/** «16 окт», with the year when it is not the current one: «16 окт 2025» / “Oct 16, 2025”. */
export function shortDate(time: Timestamp, now: Timestamp): string {
  const date = new Date(time);
  const day = dayAndMonth(time);
  return date.getFullYear() === new Date(now).getFullYear()
    ? day
    : text().dayInYear(day, date.getFullYear());
}

/** «16 окт, 23:40» / “Oct 16, 23:40” — the name of a group made by «Свернуть всё». */
export function dateAndTime(time: Timestamp): string {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dayAndMonth(time)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Midnight of the day `time` falls on. */
function startOfDay(time: Timestamp): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * «только что», «5 мин назад», «2 ч назад», «вчера», «3 дня назад», then a date.
 * Hours are used within the same calendar day; days count calendar days.
 */
export function timeAgo(time: Timestamp, now: Timestamp): string {
  const t = text();
  const diff = Math.max(0, now - time);
  if (diff < MINUTE_MS) return t.justNow;
  if (diff < HOUR_MS) return t.minutesAgo(Math.floor(diff / MINUTE_MS));

  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
  if (days === 0) return t.hoursAgo(Math.floor(diff / HOUR_MS));
  if (days === 1) return t.yesterday;
  if (days < 7) return t.daysAgo(days);
  return shortDate(time, now);
}

/** Whole days left until `until`, at least 0: «ещё 27 дн.» in the trash. */
export function daysLeft(until: Timestamp, now: Timestamp): number {
  return Math.max(0, Math.ceil((until - now) / DAY_MS));
}
