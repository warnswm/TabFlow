import { openAppPage } from '@/lib/browser-api';

export default function App() {
  async function handleOpen() {
    await openAppPage();
    window.close();
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
        onClick={handleOpen}
        className="h-9 rounded-md bg-accent font-semibold text-on-accent transition-colors duration-(--duration-fast) hover:bg-accent-hover active:bg-accent-pressed"
      >
        Открыть TabFlow
      </button>
    </main>
  );
}
