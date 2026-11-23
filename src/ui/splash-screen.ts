import { kit } from '../design/kits';
import { palette } from '../design/tokens';
import { SPOOFS } from '../game/preset-teams';
import type { Team } from '../game/teams';
import type { Panel } from './app-shell';
import { el } from './dom';
import { NEW_TEAM_HASH } from './routes';

/**
 * The splash screen (#71): the game's logo and its two ways in. A first visit,
 * with no saved team, opens here. **Create your team** opens the create
 * screen; **Play as Spoofs** plays the Spoofs without saving anything. With a
 * saved team, a third button plays it, so coming back here never loses it.
 */

export interface SplashOptions {
  /** The team saved in this browser, if there is one. */
  readonly savedTeam: Team | null;
  /** Why there's no saved team to play, when it's worth saying (storage blocked, a save that can't be read). */
  readonly notice: string | null;
  /** Plays a team: your saved team, or the Spoofs. */
  readonly onPlay: (team: Team) => void;
}

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string | number>>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

/**
 * The Spoofball logo: a court with three spoofs on it, in two teams' kits,
 * one bumping another. Drawn from the game's own shapes and colors.
 */
export function spoofballLogo(): SVGSVGElement {
  const logo = svg('svg', { viewBox: '0 0 120 120', class: 'splash-logo' });
  logo.setAttribute('aria-hidden', 'true');
  const home = kit('blue', 'home');
  const away = kit('orange', 'away');
  const gold = kit('gold', 'home');
  logo.append(
    svg('circle', {
      cx: 60,
      cy: 60,
      r: 56,
      fill: palette.apron,
      stroke: palette.courtEdge,
      'stroke-width': 2,
    }),
    svg('circle', {
      cx: 60,
      cy: 60,
      r: 32,
      fill: palette.mosh,
      stroke: palette.moshLine,
      'stroke-width': 1.5,
    }),
    svg('circle', { cx: 46, cy: 70, r: 17, fill: home.fill, stroke: home.trim, 'stroke-width': 4 }),
    svg('circle', { cx: 77, cy: 58, r: 14, fill: away.fill, stroke: away.trim, 'stroke-width': 4 }),
    svg('circle', { cx: 62, cy: 34, r: 10, fill: gold.fill, stroke: gold.trim, 'stroke-width': 3 }),
  );
  return logo;
}

function teamButton(label: string, team: Team, primary: boolean, onPlay: (team: Team) => void) {
  const button = el('button', primary ? 'button button-primary' : 'button');
  button.type = 'button';
  const logo = el('span', 'button-logo', team.logo);
  logo.setAttribute('aria-hidden', 'true');
  button.append(logo, el('span', undefined, label));
  button.addEventListener('click', () => {
    onPlay(team);
  });
  return button;
}

export function createSplashScreen({ savedTeam, notice, onPlay }: SplashOptions): Panel {
  const element = el('section', 'splash');
  const heading = el('h1', 'splash-title', 'Spoofball');
  heading.tabIndex = -1;

  const actions = el('div', 'splash-actions');
  if (savedTeam) actions.append(teamButton(`Play as ${savedTeam.name}`, savedTeam, true, onPlay));
  const create = el('a', savedTeam ? 'button' : 'button button-primary', 'Create your team');
  create.href = NEW_TEAM_HASH;
  actions.append(create, teamButton(`Play as ${SPOOFS.name}`, SPOOFS, false, onPlay));

  element.append(spoofballLogo(), heading);
  if (notice) element.append(el('p', 'notice', notice));
  element.append(actions);
  return { element, heading };
}
