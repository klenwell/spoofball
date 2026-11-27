import { describe, expect, it } from 'vitest';
import { DRAFT_BUDGET } from '../game/combine';
import { draftPool, startDraft } from '../game/draft';
import { LEAGUE } from '../game/league';
import { matchRecord } from '../game/match';
import { computerMatch } from '../game/computer-play';
import { afterMatch, prospectRange } from '../game/pharm';
import { createRandom } from '../game/random';
import { emptyRoster } from '../game/roster';
import { skillTotal } from '../game/skills';
import { generateSpoof, teamProblems } from '../game/teams';
import { SPOOFS } from '../game/preset-teams';
import {
  findOpponent,
  matchLine,
  prospectLine,
  prospectRows,
  quickDraft,
  simUntil,
  teamLine,
  teamRows,
} from './qa-core';

const WEAKEST = LEAGUE[0];
const STRONGEST = LEAGUE[LEAGUE.length - 1];
if (!WEAKEST || !STRONGEST) throw new Error('The league is empty');

describe('findOpponent', () => {
  it('finds a league team by name, ignoring case and spaces at the ends', () => {
    expect(findOpponent('  yosemite GOATS ', createRandom(1))).toEqual({
      ok: true,
      value: STRONGEST,
    });
  });

  it('draws a league team when no name is given', () => {
    const found = findOpponent(undefined, createRandom(1));
    expect(found.ok && LEAGUE.includes(found.value)).toBe(true);
  });

  it('lists the league for a name it doesn’t know', () => {
    const found = findOpponent('Embers', createRandom(1));
    expect(found.ok).toBe(false);
    expect(!found.ok && found.message).toContain('No league team called "Embers"');
    expect(!found.ok && found.message).toContain(STRONGEST.name);
  });
});

describe('simUntil', () => {
  it('plays until a match ends in the result asked for', () => {
    for (const result of ['won', 'lost'] as const) {
      const opponent = result === 'won' ? WEAKEST : STRONGEST;
      const played = simUntil(SPOOFS, opponent, result, 100);
      expect(played.ok && played.value.record.result).toBe(result);
    }
  });

  it('takes the first match when no result is asked for', () => {
    const played = simUntil(SPOOFS, STRONGEST, undefined, 100);
    expect(played.ok && played.value.tries).toBe(1);
    expect(played.ok && played.value.record).toEqual(
      matchRecord(computerMatch(SPOOFS, STRONGEST, 100)),
    );
  });

  it('gives up with a message after its tries', () => {
    const first = matchRecord(computerMatch(SPOOFS, STRONGEST, 100)).result;
    const other = first === 'lost' ? 'won' : 'lost';

    const played = simUntil(SPOOFS, STRONGEST, other, 100, 1);

    expect(played).toEqual({
      ok: false,
      message: `No ${other} against ${STRONGEST.name} in 1 matches. Try another opponent.`,
    });
  });
});

describe('matchLine', () => {
  it('says the result, the score and the opponent', () => {
    const record = matchRecord(computerMatch(SPOOFS, STRONGEST, 100));
    expect(matchLine(record)).toBe(
      `${record.result} ${String(record.score.home)}–${String(record.score.visitor)} against Yosemite Goats`,
    );
  });
});

describe('quickDraft', () => {
  it('drafts a sound team of 5 within the budget, the same for the same seed', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const team = quickDraft(seed);
      expect(teamProblems(team)).toEqual([]);
      const pool = draftPool(
        startDraft({ name: team.name, color: team.color, logo: team.logo }, seed),
      );
      const spent = team.spoofs.reduce(
        (sum, s) => sum + (pool.find((c) => c.spoof.id === s.id)?.price ?? 0),
        0,
      );
      expect(spent).toBeLessThanOrEqual(DRAFT_BUDGET);
    }
    expect(quickDraft(7)).toEqual(quickDraft(7));
    expect(quickDraft(7).name).toBe('QA Team');
  });
});

describe('teamRows', () => {
  it('gives each spoof’s hidden type and skill total, in team order', () => {
    const rows = teamRows(SPOOFS);
    expect(rows.map((r) => r.id)).toEqual(SPOOFS.spoofs.map((s) => s.id));
    expect(rows.map((r) => r.type)).toEqual(SPOOFS.spoofs.map((s) => s.type));
    expect(rows.map((r) => r.total)).toEqual(SPOOFS.spoofs.map((s) => skillTotal(s.skills)));
  });
});

describe('teamLine', () => {
  it('gives the team’s total against the ceiling', () => {
    const total = SPOOFS.spoofs.reduce((sum, s) => sum + skillTotal(s.skills), 0);
    expect(teamLine(SPOOFS)).toBe(`Spoofs: ${String(total)} of the 3300 ceiling`);
  });
});

describe('prospectRows', () => {
  it('marks each prospect in, above or below the team’s range', () => {
    const range = prospectRange(SPOOFS);
    const at = (id: string, total: number) =>
      generateSpoof(id, 'pawn-basic', total, createRandom(total), [id]);
    const roster = {
      ...emptyRoster(1),
      prospectsDrawn: 3,
      prospects: [
        at('x1', Math.round(range.high) + 30),
        at('x2', Math.round((range.low + range.high) / 2)),
        at('x3', Math.round(range.low) - 30),
      ],
    };

    expect(prospectRows(SPOOFS, roster).map((r) => [r.id, r.range])).toEqual([
      ['x1', 'above'],
      ['x2', 'in'],
      ['x3', 'below'],
    ]);
  });
});

describe('prospectLine', () => {
  it('gives the picks held and the range', () => {
    const roster = afterMatch(emptyRoster(1), SPOOFS, 'lost');
    const { low, high, cap } = prospectRange(SPOOFS);
    expect(prospectLine(SPOOFS, roster)).toBe(
      `1 of 3 picks. Range ${String(Math.round(low))}–${String(Math.round(high))}, cap ${String(Math.round(cap))}.`,
    );
  });
});
