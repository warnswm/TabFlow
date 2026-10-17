/**
 * Background logic, independent of the service worker entrypoint so that tests can drive it
 * with a fake `TabsApi`. Commands and browser events run through one serial queue.
 */
import type { TabsEvent } from '../browser-api';
import {
  type Command,
  CommandError,
  type CommandResponse,
  type CommandResult,
  isCommand,
} from '../messages';
import { collapseAll } from './collapse';
import type { BackgroundContext } from './context';
import { editGroup, openTab, restoreGroup, sleepGroup, stowGroup } from './group-actions';
import { handleTabsEvent, reconcileAll } from './mirror';
import { moveTab } from './move-tab';
import {
  createIconRefresher,
  discardPlaceholder,
  ICON_REFRESH_WINDOW_MS,
  needsIconRefresh,
  reopenMissingLinks,
} from './placeholder-icons';
import { createSerialQueue } from './serial-queue';
import { deleteGroup, deleteSpace, deleteTab, restoreDeleted } from './trash-actions';

export type { BackgroundContext } from './context';

export interface Background {
  /** Reconciles the mirror with Chrome; in a new browser session also empties the old trash. */
  start(): Promise<void>;
  handleEvent(event: TabsEvent): Promise<void>;
  handleMessage(message: unknown): Promise<CommandResponse>;
  /** Resolves when all queued work is done (tests). */
  idle(): Promise<void>;
}

function runCommand(ctx: BackgroundContext, command: Command): Promise<CommandResult> {
  switch (command.type) {
    case 'collapseAll':
      return collapseAll(ctx);
    case 'sleepGroup':
      return sleepGroup(ctx, command.groupId);
    case 'stowGroup':
      return stowGroup(ctx, command.groupId);
    case 'restoreGroup':
      return restoreGroup(ctx, command.groupId, command.mode);
    case 'editGroup':
      return editGroup(ctx, command.groupId, { title: command.title, color: command.color });
    case 'deleteGroup':
      return deleteGroup(ctx, command.groupId);
    case 'deleteSpace':
      return deleteSpace(ctx, command.spaceId);
    case 'deleteTab':
      return deleteTab(ctx, command.tabId);
    case 'restoreDeleted':
      return restoreDeleted(ctx, command.kind, command.id, command.reopenGroupIds, command.mode);
    case 'moveTab':
      return moveTab(ctx, command.tabId, command.groupId, command.index);
    case 'openTab':
      return openTab(ctx, command.tabId);
  }
}

function logError(what: string, error: unknown): void {
  console.error(`[TabFlow] ${what} failed:`, error);
}

export function createBackground(ctx: BackgroundContext): Background {
  const queue = createSerialQueue();
  const icons = createIconRefresher(ctx);
  /** Until when tabs Chrome restores in a new browser session get their placeholder icon back. */
  let refreshIconsUntil = 0;
  /** Tabs opened while a command ran: TabFlow's own, they already have their icon. */
  const ownTabs = new Set<number>();
  let commandRunning = false;

  return {
    start() {
      return queue.run(async () => {
        try {
          const idsAreStale = await ctx.api.isFirstRunInSession();
          // The extension was reloaded or updated: Chrome closed its placeholders meanwhile.
          const reopened: number[] = [];
          await reconcileAll(ctx, {
            idsAreStale,
            reopenMissing: idsAreStale
              ? async (mirror, chromeGroup) => {
                  reopened.push(...(await reopenMissingLinks(ctx, mirror.id, chromeGroup.id)));
                }
              : undefined,
          });
          if (idsAreStale) {
            await ctx.repos.trash.purgeExpired();
            refreshIconsUntil = ctx.clock() + ICON_REFRESH_WINDOW_MS;
            // Not awaited: loading and discarding takes a moment and must not hold the queue.
            for (const tabId of reopened) void discardPlaceholder(ctx, tabId);
            void icons.refreshAll(new Set(reopened));
          }
        } catch (error) {
          logError('start', error);
        }
      });
    },

    handleEvent(event) {
      const watchIcons = event.type === 'tabCreated' && ctx.clock() < refreshIconsUntil;
      if (watchIcons && commandRunning) ownTabs.add(event.tabId);
      return queue.run(async () => {
        try {
          await handleTabsEvent(ctx, event);
          if (watchIcons && !ownTabs.delete(event.tabId)) {
            // A tab Chrome restored unloaded: a placeholder without its icon.
            const tab = await ctx.api.getTab(event.tabId);
            if (tab && needsIconRefresh(tab) && tab.discarded && !tab.hasIcon) {
              void icons.refresh(tab.id);
            }
          }
        } catch (error) {
          logError(`event ${event.type}`, error);
        }
      });
    },

    async handleMessage(message) {
      if (!isCommand(message)) {
        return { ok: false, code: 'invalid-command', message: 'Unknown command' };
      }
      try {
        const result = await queue.run(async () => {
          commandRunning = true;
          try {
            return await runCommand(ctx, message);
          } finally {
            commandRunning = false;
          }
        });
        return { ok: true, result };
      } catch (error) {
        if (error instanceof CommandError) {
          return { ok: false, code: error.code, message: error.message };
        }
        logError(`command ${message.type}`, error);
        return { ok: false, code: 'unexpected', message: String(error) };
      }
    },

    idle: () => queue.idle(),
  };
}
