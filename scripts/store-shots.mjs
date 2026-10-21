/**
 * Screenshots for the Chrome Web Store (1280×800) with made-up data only: the built extension in
 * Playwright's Chromium, a fresh profile, invented sites with letter icons served locally (every
 * host resolves to a local server) and drawn video thumbnails — no real brands, accounts or
 * history. `pnpm build` first, then:
 *
 *   node scripts/store-shots.mjs [ru|en]   → docs/screenshots/<lang>/01-…05-*.png
 *
 * The extension is copied to a temporary folder with site access granted at install (only there:
 * the real manifest asks per site), so that «Рядом» can show the sites without Chrome's prompt.
 */
import { chromium } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const LANG = process.argv[2] === 'en' ? 'en' : 'ru';
const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs', 'screenshots', LANG);
const PORT = 4180;
// Pages are laid out at 1440×900 and shot at 1280×800: four tiles in a row, as on a laptop.
const WIDTH = 1440;
const HEIGHT = 900;
const SCALE = 1280 / WIDTH;

const t = (ru, en) => (LANG === 'ru' ? ru : en);
const NOW = Date.now();
const MIN = 60_000;
const DAY = 86_400_000;

// ---------------------------------------------------------------------------------------------
// Made-up sites: a letter icon in the site color and a page of one of a few kinds.

const SITES = {
  'board.taskline.io': { name: 'Taskline', letter: 'T', color: '#5B8DEF', kind: 'board' },
  'docs.paperleaf.io': { name: 'Paperleaf', letter: 'P', color: '#E8A33D', kind: 'docs' },
  'metrics.quanta.io': { name: 'Quanta', letter: 'Q', color: '#8E6CEF', kind: 'chart' },
  'mail.letterly.net': { name: 'Letterly', letter: 'L', color: '#E25D5D', kind: 'docs' },
  'wiki.atlasdesk.net': { name: 'Atlasdesk', letter: 'A', color: '#3FB27F', kind: 'docs' },
  'learn.lectoria.org': { name: 'Lectoria', letter: 'L', color: '#F06A4A', kind: 'video' },
  'notes.inkwell.io': { name: 'Inkwell', letter: 'I', color: '#C9A227', kind: 'docs' },
  'trips.wayfare.travel': { name: 'Wayfare', letter: 'W', color: '#2E9CCA', kind: 'docs' },
  'cook.saltleaf.kitchen': { name: 'Saltleaf', letter: 'S', color: '#7CB342', kind: 'docs' },
  'code.forgehub.net': { name: 'Forgehub', letter: 'F', color: '#9AA0A6', kind: 'docs' },
  'files.pixelyard.io': { name: 'Pixelyard', letter: 'P', color: '#EC6FA8', kind: 'board' },
  'news.dailybrief.net': { name: 'Daily Brief', letter: 'D', color: '#607D8B', kind: 'docs' },
  'shop.homestead.store': { name: 'Homestead', letter: 'H', color: '#FF8A50', kind: 'docs' },
};

const url = (host, path) => `http://${host}${path}`;

/** Title of every page the data links to, for the server. */
const TITLES = new Map();
const link = (host, path, ru, en) => {
  const title = t(ru, en);
  TITLES.set(url(host, path), title);
  return { url: url(host, path), title };
};

// ---------------------------------------------------------------------------------------------
// The data: spaces, groups in three states, the video queue and a saved layout of «Рядом».

const SPACES = {
  inbox: t('Входящие', 'Inbox'),
  work: t('Работа', 'Work'),
  study: t('Учёба', 'Study'),
  personal: t('Личное', 'Personal'),
};

