import { useState } from 'react';
import { openAppPage } from '@/lib/browser-api';
import { describeResponse } from '@/lib/command-messages';
import { sendCommand } from '@/lib/messages';

export default function App() {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleOpen() {
    await openAppPage();
    window.close();
  }

  async function handleCollapse() {
    setBusy(true);
    try {
      setStatus(describeResponse('collapseAll', await sendCommand({ type: 'collapseAll' })));
    } catch {
      setStatus('Фоновая часть TabFlow не ответила. Вкладки остались на месте.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex w-[360px] flex-col gap-4 bg-bg p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-md font-semibold tracking-tight">TabFlow</h1>
        <span className="font-mono text-xs text-fg-subtle">v0.0.1</span>
      </header>

      <p className="text-sm text-fg-muted">Всё на виду. Ничего в памяти.</p>

      <button
        type="button"
        disabled={busy}
        onClick={handleCollapse}
        className="h-11 rounded-md bg-accent font-semibold text-on-accent transition-colors duration-(--duration-fast) hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-50"
      >
        Свернуть всё
      </button>

      <button
        type="button"
        onClick={handleOpen}
        className="h-9 rounded-md border border-border bg-surface-raised font-semibold text-fg"
      >
        Открыть TabFlow
      </button>

      <p role="status" aria-live="polite" className="text-sm text-fg-muted empty:hidden">
        {status}
      </p>
    </main>
  );
}
