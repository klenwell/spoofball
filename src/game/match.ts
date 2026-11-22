import type { BenchSide } from './arena';
import { drawOrder, isMiseOver, miseEntries, startMise, type MiseState } from './mise';
import { createRandom, type Random } from './random';
import { finalScores, type Scores } from './scoring';
import {
  emptyStats,
  simulateScrum,
  type BehaviorStats,
  type ScrumEntry,
  type ScrumResult,
} from './scrum';
import { clampSkill, type Skills } from './skills';
import type { ScrumSkills } from './spoof-motion';
import type { Spoof, Team } from './teams';

/**
 * A match (#40): three scrums, each with its own mise, with tired spoofs
 * carrying their fatigue from one scrum to the next, then a result. Rules
 * from docs/design.md (Decisions for later epics, Match), after the
 * prototype's `models/match.py` and `recuperate` in `lib/minrook/rooks.py`.
 *
 * A pure state machine: the screen runs each mise (mise.ts, with your moves)
 * and hands it to `playScrum`, which simulates the scrum and records it.
 * Every random choice comes from the match's seed, so the same seed and the
 * same placements replay the same match.
 */

export const SCRUMS_PER_MATCH = 3;

/** Between scrums, every spoof recovers up to this share of what it lost, in percent. */
export const BREAK_RECOVERY_CAP = 66;
/** A spoof that sat a scrum out can recover fully, before the break's recovery too. */
export const REST_RECOVERY_CAP = 100;

/** The skills tiring wears down, and recovery restores. */
const TIRING_SKILLS = ['growth', 'burst', 'iq'] as const;

/** A spoof's state through a match. */
export interface MatchSpoof {
  readonly spoof: Spoof;
  /** Its skills now: its own, worn down by tiring and partly restored by recovery. */
  readonly skills: ScrumSkills;
  readonly fatigue: number;
  /** Its points in each scrum played so far, or null for a scrum it sat out. */
  readonly points: readonly (number | null)[];
  /** Behavior stats, summed over the scrums it played. Recorded quietly, never shown. */
  readonly stats: BehaviorStats;
}

/** One scrum, once played. */
export interface PlayedScrum {
  /** Its mise, with every placement. */
  readonly mise: MiseState;
  readonly result: ScrumResult;
  readonly scores: Scores;
}

export interface Match {
  readonly seed: number;
  /** The team that places last in every mise: picked at random each match. */
  readonly host: BenchSide;
  readonly teams: Readonly<Record<BenchSide, Team>>;
  readonly spoofs: Readonly<Record<BenchSide, readonly MatchSpoof[]>>;
  readonly scrums: readonly PlayedScrum[];
}

/**
 * A random source for one purpose in one scrum, drawn from the match's seed.
 * Each gets its own, so (say) how a scrum plays doesn't depend on how many
 * random spots the Embers tried in its mise.
 */
export function matchRandom(
  match: Pick<Match, 'seed'>,
  purpose: 'host' | 'order' | 'moves' | 'scrum' | 'recovery',
  scrum = 0,
): Random {
  const purposes = { host: 1, order: 2, moves: 3, scrum: 4, recovery: 5 } as const;
  // A large odd multiplier spreads nearby seeds apart; >>> 0 keeps it a 32-bit integer.
  return createRandom((match.seed * 2654435761 + purposes[purpose] * 97 + scrum * 7919) >>> 0);
}

function freshSpoof(spoof: Spoof): MatchSpoof {
  return {
    spoof,
    skills: { ...spoof.skills },
    fatigue: 0,
    points: [],
    stats: emptyStats(),
  };
}

/** A new match between two teams. Fatigue starts at 0: it resets every match. */
export function startMatch(home: Team, visitor: Team, seed: number): Match {
  const host = matchRandom({ seed }, 'host').pick<BenchSide>(['home', 'visitor']);
  return {
    seed,
    host,
    teams: { home, visitor },
    spoofs: { home: home.spoofs.map(freshSpoof), visitor: visitor.spoofs.map(freshSpoof) },
    scrums: [],
  };
}

/** Which scrum is next, or being played: 0, 1 or 2. */
export function scrumNumber(match: Match): number {
  return match.scrums.length;
}

