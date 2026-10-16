/** UI state of the main page that is not in the database: the toast and the restore mode. */
import { create } from 'zustand';
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
  showToast(text: string, undo?: () => void): void;
  dismissToast(id: number): void;
  setRestoreMode(mode: RestoreMode, persist?: boolean): void;
}

let nextToastId = 1;

export const useUi = create<UiState>()((set) => ({
  restoreMode: DEFAULT_RESTORE_MODE,
  // One toast at a time: a new result replaces the previous one.
  showToast: (text, undo) => set({ toast: { id: nextToastId++, text, undo } }),
  dismissToast: (id) => set((state) => (state.toast?.id === id ? { toast: undefined } : state)),
  setRestoreMode: (mode, persist = true) => {
    set({ restoreMode: mode });
    if (persist) void saveRestoreMode(mode);
  },
}));
