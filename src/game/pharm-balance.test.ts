import { describe, expect, it } from 'vitest';
import { DRAFT_BUDGET, createPool } from './combine';
import {
  DEFAULT_PROSPECT_TUNING,
  TEAM_SKILL_CEILING,
  afterMatch,
  canDraft,
  draftProspect,
  teamSkillTotal,
  type ProspectTuning,
} from './pharm';
import { createRandom, type Random } from './random';
import { emptyRoster } from './roster';
import { skillTotal } from './skills';
import type { Spoof, Team } from './teams';

/**
 * The balance check for the Pharm's prospects (#107): teams drafted in the
 * combine lose match after match, and draft whenever they hold 3 prospects.
 * The owner's aim (#105): a team's weakest spoof improves, while its best
 * rarely climbs, so teams improve and level off under the ceiling.
 */

const TEAMS = 40;
const LOSSES = 60;

/** A team drafted from a combine pool: candidates in a random order, each taken while the budget allows. */
function draftedTeam(seed: number): Team {
  const random = createRandom(seed * 7 + 1);
  const pool = createPool(seed)
    .map((candidate) => ({ candidate, key: random.next() }))
    .sort((a, b) => a.key - b.key)
    .map((c) => c.candidate);
  const picks: Spoof[] = [];
  let left = DRAFT_BUDGET;
  const byPrice = [...pool].sort((a, b) => a.price - b.price);
  for (const candidate of pool) {
    const stillNeeded = 4 - picks.length;
    const cheapestRest = byPrice
      .filter((c) => c !== candidate && !picks.includes(c.spoof))
      .slice(0, Math.max(stillNeeded, 0))
      .reduce((sum, c) => sum + c.price, 0);
    if (picks.length < 5 && candidate.price + cheapestRest <= left) {
      picks.push(candidate.spoof);
      left -= candidate.price;
    }
  }
  if (picks.length !== 5)
    throw new Error(`pool ${String(seed)} gave ${String(picks.length)} picks`);
  return { name: `Team ${String(seed)}`, color: 'teal', logo: '🐝', spoofs: picks };
}

const totalOf = (s: Spoof) => skillTotal(s.skills);
const weakest = (team: Team) => team.spoofs.reduce((a, b) => (totalOf(a) <= totalOf(b) ? a : b));
const best = (team: Team) => Math.max(...team.spoofs.map(totalOf));

type Scout = (prospects: readonly Spoof[], random: Random) => Spoof;
/** A perfect scout takes the strongest prospect. */
const perfect: Scout = (prospects) =>
  prospects.reduce((a, b) => (totalOf(a) >= totalOf(b) ? a : b));
/** A careless one takes any. */
const careless: Scout = (prospects, random) => random.pick(prospects);

interface Run {
  readonly start: { weakest: number; best: number; team: number };
  readonly half: { weakest: number; best: number; team: number };
  readonly end: { weakest: number; best: number; team: number };
  readonly drafts: number;
  readonly highestTeam: number;
}

function season(seed: number, scout: Scout, tuning: ProspectTuning = DEFAULT_PROSPECT_TUNING): Run {
  const random = createRandom(seed + 1000);
  let team = draftedTeam(seed);
  let roster = emptyRoster(seed);
  let drafts = 0;
  let highestTeam = teamSkillTotal(team);
  const snap = () => ({
    weakest: totalOf(weakest(team)),
    best: best(team),
    team: teamSkillTotal(team),
  });
  const start = snap();
  let half = start;
  for (let loss = 1; loss <= LOSSES; loss += 1) {
    roster = afterMatch(roster, team, 'lost', tuning);
    if (canDraft(roster)) {
      const chosen = scout(roster.prospects, random);
      const result = draftProspect(team, roster, chosen.id, weakest(team).id);
      // A type limit can refuse the weakest spot; then the scout waits a loss.
      if (result.ok) {
        team = result.team;
        roster = result.roster;
        drafts += 1;
      }
    }
    highestTeam = Math.max(highestTeam, teamSkillTotal(team));
    if (loss === LOSSES / 2) half = snap();
  }
  return { start, half, end: snap(), drafts, highestTeam };
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function summary(runs: readonly Run[]) {
  const at = (key: 'start' | 'half' | 'end', field: 'weakest' | 'best' | 'team') =>
    Math.round(mean(runs.map((r) => r[key][field])));
  return {
    weakest: [at('start', 'weakest'), at('half', 'weakest'), at('end', 'weakest')],
    best: [at('start', 'best'), at('half', 'best'), at('end', 'best')],
    team: [at('start', 'team'), at('half', 'team'), at('end', 'team')],
    drafts: mean(runs.map((r) => r.drafts)),
    bestClimbed: runs.filter((r) => r.end.best > r.start.best).length,
    highestTeam: Math.max(...runs.map((r) => r.highestTeam)),
  };
}

describe(`a season of ${String(LOSSES)} losses, for ${String(TEAMS)} drafted teams (#107)`, () => {
  const seeds = Array.from({ length: TEAMS }, (_, i) => i + 1);
  const perfectRuns = seeds.map((seed) => season(seed, perfect));
  const carelessRuns = seeds.map((seed) => season(seed, careless));
  const noOutliers = { ...DEFAULT_PROSPECT_TUNING, outlierRate: 0 };
  const withoutOutliers = seeds.map((seed) => season(seed, perfect, noOutliers));
  const results = {
    perfect: summary(perfectRuns),
    careless: summary(carelessRuns),
    withoutOutliers: summary(withoutOutliers),
  };

  it('never takes a team over the ceiling', () => {
    expect(results.perfect.highestTeam).toBeLessThanOrEqual(TEAM_SKILL_CEILING);
    expect(results.careless.highestTeam).toBeLessThanOrEqual(TEAM_SKILL_CEILING);
  });

  it("improves a team's weakest spoof, more for a good scout", () => {
    const { perfect: p, careless: c } = results;
    expect(p.weakest[2]).toBeGreaterThan((p.weakest[0] ?? 0) * 1.08);
    expect(c.weakest[2]).toBeGreaterThan(c.weakest[0] ?? 0);
    expect(p.team[2]).toBeGreaterThan(c.team[2] ?? 0);
  });

  it('levels off: the second half of the season improves a team less than the first', () => {
    const { team } = results.perfect;
    const [start = 0, half = 0, end = 0] = team;
    expect(end - half).toBeLessThan(half - start);
  });

  it('lifts a team’s best spoof only through outliers', () => {
    expect(results.withoutOutliers.bestClimbed).toBe(0);
  });

  it('lifts it modestly with them: under 10% on average over the season, even for a perfect scout', () => {
    const [start = 0, , end = 0] = results.perfect.best;
    expect(end).toBeGreaterThan(start);
    expect(end).toBeLessThan(start * 1.1);
  });
});
