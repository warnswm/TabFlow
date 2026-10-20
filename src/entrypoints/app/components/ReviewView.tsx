import { ArchiveRestore, ArrowUpToLine, Check, Lock, Play, Trash } from 'lucide-react';
import { displayHost, type Overview } from '@/lib/app/overview';
import { REVIEW_DAYS, reviewCounts, type ReviewDays, type ReviewItem } from '@/lib/app/review';
import { routeHash } from '@/lib/app/route';
import { DAY_MS } from '@/lib/app/time-format';
import { faviconUrl } from '@/lib/browser-api';
import { repositories } from '@/lib/db';
import { localized } from '@/lib/i18n';
import { pluralEn, pluralRu, words } from '@/lib/i18n/words';
import { runCommand } from '../commands';
import { useNow } from '../hooks';
import { useUi } from '../store';
import { useReview } from '../use-review';
import {
  BUTTON_DANGER,
  BUTTON_LINK,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  GROUP_DOT,
  untitled,
} from '../ui';
import { ChoiceList, Section } from './SettingsParts';
import { VideoThumb } from './VideoThumb';

/**
 * «Давно не открывали» (`#/review`): stowed groups and queued videos untouched for a while, one at
 * a time — «Вернуть / Наверх очереди / Удалить / Оставить». The oldest comes first; whatever is
 * done takes it off the list, so the next one shows up. Deleting goes to the trash with «Отменить».
 */

const LINKS_SHOWN = 5;

const text = localized({
  ru: {
    title: 'Давно не открывали',
    intro: (days: number) =>
      `Убранные группы и видео очереди, которые лежат дольше ${daysLonger(days)}. По одному: вернуть, удалить или оставить. Удалённое 30 дней лежит в корзине.`,
    left: (groups: number, videos: number) =>
      `Осталось: ${[groups > 0 && words().groups(groups), videos > 0 && words().videos(videos)].filter(Boolean).join(' · ')}`,
    nothing: (days: number) =>
      `Давно не открытого нет: всё отложенное лежит меньше ${daysLonger(days)}.`,
    off: 'Разбор выключен — он включается в настройках, раздел «Давно не открывали».',
    settings: 'Настройки',
    stowedFor: (days: number) => `Убрана ${daysText(days)} назад`,
    queuedFor: (days: number) => `В очереди ${daysText(days)}`,
    priority: (n: number) => `#${n} в очереди`,
    more: (n: number) => `и ещё ${words().tabs(n)}`,
    locked: 'Защищена от удаления',
    restore: 'Вернуть на панель',
    open: 'Открыть',
    toTop: 'Наверх очереди',
    delete: 'Удалить',
    keep: 'Оставить',
    keepHint: (days: number) => `«Оставить» — снова покажется здесь через ${daysText(days)}.`,
    keptGroup: (title: string, days: number) =>
      `Группа ${title} осталась убранной — снова покажется здесь через ${daysText(days)}.`,
    keptVideo: (title: string, days: number) =>
      `Видео ${title} осталось в очереди — снова покажется здесь через ${daysText(days)}.`,
    notKept: 'Не сохранено — всё осталось как было.',
    setting: 'Давно не открывали',
    settingAbout:
      'Убранные группы и видео очереди, которые долго лежат без дела, собираются на экране «Давно не открывали».',
    choice: (days: ReviewDays) => (days === 0 ? 'Выключено' : `Через ${daysText(days)}`),
    byDefault: 'По умолчанию.',
  },
  en: {
    title: 'Not opened for a while',
    intro: (days: number) =>
      `Stowed groups and queued videos lying untouched for more than ${daysLonger(days)}. One at a time: restore, delete or keep. Deleted items stay in Trash for 30 days.`,
    left: (groups: number, videos: number) =>
      `Left: ${[groups > 0 && words().groups(groups), videos > 0 && words().videos(videos)].filter(Boolean).join(' · ')}`,
    nothing: (days: number) =>
      `Nothing forgotten: everything put aside is younger than ${daysLonger(days)}.`,
    off: 'The review is off — it is turned on in Settings, “Not opened for a while”.',
    settings: 'Settings',
    stowedFor: (days: number) => `Stowed ${daysText(days)} ago`,
    queuedFor: (days: number) => `In the queue for ${daysText(days)}`,
    priority: (n: number) => `#${n} in the queue`,
    more: (n: number) => `and ${words().tabs(n)} more`,
    locked: 'Protected from deletion',
    restore: 'Restore to the tab strip',
    open: 'Open',
    toTop: 'To the top of the queue',
    delete: 'Delete',
    keep: 'Keep',
    keepHint: (days: number) => `“Keep” — shows up here again in ${daysText(days)}.`,
    keptGroup: (title: string, days: number) =>
      `${title} stays stowed — it shows up here again in ${daysText(days)}.`,
    keptVideo: (title: string, days: number) =>
      `${title} stays in the queue — it shows up here again in ${daysText(days)}.`,
    notKept: 'Not saved — everything stays as it was.',
    setting: 'Not opened for a while',
    settingAbout:
      'Stowed groups and queued videos left untouched for long are gathered on the “Not opened for a while” screen.',
    choice: (days: ReviewDays) => (days === 0 ? 'Off' : `After ${daysText(days)}`),
    byDefault: 'Default.',
  },
});

