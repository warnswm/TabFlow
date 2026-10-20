/**
 * Topics by Gemini Nano (experimental, off by default): the request to the built-in model of
 * Chrome and the reading of its answer. The model only names topics and sorts tab numbers; a tab
 * it leaves out goes to the dictionary (`topicPlacer`), an answer that makes no sense is dropped.
 */
import type { Language } from '../i18n';
import {
  colorOf,
  type GroupingTab,
  type Placement,
  titleKey,
  titleWords,
  dictionaryTopic,
} from './grouping';
import { TOPICS } from './topics';

/** Tabs sent to the model at most: a longer request is slow on a small model. */
export const AI_MAX_TABS = 60;

/** The answer must follow this JSON schema (`responseConstraint`). */
export const AI_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tabs: { type: 'array', items: { type: 'integer' } },
        },
        required: ['name', 'tabs'],
      },
    },
  },
  required: ['groups'],
} as const;

/**
 * The request: numbered tabs (title and site). Group names are asked in English — the only
 * language of ours the model takes (`MODEL_OPTIONS` in `browser-api.ts`); `readAiAnswer` puts
 * names of dictionary topics into the interface language.
 */
export function aiPrompt(tabs: readonly GroupingTab[]): string {
  const lines = tabs.slice(0, AI_MAX_TABS).map((tab, i) => {
    let host = '';
    try {
      host = new URL(tab.url).hostname.replace(/^www\./, '');
    } catch {
      // A broken URL: the title alone.
    }
    return `${i + 1}. ${tab.title.slice(0, 80)}${host ? ` — ${host}` : ''}`;
  });
  return [
    'Sort these browser tabs into 2 to 8 groups by topic.',
    'Name every group with one or two words in English, like a folder name.',
    'Use each tab number at most once; leave out tabs that fit no group.',
    'Tabs:',
    ...lines,
  ].join('\n');
}

/**
 * Reads the answer into a placement per tab id. Unknown or repeated numbers, empty names and
 * groups of one tab are dropped; a name of a dictionary topic gets the topic's name in `language`
 * and its color, other names stay as the model wrote them.
 */
export function readAiAnswer(
  answer: string,
  tabs: readonly GroupingTab[],
  language: Language,
): Map<number, Placement> {
  const placements = new Map<number, Placement>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    return placements;
  }
  const groups = (parsed as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return placements;
  const sent = tabs.slice(0, AI_MAX_TABS);
  for (const group of groups) {
    const { name, tabs: numbers } = (group ?? {}) as { name?: unknown; tabs?: unknown };
    if (typeof name !== 'string' || !Array.isArray(numbers)) continue;
    const written = name.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!written) continue;
    const ids = numbers
      .filter((n): n is number => Number.isInteger(n))
      .map((n) => sent[n - 1]?.id)
      .filter((id): id is number => id !== undefined && !placements.has(id));
    const unique = [...new Set(ids)];
    if (unique.length < 2) continue;
    const placement = aiPlacement(written, language);
    for (const id of unique) placements.set(id, placement);
  }
  return placements;
}

/**
 * A model name that is a dictionary topic (“Video”, «Видео») becomes the topic in `language`;
 * one that only has a word of a topic keeps its name and takes the topic's color.
 */
function aiPlacement(written: string, language: Language): Placement {
  const key = titleKey(written);
  const named = TOPICS.find((item) =>
    Object.values(item.name).some((name) => titleKey(name) === key),
  );
  if (named) return { title: named.name[language], color: named.color };
  const topic = dictionaryTopic('about:blank', titleWords(written));
  return { title: written, color: topic ? topic.color : colorOf(written) };
}
