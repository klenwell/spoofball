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
import { courtMateNudge, matchForm, nudged } from './skew';
import { clampSkill, skillNames, type Skills } from './skills';
import type { ScrumSkills } from './spoof-motion';
import type { Spoof, Team } from './teams';

/**
 * A match (#40): three scrums, each with its own mise, with tired spoofs
 * carrying their fatigue from one scrum to the next, then a result. Rules
 * from docs/design.md (Decisions for later epics, Match), after the
 * prototype's `models/match.py` and `recuperate` in `lib/minrook/rooks.py`.
 *
 * Each spoof plays the match in its own form, and each scrum it's nudged by
 * its court-mates (#62, skew.ts). Both are hidden.
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
  /** Its form this match (#62): its own skills, skewed once at the start. Recovery restores toward it. Hidden. */
  readonly form: Skills;
  /** Its skills now: its form, worn down by tiring and partly restored by recovery. */
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
  purpose: 'host' | 'order' | 'moves' | 'scrum' | 'recovery' | 'form' | 'nudge' | 'opponent',
  scrum = 0,
): Random {
  const purposes = {
    host: 1,
    order: 2,
    moves: 3,
    scrum: 4,
    recovery: 5,
    form: 6,
    nudge: 7,
    // Which league team a match is against (#75), drawn before the match starts.
    opponent: 8,
  } as const;
  // A large odd multiplier spreads nearby seeds apart. Math.imul keeps the
  // product in 32-bit integers: a plain multiply passes 2^53 for most seeds
  // and rounds away the purpose and scrum, so every purpose drew the same
  // numbers (#57 review). >>> 0 makes it unsigned.
  return createRandom(
    (Math.imul(match.seed, 2654435761) + purposes[purpose] * 97 + scrum * 7919) >>> 0,
  );
}

function freshSpoof(spoof: Spoof, random: Random): MatchSpoof {
  const form = matchForm(spoof.skills, random);
  return {
    spoof,
    form,
    skills: { ...form },
    fatigue: 0,
    points: [],
    stats: emptyStats(),
  };
}

/**
 * A new match between two teams. Fatigue starts at 0: it resets every match.
 * Every spoof's form is drawn anew from the seed.
 */