const daysLabels = localized({
  ru: {
    days: (n: number) => `${n} ${pluralRu(n, ['день', 'дня', 'дней'])}`,
    longer: (n: number) => `${n} ${pluralRu(n, ['дня', 'дней', 'дней'])}`,
  },
  en: {
    days: (n: number) => `${n} ${pluralEn(n, ['day', 'days'])}`,
    longer: (n: number) => `${n} ${pluralEn(n, ['day', 'days'])}`,
  },
});

/** «21 день» — after «через», «назад», «в очереди». */
function daysText(days: number): string {
  return daysLabels().days(days);
}

/** «21 дня» — after «дольше», «меньше». */
function daysLonger(days: number): string {
  return daysLabels().longer(days);
}

/** Number of whole days since `time`. */
const daysSince = (time: number, now: number) => Math.max(1, Math.floor((now - time) / DAY_MS));

export function ReviewView({ overview }: { overview: Overview }) {
  const t = text();
  const items = useReview(overview);
  const days = useUi((state) => state.reviewDays);
  const now = useNow();
  const [first] = items;
  const counts = reviewCounts(items);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-[-0.02em]">{t.title}</h1>
        {days > 0 && <p className="text-sm text-fg-muted">{t.intro(days)}</p>}
      </header>

      {days === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-fg-muted">
          {t.off}{' '}
          <a href={routeHash({ view: 'settings' })} className={BUTTON_LINK}>
            {t.settings}
          </a>
        </p>
      ) : !first ? (
        <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-fg-muted">
          {t.nothing(days)}
        </p>
      ) : (
        <>
          <p className="font-mono text-sm text-fg-muted" aria-live="polite">
            {t.left(counts.groups, counts.videos)}
          </p>
          {first.kind === 'group' ? (
            <GroupCard key={first.group.id} item={first} overview={overview} now={now} />
          ) : (
            <VideoCard key={first.video.id} item={first} now={now} />
          )}
          <p className="text-xs text-fg-subtle">{t.keepHint(days)}</p>
        </>
      )}
    </div>
  );
}

const CARD = 'flex flex-col gap-4 rounded-lg border bg-surface p-4 sm:flex-row';

