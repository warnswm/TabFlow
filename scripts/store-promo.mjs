/**
 * Promo images of the Chrome Web Store, drawn from HTML in Playwright's Chromium: the small tile
 * 440×280 (required) and the marquee 1400×560 (optional). The logo, the name and three tiles —
 * active, asleep, stowed; no other text (the store advises against it, and the tiles are the same
 * for every language).
 *
 *   node scripts/store-promo.mjs   → store/images/promo-small-440x280.png, promo-marquee-1400x560.png
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'store', 'images');
const font = readFileSync(
  join(ROOT, 'node_modules', '@fontsource', 'onest', 'files', 'onest-latin-600-normal.woff2'),
).toString('base64');

// Tokens of design/tokens.css.
const BG = '#0E1013';
const SURFACE = '#161A1F';
const RAISED = '#1D2228';
const BORDER = '#2A2F36';
const CONTROL = '#656E7B';
const TEAL = '#2DD4BF';
const INK = '#04201C';

/** The logo of the popup and the icon: three tiles and a line on the teal square. */
const logo = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><rect width="24" height="24" rx="6.5" fill="${TEAL}"/><g transform="translate(3.6 3.4) scale(.7)" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7"/></g></svg>`;

const MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="#C9CED6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
const ARCHIVE = `<svg viewBox="0 0 24 24" fill="none" stroke="#C9CED6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`;

/** A group tile: 2×2 icons of made-up sites, the color dot and a bar for the title. */
function tile({ width, state, color, icons }) {
  const preview = icons
    .map((c) => `<div class="cell"><i style="background:${c}"></i><b></b></div>`)
    .join('');
  const badge =
    state === 'asleep'
      ? `<span class="badge">${MOON}</span>`
      : state === 'stowed'
        ? `<span class="badge">${ARCHIVE}</span>`
        : '';
  return `<div class="tile ${state}" style="width:${width}px">${badge}<div class="preview" style="height:${Math.round((width * 9) / 16)}px">${preview}</div><div class="meta"><span class="dot" style="background:${color}"></span><span class="title"></span></div><div class="sub"></div></div>`;
}

const TILES = [
  { state: 'active', color: '#8AB4F8', icons: ['#5B8DEF', '#9AA0A6', '#8E6CEF', '#E8A33D'] },
  { state: 'asleep', color: '#FDD663', icons: ['#3FB27F', '#E25D5D', '#E8A33D', '#2E9CCA'] },
  { state: 'stowed', color: '#81C995', icons: ['#EC6FA8', '#F06A4A', '#C9A227', '#7CB342'] },
];

const css = (scale) => `
@font-face{font-family:Onest;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:600}
*{box-sizing:border-box}body{margin:0;background:${BG};font-family:Onest,sans-serif;overflow:hidden}
.tile{position:relative;background:${SURFACE};border:${1 * scale}px solid ${BORDER};border-radius:${12 * scale}px;overflow:hidden}
.tile.asleep .preview,.tile.asleep .meta{opacity:.5}
.tile.stowed{background:transparent;border:${1.5 * scale}px dashed ${CONTROL}}
.preview{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;overflow:hidden;gap:${2 * scale}px;background:${BG}}
.tile.stowed .preview{background:transparent}
.cell{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${5 * scale}px;background:${SURFACE}}
.tile.stowed .cell{background:transparent}
.cell i{width:${14 * scale}px;height:${14 * scale}px;border-radius:${3.5 * scale}px;opacity:.9}
.cell b{width:44%;height:${3 * scale}px;border-radius:9px;background:${RAISED}}
.meta{display:flex;align-items:center;gap:${7 * scale}px;padding:${11 * scale}px ${12 * scale}px ${6 * scale}px}
.dot{width:${8 * scale}px;height:${8 * scale}px;border-radius:50%}
.title{height:${7 * scale}px;width:58%;border-radius:9px;background:#C9CED6;opacity:.8}
.sub{height:${5 * scale}px;width:40%;margin:${2 * scale}px ${12 * scale}px ${12 * scale}px ${27 * scale}px;border-radius:9px;background:${RAISED}}
.badge{position:absolute;top:${7 * scale}px;left:${7 * scale}px;z-index:1;display:flex;padding:${4 * scale}px;border-radius:${6 * scale}px;background:${BG}}
.badge svg{width:${12 * scale}px;height:${12 * scale}px}
.brand{display:flex;align-items:center;color:#F1F3F5;font-weight:600;letter-spacing:-.01em}
`;

function small() {
  return `<style>${css(1)}</style><div style="width:440px;height:280px;position:relative">
<div class="brand" style="position:absolute;left:28px;top:26px;gap:12px;font-size:30px">${logo(44)}TabFlow</div>
<div style="position:absolute;left:28px;right:28px;bottom:26px;display:flex;gap:12px">${TILES.map((t) => tile({ ...t, width: 120 })).join('')}</div>
</div>`;
}

function marquee() {
  return `<style>${css(2)}</style><div style="width:1400px;height:560px;position:relative">
<div class="brand" style="position:absolute;left:96px;top:50%;transform:translateY(-50%);gap:24px;font-size:72px">${logo(100)}TabFlow</div>
<div style="position:absolute;right:96px;top:50%;transform:translateY(-50%);display:flex;gap:24px">${TILES.map((t) => tile({ ...t, width: 210 })).join('')}</div>
</div>`;
}

const browser = await chromium.launch({ channel: 'chromium' });
try {
  mkdirSync(OUT, { recursive: true });
  for (const [name, html, width, height] of [
    ['promo-small-440x280.png', small(), 440, 280],
    ['promo-marquee-1400x560.png', marquee(), 1400, 560],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(OUT, name) });
    await page.close();
  }
  console.log(`Promo images: ${OUT}`);
} finally {
  await browser.close();
}
