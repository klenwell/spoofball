import { appInfo } from '../app-info';
import { createMatchPreview } from './match-preview';
import { hashFor, isCanonicalHash, tabById, tabFromHash, tabs, type TabId } from './tabs';

/**
 * The app shell (#21): a header with the tab bar, the current tab's screen,
 * and a footer with the version and the GitHub link. On phones the tab bar is
 * fixed to the bottom of the screen; on wider screens it sits in the header
 * (see `app.css`). Routing rules live in `tabs.ts`; this file only wires them
 * to the DOM. Every value is set as text, never parsed as HTML.
 */

const SOURCE_URL = 'https://github.com/klenwell/spoofball';

/** Extra content a tab shows under its heading, built the first time the tab opens. */
const panelBuilders: Partial<Record<TabId, () => HTMLElement>> = {
  match: createMatchPreview,
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function tabLink(id: TabId, label: string): HTMLAnchorElement {
  const link = el('a', 'tab');
  link.href = hashFor(id);
  link.dataset.tab = id;
  const icon = el('span', 'tab-icon');
  icon.setAttribute('aria-hidden', 'true');
  link.append(icon, el('span', 'tab-label', label));
  return link;
}

function footer(): HTMLElement {
  const foot = el('footer', 'app-footer');
  const source = el('a', undefined, 'Source and progress on GitHub');
  source.href = SOURCE_URL;
  const dot = el('span', undefined, '·');
  dot.setAttribute('aria-hidden', 'true');
  foot.append(el('span', 'version', appInfo().version), dot, source);
  return foot;
}

export function mountAppShell(root: HTMLElement): void {
  const header = el('header', 'app-bar');
  const nav = el('nav', 'tab-bar');
  nav.setAttribute('aria-label', 'Main');
  const links = tabs.map((tab) => tabLink(tab.id, tab.label));
  nav.append(...links);
  header.append(el('span', 'app-brand', 'Spoofball'), nav);

  const screen = el('main', 'screen');
  const heading = el('h1', 'screen-title');
  // Focusable from script only, so moving to a new tab can put focus on its heading.
  heading.tabIndex = -1;
  const body = el('p', 'screen-coming');
  const panel = el('div', 'screen-panel');
  screen.append(heading, body, panel);
  const builtPanels = new Map<TabId, HTMLElement>();

  function panelFor(id: TabId): HTMLElement | undefined {
    const build = panelBuilders[id];
    if (!build) return undefined;
    let built = builtPanels.get(id);
    if (!built) {
      built = build();
      builtPanels.set(id, built);
    }
    return built;
  }

  root.replaceChildren(header, screen, footer());

  function show(id: TabId, { moveFocus }: { moveFocus: boolean }): void {
    const tab = tabById(id);
    root.dataset.tab = id;
    heading.textContent = tab.title;
    body.textContent = tab.coming;
    const content = panelFor(id);
    if (content) panel.replaceChildren(content);
    else panel.replaceChildren();
    document.title = `${tab.title} · Spoofball`;
    for (const link of links) {
      if (link.dataset.tab === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    // After a tab change, screen readers announce the new screen's heading.
    if (moveFocus) heading.focus();
  }

  function route({ moveFocus }: { moveFocus: boolean }): void {
    const { hash } = window.location;
    const id = tabFromHash(hash);
    // Rewrite a missing or unknown hash to the tab shown, without adding a
    // history entry, so Back never lands on a URL that names no tab.
    if (!isCanonicalHash(hash)) window.history.replaceState(null, '', hashFor(id));
    show(id, { moveFocus });
  }

  window.addEventListener('hashchange', () => {
    route({ moveFocus: true });
  });
  route({ moveFocus: false });
}