function GroupCard({
  item,
  overview,
  now,
}: {
  item: Extract<ReviewItem, { kind: 'group' }>;
  overview: Overview;
  now: number;
}) {
  const t = text();
  const { group, tabs, since } = item;
  const title = group.title || untitled();
  const space = overview.spaces.find((view) => view.space.id === group.spaceId)?.space;
  const restoreMode = useUi((state) => state.restoreMode);

  return (
    <article
      aria-label={title}
      className={`${CARD} border-dashed border-border-control bg-transparent`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-md font-semibold">
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-full ${GROUP_DOT[group.color]}`}
            />
            <span className="min-w-0 truncate">{title}</span>
            {group.locked && (
              <Lock aria-label={t.locked} className="size-3.5 shrink-0 text-fg-muted" />
            )}
          </h2>
          <p className="pl-[18px] text-sm text-fg-muted">
            {[t.stowedFor(daysSince(since, now)), words().tabs(tabs.length), space?.name]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {group.note && <p className="pl-[18px] text-sm text-fg">{group.note}</p>}
        </div>
        <ul className="flex flex-col gap-1.5 pl-[18px]">
          {tabs.slice(0, LINKS_SHOWN).map((tab) => (
            <li key={tab.id} className="flex min-w-0 items-center gap-2.5 text-sm">
              <img src={faviconUrl(tab.url, 16)} alt="" className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{tab.title || tab.url}</span>
              <span className="max-w-40 shrink-0 truncate text-xs text-fg-subtle">
                {displayHost(tab.url)}
              </span>
            </li>
          ))}
          {tabs.length > LINKS_SHOWN && (
            <li className="text-xs text-fg-subtle">{t.more(tabs.length - LINKS_SHOWN)}</li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={() =>
              runCommand(
                { type: 'restoreGroup', groupId: group.id, mode: restoreMode },
                { name: group.title },
              )
            }
          >
            <ArchiveRestore aria-hidden className="size-4" /> {t.restore}
          </button>
          <button
            type="button"
            className={BUTTON_DANGER}
            disabled={group.locked}
            title={group.locked ? t.locked : undefined}
            onClick={() => runCommand({ type: 'deleteGroup', groupId: group.id }, { name: title })}
          >
            <Trash aria-hidden className="size-4" /> {t.delete}
          </button>
          <KeepButton
            onKeep={() => repositories.groups.markReviewed(group.id)}
            kept={(days) => t.keptGroup(words().quote(title), days)}
          />
        </div>
      </div>
    </article>
  );
}

function VideoCard({ item, now }: { item: Extract<ReviewItem, { kind: 'video' }>; now: number }) {
  const t = text();
  const { video, priority, since } = item;
  const title = video.title || video.url;
  // Opened or moved up: no longer forgotten.
  const markReviewed = () => repositories.queue.markReviewed(video.id).catch(() => undefined);

  return (
    <article aria-label={title} className={`${CARD} border-border`}>
      <VideoThumb item={video} large className="aspect-video w-full rounded-md sm:w-60" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="line-clamp-2 text-md font-semibold">{title}</h2>
          <p className="text-sm text-fg-muted">
            {[video.channel || displayHost(video.url), t.priority(priority)].join(' · ')}
          </p>
          <p className="text-sm text-fg-muted">{t.queuedFor(daysSince(since, now))}</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={() =>
              void runCommand({ type: 'openVideo', itemId: video.id }, { quiet: true }).then(
                (response) => {
                  if (response?.ok) void markReviewed();
                },
              )
            }
          >
            <Play aria-hidden className="size-4" /> {t.open}
          </button>
          <button
            type="button"
            className={BUTTON_SECONDARY}
            disabled={priority === 1}
            onClick={() =>
              void runCommand({ type: 'moveVideo', itemId: video.id, index: 0 }).then(
                (response) => {
                  if (response?.ok) void markReviewed();
                },
              )
            }
          >
            <ArrowUpToLine aria-hidden className="size-4" /> {t.toTop}
          </button>
          <button
            type="button"
            className={BUTTON_DANGER}
            onClick={() => runCommand({ type: 'removeVideo', itemId: video.id })}
          >
            <Trash aria-hidden className="size-4" /> {t.delete}
          </button>
          <KeepButton
            onKeep={() => repositories.queue.markReviewed(video.id)}
            kept={(days) => t.keptVideo(words().quote(title), days)}
          />
        </div>
      </div>
    </article>
  );
}

/** «Оставить»: only the database — the count of days starts again. */
function KeepButton({
  onKeep,
  kept,
}: {
  onKeep: () => Promise<void>;
  kept: (days: number) => string;
}) {
  const t = text();
  return (
    <button
      type="button"
      className={BUTTON_SECONDARY}
      onClick={() => {
        const { showToast, reviewDays } = useUi.getState();
        onKeep().then(
          () => showToast(kept(reviewDays)),
          () => showToast(t.notKept),
        );
      }}
    >
      <Check aria-hidden className="size-4" /> {t.keep}
    </button>
  );
}

/** Settings: after how many days a thing shows up in «Давно не открывали». */
export function ReviewSection() {
  const t = text();
  const days = useUi((state) => state.reviewDays);
  const setDays = useUi((state) => state.setReviewDays);
  return (
    <Section title={t.setting} description={t.settingAbout}>
      <ChoiceList
        name="review-days"
        value={String(days)}
        choices={REVIEW_DAYS.map((option) => ({
          value: String(option),
          label: t.choice(option),
          hint: option === 14 ? t.byDefault : '',
        }))}
        onChange={(value) => setDays(Number(value) as ReviewDays)}
      />
    </Section>
  );
}
