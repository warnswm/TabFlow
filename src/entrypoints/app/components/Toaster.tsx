import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useUi } from '../store';
import { BUTTON_ICON, BUTTON_LINK } from '../ui';
import { localized } from '@/lib/i18n';

/** Long enough to read the text and press «Отменить»; paused while the pointer is over it. */
const TOAST_MS = 8000;

const text = localized({
  ru: { undo: 'Отменить', close: 'Закрыть уведомление' },
  en: { undo: 'Undo', close: 'Dismiss' },
});

export function Toaster() {
  const toast = useUi((state) => state.toast);
  const dismiss = useUi((state) => state.dismissToast);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!toast || paused) return;
    const timer = window.setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, paused, dismiss]);

  return (
    // The live region stays in the page, so screen readers announce every new text.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      {toast && (
        <div
          key={toast.id}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          className="pointer-events-auto flex max-w-[560px] animate-toast-in items-center gap-4 rounded-lg bg-surface-raised py-2.5 pr-2 pl-4 text-sm shadow-popover"
        >
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                dismiss(toast.id);
                toast.undo?.();
              }}
              className={`shrink-0 ${BUTTON_LINK}`}
            >
              {text().undo}
            </button>
          )}
          <button
            type="button"
            aria-label={text().close}
            onClick={() => dismiss(toast.id)}
            className={BUTTON_ICON}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
