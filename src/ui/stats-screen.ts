import type { LoggedMatch, TeamStats } from '../game/stats';
import type { Team } from '../game/teams';
import { STORAGE_PROBLEM_TEXT, type StatsResult } from '../storage/saved-team';
import type { Panel } from './app-shell';
import { el } from './dom';
import { NEW_TEAM_HASH } from './routes';
import {
  RESULT_LETTER,
  RESULT_WORD,
  bestText,
  forfeitText,
  joinedText,
  matchesText,
  pointsPerMatchText,
  recordText,
  scoreText,
} from './stats-text';
import { hashFor } from './tabs';

/**
 * The Stats tab (#91): your team's record and its match log (wireframe 1).
 * Outcomes only: no skills, comps or pawn subtypes (Decision 7). It reads the
 * saved stats each time it's shown, so it's up to date after every match.
 */

export interface StatsScreenOptions {
  readonly team: Team;
  /** Whether the team is the one saved in this browser: only it has stats (#88). */
  readonly isSaved: boolean;
  readonly loadStats: () => StatsResult;
}

export function createStatsScreen({ team, isSaved, loadStats }: StatsScreenOptions): Panel {
  const root = el('div', 'stats-screen');

  function render(): void {
    if (!isSaved) {
      root.replaceChildren(quickStartNote());
      return;
    }
    const loaded = loadStats();
    if (!loaded.ok) {
      root.replaceChildren(el('p', 'stats-note', problemText(loaded.problem)));
      return;
    }
    root.replaceChildren(teamPanel(team, loaded.stats));
  }

  render();
  return { element: root, show: render };
}

function problemText(problem: Extract<StatsResult, { ok: false }>['problem']): string {
  return problem === 'unreadable'
    ? "Your team's stats couldn't be read, so there's nothing to show."
    : STORAGE_PROBLEM_TEXT[problem];
}

/** For the quick start's Spoofs, which aren't recorded (#88). */
function quickStartNote(): HTMLElement {
  const note = el('div', 'stats-note');
  const create = el('a', 'button button-primary', 'Create your team');
  create.href = NEW_TEAM_HASH;
  note.append(
    el('p', undefined, "The Spoofs don't keep stats. Create your own team to start a record."),
    create,
  );
  return note;
}

function teamPanel(team: Team, stats: TeamStats): HTMLElement {
  const section = el('section', 'stats-team');
  section.append(teamHeader(team, stats), tiles(stats), matchLog(stats.log));
  return section;
}

function teamHeader(team: Team, stats: TeamStats): HTMLElement {
  const header = el('div', 'stats-team-header');
  const disc = el('span', 'stats-team-disc');
  disc.setAttribute('aria-hidden', 'true');
  disc.style.setProperty('--dot', `var(--team-${team.color})`);
  disc.style.setProperty('--dot-deep', `var(--team-${team.color}-deep)`);
  const text = el('div', 'stats-team-text');
  const name = el('h2', 'stats-team-name');
  name.append(el('span', 'team-logo', team.logo), ` ${team.name}`);
  text.append(name);
  const joined = joinedText(stats.joined);
  if (joined) text.append(el('p', 'stats-team-joined', joined));
  header.append(disc, text);
  return header;
}

function tiles(stats: TeamStats): HTMLElement {
  const list = el('dl', 'stats-tiles');
  const tile = (label: string, value: string, note: string | null = null) => {
    const item = el('div', 'stats-tile');
    const dd = el('dd', 'stats-tile-value', value);
    if (note) dd.append(el('span', 'stats-tile-note', note));
    item.append(el('dt', 'stats-tile-label', label), dd);
    return item;
  };
  list.append(
    tile('Record', recordText(stats.results), forfeitText(stats.results)),
    tile('Matches', matchesText(stats)),
    tile('Pts / match', pointsPerMatchText(stats)),
    tile('Best', bestText(stats)),
  );
  return list;
}

function matchLog(log: readonly LoggedMatch[]): HTMLElement {
  const section = el('section', 'match-log');
  section.append(el('h3', 'match-log-title', 'Match log'));
  if (log.length === 0) {
    const empty = el('p', 'stats-note');
    const play = el('a', undefined, 'Match');
    play.href = hashFor('match');
    empty.append('No matches yet. Play your first on the ', play, ' tab.');
    section.append(empty);
    return section;
  }
  const list = el('ol', 'match-log-list');
  for (const match of log) {
    const row = el('li', `match-log-row is-${match.result}`);
    const letter = el('span', 'match-log-result', RESULT_LETTER[match.result]);
    letter.setAttribute('aria-hidden', 'true');
    const opponent = el('span', 'match-log-opponent');
    opponent.append(
      el('span', 'visually-hidden', `${RESULT_WORD[match.result]} against `),
      el('span', 'team-logo', match.opponent.logo),
      ` ${match.opponent.name}`,
    );
    const score = el('span', 'match-log-score', scoreText(match.score));
    row.append(letter, opponent, score);
    list.append(row);
  }
  section.append(list);
  return section;
}
