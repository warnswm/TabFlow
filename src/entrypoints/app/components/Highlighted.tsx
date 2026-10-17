import { highlight } from '@/lib/app/search';

/** Text with the matched words in the accent color (search results). */
export function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {highlight(text, terms).map((part, i) =>
        part.hit ? (
          <mark key={i} className="bg-transparent font-semibold text-accent">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
