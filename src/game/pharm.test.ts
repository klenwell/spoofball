import { describe, expect, it } from 'vitest';
import { createPool, POOL_SIZE } from './combine';
import {
  DEFAULT_PROSPECT_TUNING,
  TEAM_SKILL_CEILING,
  afterMatch,
  canDraft,
  canReplace,
  draftProspect,
  drawProspect,
  changeMark,
  drawProspectTotal,
  moveSpoof,
  renameSpoof,
  spoofRenameProblem,
  prospectRange,
  prospectTypes,
  teamSkillTotal,
} from './pharm';
import { createRandom } from './random';
import { emptyRoster, rosterProblems, type Roster } from './roster';
import { skillTotal } from './skills';
import type { SpoofType } from './spoof-types';
import { generateSpoof, spoofProblems, teamProblems, type Spoof, type Team } from './teams';

/** A team of 5 spoofs of these types and skill totals. */
function teamOf(spoofs: readonly (readonly [SpoofType, number])[], name = 'Testers'): Team {
  const made: Spoof[] = [];
  spoofs.forEach(([type, total], i) => {
    const spoof = generateSpoof(
      `t${String(i + 1)}`,
      type,
      total,
      createRandom(i + 17),
      made.map((s) => s.name),
    );
    made.push(spoof);
  });
  return { name, color: 'teal', logo: '🐝', spoofs: made };
}

/** A team with a queen, a rook, a bishop and 2 pawns, from 480 to 560. */
const MIXED = teamOf([
  ['queen', 520],
  ['rook', 560],
  ['bishop', 500],
  ['pawn-basic', 480],
  ['pawn-noble', 540],
]);

/** A roster with these losses' prospects already drawn. */
function rosterAfterLosses(team: Team, losses: number, seed = 5): Roster {
  let roster = emptyRoster(seed);
  for (let i = 0; i < losses; i += 1) roster = afterMatch(roster, team, 'lost');
  return roster;
}

describe('TEAM_SKILL_CEILING', () => {
  it('is never reached by a combine draft, even the 5 strongest of a pool', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const totals = createPool(seed)
        .map((c) => skillTotal(c.spoof.skills))
        .sort((a, b) => b - a);
      expect(totals).toHaveLength(POOL_SIZE);
      const strongest = totals.slice(0, 5).reduce((a, b) => a + b, 0);
      expect(strongest).toBeLessThanOrEqual(TEAM_SKILL_CEILING);
    }
  });

  it('keeps every swap under it: a prospect for the weakest spoof brings the team at most to it', () => {
    // 650 a spoof: 3,250, just under the ceiling.
    const near = teamOf([
      ['queen', 650],
      ['rook', 650],
      ['bishop', 650],
      ['knight', 650],
      ['pawn-basic', 650],
    ]);
    let roster = emptyRoster(3);
    for (let i = 0; i < 200; i += 1) {
      roster = afterMatch(roster, near, 'lost');
      const prospect = roster.prospects.at(-1);
      if (!prospect) throw new Error('no prospect');
      for (const spoof of near.spoofs) {
        const swapped =
          teamSkillTotal(near) - skillTotal(spoof.skills) + skillTotal(prospect.skills);
        expect(swapped).toBeLessThanOrEqual(TEAM_SKILL_CEILING);
      }
    }
  });
});

describe('prospectTypes', () => {
  it('allows no royal when the team has one, and pawns always', () => {
    const types = prospectTypes(MIXED);
    expect(types).not.toContain('king');
    expect(types).not.toContain('queen');
    expect(types).toEqual(expect.arrayContaining(['pawn-basic', 'pawn-noble', 'pawn-angry']));
  });

  it('allows a face type only while the team has fewer than 2', () => {
    const twoRooks = teamOf([
      ['rook', 500],
      ['rook', 500],
      ['bishop', 500],
      ['pawn-basic', 500],
      ['pawn-basic', 500],
    ]);
    const types = prospectTypes(twoRooks);
    expect(types).not.toContain('rook');
    expect(types).toEqual(expect.arrayContaining(['bishop', 'knight', 'king', 'queen']));
  });
});

describe('prospectRange', () => {
  it('runs from the weakest spoof to the strongest', () => {
    expect(prospectRange(MIXED)).toMatchObject({ low: 480, high: 560 });
  });

  it('is widened downward, to at least 10% of the average spoof, when the team is tight', () => {
    const even = teamOf([
      ['queen', 500],
      ['rook', 500],
      ['bishop', 500],
      ['pawn-basic', 500],
      ['pawn-noble', 500],
    ]);
    expect(prospectRange(even)).toMatchObject({ low: 450, high: 500 });
  });

  it('is capped so a prospect for the weakest spoof brings the team at most to the ceiling', () => {
    const near = teamOf([
      ['queen', 600],
      ['rook', 700],
      ['bishop', 700],
      ['knight', 700],
      ['pawn-basic', 560],
    ]);
    // 3,260 in all: the cap is 3,300 − (3,260 − 560) = 600. The range keeps
    // its least width under it, 2 × 5% of the 652 average: from 534.8.
    const range = prospectRange(near);
    expect(range).toMatchObject({ high: 600, cap: 600 });
    expect(range.low).toBeCloseTo(534.8);
  });
});

