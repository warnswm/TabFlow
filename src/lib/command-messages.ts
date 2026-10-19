/**
 * Texts for command results, in the brand voice: fact → consequence, no address, no exclamations,
 * always say that nothing is lost. Russian and English (`i18n`).
 */
import { localized } from './i18n';
import { pluralRu, words } from './i18n/words';
import type {
  CommandErrorCode,
  CommandResponse,
  CommandType,
  ImportReport,
  QueuedVideo,
} from './messages';

type ErrorTexts = Record<Exclude<CommandErrorCode, 'invalid-backup'>, string>;

const errorsRu: ErrorTexts = {
  'invalid-command': 'Действие не выполнено. Вкладки и ссылки остались на месте.',
  'group-not-found': 'Группа не найдена — возможно, она уже удалена.',
  'group-not-on-tab-strip':
    'Группа убрана в TabFlow — усыпить можно только группу на панели вкладок.',
  'group-empty': 'В группе нет вкладок — восстанавливать нечего.',
  'restore-failed': 'Не удалось восстановить вкладки — страницы недоступны. Ссылки сохранены.',
  'space-not-found': 'Пространство не найдено — возможно, оно уже удалено.',
  'space-protected': '«Входящие» не удаляются — сюда попадают свёрнутые вкладки.',
  'tab-not-found': 'Ссылка не найдена — возможно, она уже удалена.',
  'tab-not-in-group': 'Вкладка не в группе — усыпить можно только группу.',
  'tab-not-saveable':
    'Закреплённые и служебные вкладки остаются открытыми — сохраняются только сайты и файлы.',
  'not-in-trash': 'В корзине этого уже нет — возможно, оно уже восстановлено.',
  'page-not-queueable':
    'В очередь попадают только сайты и файлы — служебные страницы браузера остаются как есть.',
  'video-not-found': 'Видео не найдено — возможно, оно уже удалено из очереди.',
  unexpected: 'Действие не выполнено. Вкладки и ссылки остались на месте.',
};

const errorsEn: ErrorTexts = {
  'invalid-command': 'Nothing was done. Tabs and links stay where they are.',
  'group-not-found': 'Group not found — it may have been deleted already.',
  'group-not-on-tab-strip':
    'The group is stowed in TabFlow — only a group on the tab strip can be put to sleep.',
  'group-empty': 'The group has no tabs — nothing to restore.',
  'restore-failed': 'Couldn’t restore the tabs — pages unavailable. Links are saved.',
  'space-not-found': 'Space not found — it may have been deleted already.',
  'space-protected': 'Inbox stays — collapsed tabs go there.',
  'tab-not-found': 'Link not found — it may have been deleted already.',
  'tab-not-in-group': 'The tab is not in a group — only a group can be put to sleep.',
  'tab-not-saveable': 'Pinned and browser tabs stay open — only sites and files are saved.',
  'not-in-trash': 'It is no longer in Trash — it may have been restored already.',
  'page-not-queueable': 'Only sites and files go to the queue — browser pages stay as they are.',
  'video-not-found': 'Video not found — it may have been removed from the queue already.',
  unexpected: 'Nothing was done. Tabs and links stay where they are.',
};

