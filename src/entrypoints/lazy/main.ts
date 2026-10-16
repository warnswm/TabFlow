/**
 * Placeholder of a restored tab (see `lib/placeholder.ts`): shows the real title and icon while
 * the tab waits discarded, and goes to the real page as soon as the tab is opened.
 */
import { cachedFaviconUrl, parsePlaceholderUrl } from '@/lib/placeholder';

const pageUrl = location.href.split('#')[0] ?? '';
const target = parsePlaceholderUrl(pageUrl, location.href);

function go(): void {
  // `replace`: the placeholder does not stay in the tab's history.
  if (target) location.replace(target.url);
}

if (target) {
  document.title = target.title;
  // The site's icon from Chrome's own favicon cache: local and instant, so the tab shows it
  // before it is discarded (a remote icon would still be downloading).
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = cachedFaviconUrl(location.origin, target.url);
  document.head.append(icon);
  const title = document.getElementById('title');
  const url = document.getElementById('url');
  const open = document.getElementById('open');
  if (title) title.textContent = target.title;
  if (url) url.textContent = target.url;
  if (open) {
    open.setAttribute('href', target.url);
    open.addEventListener('click', (event) => {
      event.preventDefault();
      go();
    });
  }

  // Opened by the user (or loaded while visible): go to the real page right away.
  if (document.visibilityState === 'visible') go();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') go();
  });
}
