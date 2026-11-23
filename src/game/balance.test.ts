import { describe, expect, it } from 'vitest';
import {
  isMatchOver,
  matchScore,
  miseRandom,
  nextMise,
  playScrum,
  startMatch,
  type Match,
} from './match';
import { computerMove, placeSpoof, whoseTurn, type MiseState } from './mise';
import { PRESET_HOME, PRESET_VISITOR } from './preset-teams';

/**
 * Balance checks over many seeded matches (#41). Repeatable, because every
 * match comes from its seed: if a change moves scoring out of its range, this
 * says so.
 */

function computerMise(match: Match): MiseState {
  let mise = nextMise(match);
  const random = miseRandom(match);
  for (let team = whoseTurn(mise); team; team = whoseTurn(mise)) {
    const move = computerMove(mise, team, match.teams[team].spoofs, random);
    mise = placeSpoof(mise, move.spoof, team, move.spot);
  }
  return mise;
}

function teamTotals(matches: number): number[] {
  const totals: number[] = [];
  for (let n = 1; n <= matches; n += 1) {
    let match = startMatch(PRESET_HOME.team, PRESET_VISITOR.team, Math.imul(n, 2654435761) >>> 0);
    while (!isMatchOver(match)) match = playScrum(match, computerMise(match));
    const score = matchScore(match);
    totals.push(score.home, score.visitor);
  }
  return totals.sort((a, b) => a - b);
}

describe('match totals, over many seeded matches', () => {
  const totals = teamTotals(60);
  const share = (test: (x: number) => boolean) => totals.filter(test).length / totals.length;

  it("land in the prototype's 10–100 range for a typical team", () => {
    const median = totals[Math.floor(totals.length / 2)] ?? 0;

    expect(median).toBeGreaterThanOrEqual(30);
    expect(median).toBeLessThanOrEqual(70);
    expect(share((x) => x >= 10 && x <= 100)).toBeGreaterThanOrEqual(0.9);
  });

  it('vary from match to match', () => {
    expect(share((x) => x < 30)).toBeGreaterThan(0.05);
    expect(share((x) => x > 70)).toBeGreaterThan(0.05);
  });
});