const text = localized({
  ru: {
    errors: errorsRu,
    failedNote: (n: number) => ` Не удалось: ${words().tabs(n)} — ссылки сохранены.`,
    collapseNothing: 'Сворачивать нечего — открыты только закреплённые и служебные вкладки.',
    collapsed: (groups: number, tabs: number) =>
      `Свёрнуто: ${words().groups(groups)} · ${words().tabs(tabs)}. Ссылки сохранены во «Входящих».`,
    asleep: (title: string, tabs: number) =>
      `Группа ${title} уснула — ${words().tabs(tabs)}. Вкладки остались на месте.`,
    stowed: (title: string, tabs: number) =>
      `${title} убрана в TabFlow. ${words().tabs(tabs)} ${pluralRu(tabs, ['сохранена', 'сохранены', 'сохранены'])}.`,
    restored: (title: string, tabs: number) =>
      `Группа ${title} восстановлена — ${words().tabs(tabs)}.`,
    edited: (title: string) => `Группа ${title} сохранена.`,
    groupDeleted: (title: string) =>
      `Группа ${title} удалена. Её можно вернуть из корзины в течение 30 дней.`,
    spaceDeleted: (title: string, groups: number) =>
      groups === 0
        ? `Пространство ${title} удалено. Его можно вернуть из корзины в течение 30 дней.`
        : `Пространство ${title} удалено вместе с ${groups} ${pluralRu(groups, ['группой', 'группами', 'группами'])}. Его можно вернуть из корзины в течение 30 дней.`,
    lastLinkDeleted: (title: string) =>
      `Последняя ссылка удалена вместе с группой ${title}. Её можно вернуть из корзины в течение 30 дней.`,
    linkDeleted: 'Ссылка удалена. Её можно вернуть из корзины в течение 30 дней.',
    restoredFromTrash: 'Восстановлено из корзины.',
    tabOpened: 'Вкладка открыта.',
    linkMovedEmptied: (title: string) =>
      `Ссылка перенесена в ${title}. Пустая группа удалена — её можно вернуть из корзины в течение 30 дней.`,
    linkMoved: (title: string) => `Ссылка перенесена в ${title}.`,
    tabStowed: (title: string) => `Вкладка убрана в TabFlow — в группу ${title}.`,
    sleepNothing: 'Усыплять нечего — других активных групп нет.',
    sleptMany: (groups: number, tabs: number) =>
      `Уснули: ${words().groups(groups)} · ${words().tabs(tabs)}. Вкладки остались на месте.`,
    selectedStowed: (tabs: number, title: string) =>
      `${words().tabs(tabs)} ${pluralRu(tabs, ['убрана', 'убраны', 'убраны'])} в TabFlow — группа ${title}.`,
    savedToGroup: (title: string) => `Вкладка сохранена в ${title}.`,
    linkAlreadyThere: (title: string) => `Ссылка уже есть в ${title}.`,
    linkSaved: (title: string) => `Ссылка сохранена в ${title}.`,
    appOpened: 'TabFlow открыт.',
    sideBySide: 'Ссылки открыты рядом.',
    sideBySideSlept: (tabs: number) =>
      `Ссылки открыты рядом. ${words().tabs(tabs)} на панели ${pluralRu(tabs, ['уснула', 'уснули', 'уснули'])} — остались на месте.`,
    arranged: 'Группы на панели стоят в порядке TabFlow.',
    importUndone: 'Импорт отменён.',
    importUndoneFailed: (n: number) => `Импорт отменён. Не вернулось из корзины: ${n}.`,
    notJson: 'Файл не прочитан — это не копия TabFlow. Данные TabFlow не изменились.',
    newerVersion:
      'Копия сделана более новой версией TabFlow — её прочитает только обновлённое расширение. Данные TabFlow не изменились.',
    notBackup: 'В файле нет копии TabFlow. Данные TabFlow не изменились.',
    importDone: 'Импорт завершён.',
    importNothingNew: 'Новых данных в копии нет.',
    imported: (parts: string, groups: boolean) =>
      `Импортировано: ${parts}.${groups ? ' Группы убраны в TabFlow.' : ''}`,
    importSkipped: (n: number) => ` Уже были в TabFlow: ${n}.`,
    importReplaced: ' Прежние данные — в корзине на 30 дней.',
    video: (title: string) => `Видео «${title}»`,
    videoAlreadyQueued: (video: string, place: string) => `${video} уже в очереди${place}.`,
    videoQueuedTabOpen: (video: string, place: string) =>
      `${video} в очереди${place}. Вкладка осталась открытой.`,
    videoQueued: (video: string, place: string) => `${video} в очереди${place}.`,
    videoBack: (video: string, place: string) => `${video} снова в очереди${place}.`,
    videoWatched: (video: string) => `${video} просмотрено — оно в разделе «Просмотрено».`,
    videoRemoved: (video: string) => `${video} удалено из очереди.`,
  },
  en: {
    errors: errorsEn,
    failedNote: (n: number) => ` Couldn’t: ${words().tabs(n)} — links are saved.`,
    collapseNothing: 'Nothing to collapse — only pinned and browser tabs are open.',
    collapsed: (groups: number, tabs: number) =>
      `Collapsed: ${words().groups(groups)} · ${words().tabs(tabs)}. Links are saved in Inbox.`,
    asleep: (title: string, tabs: number) =>
      `${title} is asleep — ${words().tabs(tabs)}. Tabs stay where they are.`,
    stowed: (title: string, tabs: number) =>
      `${title} moved to TabFlow. ${words().tabs(tabs)} saved.`,
    restored: (title: string, tabs: number) => `${title} restored — ${words().tabs(tabs)}.`,
    edited: (title: string) => `Group ${title} saved.`,
    groupDeleted: (title: string) =>
      `Group ${title} deleted. It can be restored from Trash within 30 days.`,
    spaceDeleted: (title: string, groups: number) =>
      groups === 0
        ? `Space ${title} deleted. It can be restored from Trash within 30 days.`
        : `Space ${title} deleted with ${words().groups(groups)}. It can be restored from Trash within 30 days.`,
    lastLinkDeleted: (title: string) =>
      `The last link was deleted with group ${title}. It can be restored from Trash within 30 days.`,
    linkDeleted: 'Link deleted. It can be restored from Trash within 30 days.',
    restoredFromTrash: 'Restored from Trash.',
    tabOpened: 'Tab opened.',
    linkMovedEmptied: (title: string) =>
      `Link moved to ${title}. The empty group was deleted — it can be restored from Trash within 30 days.`,
    linkMoved: (title: string) => `Link moved to ${title}.`,
    tabStowed: (title: string) => `Tab moved to TabFlow — into group ${title}.`,
    sleepNothing: 'Nothing to put to sleep — no other active groups.',
    sleptMany: (groups: number, tabs: number) =>
      `Asleep: ${words().groups(groups)} · ${words().tabs(tabs)}. Tabs stay where they are.`,
    selectedStowed: (tabs: number, title: string) =>
      `${words().tabs(tabs)} moved to TabFlow — group ${title}.`,
    savedToGroup: (title: string) => `Tab saved to ${title}.`,
    linkAlreadyThere: (title: string) => `The link is already in ${title}.`,
    linkSaved: (title: string) => `Link saved to ${title}.`,
    appOpened: 'TabFlow opened.',
    sideBySide: 'Links opened side by side.',
    sideBySideSlept: (tabs: number) =>
      `Links opened side by side. ${words().tabs(tabs)} on the tab strip ${tabs === 1 ? 'is' : 'are'} asleep — still in place.`,
    arranged: 'Groups on the tab strip follow the TabFlow order.',
    importUndone: 'Import undone.',
    importUndoneFailed: (n: number) => `Import undone. Not restored from Trash: ${n}.`,
    notJson: 'The file couldn’t be read — it is not a TabFlow backup. TabFlow data is unchanged.',
    newerVersion:
      'The backup was made by a newer TabFlow — only an updated extension can read it. TabFlow data is unchanged.',
    notBackup: 'The file holds no TabFlow backup. TabFlow data is unchanged.',
    importDone: 'Import finished.',
    importNothingNew: 'Nothing new in the backup.',
    imported: (parts: string, groups: boolean) =>
      `Imported: ${parts}.${groups ? ' Groups are stowed in TabFlow.' : ''}`,
    importSkipped: (n: number) => ` Already in TabFlow: ${n}.`,
    importReplaced: ' Previous data is in Trash for 30 days.',
    video: (title: string) => `Video “${title}”`,
    videoAlreadyQueued: (video: string, place: string) => `${video} is already queued${place}.`,
    videoQueuedTabOpen: (video: string, place: string) =>
      `${video} queued${place}. The tab stays open.`,
    videoQueued: (video: string, place: string) => `${video} queued${place}.`,
    videoBack: (video: string, place: string) => `${video} is back in the queue${place}.`,
    videoWatched: (video: string) => `${video} watched — it is in “Watched”.`,
    videoRemoved: (video: string) => `${video} removed from the queue.`,
  },
});

