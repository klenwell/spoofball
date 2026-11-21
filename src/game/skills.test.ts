import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { createRandom } from './random';
import {
  MAX_SKILL,
  MIN_SKILL,
  baseSkills,
  compNames,
  comps,
  drawSpoofType,
  generateSkills,
  minimumTotal,
  sizeToRadius,
  skillNames,
  skillTotal,
  typeProfiles,
  type SkillName,
  type Skills,
} from './skills';
import { MAX_SPOOF_RADIUS, MIN_SPOOF_RADIUS, spoofTypes } from './spoof-types';

function uniformSkills(value: number): Skills {
  return Object.fromEntries(skillNames.map((name) => [name, value])) as Skills;
}

describe('skillNames and compNames', () => {
  it("lists the prototype's 11 skills and 5 comps", () => {
    expect(skillNames).toHaveLength(11);
    expect(compNames).toEqual(['force', 'zip', 'smarts', 'mesh', 'will']);
  });
});

describe('comps', () => {
  it('averages the skills behind each comp with their weights', () => {
    const skills = { ...uniformSkills(50), mass: 90, burst: 30, charisma: 20, impact: 80 };
    // force = (mass × 1 + burst × 0.5) / 1.5 = (90 + 15) / 1.5 = 70
    expect(comps(skills).force).toBe(70);
    // will = (charisma + impact) / 2 = 50
    expect(comps(skills).will).toBe(50);
  });

  it('gives every comp the same value when every skill is the same', () => {
    expect(Object.values(comps(uniformSkills(42)))).toEqual([42, 42, 42, 42, 42]);
  });
});

describe('sizeToRadius', () => {
  it('maps size 1 to about the smallest radius and 99 to the largest', () => {
    expect(sizeToRadius(1)).toBe(MIN_SPOOF_RADIUS);
    expect(sizeToRadius(MAX_SKILL)).toBe(MAX_SPOOF_RADIUS);
  });

  it('grows with size and stays within the radius limits', () => {
    let previous = 0;
    for (let size = MIN_SKILL; size <= MAX_SKILL; size += 1) {
      const radius = sizeToRadius(size);
      expect(radius).toBeGreaterThanOrEqual(previous);
      expect(radius).toBeGreaterThanOrEqual(MIN_SPOOF_RADIUS);
      expect(radius).toBeLessThanOrEqual(MAX_SPOOF_RADIUS);
      previous = radius;
    }
  });
});

describe('typeProfiles', () => {
  it('has a profile for every spoof type, with a weight from 1 to 5 for each skill', () => {
    expect(Object.keys(typeProfiles).sort()).toEqual([...spoofTypes].sort());
    for (const type of spoofTypes) {
      const { weights } = typeProfiles[type];
      expect(weights, type).toHaveLength(skillNames.length);
      for (const w of weights) {
        expect(w).toBeGreaterThanOrEqual(1);
        expect(w).toBeLessThanOrEqual(5);
      }
    }
  });

  it("keeps the prototype's caps: 792 for royals, 748 for faces, 704 for pawns", () => {
    expect(typeProfiles.king.maxTotal).toBe(792);
    expect(typeProfiles.queen.maxTotal).toBe(792);
    for (const face of ['rook', 'bishop', 'knight'] as const) {
      expect(typeProfiles[face].maxTotal).toBe(748);
    }
    for (const pawn of ['pawn-basic', 'pawn-noble', 'pawn-angry'] as const) {
      expect(typeProfiles[pawn].maxTotal).toBe(704);
    }
  });

  it('gives draft odds that add up to 100, with pawns at 65', () => {
    const odds = spoofTypes.map((t) => typeProfiles[t].draftOdds);
    expect(odds.reduce((a, b) => a + b, 0)).toBe(100);
    const pawns = spoofTypes.filter((t) => t.startsWith('pawn'));
    expect(pawns.reduce((sum, t) => sum + typeProfiles[t].draftOdds, 0)).toBe(65);
  });
});

