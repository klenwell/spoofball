import { appInfo } from '../app-info';
import type { Team } from '../game/teams';
import { STORAGE_PROBLEM_TEXT, browserStorage, loadTeam } from '../storage/saved-team';
import { el } from './dom';
import { createMatchScreen } from './match-screen';
import { createNewTeamScreen } from './new-team-screen';
import { START_HASH, hashForRoute, routeFromHash, type Route } from './routes';
import { createSplashScreen } from './splash-screen';
import { hashFor, tabById, tabs, type TabId } from './tabs';

/**
 * The app shell (#21): a header with the tab bar, the current screen, and a
 * footer with the version and the GitHub link. On phones the tab bar is fixed
 * to the bottom of the screen; on wider screens it sits in the header (see
 * `app.css`). Routing rules live in `routes.ts` and `tabs.ts`; this file only
 * wires them to the DOM. Every value is set as text, never parsed as HTML.
 *
 * Since #71 it also holds the team in play: the one saved in this browser,
 * the Spoofs, or a new one. With no team, it opens on the splash screen,
 * which has no tab bar, and so does the create screen. The header shows the
 * team in play, and links back to the splash screen to switch.
 */

const SOURCE_URL = 'https://github.com/klenwell/spoofball';

/** Extra content a screen shows, built the first time it opens. */
export interface Panel {
  readonly element: HTMLElement;
  /** Called when the player leaves the screen, for example to pause a scrum. */
  readonly hide?: () => void;
  /** Called when the screen is thrown away (the team changed), to stop its timers and listeners. */
  readonly dispose?: () => void;
  /** The screen's own heading, for screens without the shell's (splash, create). */
  readonly heading?: HTMLElement;
}

/** The tabs with a screen of their own, built for the team in play. */
const panelBuilders: Partial<Record<TabId, (team: Team) => Panel>> = {
  match: createMatchScreen,
};

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
  const store = browserStorage();
  const loaded = loadTeam(store);
  /** The team saved in this browser. */
  let savedTeam: Team | null = loaded.ok ? loaded.team : null;
  /** The team being played: none until one is loaded, picked or created. */
  let team: Team | null = savedTeam;
  /** Said on the splash screen, when there's no saved team for a reason worth knowing. */
  const loadNotice =
    loaded.ok || loaded.problem === 'none' ? null : STORAGE_PROBLEM_TEXT[loaded.problem];

  const header = el('header', 'app-bar');
  const nav = el('nav', 'tab-bar');
  nav.setAttribute('aria-label', 'Main');
  const links = tabs.map((tab) => tabLink(tab.id, tab.label));
  nav.append(...links);
  const badge = el('a', 'team-badge');
  badge.href = START_HASH;
  const badgeLogo = el('span', 'team-badge-logo');
  badgeLogo.setAttribute('aria-hidden', 'true');
  const badgeName = el('span', 'team-badge-name');
  badge.append(badgeLogo, badgeName);
  header.append(el('span', 'app-brand', 'Spoofball'), nav, badge);

  const screen = el('main', 'screen');
  const heading = el('h1', 'screen-title');
  // Focusable from script only, so moving to a new screen can put focus on its heading.
  heading.tabIndex = -1;
  const body = el('p', 'screen-coming');
  const panel = el('div', 'screen-panel');
  screen.append(heading, body, panel);

  /** The tab panels for the team in play, built as each tab first opens. */
  let builtPanels = new Map<TabId, Panel>();
  /** The panel on screen, to tell when it's left. */
  let shownPanel: Panel | undefined;

  root.replaceChildren(header, screen, footer());

  function tabPanel(id: TabId, forTeam: Team): Panel | undefined {
    const build = panelBuilders[id];
    if (!build) return undefined;
    let built = builtPanels.get(id);
    if (!built) {
      built = build(forTeam);
      builtPanels.set(id, built);
    }
    return built;
  }

  /** Puts a team in play: tab screens are built afresh for it, and the game goes to Match. */
  function play(next: Team): void {
    shownPanel?.hide?.();
    shownPanel = undefined;
    team = next;
    // The old team's screens stop for good, so none keeps running offscreen.
    for (const built of builtPanels.values()) built.dispose?.();
    builtPanels = new Map();
    badgeLogo.textContent = next.logo;
    badgeName.textContent = next.name;
    badge.setAttribute('aria-label', `${next.name}: change team`);
    window.location.hash = hashFor('match');
  }
  if (team) {
    badgeLogo.textContent = team.logo;
    badgeName.textContent = team.name;
    badge.setAttribute('aria-label', `${team.name}: change team`);
  }

  function screenPanel(route: Route): Panel | undefined {
    if (route.screen === 'start') {
      return createSplashScreen({ savedTeam, notice: savedTeam ? null : loadNotice, onPlay: play });
    }
    if (route.screen === 'new-team') {
      return createNewTeamScreen({
        store,
        savedTeam,
        onCreated: (created, saved) => {
          if (saved) savedTeam = created;
          play(created);
        },
      });
    }
    return team ? tabPanel(route.tab, team) : undefined;
  }

  function show(route: Route, { moveFocus }: { moveFocus: boolean }): void {
    const content = screenPanel(route);
    if (shownPanel && shownPanel !== content) shownPanel.hide?.();
    shownPanel = content;
    root.dataset.screen = route.screen;
    badge.hidden = route.screen !== 'tab' || team === null;
    if (route.screen === 'tab') {
      const tab = tabById(route.tab);
      root.dataset.tab = route.tab;
      heading.hidden = false;
      heading.textContent = tab.title;
      body.textContent = tab.coming;
      document.title = `${tab.title} · Spoofball`;
    } else {
      delete root.dataset.tab;
      heading.hidden = true;
      body.textContent = '';
      document.title = route.screen === 'start' ? 'Spoofball' : 'Create your team · Spoofball';
    }
    if (content) panel.replaceChildren(content.element);
    else panel.replaceChildren();
    for (const link of links) {
      if (route.screen === 'tab' && link.dataset.tab === route.tab) {
        link.setAttribute('aria-current', 'page');
      } else link.removeAttribute('aria-current');
    }
    // After a change of screen, screen readers announce the new screen's heading.
    if (moveFocus) (content?.heading ?? heading).focus();
  }

  function route({ opening }: { opening: boolean }): void {
    const { hash } = window.location;
    const next = routeFromHash(hash, { hasTeam: team !== null, opening });
    // Rewrite a hash that doesn't name the screen shown, without adding a
    // history entry, so Back never lands on a URL that names no screen.
    const canonical = hashForRoute(next);
    if (hash !== canonical) window.history.replaceState(null, '', canonical);
    show(next, { moveFocus: !opening });
  }

  window.addEventListener('hashchange', () => {
    route({ opening: false });
  });
  route({ opening: true });
}
