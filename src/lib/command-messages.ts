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

export const TABS: [string, string, string] = ['вкладка', 'вкладки', 'вкладок'];
export const GROUPS: [string, string, string] = ['группа', 'группы', 'групп'];
const GROUPS_WITH: [string, string, string] = ['группой', 'группами', 'группами'];

/** «3 вкладки». */
export const count = (n: number, forms: readonly [string, string, string]) =>
  `${n} ${plural(n, forms)}`;

const TRASH_NOTE = 'Её можно вернуть из корзины в течение 30 дней.';

/**
 * Text for a command result. `name` is the title of the group or space the command was about.
 * Commands with a visible result (opening a tab, editing a group) still get a short text.
 */
export function describeResponse(type: CommandType, response: CommandResponse, name = ''): string {
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
      case 'space-not-found':
        return 'Пространство не найдено — возможно, оно уже удалено.';
      case 'space-protected':
        return '«Входящие» не удаляются — сюда попадают свёрнутые вкладки.';
      case 'tab-not-found':
        return 'Ссылка не найдена — возможно, она уже удалена.';
      case 'tab-not-in-group':
        return 'Вкладка не в группе — усыпить можно только группу.';
      case 'tab-not-saveable':
        return 'Закреплённые и служебные вкладки остаются открытыми — сохраняются только сайты и файлы.';
      case 'not-in-trash':
        return 'В корзине этого уже нет — возможно, оно уже восстановлено.';
      default:
        return 'Действие не выполнено. Вкладки и ссылки остались на месте.';
    }
  }

  const { groups, tabs, failed, groupTitle } = response.result;
  const title = `«${name || groupTitle || 'Без названия'}»`;
  const failedNote = failed > 0 ? ` Не удалось: ${count(failed, TABS)} — ссылки сохранены.` : '';

  switch (type) {
    case 'collapseAll':
      return tabs === 0
        ? 'Сворачивать нечего — открыты только закреплённые и служебные вкладки.'
        : `Свёрнуто: ${count(groups, GROUPS)} · ${count(tabs, TABS)}. Ссылки сохранены во «Входящих».`;
    case 'sleepGroup':
      return `Группа ${title} уснула — ${count(tabs, TABS)}. Вкладки остались на месте.${failedNote}`;
    case 'stowGroup':
      return `${title} убрана в TabFlow. ${count(tabs, TABS)} ${plural(tabs, ['сохранена', 'сохранены', 'сохранены'])}.`;
    case 'restoreGroup':
      return `Группа ${title} восстановлена — ${count(tabs, TABS)}.${failedNote}`;
    case 'editGroup':
      return `Группа ${title} сохранена.`;
    case 'deleteGroup':
      return `Группа ${title} удалена. ${TRASH_NOTE}`;
    case 'deleteSpace':
      return groups === 0
        ? `Пространство ${title} удалено. Его можно вернуть из корзины в течение 30 дней.`
        : `Пространство ${title} удалено вместе с ${count(groups, GROUPS_WITH)}. Его можно вернуть из корзины в течение 30 дней.`;
    case 'deleteTab':
      return groups > 0
        ? `Последняя ссылка удалена вместе с группой ${title}. ${TRASH_NOTE}`
        : 'Ссылка удалена. Её можно вернуть из корзины в течение 30 дней.';
    case 'restoreDeleted':
      return `Восстановлено из корзины.${failedNote}`;
    case 'openTab':
      return 'Вкладка открыта.';
    case 'moveTab':
      return groups > 0
        ? `Ссылка перенесена в ${title}. Пустая группа удалена — её можно вернуть из корзины в течение 30 дней.${failedNote}`
        : `Ссылка перенесена в ${title}.${failedNote}`;
    case 'stowCurrent':
      return groups > 0
        ? `${title} убрана в TabFlow. ${count(tabs, TABS)} ${plural(tabs, ['сохранена', 'сохранены', 'сохранены'])}.`
        : `Вкладка убрана в TabFlow — в группу ${title}.`;
    case 'sleepCurrent':
      return `Группа ${title} уснула — ${count(tabs, TABS)}. Вкладки остались на месте.${failedNote}`;
    case 'sleepInactive':
      return groups === 0
        ? 'Усыплять нечего — других активных групп нет.'
        : `Уснули: ${count(groups, GROUPS)} · ${count(tabs, TABS)}. Вкладки остались на месте.${failedNote}`;
    case 'stowSelected':
      return `${count(tabs, TABS)} ${plural(tabs, ['убрана', 'убраны', 'убраны'])} в TabFlow — группа ${title}.`;
    case 'saveToGroup':
      return `Вкладка сохранена в ${title}.`;
    case 'saveLink':
      return tabs === 0
        ? `Ссылка уже есть в ${title}.`
        : `Ссылка сохранена в ${title}.${failedNote}`;
    case 'openApp':
      return 'TabFlow открыт.';
  }
}