describe('baseSkills', () => {
  it('starts each skill at 20 points per weight step above 1', () => {
    // A rook's weights: size 3, mass 5, burst 1.
    const base = baseSkills('rook');
    expect(base.size).toBe(40);
    expect(base.mass).toBe(80);
  });

  // The prototype started a weight-1 skill at 0, below the 1–99 range, which
  // its own serializer (`minchr`) refused. Here it starts at 1.
  describe('regression: a weight-1 skill', () => {
    it('starts at 1, not 0', () => {
      expect(baseSkills('rook').burst).toBe(MIN_SKILL);
    });
  });
});

describe('generateSkills', () => {
  const total = 528;

  it('gives the same skills for the same seed', () => {
    expect(generateSkills('rook', total, createRandom(TEST_SEED))).toEqual(
      generateSkills('rook', total, createRandom(TEST_SEED)),
    );
  });

  it('gives different skills for a different seed', () => {
    expect(generateSkills('rook', total, createRandom(TEST_SEED))).not.toEqual(
      generateSkills('rook', total, createRandom(TEST_SEED + 1)),
    );
  });

  it.each(spoofTypes)('adds up to the total and keeps every %s skill from 1 to 99', (type) => {
    for (let seed = 0; seed < 50; seed += 1) {
      const skills = generateSkills(type, total, createRandom(seed));
      expect(skillTotal(skills)).toBe(total);
      for (const name of skillNames) {
        expect(skills[name]).toBeGreaterThanOrEqual(MIN_SKILL);
        expect(skills[name]).toBeLessThanOrEqual(MAX_SKILL);
      }
    }
  });

  it('never goes below the type base', () => {
    const base = baseSkills('king');
    const skills = generateSkills('king', total, createRandom(TEST_SEED));
    for (const name of skillNames) expect(skills[name]).toBeGreaterThanOrEqual(base[name]);
  });

  describe("when the total is above the type's cap", () => {
    it('stops at the cap', () => {
      expect(skillTotal(generateSkills('pawn-basic', 900, createRandom(TEST_SEED)))).toBe(704);
    });
  });

  // The prototype sized its chunks once, at 10% of the points to add, so a
  // total within 4 points of a type's base gave a chunk of 0 and crashed
  // (`randint` with a minimum above its maximum). Chunks here are at least 1.
  describe("regression: a total just above the type's starting points", () => {
    it.each(spoofTypes)('still generates a %s that adds up to the total', (type) => {
      for (let extra = 1; extra <= 5; extra += 1) {
        const target = minimumTotal(type) + extra;
        expect(
          skillTotal(generateSkills(type, target, createRandom(TEST_SEED))),
          `+${String(extra)}`,
        ).toBe(target);
      }
    });
  });

  describe("when the total is below the type's starting points", () => {
    it('refuses it', () => {
      expect(() => generateSkills('rook', minimumTotal('rook') - 1, createRandom(1))).toThrow(
        RangeError,
      );
    });
  });

  it("follows the type's weighting: its strong skills end up higher than its weak ones", () => {
    // Over many rooks, the weight-5 skills (mass, growth, cooperation, impact)
    // average well above the weight-1 skills (burst, vision).
    const strong: SkillName[] = ['mass', 'growth', 'cooperation', 'impact'];
    const weak: SkillName[] = ['burst', 'vision'];
    const average = (names: SkillName[]) => {
      let sum = 0;
      for (let seed = 0; seed < 200; seed += 1) {
        const skills = generateSkills('rook', total, createRandom(seed));
        for (const name of names) sum += skills[name];
      }
      return sum / (200 * names.length);
    };
    expect(average(strong) - average(weak)).toBeGreaterThan(40);
  });
});

describe('drawSpoofType', () => {
  it('draws pawns about 65% of the time and kings about 2%', () => {
    const random = createRandom(TEST_SEED);
    const draws = 20_000;
    let pawns = 0;
    let kings = 0;
    for (let i = 0; i < draws; i += 1) {
      const type = drawSpoofType(random);
      if (type.startsWith('pawn')) pawns += 1;
      if (type === 'king') kings += 1;
    }
    expect(pawns / draws).toBeCloseTo(0.65, 1);
    expect(kings / draws).toBeCloseTo(0.02, 2);
  });
});
