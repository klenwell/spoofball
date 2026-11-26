import { kit } from '../design/kits';
import { LEAGUE } from '../game/league';
import { leagueStandings } from '../game/standings';
import type { LoggedMatch, TeamStats } from '../game/stats';
import type { Team } from '../game/teams';
import { STORAGE_PROBLEM_TEXT, type StatsResult } from '../storage/saved-team';
import type { Panel } from './app-shell';
import { el, teamLogo } from './dom';
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
  pctText,
  scoreText,
  spoofLineText,
  standingsRecordText,
  type SpoofLineText,
} from './stats-text';
import { markDisc, spoofLabel } from './spoof-label';
import { hashFor } from './tabs';

/**
 * The Stats tab (#91): your team's record, a line for each spoof (#92), the
 * league standings (#93) and its match log (wireframes 1 and 2).
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

  // Rendered by `show`, each time the tab opens: the app shell calls it before the screen is seen.
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
  // The spoof lines before the log, which can run to 20 rows (#92).
  section.append(
    teamHeader(team, stats),
    tiles(stats),
    spoofLines(team, stats),
    standings(team, stats),
    matchLog(stats.log),
  );
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
  name.append(teamLogo(team.logo), ` ${team.name}`);
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

/** The columns of the spoof lines: short headings, and their full names for screen readers. */
const SPOOF_COLUMNS: readonly {
  readonly key: keyof SpoofLineText;
  readonly short: string;
  readonly full: string;
}[] = [
  { key: 'matches', short: 'Mat', full: 'Matches' },
  { key: 'scrums', short: 'Scr', full: 'Scrums' },
  { key: 'points', short: 'Pts', full: 'Points' },
  { key: 'pointsPerScrum', short: 'Pts/scr', full: 'Points per scrum' },
  { key: 'plusMinusPerScrum', short: '+/−', full: 'Plus-minus per scrum' },
];

/**
 * A line for each of your spoofs (#92), in team order, after wireframe 2.
 * Outcomes only: the totals are by spoof id, so a renamed spoof keeps its
 * line, under its name now.
 */
function spoofLines(team: Team, stats: TeamStats): HTMLElement {
  const section = el('section', 'spoof-lines');
  section.append(el('h3', 'stats-section-title', 'Team Stats'));
  const table = el('table', 'spoof-lines-table');
  const head = el('tr');
  // Headed on screen too (the owner, #94).
  const corner = el('th', 'spoof-lines-name', 'Spoof');
  corner.scope = 'col';
  head.append(corner);
  for (const column of SPOOF_COLUMNS) {
    const th = el('th');
    th.scope = 'col';
    const short = el('span', undefined, column.short);
    short.setAttribute('aria-hidden', 'true');
    th.append(short, el('span', 'visually-hidden', column.full));
    head.append(th);
  }
  table.append(el('thead'), el('tbody'));
  table.tHead?.append(head);
  const body = table.tBodies[0];
  const disc = kit(team.color, 'home');
  for (const spoof of team.spoofs) {
    const row = el('tr');
    const name = el('th', 'spoof-lines-name');
    name.scope = 'row';
    const who = el('span', 'spoof-lines-who');
    who.append(markDisc(spoof.mark, disc, 18, 7), spoofLabel(spoof));
    name.append(who);
    row.append(name);
    const line = spoofLineText(stats.spoofs[spoof.id]);
    for (const column of SPOOF_COLUMNS) row.append(el('td', undefined, line[column.key]));
    body?.append(row);
  }
  section.append(
    table,
    el(
      'p',
      'stats-footnote',
      "+/− per scrum: your team's points minus the opponent's in each scrum the spoof played, averaged.",
    ),
  );
  return section;
}

/**
 * League standings (#93): your team, in bold, among the league's 7, by win
 * percentage. Each league team's record is its own, from its matches with
 * you. The Embers play only the quick start, so they aren't listed.
 */
function standings(team: Team, stats: TeamStats): HTMLElement {
  const section = el('section', 'standings');
  section.append(el('h3', 'stats-section-title', 'League standings'));
  const table = el('table', 'standings-table');
  const head = el('tr');
  for (const [text, full] of [
    ['Team', 'Team'],
    ['W–L–T', 'Wins, losses and ties'],
    ['Pct', 'Win percentage'],
  ] as const) {
    const th = el('th');
    th.scope = 'col';
    const short = el('span', undefined, text);
    short.setAttribute('aria-hidden', 'true');
    th.append(short, el('span', 'visually-hidden', full));
    head.append(th);
  }
  table.append(el('thead'), el('tbody'));
  table.tHead?.append(head);
  for (const line of leagueStandings(stats, team, LEAGUE)) {
    const row = el('tr', line.yours ? 'is-yours' : undefined);
    const name = el('th', 'standings-name');
    name.scope = 'row';
    name.append(teamLogo(line.logo), ` ${line.name}`);
    if (line.yours) name.append(el('span', 'visually-hidden', ' (your team)'));
    row.append(name);
    if (line.played === 0) {
      row.append(el('td', 'standings-unplayed', 'Not played'), el('td', undefined, pctText(null)));
    } else {
      row.append(
        el('td', undefined, standingsRecordText(line.record)),
        el('td', undefined, pctText(line.pct)),
      );
    }
    table.tBodies[0]?.append(row);
  }
  section.append(table);
  return section;
}

function matchLog(log: readonly LoggedMatch[]): HTMLElement {
  const section = el('section', 'match-log');
  section.append(el('h3', 'stats-section-title', 'Match log'));
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
      teamLogo(match.opponent.logo),
      ` ${match.opponent.name}`,
    );
    const score = el('span', 'match-log-score', scoreText(match.score));
    row.append(letter, opponent, score);
    list.append(row);
  }
  section.append(list);
  return section;
}
