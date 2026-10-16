/** Stage 0 placeholder: shows that design tokens, fonts and Tailwind are wired up. */
export default function App() {
  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">TabFlow</h1>
          <p className="text-fg-muted">Всё на виду. Ничего в памяти.</p>
        </header>

        <section aria-labelledby="sample-title" className="flex flex-col gap-3">
          <h2 id="sample-title" className="text-sm font-medium text-fg-subtle">
            Пример плитки группы
          </h2>
          <article className="flex max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-3.5">
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-2 rounded-full bg-group-blue" />
              <span className="font-semibold">Учёба</span>
              <span className="ml-auto font-mono text-xs text-fg-muted">12</span>
            </div>
            <div aria-hidden className="flex gap-1.5">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="size-5 rounded-sm bg-surface-raised" />
              ))}
              <span className="font-mono text-xs leading-5 text-fg-subtle">+6</span>
            </div>
            <p className="text-xs text-fg-subtle">активна · 12 вкладок</p>
          </article>
        </section>

        <section className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="h-9 rounded-md bg-accent px-4 font-semibold text-on-accent transition-colors duration-(--duration-fast) hover:bg-accent-hover active:bg-accent-pressed"
          >
            Свернуть всё
          </button>
          <button
            type="button"
            className="h-9 rounded-md border border-border bg-surface-raised px-4 font-semibold text-fg"
          >
            Новое пространство
          </button>
          <kbd className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
            Ctrl+Shift+S
          </kbd>
        </section>

        <p className="text-sm text-fg-subtle">
          Каркас этапа 0. Группы и действия появятся на следующих этапах.
        </p>
      </main>
    </div>
  );
}
