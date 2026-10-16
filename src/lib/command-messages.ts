/**
 * Texts for command results, in the brand voice: fact → consequence, no address, no exclamations,
 * always say that nothing is lost. RU only for now; EN comes with i18n.
 */
import type { CommandResponse, CommandType } from './messages';

/** Russian plural: 1 вкладка, 2 вкладки, 5 вкладок. */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const TABS: [string, string, string] = ['вкладка', 'вкладки', 'вкладок'];
const GROUPS: [string, string, string] = ['группа', 'группы', 'групп'];

const count = (n: number, forms: [string, string, string]) => `${n} ${plural(n, forms)}`;

export function describeResponse(
  type: CommandType,
  response: CommandResponse,
  groupTitle = '',
): string {
  if (!response.ok) {
    switch (response.code) {
      case 'group-not-found':
        return 'Группа не найдена — возможно, она уже удалена.';
      case 'group-not-on-tab-strip':
        return 'Группа убрана в TabFlow — усыпить можно только группу на панели вкладок.';
      case 'group-empty':
        return 'В группе нет вкладок — восстанавливать нечего.';
      case 'restore-failed':
        return 'Не удалось восстановить вкладки — страницы недоступны. Ссылки сохранены.';
      default:
        return 'Действие не выполнено. Вкладки и ссылки остались на месте.';
    }
  }

  const { groups, tabs, failed } = response.result;
  const name = `«${groupTitle || 'Без названия'}»`;
  const failedNote = failed > 0 ? ` Не удалось: ${count(failed, TABS)} — ссылки сохранены.` : '';

  switch (type) {
    case 'collapseAll':
      return tabs === 0
        ? 'Сворачивать нечего — открыты только закреплённые и служебные вкладки.'
        : `Свёрнуто: ${count(groups, GROUPS)} · ${count(tabs, TABS)}. Ссылки сохранены во «Входящих».`;
    case 'sleepGroup':
      return `Группа ${name} уснула — ${count(tabs, TABS)}. Вкладки остались на месте.${failedNote}`;
    case 'stowGroup':
      return `${name} убрана в TabFlow. ${count(tabs, TABS)} ${plural(tabs, ['сохранена', 'сохранены', 'сохранены'])}.`;
    case 'restoreGroup':
      return `Группа ${name} восстановлена — ${count(tabs, TABS)}.${failedNote}`;
  }
}