/** Groups of «Работа» in tile order; `open` ones become native Chrome groups, `asleep` are discarded. */
const WORK_GROUPS = [
  {
    title: t('Релиз 2.4', 'Release 2.4'),
    color: 'blue',
    state: 'active',
    favorite: true,
    note: t('До пятницы: заметки к релизу и демо', 'By Friday: release notes and the demo'),
    links: [
      link('board.taskline.io', '/release-2-4', 'Релиз 2.4 — доска', 'Release 2.4 — board'),
      link('code.forgehub.net', '/pull/412', 'PR 412: кэш поиска', 'PR 412: search cache'),
      link('metrics.quanta.io', '/latency', 'Задержка API — 7 дней', 'API latency — 7 days'),
      link('docs.paperleaf.io', '/release-notes', 'Заметки к релизу 2.4', 'Release notes 2.4'),
      link(
        'mail.letterly.net',
        '/thread/demo',
        'Демо для команды продаж',
        'Demo for the sales team',
      ),
    ],
  },
  {
    title: t('Исследование онбординга', 'Onboarding research'),
    color: 'green',
    state: 'active',
    links: [
      link(
        'docs.paperleaf.io',
        '/interviews',
        'Интервью: 12 пользователей',
        'Interviews: 12 users',
      ),
      link('files.pixelyard.io', '/onboarding', 'Онбординг — макеты', 'Onboarding — mockups'),
      link('metrics.quanta.io', '/funnel', 'Воронка регистрации', 'Sign-up funnel'),
      link('wiki.atlasdesk.net', '/personas', 'Персоны продукта', 'Product personas'),
    ],
  },
  {
    title: t('Квартальный отчёт', 'Quarterly report'),
    color: 'yellow',
    state: 'asleep',
    links: [
      link('metrics.quanta.io', '/q3', 'Итоги III квартала', 'Q3 results'),
      link(
        'docs.paperleaf.io',
        '/q3-report',
        'Отчёт за квартал — черновик',
        'Quarterly report — draft',
      ),
      link('wiki.atlasdesk.net', '/okr', 'Цели на квартал', 'Quarter goals'),
      link('mail.letterly.net', '/thread/finance', 'Цифры от финансов', 'Numbers from finance'),
    ],
  },
  {
    title: t('Найм', 'Hiring'),
    color: 'purple',
    state: 'asleep',
    locked: true,
    links: [
      link('wiki.atlasdesk.net', '/hiring', 'Процесс найма', 'Hiring process'),
      link(
        'mail.letterly.net',
        '/thread/candidates',
        'Кандидаты — неделя 42',
        'Candidates — week 42',
      ),
      link('docs.paperleaf.io', '/test-task', 'Тестовое задание', 'Take-home task'),
    ],
  },
  {
    title: t('Архитектура поиска', 'Search architecture'),
    color: 'red',
    state: 'stowed',
    days: 5,
    note: t('Вернуться после релиза', 'Back to it after the release'),
    links: [
      link(
        'wiki.atlasdesk.net',
        '/search',
        'Поиск: как устроен сейчас',
        'Search: how it works now',
      ),
      link('code.forgehub.net', '/issues/388', 'Задача 388: ранжирование', 'Issue 388: ranking'),
      link('docs.paperleaf.io', '/search-rfc', 'RFC: новый индекс', 'RFC: a new index'),
      link('metrics.quanta.io', '/search', 'Поиск — время ответа', 'Search — response time'),
      link('notes.inkwell.io', '/search', 'Заметки по поиску', 'Search notes'),
      link(
        'news.dailybrief.net',
        '/indexes',
        'Обзор: индексы для поиска',
        'Overview: search indexes',
      ),
    ],
  },
  {
    title: t('Конференция', 'Conference'),
    color: 'cyan',
    state: 'stowed',
    days: 3,
    links: [
      link('docs.paperleaf.io', '/talk', 'Доклад — тезисы', 'Talk — outline'),
      link('files.pixelyard.io', '/slides', 'Слайды доклада', 'Talk slides'),
      link('trips.wayfare.travel', '/conference', 'Билеты и отель', 'Tickets and hotel'),
      link('notes.inkwell.io', '/talk', 'Репетиция: замечания', 'Rehearsal notes'),
    ],
  },
  {
    title: t('Идеи для API', 'API ideas'),
    color: 'orange',
    state: 'stowed',
    days: 20,
    links: [
      link(
        'code.forgehub.net',
        '/discussions/51',
        'Обсуждение: версии API',
        'Discussion: API versions',
      ),
      link('news.dailybrief.net', '/api-design', 'Как проектировать API', 'Designing APIs'),
    ],
  },
  {
    title: t('Бюджет 2027', 'Budget 2027'),
    color: 'grey',
    state: 'stowed',
    days: 9,
    links: [
      link('metrics.quanta.io', '/costs', 'Расходы по командам', 'Costs by team'),
      link('docs.paperleaf.io', '/budget', 'Бюджет 2027 — план', 'Budget 2027 — plan'),
      link('mail.letterly.net', '/thread/budget', 'Согласование бюджета', 'Budget approval'),
    ],
  },
];