export function startMatch(home: Team, visitor: Team, seed: number): Match {
  const host = matchRandom({ seed }, 'host').pick<BenchSide>(['home', 'visitor']);
  const forms = matchRandom({ seed }, 'form');
  return {
    seed,
    host,
    teams: { home, visitor },
    spoofs: {
      home: home.spoofs.map((s) => freshSpoof(s, forms)),
      visitor: visitor.spoofs.map((s) => freshSpoof(s, forms)),
    },
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

function matchSpoof(match: Match, side: BenchSide, id: string): MatchSpoof {
  const found = match.spoofs[side].find((m) => m.spoof.id === id);
  if (!found) throw new Error(`No spoof ${id} on ${side}`);
  return found;
}

/**
 * The next scrum's starting lineup from its finished mise: placed spoofs, as
 * tired as they are, each nudged by its court-mates in this scrum (#62).
 */
export function scrumEntries(match: Match, mise: MiseState): ScrumEntry[] {
  const random = matchRandom(match, 'nudge', scrumNumber(match));
  const placed = miseEntries(mise, {
    home: match.teams.home.spoofs,
    visitor: match.teams.visitor.spoofs,
  });
  return placed.map((entry) => {
    const side = entry.team as BenchSide;
    const me = matchSpoof(match, side, entry.spoof.id);
    const courtMates = placed
      .filter((e) => e.team === side && e.spoof.id !== entry.spoof.id)
      .map((e) => e.spoof.skills);
    const nudge = courtMateNudge(me.form, courtMates, random);
    const skills = nudged(me.spoof.skills, me.form, me.skills, nudge);
    return { ...entry, spoof: { ...entry.spoof, skills }, fatigue: me.fatigue };
  });
}

/**
 * A spoof's skills after a scrum: what it had going in, less what it lost to
 * tiring in the scrum. The court-mates' nudge drops off: it lasts only that
 * scrum (#62).
 */
function afterScrum(
  before: Readonly<ScrumSkills>,
  start: Readonly<ScrumSkills>,
  finish: Readonly<ScrumSkills>,
): ScrumSkills {
  const skills = { ...before };
  for (const name of skillNames)
    skills[name] = clampSkill(before[name] - (start[name] - finish[name]));
  return skills;
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
  // At most half of comp (constancy tops out at 99), so always below `most`
  // with this game's caps of 66 and 100. The prototype also held it under
  // 90% of the most, which could never bind here, so that's left out.
  const least = Math.round(comp * core.constancy * 0.01 * 0.5);
  const skills = { ...current };
  let lost = 0;
  let regained = 0;
  for (const name of TIRING_SKILLS) {
    const loss = core[name] - current[name];
    if (loss <= 0) continue;
    const share = random.int(least, most) * 0.01;
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
      const entry = entries.find((e) => e.team === side && e.spoof.id === m.spoof.id);
      if (!finish || !entry) return { ...m, points: [...m.points, null] };
      return {
        ...m,
        skills: afterScrum(m.skills, entry.spoof.skills, finish.skills),
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
 * Both restore toward the spoof's form, not its own skills (#62): the
 * prototype's fade of the form is left out.
 */
export function restBetweenScrums(
  spoofs: readonly MatchSpoof[],
  played: ReadonlySet<string>,
  random: Random,
): MatchSpoof[] {
  return spoofs.map((m) => {
    let now = { skills: m.skills, fatigue: m.fatigue };
    if (!played.has(m.spoof.id)) {
      now = recover(m.form, now.skills, now.fatigue, REST_RECOVERY_CAP, random);
    }
    now = recover(m.form, now.skills, now.fatigue, BREAK_RECOVERY_CAP, random);
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

/** A spoof's line in a scrum's result: its points, or null if it sat the scrum out. */
export interface SpoofScrumLine {
  readonly id: string;
  readonly name: string;
  readonly type: Spoof['type'];
  /** The mark on its disc (#74). */
  readonly mark: Spoof['mark'];
  readonly points: number | null;
}

/** One played scrum's result (#58): its score, the match score after it, and each spoof's points. */
export interface ScrumSummary {
  /** Which scrum, from 1. */
  readonly scrum: number;
  readonly score: Readonly<Record<BenchSide, number>>;
  /** The match score after this scrum. */
  readonly matchScore: Readonly<Record<BenchSide, number>>;
  /** Every spoof of each team, in team order. Outcomes only: no skills. */
  readonly spoofs: Readonly<Record<BenchSide, readonly SpoofScrumLine[]>>;
}

/** The result of played scrum `n` (from 0). */
export function scrumSummary(match: Match, n: number): ScrumSummary {
  const by = scoreByScrum(match);
  if (n < 0 || n >= by.home.length)
    throw new RangeError(`Scrum ${String(n + 1)} hasn't been played`);
  const upTo = (xs: readonly number[]) => xs.slice(0, n + 1).reduce((a, b) => a + b, 0);
  const lines = (side: BenchSide) =>
    match.spoofs[side].map((m) => ({
      id: m.spoof.id,
      name: m.spoof.name,
      type: m.spoof.type,
      mark: m.spoof.mark,
      points: m.points[n] ?? null,
    }));
  return {
    scrum: n + 1,
    score: { home: by.home[n] ?? 0, visitor: by.visitor[n] ?? 0 },
    matchScore: { home: upTo(by.home), visitor: upTo(by.visitor) },
    spoofs: { home: lines('home'), visitor: lines('visitor') },
  };
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

/** A spoof's line on the match scorecard: its points in each scrum (null if it sat out), and its total. */
export interface ScorecardLine {
  readonly id: string;
  readonly name: string;
  readonly type: Spoof['type'];
  /** The mark on its disc (#74). */
  readonly mark: Spoof['mark'];
  readonly byScrum: readonly (number | null)[];
  readonly total: number;
}

/** A team on the match scorecard: its name, its score in each scrum and in all, and its spoofs. */
export interface ScorecardTeam {
  readonly name: string;
  /** The team's emoji logo, shown with its name (#75). */
  readonly logo: string;
  readonly byScrum: readonly number[];
  readonly total: number;
  readonly lines: readonly ScorecardLine[];
}

/** The match scorecard (#60): the outcome, and both teams' scores broken down by scrum. Outcomes only. */
export interface Scorecard {
  /** The home team's result. */
  readonly outcome: Outcome;
  readonly teams: Readonly<Record<BenchSide, ScorecardTeam>>;
}

export function matchScorecard(match: Match): Scorecard {
  const by = scoreByScrum(match);
  const total = matchScore(match);
  const team = (side: BenchSide): ScorecardTeam => ({
    name: match.teams[side].name,
    logo: match.teams[side].logo,
    byScrum: by[side],
    total: total[side],
    lines: match.spoofs[side].map((m) => ({
      id: m.spoof.id,
      name: m.spoof.name,
      type: m.spoof.type,
      mark: m.spoof.mark,
      byScrum: m.points,
      total: m.points.reduce<number>((a, p) => a + (p ?? 0), 0),
    })),
  });
  return {
    outcome: outcomeFor(match, 'home'),
    teams: { home: team('home'), visitor: team('visitor') },
  };
}

/**
 * What a finished match leaves behind, saved in your team's stats (#40,
 * #89): the teams, the score by scrum, the result, and for each spoof its
 * scrums played, points and behavior stats. Outcomes only: no skills.
 */
export interface MatchRecord {
  readonly seed: number;
  readonly host: BenchSide;
  readonly teams: Readonly<Record<BenchSide, string>>;
  /** Each team's emoji logo (#89), for the match log. */
  readonly logos: Readonly<Record<BenchSide, string>>;
  readonly scoreByScrum: Readonly<Record<BenchSide, readonly number[]>>;
  readonly score: Readonly<Record<BenchSide, number>>;
  /** The home team's result: won, lost or tied. */
  readonly result: Outcome;
  readonly spoofs: readonly {
    readonly team: BenchSide;
    readonly id: string;
    /** The spoof's name when the match was played: a spoof can be renamed later. */
    readonly name: string;
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
    logos: { home: match.teams.home.logo, visitor: match.teams.visitor.logo },
    scoreByScrum: scoreByScrum(match),
    score: matchScore(match),
    result: outcomeFor(match, 'home'),
    spoofs: sides.flatMap((team) =>
      match.spoofs[team].map((m) => ({
        team,
        id: m.spoof.id,
        name: m.spoof.name,
        scrumsPlayed: m.points.filter((p) => p !== null).length,
        points: m.points.reduce<number>((a, p) => a + (p ?? 0), 0),
        pointsByScrum: m.points,
        stats: m.stats,
      })),
    ),
  };
}
