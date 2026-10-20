/** Building blocks of the settings page: a titled section, a list of choices. */
import type { ReactNode } from 'react';

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-md font-semibold">{title}</h2>
        {description && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        {children}
      </div>
    </section>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint: string;
}

export function ChoiceList<T extends string>({
  name,
  value,
  choices,
  onChange,
}: {
  name: string;
  value: T | undefined;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex flex-col gap-1">
      {choices.map((choice) => (
        <label
          key={choice.value}
          className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-raised"
        >
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
            className="mt-1 size-4 shrink-0 accent-accent"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm text-fg">{choice.label}</span>
            {choice.hint && <span className="text-xs text-fg-muted">{choice.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
