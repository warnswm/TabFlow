/** Dates and relative times in Russian, local time. */
import { plural } from '../command-messages';
import type { Timestamp } from '../db/models';

export const MONTHS_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
] as const;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const DAYS: [string, string, string] = ['день', 'дня', 'дней'];

/** «16 окт», with the year when it is not the current one: «16 окт 2025». */
export function shortDate(time: Timestamp, now: Timestamp): string {
  const date = new Date(time);
  const day = `${date.getDate()} ${MONTHS_RU[date.getMonth()]}`;
  return date.getFullYear() === new Date(now).getFullYear() ? day : `${day} ${date.getFullYear()}`;
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
  const diff = Math.max(0, now - time);
  if (diff < MINUTE_MS) return 'только что';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} мин назад`;

  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
  if (days === 0) return `${Math.floor(diff / HOUR_MS)} ч назад`;
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} ${plural(days, DAYS)} назад`;
  return shortDate(time, now);
}

/** Whole days left until `until`, at least 0: «ещё 27 дн.» in the trash. */
export function daysLeft(until: Timestamp, now: Timestamp): number {
  return Math.max(0, Math.ceil((until - now) / DAY_MS));
}