/** Stowed groups of the other spaces. */
const OTHER_GROUPS = [
  {
    space: 'study',
    title: t('Курс TypeScript', 'TypeScript course'),
    color: 'blue',
    days: 2,
    links: [
      link('learn.lectoria.org', '/ts/4', 'Урок 4. Дженерики', 'Lesson 4. Generics'),
      link('learn.lectoria.org', '/ts/5', 'Урок 5. Условные типы', 'Lesson 5. Conditional types'),
      link('notes.inkwell.io', '/ts', 'Конспект курса', 'Course notes'),
    ],
  },
  {
    space: 'study',
    title: t('Статистика', 'Statistics'),
    color: 'green',
    days: 6,
    links: [
      link(
        'learn.lectoria.org',
        '/stats/3',
        'Лекция 3. Доверительные интервалы',
        'Lecture 3. Confidence intervals',
      ),
      link(
        'news.dailybrief.net',
        '/ab-tests',
        'A/B-тесты без ошибок',
        'A/B tests without mistakes',
      ),
    ],
  },
  {
    space: 'personal',
    title: t('Поездка в горы', 'Mountain trip'),
    color: 'cyan',
    days: 4,
    links: [
      link('trips.wayfare.travel', '/mountains', 'Маршрут на 5 дней', 'A 5-day route'),
      link('shop.homestead.store', '/tents', 'Палатки на двоих', 'Two-person tents'),
      link('trips.wayfare.travel', '/weather', 'Погода в горах', 'Mountain weather'),
    ],
  },
  {
    space: 'personal',
    title: t('Рецепты', 'Recipes'),
    color: 'orange',
    days: 12,
    links: [
      link('cook.saltleaf.kitchen', '/soup', 'Тыквенный суп', 'Pumpkin soup'),
      link('cook.saltleaf.kitchen', '/bread', 'Хлеб без замеса', 'No-knead bread'),
    ],
  },
  {
    space: 'inbox',
    title: t('18 окт · отложено', 'Oct 18 · saved for later'),
    color: 'grey',
    days: 2,
    links: [
      link(
        'news.dailybrief.net',
        '/focus',
        'Как работать без отвлечений',
        'Working without distractions',
      ),
      link('shop.homestead.store', '/lamp', 'Настольная лампа', 'Desk lamp'),
    ],
  },
];

/** The queue: `thumb` draws the thumbnail (served for the made-up video id). */
const VIDEOS = [
  {
    id: 'lectoria-ts',
    title: t('Дженерики в TypeScript без боли', 'TypeScript generics without the pain'),
    channel: 'Lectoria',
    duration: 37 * 60 + 5,
    position: 12 * 60 + 40,
    thumb: { bg: '#1E3A5F', fg: '#8AB4F8', text: '<T>' },
  },
  {
    id: 'coffee-index',
    title: t(
      'Индексы в базе данных: как читать план запроса',
      'Database indexes: reading a query plan',
    ),
    channel: t('Код и кофе', 'Code & Coffee'),
    duration: 24 * 60 + 10,
    position: 0,
    thumb: { bg: '#3B2A1E', fg: '#FCAD70', text: 'INDEX' },
  },
  {
    id: 'course-stats',
    title: t(
      'Статистика для продуктовых решений. Лекция 3',
      'Statistics for product decisions. Lecture 3',
    ),
    channel: t('Открытый курс', 'Open Course'),
    duration: 52 * 60 + 40,
    position: 0,
    thumb: { bg: '#1F3B2D', fg: '#81C995', text: 'p < 0.05' },
  },
  {
    id: 'coffee-gc',
    title: t('Как устроен сборщик мусора', 'How a garbage collector works'),
    channel: t('Код и кофе', 'Code & Coffee'),
    duration: 18 * 60 + 30,
    position: 0,
    thumb: { bg: '#2D2140', fg: '#C58AF9', text: 'GC' },
  },
  {
    id: 'wayfare-hike',
    title: t(
      'Горы за пять дней: маршрут и снаряжение',
      'Five days in the mountains: route and gear',
    ),
    channel: 'Wayfare',
    duration: 14 * 60 + 20,
    position: 0,
    thumb: { bg: '#163640', fg: '#78D9EC', text: '5 × ▲' },
  },
  {
    id: 'saltleaf-bread',
    title: t('Хлеб без замеса за 10 минут работы', 'No-knead bread in 10 minutes of work'),
    channel: 'Saltleaf',
    duration: 11 * 60 + 45,
    position: 0,
    thumb: { bg: '#3A3418', fg: '#FDD663', text: '10′' },
  },
];
const WATCHED = [
  {
    id: 'lectoria-ts3',
    title: t('Урок 3. Типы и интерфейсы', 'Lesson 3. Types and interfaces'),
    channel: 'Lectoria',
    duration: 29 * 60,
  },
];

const VIDEO_HOST = 'learn.lectoria.org';
for (const video of [...VIDEOS, ...WATCHED])
  TITLES.set(url(VIDEO_HOST, `/watch/${video.id}`), video.title);