describe('drawProspectTotal', () => {
  const DRAWS = 20000;
  const range = prospectRange(MIXED);

  function draw(r = range, seed = 9) {
    const random = createRandom(seed);
    return Array.from({ length: DRAWS }, () => drawProspectTotal(r, random));
  }

  it('puts about 4% (3–5%) outside the range, about half above and half below', () => {
    const totals = draw();
    const above = totals.filter((t) => t > range.high).length;
    const below = totals.filter((t) => t < range.low).length;
    expect((above + below) / DRAWS).toBeGreaterThanOrEqual(0.03);
    expect((above + below) / DRAWS).toBeLessThanOrEqual(0.05);
    expect(above / (above + below)).toBeGreaterThan(0.35);
    expect(above / (above + below)).toBeLessThan(0.65);
  });

  it('takes an outlier no more than 15% beyond the range', () => {
    const totals = draw();
    expect(Math.max(...totals)).toBeLessThanOrEqual(Math.round(range.high * 1.15));
    expect(Math.min(...totals)).toBeGreaterThanOrEqual(Math.round(range.low * 0.85));
    expect(Math.max(...totals)).toBeGreaterThan(range.high * 1.1);
    expect(Math.min(...totals)).toBeLessThan(range.low * 0.9);
  });

  it('has a soft middle: the middle third of the range is likelier than either end', () => {
    const third = (range.high - range.low) / 3;
    const inThird = (k: number) =>
      draw().filter((t) => t >= range.low + k * third && t < range.low + (k + 1) * third).length;
    const [low, middle, high] = [inThird(0), inThird(1), inThird(2)];
    expect(middle).toBeGreaterThan(1.5 * low);
    expect(middle).toBeGreaterThan(1.5 * high);
  });

  it('never goes over the cap; near it, outliers only go below', () => {
    const capped = { low: 560, high: 600, cap: 600 };
    const totals = draw(capped);
    expect(Math.max(...totals)).toBeLessThanOrEqual(600);
    const below = totals.filter((t) => t < capped.low).length;
    expect(below / DRAWS).toBeGreaterThanOrEqual(0.03);
  });

  it('uses the tuning it’s given', () => {
    const random = createRandom(4);
    const none = { ...DEFAULT_PROSPECT_TUNING, outlierRate: 0 };
    const totals = Array.from({ length: 2000 }, () => drawProspectTotal(range, random, none));
    expect(totals.every((t) => t >= range.low && t <= range.high)).toBe(true);
  });
});

describe('drawProspect', () => {
  it('draws the same prospect for the same team and roster', () => {
    expect(drawProspect(MIXED, emptyRoster(8))).toEqual(drawProspect(MIXED, emptyRoster(8)));
    expect(drawProspect(MIXED, emptyRoster(8))).not.toEqual(drawProspect(MIXED, emptyRoster(9)));
  });

  it('numbers it after the prospects drawn so far', () => {
    expect(drawProspect(MIXED, emptyRoster(8)).id).toBe('x1');
    expect(drawProspect(MIXED, { ...emptyRoster(8), prospectsDrawn: 6 }).id).toBe('x7');
  });

  it('draws a sound spoof of an allowed type, with its drawn total', () => {
    let roster = emptyRoster(21);
    for (let i = 0; i < 300; i += 1) {
      const prospect = drawProspect(MIXED, roster);
      expect(spoofProblems(prospect)).toEqual([]);
      expect(prospectTypes(MIXED)).toContain(prospect.type);
      roster = { ...roster, prospectsDrawn: roster.prospectsDrawn + 1 };
    }
  });

  it('draws types by the combine’s odds, among those allowed', () => {
    // MIXED allows no royal: of the combine's odds left, pawns hold 50 of 90.
    const types = Array.from({ length: 3000 }, (_, i) =>
      drawProspect(MIXED, { ...emptyRoster(33), prospectsDrawn: i }),
    ).map((p) => p.type);
    const share = (match: (t: SpoofType) => boolean) => types.filter(match).length / types.length;
    expect(share((t) => t.startsWith('pawn'))).toBeGreaterThan(0.5);
    expect(share((t) => t.startsWith('pawn'))).toBeLessThan(0.61);
    expect(share((t) => t === 'knight')).toBeGreaterThan(0.11);
    expect(share((t) => t === 'knight')).toBeLessThan(0.2);
  });

  it('never turns a strong outlier into a weak spoof, near a type’s limit (#116 review)', () => {
    // A queen, a rook at 740, and 3 between 560 and 600: the allowed faces top
    // out at 748 and pawns at 704, below some high outliers.
    const strong = teamOf([
      ['queen', 560],
      ['rook', 740],
      ['bishop', 600],
      ['knight', 580],
      ['pawn-basic', 570],
    ]);
    const range = prospectRange(strong);
    for (let i = 0; i < 2000; i += 1) {
      const prospect = drawProspect(strong, { ...emptyRoster(12), prospectsDrawn: i });
      expect(skillTotal(prospect.skills)).toBeGreaterThanOrEqual(Math.floor(range.low * 0.85));
    }
  });

  it('names it unlike the team’s spoofs and the other prospects, with no word reused', () => {
    let roster = emptyRoster(5);
    for (let loss = 0; loss < 300; loss += 1) {
      roster = afterMatch(roster, MIXED, 'lost');
      const names = [...MIXED.spoofs, ...roster.prospects].map((s) => s.name.toLowerCase());
      const words = names.flatMap((n) => n.split(' '));
      expect(new Set(words).size).toBe(words.length);
    }
  });
});