/**
 * Text for a command result. `name` is the title of the group or space the command was about.
 * Commands with a visible result (opening a tab, editing a group) still get a short text.
 */
export function describeResponse(type: CommandType, response: CommandResponse, name = ''): string {
  const t = text();
  if (!response.ok) {
    if (response.code === 'invalid-backup') return describeBackupError(response.message);
    return t.errors[response.code] ?? t.errors.unexpected;
  }

  const { groups, tabs, failed, groupTitle } = response.result;
  const title = words().quote(name || groupTitle || words().untitled);
  const failedNote = failed > 0 ? t.failedNote(failed) : '';

  switch (type) {
    case 'collapseAll':
      return tabs === 0 ? t.collapseNothing : t.collapsed(groups, tabs);
    case 'sleepGroup':
    case 'sleepCurrent':
      return t.asleep(title, tabs) + failedNote;
    case 'stowGroup':
      return t.stowed(title, tabs);
    case 'restoreGroup':
      return t.restored(title, tabs) + failedNote;
    case 'editGroup':
      return t.edited(title);
    case 'deleteGroup':
      return t.groupDeleted(title);
    case 'deleteSpace':
      return t.spaceDeleted(title, groups);
    case 'deleteTab':
      return groups > 0 ? t.lastLinkDeleted(title) : t.linkDeleted;
    case 'restoreDeleted':
      return t.restoredFromTrash + failedNote;
    case 'openTab':
      return t.tabOpened;
    case 'moveTab':
      return (groups > 0 ? t.linkMovedEmptied(title) : t.linkMoved(title)) + failedNote;
    case 'stowCurrent':
      return groups > 0 ? t.stowed(title, tabs) : t.tabStowed(title);
    case 'sleepInactive':
      return groups === 0 ? t.sleepNothing : t.sleptMany(groups, tabs) + failedNote;
    case 'stowSelected':
      return t.selectedStowed(tabs, title);
    case 'saveToGroup':
      return t.savedToGroup(title);
    case 'saveLink':
      return tabs === 0 ? t.linkAlreadyThere(title) : t.linkSaved(title) + failedNote;
    case 'openApp':
      return t.appOpened;
    case 'sleepLinks':
      return tabs === 0 ? t.sideBySide : t.sideBySideSlept(tabs);
    case 'arrangeGroups':
      return t.arranged;
    case 'importBackup':
      return describeImport(response.result.imported);
    case 'undoImport':
      return failed > 0 ? t.importUndoneFailed(failed) : t.importUndone;
    case 'queueTab':
    case 'queueLink':
    case 'openVideo':
    case 'moveVideo':
    case 'setWatched':
    case 'removeVideo':
    case 'restoreVideo':
    case 'videoProgress':
      return describeVideo(type, response.result.video);
  }
}

