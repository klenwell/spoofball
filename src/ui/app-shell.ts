import { appInfo } from '../app-info';
import { startDraft, type Draft } from '../game/draft';
import { leagueOpponent } from '../game/league';
import { EMBERS, SPOOFS } from '../game/preset-teams';
import type { Team } from '../game/teams';
import {
  STORAGE_PROBLEM_TEXT,
  browserStorage,
  loadDraft,
  loadTeam,
  recordForfeit,
  recordMatch,
  saveDraft,
  saveMatchInProgress,
  saveTeam,
  type KeyValueStore,
} from '../storage/saved-team';
import { createCombineScreen } from './combine-screen';
import { el, newSeed, today } from './dom';
import { createMatchScreen, type MatchRecorder } from './match-screen';
import { createNewTeamScreen } from './new-team-screen';
import { COMBINE_HASH, START_HASH, hashForRoute, routeFromHash, type Route } from './routes';
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
 *
 * Since #72 it also holds the draft in progress: the create screen starts or
 * updates it, the combine changes it, and finishing it saves the new team.
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

/**
 * Who a team plays (#75): the quick start's Spoofs play the Embers, as
 * before; every other team plays a league team drawn from each match's seed.
 */
function opponentsFor(team: Team): (seed: number) => Team {
  return team === SPOOFS ? () => EMBERS : leagueOpponent;
}

/**
 * The browser's "Leave site?" prompt (#90), while your saved team has a
 * match in progress. Browsers show their own text and may skip it (mobile
 * browsers often do), but the forfeit is recorded either way: the match in
 * progress is already saved. Only listened for while needed, since a
 * `beforeunload` listener can keep a page out of the browser's back-forward
 * cache.
 */
function warnOnLeave(event: BeforeUnloadEvent): void {
  event.preventDefault();
}

function setLeaveWarning(on: boolean): void {
  window.removeEventListener('beforeunload', warnOnLeave);
  if (on) window.addEventListener('beforeunload', warnOnLeave);
}

/**
 * Records your saved team's matches (#89), and its match in progress, which
 * becomes a forfeit if you leave (#90). A record that can't be saved never
 * stops the match: its scorecard still shows.
 */
function matchRecorder(store: KeyValueStore | null): MatchRecorder {
  return {
    progress: (soFar) => {
      saveMatchInProgress(store, soFar, today());
      setLeaveWarning(true);
    },
    end: (record) => {
      recordMatch(store, record, today());
      setLeaveWarning(false);
    },
  };
}

/**
 * The tabs with a screen of their own, built for the team in play. Only the
 * team saved in this browser has its matches recorded (#89): never the quick
 * start's Spoofs (the owner, #88).
 */
function panelBuilders(
  store: KeyValueStore | null,
  isSaved: (team: Team) => boolean,
): Partial<Record<TabId, (team: Team) => Panel>> {
  return {
    match: (team) =>
      createMatchScreen(team, opponentsFor(team), isSaved(team) ? matchRecorder(store) : undefined),
  };
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
  const store = browserStorage();
  const loaded = loadTeam(store);
  // A team saved by an older version is written back in the current format,
  // so it no longer depends on the upgrade. If that fails, the upgrade runs
  // again next time, with the same result.
  if (loaded.ok && loaded.upgraded) saveTeam(store, loaded.team);
  // A match left unfinished last time is a forfeit (#90).
  recordForfeit(store);
  /** The team saved in this browser. */
  let savedTeam: Team | null = loaded.ok ? loaded.team : null;
  /** The team being played: none until one is loaded, picked or created. */
  let team: Team | null = savedTeam;
  /** The draft in progress (#72), kept across reloads, or null. */
  let draft: Draft | null = loadDraft(store);
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

  const builders = panelBuilders(store, (t) => t === savedTeam);

  function tabPanel(id: TabId, forTeam: Team): Panel | undefined {
    const build = builders[id];
    if (!build) return undefined;
    let built = builtPanels.get(id);
    if (!built) {
      built = build(forTeam);
      builtPanels.set(id, built);
    }
    return built;
  }

  /**
   * Puts a team in play: tab screens are built afresh for it, and the game
   * goes to Match. The team already in play goes back to its match instead,
   * paused where you left it (the owner, #90).
   */
  function play(next: Team): void {
    if (next === team) {
      window.location.hash = hashFor('match');
      return;
    }
    shownPanel?.hide?.();
    // The old team's match in progress goes with it (#90): no warning for it now.
    setLeaveWarning(false);
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
        canSave: store !== null,
        savedTeam,
        draft,
        onNext: (choices) => {
          // Changing your choices keeps the draft's pool and picks; otherwise a new pool.
          draft = draft ? { ...draft, ...choices } : startDraft(choices, newSeed());
          saveDraft(store, draft);
          window.location.hash = COMBINE_HASH;
        },
      });
    }
    if (route.screen === 'combine' && draft) {
      return createCombineScreen({
        draft,
        savedTeam,
        onChange: (next) => {
          draft = next;
          return saveDraft(store, next);
        },
        // A new team: it joins the league today, with a fresh record (#89).
        onFinish: (team) => saveTeam(store, team, { endDraft: true, joined: today() }),
        onPlay: (team, saved) => {
          draft = null;
          if (saved) savedTeam = team;
          play(team);
        },
      });
    }
    if (route.screen !== 'tab') return undefined;
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
      document.title = {
        start: 'Spoofball',
        'new-team': 'Create your team · Spoofball',
        combine: 'Combine · Spoofball',
      }[route.screen];
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
    const next = routeFromHash(hash, { hasTeam: team !== null, hasDraft: draft !== null, opening });
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