describe('afterMatch', () => {
  it('brings a prospect with each loss, up to 3', () => {
    const one = afterMatch(emptyRoster(5), MIXED, 'lost');
    expect(one.prospects).toHaveLength(1);
    expect(one.prospectsDrawn).toBe(1);
    expect(rosterAfterLosses(MIXED, 3).prospects).toHaveLength(3);
    expect(rosterProblems(rosterAfterLosses(MIXED, 3))).toEqual([]);
  });

  it('replaces the oldest at 3', () => {
    const three = rosterAfterLosses(MIXED, 3);
    const four = afterMatch(three, MIXED, 'lost');

    expect(four.prospects.map((p) => p.id)).toEqual(['x2', 'x3', 'x4']);
    expect(four.prospectsDrawn).toBe(4);
  });

  it.each(['won', 'tied', 'forfeited'] as const)('changes nothing after a %s match', (result) => {
    const two = rosterAfterLosses(MIXED, 2);
    expect(afterMatch(two, MIXED, result)).toBe(two);
  });
});

describe('canDraft', () => {
  it('needs 3 prospects', () => {
    expect(canDraft(rosterAfterLosses(MIXED, 2))).toBe(false);
    expect(canDraft(rosterAfterLosses(MIXED, 3))).toBe(true);
  });
});

describe('draftProspect', () => {
  const three = rosterAfterLosses(MIXED, 3);

  it('refuses with fewer than 3 prospects', () => {
    const two = rosterAfterLosses(MIXED, 2);
    const id = two.prospects[0]?.id ?? '';
    expect(draftProspect(MIXED, two, id, 't1')).toEqual({ ok: false, problem: 'too-few' });
  });

  it('puts the prospect in the spoof’s place and cleans the slate', () => {
    const prospect = three.prospects[1];
    if (!prospect) throw new Error('no prospect');

    const result = draftProspect(MIXED, three, prospect.id, 't4');

    if (!result.ok) throw new Error(result.problem);
    expect(result.team.spoofs.map((s) => s.id)).toEqual(['t1', 't2', 't3', prospect.id, 't5']);
    expect(result.team.spoofs[3]).toBe(prospect);
    expect(teamProblems(result.team)).toEqual([]);
    expect(result.roster).toEqual({ ...three, prospects: [] });
  });

  it('refuses a prospect that isn’t there', () => {
    expect(draftProspect(MIXED, three, 'x99', 't1')).toEqual({ ok: false, problem: 'no-prospect' });
  });

  it('refuses a spoof that isn’t there', () => {
    const id = three.prospects[0]?.id ?? '';
    expect(draftProspect(MIXED, three, id, 't9')).toEqual({ ok: false, problem: 'no-spoof' });
  });

  it('refuses a swap that breaks the type limits, but allows it in place of the same kind', () => {
    const king = generateSpoof('x1', 'king', 520, createRandom(1), ['Nobody Here']);
    const roster: Roster = { ...three, prospects: [king, ...three.prospects.slice(1)] };

    // The team has a queen (t1): a king for a pawn would make 2 royals.
    expect(draftProspect(MIXED, roster, 'x1', 't4')).toEqual({ ok: false, problem: 'type-limit' });
    expect(draftProspect(MIXED, roster, 'x1', 't1').ok).toBe(true);
  });
});