/** Why a file is not a TabFlow backup (`BackupError` codes). */
export function describeBackupError(code: string): string {
  const t = text();
  switch (code) {
    case 'not-json':
      return t.notJson;
    case 'newer-version':
      return t.newerVersion;
    default:
      return t.notBackup;
  }
}

function describeImport(imported: ImportReport | undefined): string {
  const t = text();
  if (!imported) return t.importDone;
  const { groups, tabs, videos, layouts, skipped, replaced } = imported;
  const w = words();
  const parts = [
    groups > 0 && `${w.groups(groups)} · ${w.links(tabs)}`,
    videos > 0 && w.videos(videos),
    layouts > 0 && w.layouts(layouts),
  ].filter(Boolean);
  const added = parts.length === 0 ? t.importNothingNew : t.imported(parts.join(' · '), groups > 0);
  const skippedNote = skipped > 0 ? t.importSkipped(skipped) : '';
  return `${added}${skippedNote}${replaced ? t.importReplaced : ''}`;
}

function describeVideo(type: CommandType, video: QueuedVideo | undefined): string {
  const t = text();
  const title = t.video(video?.title || words().untitled);
  const place = video && video.priority > 0 ? ` — #${video.priority}` : '';
  switch (type) {
    case 'queueTab':
      return video?.created === false
        ? t.videoAlreadyQueued(title, place)
        : t.videoQueuedTabOpen(title, place);
    case 'queueLink':
      return video?.created === false
        ? t.videoAlreadyQueued(title, place)
        : t.videoQueued(title, place);
    case 'setWatched':
      return place ? t.videoBack(title, place) : t.videoWatched(title);
    case 'removeVideo':
      return t.videoRemoved(title);
    case 'restoreVideo':
      return t.videoBack(title, place);
    default:
      return `${title}${place}.`;
  }
}
