/**
 * The app's tabs and the hash routes that select them (#21).
 *
 * Each tab has its own URL, such as `#/stats`, so the browser's back and
 * forward buttons move between tabs and a reload stays on the same tab. Hash
 * routes work on GitHub Pages without server rewrites. This module is pure, so
 * the routing rules are unit-tested without a browser; `app-shell.ts` wires it
 * to the DOM.
 */

export const tabIds = ['match', 'pharm', 'stats'] as const;
export type TabId = (typeof tabIds)[number];

/** The tab the app opens on when the URL names no tab, or one that doesn't exist. */
export const DEFAULT_TAB: TabId = 'match';

export interface Tab {
  id: TabId;
  /** The label on the tab bar. */
  label: string;
  /** The screen's heading. */
  title: string;
  /** What the placeholder screen says is coming. */
  coming: string;
}

/** The tabs in tab-bar order. Placeholder copy until each epic builds its screen. */
export const tabs: readonly Tab[] = [
  {
    id: 'match',
    label: 'Match',
    title: 'Match',
    coming:
      'Place your spoofs, then watch them play three scrums against a rival team. The first playable match is coming in v0.2.0.',
  },
  {
    id: 'pharm',
    label: 'Pharm',
    title: 'Pharm',
    coming:
      'Manage your roster: scout your spoofs, replace one with a draft pick, or re-draft the team. Coming in v0.4.0.',
  },
  {
    id: 'stats',
    label: 'Stats',
    title: 'Stats',
    coming:
      "Your team's record, a log of its matches, and a line for each spoof. Coming in v0.3.0.",
  },
];

function isTabId(value: string): value is TabId {
  return (tabIds as readonly string[]).includes(value);
}

/** The URL hash for a tab, e.g. `#/stats`. */
export function hashFor(id: TabId): string {
  return `#/${id}`;
}

/**
 * The tab a URL hash selects. Anything that isn't exactly a tab's hash
 * (empty, unknown, or differently cased) selects the default tab.
 */
export function tabFromHash(hash: string): TabId {
  const match = /^#\/([a-z]+)$/.exec(hash);
  const id = match?.[1];
  return id !== undefined && isTabId(id) ? id : DEFAULT_TAB;
}

/** True when the hash already names a tab exactly, so the URL needs no correcting. */
export function isCanonicalHash(hash: string): boolean {
  return hash === hashFor(tabFromHash(hash));
}

export function tabById(id: TabId): Tab {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) throw new Error(`Unknown tab: ${id}`);
  return tab;
}
