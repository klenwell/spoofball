import { hashFor, tabFromHash, type TabId } from './tabs';

/**
 * Which screen a URL hash opens (#71). Besides the tabs, there's the splash
 * screen (`#/start`), the create screen (`#/new-team`) and the combine
 * (`#/combine`, #72), which have no tab bar. Like `tabs.ts`, this is pure, so
 * the rules are tested without a browser.
 *
 * The rules:
 * - With no team in play, every hash opens the splash screen, except the
 *   create screen's own.
 * - With a team in play, the splash and create screens stay reachable, so you
 *   can switch teams. Opening the game (a load or reload) on the splash screen
 *   goes straight to Match instead: your saved team is ready.
 * - The combine opens only while a draft is in progress; without one, its
 *   hash opens the create screen, where a draft starts.
 * - A first-time player who opens the game mid-draft goes back to the
 *   combine, wherever the hash points, so the draft isn't lost.
 * - A spoof's card (#109) is on the Pharm tab, at `#/pharm/<spoof id>`.
 */

export type Route =
  /** `spoofId`, on the Pharm tab only: that spoof's card (#109). */
  | { readonly screen: 'tab'; readonly tab: TabId; readonly spoofId?: string }
  | { readonly screen: 'start' }
  | { readonly screen: 'new-team' }
  | { readonly screen: 'combine' };

export const START_HASH = '#/start';
export const NEW_TEAM_HASH = '#/new-team';
export const COMBINE_HASH = '#/combine';

/** A spoof's card on the Pharm tab (#109). Spoof ids are letters and numbers, such as `c1` or `x12`. */
const CARD_HASH = /^#\/pharm\/([A-Za-z0-9_-]+)$/;

/** The address of a spoof's card (#109). */
export function cardHash(spoofId: string): string {
  return `${hashFor('pharm')}/${spoofId}`;
}

export interface RouteContext {
  /** True when a team is in play: a saved one, or one picked on the splash screen. */
  readonly hasTeam: boolean;
  /** True while a draft is in progress (#72). */
  readonly hasDraft: boolean;
  /** True for the route worked out when the game opens. */
  readonly opening: boolean;
}

export function routeFromHash(hash: string, { hasTeam, hasDraft, opening }: RouteContext): Route {
  if (hash === NEW_TEAM_HASH) return { screen: 'new-team' };
  if (hash === COMBINE_HASH) return hasDraft ? { screen: 'combine' } : { screen: 'new-team' };
  if (!hasTeam) return hasDraft && opening ? { screen: 'combine' } : { screen: 'start' };
  if (hash === START_HASH && !opening) return { screen: 'start' };
  const card = CARD_HASH.exec(hash);
  if (card?.[1] !== undefined) return { screen: 'tab', tab: 'pharm', spoofId: card[1] };
  return { screen: 'tab', tab: tabFromHash(hash) };
}

/** The hash that names a route exactly. */
export function hashForRoute(route: Route): string {
  if (route.screen === 'start') return START_HASH;
  if (route.screen === 'new-team') return NEW_TEAM_HASH;
  if (route.screen === 'combine') return COMBINE_HASH;
  if (route.tab === 'pharm' && route.spoofId !== undefined) return cardHash(route.spoofId);
  return hashFor(route.tab);
}
