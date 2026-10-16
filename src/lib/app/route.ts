/**
 * Screens of the main page live in the URL hash, so reloading and the back button keep the place:
 * `#/space/<id>` — a space (without an id — «Входящие»), `#/trash` — the trash.
 */
import type { Id } from '../db/models';

export type Route = { view: 'space'; spaceId?: Id } | { view: 'trash' };

export function parseRoute(hash: string): Route {
  const [, view, id] = hash.replace(/^#/, '').split('/');
  if (view === 'trash') return { view: 'trash' };
  if (view === 'space' && id) return { view: 'space', spaceId: decodeURIComponent(id) };
  return { view: 'space' };
}

export function routeHash(route: Route): string {
  if (route.view === 'trash') return '#/trash';
  return route.spaceId ? `#/space/${encodeURIComponent(route.spaceId)}` : '#/';
}
