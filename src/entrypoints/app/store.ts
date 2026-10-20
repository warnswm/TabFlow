/**
 * UI state of the main page (and the side panel) that is not in the database: the toast, the
 * settings, the search and filter of the shown space, the command palette.
 */
import { create } from 'zustand';
import type { StateFilter } from '@/lib/app/filters';
import { DEFAULT_REVIEW_DAYS, type ReviewDays } from '@/lib/app/review';
import type { Id } from '@/lib/db';
import type { RestoreMode } from '@/lib/messages';
import {
  DEFAULT_BADGE_MODE,
  DEFAULT_RESTORE_MODE,
  saveBadgeMode,
  saveRestoreMode,
  saveReviewDays,
} from '@/lib/settings';
import type { BadgeMode } from '@/lib/summary';

export interface Toast {
  id: number;
  text: string;
  /** Shows «Отменить» in the toast. */
  undo?: () => void;
}

interface UiState {
  toast?: Toast;
  restoreMode: RestoreMode;
  /** What the number on the TabFlow icon counts. */
  badgeMode: BadgeMode;
  /** «Давно не открывали»: after how many days (0 — off). */
  reviewDays: ReviewDays;
  /** Search field of the space: filters its tiles. */
  search: string;
  stateFilter: StateFilter;
  paletteOpen: boolean;
  newSpaceOpen: boolean;
  /** A tile to scroll to and outline for a moment (chosen in the palette). */
  focusGroupId?: Id;
  /** The dialog «Рядом» is open; `groupId` — the group it starts at (menu of a tile). */
  tileDialog?: { groupId?: Id };
  /** Where «К группам» of the viewer goes back to (the screen «Рядом» was opened from). */
  viewerReturn?: string;
  showToast(text: string, undo?: () => void): void;
  dismissToast(id: number): void;
  setRestoreMode(mode: RestoreMode, persist?: boolean): void;
  setBadgeMode(mode: BadgeMode, persist?: boolean): void;
  setReviewDays(days: ReviewDays, persist?: boolean): void;
  setSearch(search: string): void;
  setStateFilter(filter: StateFilter): void;
  /** Search and filter back to «everything» — on another space, or to show a chosen tile. */
  resetFilters(): void;
  setPaletteOpen(open: boolean): void;
  setNewSpaceOpen(open: boolean): void;
  focusGroup(id?: Id): void;
  openTileDialog(groupId?: Id): void;
  closeTileDialog(): void;
  setViewerReturn(hash: string): void;
}

let nextToastId = 1;

export const useUi = create<UiState>()((set) => ({
  restoreMode: DEFAULT_RESTORE_MODE,
  badgeMode: DEFAULT_BADGE_MODE,
  reviewDays: DEFAULT_REVIEW_DAYS,
  search: '',
  stateFilter: 'all',
  paletteOpen: false,
  newSpaceOpen: false,
  // One toast at a time: a new result replaces the previous one.
  showToast: (text, undo) => set({ toast: { id: nextToastId++, text, undo } }),
  dismissToast: (id) => set((state) => (state.toast?.id === id ? { toast: undefined } : state)),
  setRestoreMode: (mode, persist = true) => {
    set({ restoreMode: mode });
    if (persist) void saveRestoreMode(mode);
  },
  setBadgeMode: (mode, persist = true) => {
    set({ badgeMode: mode });
    if (persist) void saveBadgeMode(mode);
  },
  setReviewDays: (days, persist = true) => {
    set({ reviewDays: days });
    if (persist) void saveReviewDays(days);
  },
  setSearch: (search) => set({ search }),
  setStateFilter: (stateFilter) => set({ stateFilter }),
  resetFilters: () => set({ search: '', stateFilter: 'all' }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setNewSpaceOpen: (newSpaceOpen) => set({ newSpaceOpen }),
  focusGroup: (focusGroupId) => set({ focusGroupId }),
  openTileDialog: (groupId) => set({ tileDialog: groupId === undefined ? {} : { groupId } }),
  closeTileDialog: () => set({ tileDialog: undefined }),
  setViewerReturn: (viewerReturn) => set({ viewerReturn }),
}));
