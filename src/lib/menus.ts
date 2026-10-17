/**
 * The context menu of TabFlow: what it contains (built from the groups) and which command a click
 * runs. Chrome puts several items of one extension under its name: «TabFlow ▸».
 * Chrome has no menu on the tab itself (the `tab` context is Firefox-only), so the items are on
 * the page, on links and on the TabFlow icon.
 */
import type { Id, Space, TabGroup } from './db/models';
import type { Command } from './messages';

export type MenuContext = 'page' | 'link' | 'action';

export interface MenuItem {
  id: string;
  /** Empty for a separator. */
  title: string;
  contexts: MenuContext[];
  parentId?: string;
  /** False — shown greyed out. */
  enabled?: boolean;
  separator?: boolean;
}

export const MENU_IDS = {
  stow: 'stow',
  sleep: 'sleep',
  queuePage: 'queue-page',
  saveLink: 'save-link',
  queueLink: 'queue-link',
  separator: 'separator',
  toGroup: 'to-group',
  collapseAll: 'collapse-all',
  openQueue: 'open-queue',
  openApp: 'open-app',
} as const;

const GROUP_ITEM_PREFIX = 'group:';
/** «В группу ▸» lists this many groups, the most recently changed first. */
export const MENU_GROUP_LIMIT = 10;
const MAX_TITLE_LENGTH = 48;

function shorten(text: string): string {
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1)}…` : text;
}

/** `groups` and `spaces` — live records. */
export function buildMenu(groups: readonly TabGroup[], spaces: readonly Space[]): MenuItem[] {
  const spaceNames = new Map(spaces.map((space) => [space.id, space.name]));
  const recent = groups
    .filter((group) => spaceNames.has(group.spaceId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MENU_GROUP_LIMIT);

  const items: MenuItem[] = [
    { id: MENU_IDS.stow, title: 'Убрать в TabFlow', contexts: ['page'] },
    { id: MENU_IDS.sleep, title: 'Усыпить группу', contexts: ['page'] },
    { id: MENU_IDS.queuePage, title: 'В очередь «на потом»', contexts: ['page'] },
    { id: MENU_IDS.saveLink, title: 'Сохранить ссылку в TabFlow', contexts: ['link'] },
    { id: MENU_IDS.queueLink, title: 'В очередь «на потом»', contexts: ['link'] },
  ];
  if (recent.length > 0) {
    const contexts: MenuContext[] = ['page', 'link'];
    items.push(
      { id: MENU_IDS.separator, title: '', contexts, separator: true },
      { id: MENU_IDS.toGroup, title: 'В группу', contexts },
      ...recent.map((group) => ({
        id: `${GROUP_ITEM_PREFIX}${group.id}`,
        parentId: MENU_IDS.toGroup,
        title: `${shorten(group.title || 'Без названия')} · ${spaceNames.get(group.spaceId)}`,
        contexts,
      })),
    );
  }
  items.push(
    { id: MENU_IDS.collapseAll, title: 'Свернуть всё', contexts: ['action'] },
    { id: MENU_IDS.openQueue, title: 'Открыть очередь', contexts: ['action'] },
    { id: MENU_IDS.openApp, title: 'Открыть TabFlow', contexts: ['action'] },
  );
  return items;
}

export interface MenuClick {
  itemId: string;
  /** The tab the menu was opened in; missing outside tabs. */
  tabId?: number;
  /** Its window («Открыть очередь» opens the side panel there). */
  windowId?: number;
  /** Set when the menu was opened on a link. */
  linkUrl?: string;
  /** The page the menu was opened on. */
  pageUrl?: string;
}

/**
 * The page whose site a queue item of the menu is about: the link or the page. Chrome is asked
 * for access to that site right in the click (see `queue/site-access.ts`).
 */
export function menuQueueUrl({ itemId, linkUrl, pageUrl }: MenuClick): string | undefined {
  if (itemId === MENU_IDS.queueLink) return linkUrl;
  if (itemId === MENU_IDS.queuePage) return pageUrl;
  return undefined;
}

/** The command a menu click runs; `undefined` for items that do nothing. */
export function menuCommand({ itemId, tabId, linkUrl }: MenuClick): Command | undefined {
  const chromeTabId = tabId !== undefined && tabId >= 0 ? tabId : undefined;
  const onTab = chromeTabId === undefined ? {} : { chromeTabId };

  if (itemId.startsWith(GROUP_ITEM_PREFIX)) {
    const groupId: Id = itemId.slice(GROUP_ITEM_PREFIX.length);
    if (linkUrl) return { type: 'saveLink', url: linkUrl, groupId };
    return chromeTabId === undefined ? undefined : { type: 'saveToGroup', chromeTabId, groupId };
  }
  switch (itemId) {
    case MENU_IDS.stow:
      return { type: 'stowCurrent', ...onTab };
    case MENU_IDS.sleep:
      return { type: 'sleepCurrent', ...onTab };
    case MENU_IDS.saveLink:
      return linkUrl ? { type: 'saveLink', url: linkUrl } : undefined;
    case MENU_IDS.queuePage:
      return { type: 'queueTab', ...onTab };
    case MENU_IDS.queueLink:
      return linkUrl ? { type: 'queueLink', url: linkUrl } : undefined;
    case MENU_IDS.collapseAll:
      return { type: 'collapseAll' };
    case MENU_IDS.openApp:
      return { type: 'openApp' };
    default:
      return undefined; // «Открыть очередь» opens the side panel in the click itself
  }
}