export function isMatchOver(match: Match): boolean {
  return match.scrums.length >= SCRUMS_PER_MATCH;
}

/** The mise for the next scrum: a new turn order, with the match's host placing last. */
export function nextMise(match: Match): MiseState {
  if (isMatchOver(match)) throw new Error('The match is over');
  return startMise(drawOrder(match.host, matchRandom(match, 'order', scrumNumber(match))));
}

/** The random source for the Embers' moves in the next scrum's mise. */
export function miseRandom(match: Match): Random {
  return matchRandom(match, 'moves', scrumNumber(match));
}

/** The spoofs as they'll play the next scrum: their own, with their current skills and fatigue. */
function playing(match: Match): Readonly<Record<BenchSide, readonly Spoof[]>> {
  const now = (side: BenchSide) =>
    match.spoofs[side].map((m) => ({ ...m.spoof, skills: { ...m.skills } }));
  return { home: now('home'), visitor: now('visitor') };
}

/** The next scrum's starting lineup from its finished mise: placed spoofs, as tired as they are. */
export function scrumEntries(match: Match, mise: MiseState): ScrumEntry[] {
  return miseEntries(mise, playing(match)).map((entry) => {
    const me = match.spoofs[entry.team as BenchSide].find((m) => m.spoof.id === entry.spoof.id);
    return { ...entry, fatigue: me?.fatigue ?? 0 };
  });
}

/**
 * How a spoof recovers (the prototype's `recuperate`). Its stamina, and half
 * as much its impact, set how much of what it lost it can regain, up to
 * `cap` percent; constancy narrows the range from below. Each tiring skill
 * regains a random share in that range, and fatigue drops by the share of the
 * total loss regained.
 */
export function recover(
  core: Skills,
  current: ScrumSkills,
  fatigue: number,
  cap: number,
  random: Random,
): { skills: ScrumSkills; fatigue: number } {
  const comp = clampSkill(Math.round((core.stamina * 1 + core.impact * 0.5) / 1.5));
  const most = Math.min(comp, cap);
  const least = Math.min(Math.round(comp * core.constancy * 0.01 * 0.5), most * 0.9);
  const skills = { ...current };
  let lost = 0;
  let regained = 0;
  for (const name of TIRING_SKILLS) {
    const loss = core[name] - current[name];
    if (loss <= 0) continue;
    const share = random.int(Math.ceil(least), Math.max(Math.ceil(least), most)) * 0.01;
    skills[name] = clampSkill(current[name] + loss * share);
    lost += loss;
    regained += loss * share;
  }
  const back = lost > 0 ? regained / lost : 0;
  return { skills, fatigue: Math.round(fatigue - fatigue * back) };
}

function addStats(a: BehaviorStats, b: BehaviorStats): BehaviorStats {
  const sum = { ...a };
  for (const key of Object.keys(sum) as (keyof BehaviorStats)[]) sum[key] = a[key] + b[key];
  return sum;
}

/**
 * Plays the next scrum from its finished mise: simulates it, records every
 * spoof's points and tiring, and, if the match goes on, lets them recover.
 */
export function playScrum(match: Match, mise: MiseState): Match {
  if (isMatchOver(match)) throw new Error('The match is over');
  if (!isMiseOver(mise)) throw new Error('The mise is not over');
  const n = scrumNumber(match);
  const entries = scrumEntries(match, mise);
  const result = simulateScrum(entries, { random: matchRandom(match, 'scrum', n) });
  const last = result.frames[result.frames.length - 1];
  if (!last) throw new Error('A scrum produced no frames');
  const scores = finalScores(last);
  const scrums = [...match.scrums, { mise, result, scores }];
  const over = scrums.length >= SCRUMS_PER_MATCH;
  const random = matchRandom(match, 'recovery', n);

  const update = (side: BenchSide) =>
    match.spoofs[side].map((m): MatchSpoof => {
      const finish = result.finish.find(
        (f) => f.id === m.spoof.id && entries.some((e) => e.team === side && e.spoof.id === f.id),
      );
      if (!finish) return { ...m, points: [...m.points, null] };
      return {
        ...m,
        skills: { ...finish.skills },
        fatigue: finish.fatigue,
        points: [...m.points, scores.spoofs[m.spoof.id] ?? 0],
        stats: addStats(m.stats, finish.stats),
      };
    });
  const played = (side: BenchSide) =>
    new Set(entries.filter((e) => e.team === side).map((e) => e.spoof.id));
  const after = { home: update('home'), visitor: update('visitor') };
  // Between scrums, they recover; after the last, there's nothing to recover for.
  const spoofs = over
    ? after
    : {
        home: restBetweenScrums(after.home, played('home'), random),
        visitor: restBetweenScrums(after.visitor, played('visitor'), random),
      };
  return { ...match, scrums, spoofs };
}

