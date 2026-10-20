/**
 * «Поделиться группой»: the links of a group as text for the clipboard — addresses one per line,
 * or a Markdown list with the group title as a heading. Nothing leaves the browser.
 */
import type { SavedTab } from '../db/models';

/** Addresses, one per line. */
export function linksText(tabs: readonly SavedTab[]): string {
  return tabs.map((tab) => tab.url).join('\n');
}

/**
 * `## Группа`, the group note, then `- [Заголовок](адрес) — заметка`. Brackets in titles and
 * spaces or brackets in addresses are escaped, so every link stays a link.
 */
export function markdownText(
  group: { title: string; note?: string },
  tabs: readonly SavedTab[],
  untitled: string,
): string {
  const lines = [`## ${oneLine(group.title) || untitled}`, ''];
  const note = oneLine(group.note ?? '');
  if (note) lines.push(note, '');
  for (const tab of tabs) {
    const title = escapeTitle(oneLine(tab.title) || tab.url);
    const tabNote = oneLine(tab.note ?? '');
    lines.push(`- [${title}](${escapeUrl(tab.url)})${tabNote ? ` — ${tabNote}` : ''}`);
  }
  return lines.join('\n');
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function escapeTitle(title: string): string {
  return title.replace(/[\\[\]]/g, (char) => `\\${char}`);
}

function escapeUrl(url: string): string {
  return url.replace(/[ ()<>]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
