/**
 * UI state of the main page that is not in the database: the toast, the restore mode,
 * the search and filter of the shown space, the command palette.
 */
import { create } from 'zustand';
import type { StateFilter } from '@/lib/app/filters';
import type { Id } from '@/lib/db';
import type { RestoreMode } from '@/lib/messages';
import { DEFAULT_RESTORE_MODE, saveRestoreMode } from '@/lib/settings';

export interface Toast {
  id: number;
  text: string;
  /** Shows «Отменить» in the toast. */
  undo?: () => void;
}

interface UiState {
  toast?: Toast;
  restoreMode: RestoreMode;
  /** Search field of the space: filters its tiles. */
  search: string;
  stateFilter: StateFilter;
  paletteOpen: boolean;
  newSpaceOpen: boolean;
  /** A tile to scroll to and outline for a moment (chosen in the palette). */
  focusGroupId?: Id;
  showToast(text: string, undo?: () => void): void;
  dismissToast(id: number): void;
  setRestoreMode(mode: RestoreMode, persist?: boolean): void;
  setSearch(search: string): void;
  setStateFilter(filter: StateFilter): void;
  /** Search and filter back to «everything» — on another space, or to show a chosen tile. */
  resetFilters(): void;
  setPaletteOpen(open: boolean): void;
  setNewSpaceOpen(open: boolean): void;
  focusGroup(id?: Id): void;
}

let nextToastId = 1;

export const useUi = create<UiState>()((set) => ({
  restoreMode: DEFAULT_RESTORE_MODE,
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
  setSearch: (search) => set({ search }),
  setStateFilter: (stateFilter) => set({ stateFilter }),
  resetFilters: () => set({ search: '', stateFilter: 'all' }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setNewSpaceOpen: (newSpaceOpen) => set({ newSpaceOpen }),
  focusGroup: (focusGroupId) => set({ focusGroupId }),
}));