const LAYOUT = {
  name: t('Релиз: доска и метрики', 'Release: board and metrics'),
  links: [WORK_GROUPS[0].links[0], WORK_GROUPS[0].links[2], WORK_GROUPS[0].links[3]],
};

// ---------------------------------------------------------------------------------------------
// The local server: every host maps here (`--host-resolver-rules`), the Host header picks the site.

const escape = (text) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function favicon(site) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${site.color}"/><text x="16" y="22.5" font-family="Segoe UI, Arial, sans-serif" font-size="19" font-weight="700" text-anchor="middle" fill="#fff">${site.letter}</text></svg>`;
}

function thumbnail(id) {
  const video = [...VIDEOS, ...WATCHED].find((v) => v.id === id);
  const { bg, fg, text } = video?.thumb ?? { bg: '#2A2F36', fg: '#DADCE0', text: '▶' };
  // The text stays low on the left: the middle is for the play icon of TabFlow, the top left
  // corner for the queue number, the bottom right one for the time.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="${bg}"/><circle cx="270" cy="30" r="64" fill="${fg}" opacity=".12"/><text x="22" y="138" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" fill="${fg}">${escape(text)}</text><rect x="22" y="150" width="96" height="7" rx="3.5" fill="${fg}" opacity=".35"/><rect x="22" y="163" width="64" height="7" rx="3.5" fill="${fg}" opacity=".2"/></svg>`;
}

const lines = (n, widths = [92, 86, 95, 70]) =>
  Array.from(
    { length: n },
    (_, i) => `<div class="line" style="width:${widths[i % widths.length]}%"></div>`,
  ).join('');