/**
 * The break between scrums: a spoof that sat the scrum out rests first, and
 * can recover fully; then every spoof recovers up to `BREAK_RECOVERY_CAP`.
 */
export function restBetweenScrums(
  spoofs: readonly MatchSpoof[],
  played: ReadonlySet<string>,
  random: Random,
): MatchSpoof[] {
  return spoofs.map((m) => {
    let now = { skills: m.skills, fatigue: m.fatigue };
    if (!played.has(m.spoof.id)) {
      now = recover(m.spoof.skills, now.skills, now.fatigue, REST_RECOVERY_CAP, random);
    }
    now = recover(m.spoof.skills, now.skills, now.fatigue, BREAK_RECOVERY_CAP, random);
    return { ...m, ...now };
  });
}

/** Each team's points in each scrum played so far. */
export function scoreByScrum(match: Match): Readonly<Record<BenchSide, readonly number[]>> {
  return {
    home: match.scrums.map((s) => s.scores.teams.home ?? 0),
    visitor: match.scrums.map((s) => s.scores.teams.visitor ?? 0),
  };
}

/** Each team's total so far. */
export function matchScore(match: Match): Readonly<Record<BenchSide, number>> {
  const by = scoreByScrum(match);
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  return { home: sum(by.home), visitor: sum(by.visitor) };
}

/** The result for a side, once the match is over: an equal total is a tie, with no overtime. */
export type Outcome = 'won' | 'lost' | 'tied';

export function outcomeFor(match: Match, side: BenchSide): Outcome {
  if (!isMatchOver(match)) throw new Error('The match is not over');
  const score = matchScore(match);
  const mine = score[side];
  const theirs = score[side === 'home' ? 'visitor' : 'home'];
  return mine > theirs ? 'won' : mine < theirs ? 'lost' : 'tied';
}

/**
 * What a finished match leaves behind, ready for the Stats epic to save
 * (#40): the teams, the score by scrum, the result, and for each spoof its
 * scrums played, points and behavior stats. Outcomes only: no skills.
 */
export interface MatchRecord {
  readonly seed: number;
  readonly host: BenchSide;
  readonly teams: Readonly<Record<BenchSide, string>>;
  readonly scoreByScrum: Readonly<Record<BenchSide, readonly number[]>>;
  readonly score: Readonly<Record<BenchSide, number>>;
  /** The home team's result: won, lost or tied. */
  readonly result: Outcome;
  readonly spoofs: readonly {
    readonly team: BenchSide;
    readonly id: string;
    readonly scrumsPlayed: number;
    readonly points: number;
    readonly pointsByScrum: readonly (number | null)[];
    readonly stats: BehaviorStats;
  }[];
}

export function matchRecord(match: Match): MatchRecord {
  if (!isMatchOver(match)) throw new Error('The match is not over');
  const sides: readonly BenchSide[] = ['home', 'visitor'];
  return {
    seed: match.seed,
    host: match.host,
    teams: { home: match.teams.home.name, visitor: match.teams.visitor.name },
    scoreByScrum: scoreByScrum(match),
    score: matchScore(match),
    result: outcomeFor(match, 'home'),
    spoofs: sides.flatMap((team) =>
      match.spoofs[team].map((m) => ({
        team,
        id: m.spoof.id,
        scrumsPlayed: m.points.filter((p) => p !== null).length,
        points: m.points.reduce<number>((a, p) => a + (p ?? 0), 0),
        pointsByScrum: m.points,
        stats: m.stats,
      })),
    ),
  };
}
