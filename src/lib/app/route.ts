/**
 * Screens of the main page live in the URL hash, so reloading and the back button keep the place:
 * `#/space/<id>` — a space (without an id — «Входящие»), `#/trash` — the trash,
 * `#/side/<id>,<id>` — links side by side («Рядом»), `#/layout/<id>` — a saved layout.
 */
import type { Id } from '../db/models';
import { MAX_TILES } from '../tiling/layout';

export type Route =
  | { view: 'space'; spaceId?: Id }
  | { view: 'trash' }
  | { view: 'side'; tabIds: Id[] }
  | { view: 'layout'; layoutId: Id };

export function parseRoute(hash: string): Route {
  const [, view, id] = hash.replace(/^#/, '').split('/');
  if (view === 'trash') return { view: 'trash' };
  if (view === 'space' && id) return { view: 'space', spaceId: decodeURIComponent(id) };
  if (view === 'layout' && id) return { view: 'layout', layoutId: decodeURIComponent(id) };
  if (view === 'side' && id) {
    const tabIds = [...new Set(id.split(',').filter(Boolean).map(decodeURIComponent))];
    if (tabIds.length > 0) return { view: 'side', tabIds: tabIds.slice(0, MAX_TILES) };
  }
  return { view: 'space' };
}

export function routeHash(route: Route): string {
  switch (route.view) {
    case 'trash':
      return '#/trash';
    case 'side':
      return `#/side/${route.tabIds.map(encodeURIComponent).join(',')}`;
    case 'layout':
      return `#/layout/${encodeURIComponent(route.layoutId)}`;
    case 'space':
      return route.spaceId ? `#/space/${encodeURIComponent(route.spaceId)}` : '#/';
  }
}