function pageBody(site, title, path) {
  const accent = site.color;
  if (site.kind === 'board') {
    const columns = [
      t('Сделать', 'To do'),
      t('В работе', 'In progress'),
      t('Проверка', 'Review'),
      t('Готово', 'Done'),
    ];
    const cards = [
      [
        t('Заметки к релизу', 'Release notes'),
        t('Обновить скриншоты', 'Update screenshots'),
        t('Проверить переводы', 'Check translations'),
      ],
      [t('Кэш поиска', 'Search cache'), t('Экспорт в CSV', 'CSV export')],
      [t('Новый онбординг', 'New onboarding'), t('Тёмная тема', 'Dark theme')],
      [
        t('Права доступа', 'Access rights'),
        t('Метрики задержки', 'Latency metrics'),
        t('Миграция БД', 'DB migration'),
      ],
    ];
    return `<main class="board">${columns
      .map(
        (name, i) =>
          `<section><h3>${name} <span>${cards[i].length}</span></h3>${cards[i]
            .map(
              (card, j) =>
                `<div class="card"><b>${card}</b><div class="tags"><i style="background:${['#5B8DEF', '#3FB27F', '#E8A33D', '#EC6FA8'][(i + j) % 4]}"></i></div></div>`,
            )
            .join('')}</section>`,
      )
      .join('')}</main>`;
  }
  if (site.kind === 'chart') {
    const points = [42, 38, 45, 40, 52, 47, 44, 39, 36, 41, 35, 33, 37, 31];
    const max = 60;
    const step = 560 / (points.length - 1);
    const path2 = points
      .map(
        (p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(200 - (p / max) * 200).toFixed(1)}`,
      )
      .join(' ');
    const kpis = [
      [t('p50, мс', 'p50, ms'), '33'],
      [t('p95, мс', 'p95, ms'), '118'],
      [t('Ошибки', 'Errors'), '0,12 %'],
    ];
    return `<main class="chart"><div class="kpis">${kpis.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div><svg viewBox="-10 -10 580 230" preserveAspectRatio="none"><g stroke="#E3E6EA">${[0, 50, 100, 150, 200].map((y) => `<line x1="0" x2="560" y1="${y}" y2="${y}"/>`).join('')}</g><path d="${path2}" fill="none" stroke="${accent}" stroke-width="3"/></svg><div class="bars">${[64, 80, 52, 90, 70, 58, 76].map((h) => `<i style="height:${h}%;background:${accent}"></i>`).join('')}</div></main>`;
  }
  if (site.kind === 'video') {
    const video = VIDEOS.find((v) => path.endsWith(v.id)) ?? VIDEOS[0];
    return `<main class="video"><div class="player"><div class="play"></div><div class="bar"><i></i></div></div><h1>${escape(title)}</h1><p class="channel">${escape(video.channel)} · ${Math.round(video.duration / 60)} ${t('мин', 'min')}</p>${lines(3)}<h3>${t('Следующие уроки', 'Up next')}</h3>${VIDEOS.slice(
      1,
      4,
    )
      .map(
        (v) =>
          `<div class="next"><div class="mini" style="background:${v.thumb.bg}"></div><span>${escape(v.title)}</span></div>`,
      )
      .join('')}</main>`;
  }
  return `<main class="docs"><aside>${Array.from({ length: 7 }, (_, i) => `<div class="nav${i === 1 ? ' on' : ''}"></div>`).join('')}</aside><article><h1>${escape(title)}</h1><p class="meta">${escape(site.name)} · ${t('обновлено вчера', 'updated yesterday')}</p>${lines(4)}<h2>${t('Главное', 'Key points')}</h2>${lines(5)}<div class="quote">${lines(2)}</div>${lines(4)}</article></main>`;
}

const PAGE_CSS = `*{box-sizing:border-box}body{margin:0;font:14px/1.5 "Segoe UI",Arial,sans-serif;color:#1F2328;background:#F6F7F9}
header{display:flex;align-items:center;gap:10px;height:52px;padding:0 20px;background:#fff;border-bottom:1px solid #E3E6EA;font-weight:600}
header img{width:22px;height:22px}header nav{margin-left:auto;display:flex;gap:16px;color:#6A737D;font-weight:400}
.line{height:10px;border-radius:5px;background:#E3E6EA;margin:10px 0}
.docs{display:flex;gap:28px;padding:28px}.docs aside{width:180px;flex:none}.nav{height:12px;border-radius:6px;background:#E3E6EA;margin:14px 0;width:80%}.nav.on{background:var(--accent);opacity:.5}
.docs article{flex:1;max-width:720px;background:#fff;border:1px solid #E3E6EA;border-radius:10px;padding:28px 32px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:22px 0 4px}.meta{color:#6A737D;margin:0 0 12px}
.quote{border-left:3px solid var(--accent);padding-left:14px;margin:16px 0}
.board{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:14px;padding:20px}.board section{background:#EDEFF2;border-radius:10px;padding:10px}
.board h3{font-size:13px;margin:4px 4px 10px;color:#4A525C}.board h3 span{color:#8A939D;font-weight:400}.card{background:#fff;border:1px solid #E3E6EA;border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:13px}.tags i{display:inline-block;width:34px;height:6px;border-radius:3px;margin-top:8px;opacity:.7}
.chart{padding:22px}.kpis{display:flex;gap:14px;margin-bottom:16px}.kpis div{flex:1;background:#fff;border:1px solid #E3E6EA;border-radius:10px;padding:12px 16px}.kpis small{color:#6A737D;display:block}.kpis b{font-size:24px}
.chart svg{width:100%;height:230px;background:#fff;border:1px solid #E3E6EA;border-radius:10px;padding:12px}.bars{display:flex;align-items:flex-end;gap:12px;height:120px;margin-top:16px;background:#fff;border:1px solid #E3E6EA;border-radius:10px;padding:12px}.bars i{flex:1;border-radius:4px 4px 0 0;opacity:.75}
.video{max-width:860px;padding:22px 28px}.player{position:relative;aspect-ratio:16/9;background:#111418;border-radius:10px;display:flex;align-items:center;justify-content:center}
.play{width:0;height:0;border-left:34px solid #fff;border-top:21px solid transparent;border-bottom:21px solid transparent;opacity:.85}.bar{position:absolute;left:14px;right:14px;bottom:14px;height:4px;background:#ffffff40;border-radius:2px}.bar i{display:block;width:34%;height:100%;background:var(--accent);border-radius:2px}
.video h1{margin-top:16px}.channel{color:#6A737D;margin:0 0 6px}.next{display:flex;align-items:center;gap:12px;margin:10px 0}.mini{width:120px;height:68px;border-radius:6px;flex:none}`;

function sitePage(host, path) {
  const site = SITES[host];
  const title = TITLES.get(url(host, path)) ?? site.name;
  const sections = t(['Обзор', 'Проекты', 'Команда'], ['Overview', 'Projects', 'Team']);
  return `<!doctype html><html lang="${LANG}"><head><meta charset="utf-8"><title>${escape(title)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>:root{--accent:${site.color}}${PAGE_CSS}</style></head><body><header><img src="/favicon.svg" alt="">${escape(site.name)}<nav>${sections.map((s) => `<span>${s}</span>`).join('')}</nav></header>${pageBody(site, title, path)}</body></html>`;
}

function startServer() {
  const server = createServer((request, response) => {
    const host = (request.headers.host ?? '').split(':')[0];
    const path = (request.url ?? '/').split('?')[0];
    const site = SITES[host];
    if (!site) return response.writeHead(404).end();
    if (path === '/favicon.svg' || path === '/favicon.ico') {
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      return response.end(favicon(site));
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(sitePage(host, path));
  });
  return new Promise((done) => server.listen(PORT, '127.0.0.1', () => done(server)));
}

// ---------------------------------------------------------------------------------------------
// The browser.

function extensionCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'tabflow-shots-'));
  cpSync(join(ROOT, '.output', 'chrome-mv3'), dir, { recursive: true });
  const manifestPath = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = ['*://*/*'];
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return dir;
}

async function launch(extension, profile) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    locale: t('ru-RU', 'en-US'),
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    colorScheme: 'dark',
    args: [
      `--lang=${t('ru', 'en-US')}`,
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      `--host-resolver-rules=MAP * 127.0.0.1:${PORT}, EXCLUDE 127.0.0.1`,
    ],
  });
  // Thumbnails of the queue are YouTube addresses by video id: answer with the drawn ones.
  await context.route('https://i.ytimg.com/**', (route) => {
    const id = /\/vi\/([^/]+)\//.exec(route.request().url())?.[1] ?? '';
    return route.fulfill({ contentType: 'image/svg+xml', body: thumbnail(id) });
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return { context, extensionId: new URL(worker.url()).host };
}

/** Runs `fn(chrome, arg)` in an extension page (an expression: the page CSP forbids `eval`). */
const inPage = (page, fn, arg) =>
  page.evaluate(`(${fn.toString()})(globalThis.chrome, ${JSON.stringify(arg ?? null)})`);

/** IndexedDB of TabFlow, opened from an extension page (pages read Dexie the same way). */
async function dbRows(page, store) {
  return page.evaluate(async (name) => {
    const db = await new Promise((done, fail) => {
      const request = indexedDB.open('tabflow');
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
    });
    const rows = await new Promise((done, fail) => {
      const request = db.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
    });
    db.close();
    return rows;
  }, store);
}

async function dbPut(page, store, rows) {
  await page.evaluate(
    async ([name, records]) => {
      const db = await new Promise((done, fail) => {
        const request = indexedDB.open('tabflow');
        request.onsuccess = () => done(request.result);
        request.onerror = () => fail(request.error);
      });
      await new Promise((done, fail) => {
        const tx = db.transaction(name, 'readwrite');
        for (const record of records) tx.objectStore(name).put(record);
        tx.oncomplete = done;
        tx.onerror = () => fail(tx.error);
      });
      db.close();
    },
    [store, rows],
  );
}

async function until(check, what, timeout = 15_000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${what}`);
    await new Promise((done) => setTimeout(done, 150));
  }
}

/** Opens the pages once so that Chrome's favicon cache knows their icons (`_favicon`). */
async function visitAll(app, urls) {
  for (let i = 0; i < urls.length; i += 8) {
    await inPage(
      app,
      async (chrome, batch) => {
        const tabs = await Promise.all(
          batch.map((u) => chrome.tabs.create({ url: u, active: false })),
        );
        for (let n = 0; n < 100; n++) {
          const now = await Promise.all(tabs.map((tab) => chrome.tabs.get(tab.id)));
          if (now.every((tab) => tab.status === 'complete' && tab.favIconUrl)) break;
          await new Promise((done) => setTimeout(done, 100));
        }
        await new Promise((done) => setTimeout(done, 300));
        await chrome.tabs.remove(tabs.map((tab) => tab.id));
      },
      urls.slice(i, i + 8),
    );
  }
}

const id = () => crypto.randomUUID();

function backup() {
  const spaceIds = Object.fromEntries(Object.keys(SPACES).map((key) => [key, id()]));
  const spaces = Object.entries(SPACES).map(([key, name], order) => ({
    id: spaceIds[key],
    name,
    order,
    isDefault: key === 'inbox',
    createdAt: NOW - 40 * DAY,
    updatedAt: NOW - 40 * DAY,
  }));
  const stowed = [
    ...WORK_GROUPS.filter((g) => g.state === 'stowed').map((g) => ({ ...g, space: 'work' })),
    ...OTHER_GROUPS,
  ];
  const groups = [];
  const tabs = [];
  stowed.forEach((group, order) => {
    const groupId = id();
    const changed = NOW - group.days * DAY - 3 * 3600_000;
    groups.push({
      id: groupId,
      spaceId: spaceIds[group.space],
      title: group.title,
      color: group.color,
      state: 'stowed',
      stateChangedAt: changed,
      order: order + 1,
      ...(group.note && { note: group.note }),
      createdAt: changed - 2 * DAY,
      updatedAt: changed,
    });
    group.links.forEach((l, i) =>
      tabs.push({
        id: id(),
        groupId,
        url: l.url,
        title: l.title,
        order: i + 1,
        pinned: false,
        createdAt: changed - 2 * DAY,
        updatedAt: changed,
      }),
    );
  });
  const video = (v, order, status) => ({
    id: id(),
    url: url(VIDEO_HOST, `/watch/${v.id}`),
    title: v.title,
    site: VIDEO_HOST,
    videoId: v.id,
    channel: v.channel,
    durationSec: v.duration,
    positionSec: v.position ?? 0,
    status,
    order,
    ...(status === 'watched' && { watchedAt: NOW - DAY }),
    createdAt: NOW - (order + 1) * DAY,
    updatedAt: NOW - DAY,
  });
  return {
    format: 'tabflow-backup',
    version: 1,
    exportedAt: NOW,
    spaces,
    groups,
    tabs,
    queue: [
      ...VIDEOS.map((v, i) => video(v, i + 1, 'queued')),
      ...WATCHED.map((v, i) => video(v, 100 + i, 'watched')),
    ],
    layouts: [
      {
        id: id(),
        name: LAYOUT.name,
        order: 1,
        links: LAYOUT.links,
        createdAt: NOW - DAY,
        updatedAt: NOW - DAY,
      },
    ],
    settings: {},
  };
}

/** Opens the groups that are on the tab strip as native Chrome groups in the window of `app`. */
async function openGroups(app) {
  const open = WORK_GROUPS.filter((g) => g.state !== 'stowed');
  for (const group of open) {
    await inPage(
      app,
      async (chrome, g) => {
        const windowId = (await chrome.tabs.getCurrent()).windowId;
        const tabs = await Promise.all(
          g.links.map((l) => chrome.tabs.create({ url: l.url, windowId, active: false })),
        );
        for (let n = 0; n < 100; n++) {
          const now = await Promise.all(tabs.map((tab) => chrome.tabs.get(tab.id)));
          if (now.every((tab) => tab.status === 'complete')) break;
          await new Promise((done) => setTimeout(done, 100));
        }
        const groupId = await chrome.tabs.group({
          tabIds: tabs.map((tab) => tab.id),
          createProperties: { windowId },
        });
        await chrome.tabGroups.update(groupId, { title: g.title, color: g.color });
      },
      group,
    );
  }
  const groups = await until(async () => {
    const rows = await dbRows(app, 'groups');
    const found = open.map((g) => rows.find((r) => r.title === g.title && !r.deletedAt));
    return found.every(Boolean) && found;
  }, 'mirrored groups');
  for (const [i, group] of open.entries()) {
    if (group.state === 'asleep') {
      await inPage(
        app,
        (chrome, groupId) => chrome.runtime.sendMessage({ type: 'sleepGroup', groupId }),
        groups[i].id,
      );
    }
  }
}

/** Puts the open groups into «Работа» and sets the tile order, favorite, lock, note and times. */
async function arrangeWork(app) {
  const spaces = await dbRows(app, 'spaces');
  const work = spaces.find((s) => s.name === SPACES.work && !s.deletedAt);
  const rows = await dbRows(app, 'groups');
  const updated = WORK_GROUPS.map((group, order) => {
    const row = rows.find((r) => r.title === group.title && !r.deletedAt);
    const changed = group.state === 'asleep' ? NOW - (order + 1) * 47 * MIN : row.stateChangedAt;
    return {
      ...row,
      spaceId: work.id,
      order: order + 1,
      ...(group.favorite && { favorite: true }),
      ...(group.locked && { locked: true }),
      ...(group.note && { note: group.note }),
      ...(changed && { stateChangedAt: changed }),
    };
  });
  await dbPut(app, 'groups', updated);
  await inPage(app, (chrome) => chrome.runtime.sendMessage({ type: 'arrangeGroups' }));
  return work.id;
}

// ---------------------------------------------------------------------------------------------
// Shots.

async function compose(context, html, file) {
  const page = await context.newPage();
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#0E1013">${html}</body></html>`,
  );
  await page.waitForLoadState('load');
  await page.screenshot({ path: file });
  await page.close();
}

/** A screenshot placed `width` CSS pixels wide (it was taken at `SCALE`). */
const img = (png, width, style = '') =>
  `<img src="data:image/png;base64,${png.toString('base64')}" style="display:block;width:${width}px;${style}">`;

/** Width of Chrome's side panel next to the page. */
const PANEL_WIDTH = 400;

/**
 * Opens an extension page as a background tab of the window of `pageUrl` and makes that page the
 * active tab: the popup and the side panel then see it as «the current tab», as in Chrome.
 */
async function openBehind(context, app, pageUrl, extensionUrl) {
  const [page] = await Promise.all([
    context.waitForEvent('page', (p) => p.url().startsWith(extensionUrl)),
    inPage(
      app,
      async (chrome, [address, extensionAddress]) => {
        const [tab] = await chrome.tabs.query({ url: address });
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.tabs.create({ url: extensionAddress, windowId: tab.windowId, active: false });
      },
      [pageUrl, extensionUrl],
    ),
  ]);
  await page.waitForLoadState('networkidle');
  return page;
}

async function main() {
  const extension = extensionCopy();
  const profile = mkdtempSync(join(tmpdir(), 'tabflow-profile-'));
  const server = await startServer();
  const { context, extensionId } = await launch(extension, profile);
  const base = `chrome-extension://${extensionId}`;
  mkdirSync(OUT, { recursive: true });
  try {
    const app = await context.newPage();
    await app.goto(`${base}/app.html`);
    await inPage(
      app,
      (chrome, lang) => chrome.storage.local.set({ 'tabflow.language': lang }),
      LANG,
    );

    await visitAll(app, [...TITLES.keys()]);
    await inPage(
      app,
      (chrome, file) =>
        chrome.runtime.sendMessage({ type: 'importBackup', backup: file, replace: false }),
      backup(),
    );
    await openGroups(app);
    const workId = await arrangeWork(app);
    await new Promise((done) => setTimeout(done, 1500));

    // 1. The main page: tiles in three states and the queue.
    await app.goto(`${base}/app.html#/space/${workId}`);
    await app.reload();
    await app.waitForLoadState('networkidle');
    await new Promise((done) => setTimeout(done, 1200));
    await app.screenshot({ path: join(OUT, '01-main.png') });

    // 2. The command palette.
    await app.keyboard.press('Control+KeyK');
    await app.keyboard.type(t('релиз', 'release'), { delay: 40 });
    await new Promise((done) => setTimeout(done, 600));
    await app.screenshot({ path: join(OUT, '02-palette.png') });
    await app.keyboard.press('Escape');

    // 3. The queue in the side panel next to a video page.
    const pageUrl = url(VIDEO_HOST, `/watch/${VIDEOS[0].id}`);
    const site = await context.newPage();
    await site.setViewportSize({ width: WIDTH - PANEL_WIDTH, height: HEIGHT });
    await site.goto(pageUrl);
    const panel = await openBehind(context, app, pageUrl, `${base}/sidepanel.html`);
    await panel.setViewportSize({ width: PANEL_WIDTH, height: HEIGHT });
    await new Promise((done) => setTimeout(done, 800));
    await compose(
      context,
      `<div style="display:flex">${img(await site.screenshot(), WIDTH - PANEL_WIDTH - 1)}<div style="width:1px;background:#2A2F36"></div>${img(await panel.screenshot(), PANEL_WIDTH)}</div>`,
      join(OUT, '03-queue.png'),
    );
    await panel.close();

    // 4. «Рядом»: the saved layout.
    const layouts = await dbRows(app, 'layouts');
    await app.goto(`${base}/app.html#/layout/${layouts[0].id}`);
    await app.reload();
    await app.waitForLoadState('networkidle');
    await new Promise((done) => setTimeout(done, 2000));
    await app.screenshot({ path: join(OUT, '04-side-by-side.png') });

    // 5. The popup over the page.
    await site.setViewportSize({ width: WIDTH, height: HEIGHT });
    const popup = await openBehind(context, app, pageUrl, `${base}/popup.html`);
    await popup.setViewportSize({ width: 360, height: 700 });
    await new Promise((done) => setTimeout(done, 800));
    const popupPng = await popup.locator('main').screenshot();
    await compose(
      context,
      // A bit larger than in Chrome (360 px), so that it reads on the store page.
      `${img(await site.screenshot(), WIDTH, 'filter:brightness(.55)')}${img(popupPng, 430, 'position:absolute;top:12px;right:16px;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.55),0 0 0 1px #2A2F36')}`,
      join(OUT, '05-popup.png'),
    );
    console.log(`Screenshots: ${OUT}`);
  } finally {
    await context.close();
    server.close();
    rmSync(extension, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