describe('moveSpoof', () => {
  const ids = (team: Team) => team.spoofs.map((s) => s.id);

  it('moves a spoof to a new place, the others keeping their order (#108)', () => {
    expect(ids(moveSpoof(MIXED, 't4', 0))).toEqual(['t4', 't1', 't2', 't3', 't5']);
    expect(ids(moveSpoof(MIXED, 't1', 4))).toEqual(['t2', 't3', 't4', 't5', 't1']);
    expect(ids(moveSpoof(MIXED, 't2', 3))).toEqual(['t1', 't3', 't4', 't2', 't5']);
  });

  it('keeps the team as it is for an unknown spoof or a place off the end', () => {
    expect(moveSpoof(MIXED, 't9', 0)).toBe(MIXED);
    expect(moveSpoof(MIXED, 't1', -1)).toBe(MIXED);
    expect(moveSpoof(MIXED, 't1', 5)).toBe(MIXED);
    expect(moveSpoof(MIXED, 't1', 0)).toBe(MIXED);
  });
});

describe('spoofRenameProblem (#109)', () => {
  const [first, second] = MIXED.spoofs;
  if (!first || !second) throw new Error('no spoofs');

  it('allows a name of 1 to 16 characters no teammate has', () => {
    expect(spoofRenameProblem(MIXED, first.id, 'Hoot')).toBeNull();
    expect(spoofRenameProblem(MIXED, first.id, 'Sixteen letters!')).toBeNull();
  });

  it('allows a spoof to keep its own name, in any case', () => {
    expect(spoofRenameProblem(MIXED, first.id, first.name.toUpperCase())).toBeNull();
  });

  it('refuses an empty or too long name', () => {
    expect(spoofRenameProblem(MIXED, first.id, '   ')).toBe('empty');
    expect(spoofRenameProblem(MIXED, first.id, 'Seventeen letters')).toBe('long');
  });

  it('refuses a teammate’s name, ignoring case', () => {
    expect(spoofRenameProblem(MIXED, first.id, ` ${second.name.toLowerCase()} `)).toBe('taken');
  });
});

describe('renameSpoof (#109)', () => {
  it('renames the spoof, trimmed, keeping everything else', () => {
    const [first] = MIXED.spoofs;
    if (!first) throw new Error('no spoof');

    const renamed = renameSpoof(MIXED, first.id, '  Hoot  ');

    expect(renamed.spoofs[0]).toEqual({ ...first, name: 'Hoot' });
    expect(renamed.spoofs.slice(1)).toEqual(MIXED.spoofs.slice(1));
    expect(teamProblems(renamed)).toEqual([]);
  });

  it('leaves the team as it is for a name with a problem or an unknown spoof', () => {
    expect(renameSpoof(MIXED, 't1', '')).toBe(MIXED);
    expect(renameSpoof(MIXED, 't9', 'Hoot')).toBe(MIXED);
  });
});

describe('changeMark (#109)', () => {
  it('gives the spoof a new mark, any of the 16, even a teammate’s', () => {
    const marked = changeMark(MIXED, 't2', 'heart');
    expect(marked.spoofs[1]).toEqual({ ...MIXED.spoofs[1], mark: 'heart' });
    expect(marked.spoofs.filter((_, i) => i !== 1)).toEqual(MIXED.spoofs.filter((_, i) => i !== 1));
    expect(changeMark(marked, 't3', 'heart').spoofs[2]?.mark).toBe('heart');
  });

  it('leaves the team as it is for an unknown spoof or mark', () => {
    expect(changeMark(MIXED, 't9', 'heart')).toBe(MIXED);
    expect(changeMark(MIXED, 't1', 'nonesuch' as 'heart')).toBe(MIXED);
  });
});

describe('canReplace (#110)', () => {
  it('is true with 3 prospects, for any spoof on the team', () => {
    const three = rosterAfterLosses(MIXED, 3);
    expect(MIXED.spoofs.every((s) => canReplace(MIXED, three, s.id))).toBe(true);
  });

  it('is false with fewer than 3', () => {
    expect(canReplace(MIXED, rosterAfterLosses(MIXED, 2), 't1')).toBe(false);
  });

  it('is false for a spoof no prospect may replace, or one not on the team', () => {
    const three = rosterAfterLosses(MIXED, 3);
    const kings = three.prospects.map((p, i) => ({
      ...generateSpoof(p.id, 'king', 520, createRandom(i + 1), ['Nobody Here']),
      name: p.name,
    }));
    const royal: Roster = { ...three, prospects: kings };

    // The team has a queen (t1): a king may replace her, but no other spoof.
    expect(canReplace(MIXED, royal, 't1')).toBe(true);
    expect(canReplace(MIXED, royal, 't4')).toBe(false);
    expect(canReplace(MIXED, three, 't9')).toBe(false);
  });
});
