/** In-memory `ExtensionUi` for tests: remembers what the badge and the context menu show. */
import type { ExtensionUi } from '../browser-api';
import type { MenuItem } from '../menus';

export class FakeExtensionUi implements ExtensionUi {
  badge = { text: '', title: 'TabFlow' };
  menu: MenuItem[] = [];
  /** How many times the menu was rebuilt (it is rebuilt only when it changes). */
  menuBuilds = 0;

  setBadge(text: string, title: string): Promise<void> {
    this.badge = { text, title };
    return Promise.resolve();
  }

  setMenu(items: readonly MenuItem[]): Promise<void> {
    this.menu = [...items];
    this.menuBuilds++;
    return Promise.resolve();
  }

  /** Titles of the «В группу ▸» submenu. */
  groupItems(): string[] {
    return this.menu.filter((item) => item.parentId !== undefined).map((item) => item.title);
  }
}
