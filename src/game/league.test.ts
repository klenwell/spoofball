import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { LEAGUE, LEAGUE_SPECS, leagueOpponent, leagueTeam } from './league';
import { isTeamLogo } from './logos';
import { EMBERS, SPOOFS } from './preset-teams';
import { skillNames } from './skills';
import { FACE_TYPES, ROYAL_TYPES, teamProblems } from './teams';

describe('LEAGUE', () => {
  it("is the owner's 7 teams, weakest (Monday's) first", () => {
    expect(LEAGUE.map((t) => t.name)).toEqual([
      'Sacramento Pawns',
      'Frisco Bros',
      'Middling Talents',
      'Ohio Streamers',
      'Texas Muskrats',
      'Drag Queens',
      'Yosemite Goats',
    ]);
    expect(LEAGUE_SPECS.map((s) => s.day)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });

  it('gives every team a valid roster: 5 named spoofs with sound hidden traits', () => {
    for (const team of LEAGUE) expect(teamProblems(team), team.name).toEqual([]);
  });

  it('gives each team its own color, and a logo from the curated set', () => {
    expect(new Set(LEAGUE.map((t) => t.color)).size).toBe(LEAGUE.length);
    for (const team of LEAGUE) expect(isTeamLogo(team.logo), team.name).toBe(true);
  });

  it('keeps to the draft limits: at most 1 royal, and 2 of each face type', () => {
    for (const team of LEAGUE) {
      const types = team.spoofs.map((s) => s.type);
      expect(types.filter((t) => ROYAL_TYPES.includes(t)).length, team.name).toBeLessThanOrEqual(1);
      for (const face of FACE_TYPES) {
        expect(types.filter((t) => t === face).length, team.name).toBeLessThanOrEqual(2);
      }
    }
  });

  it('is the same every time: it comes from fixed seeds', () => {
    LEAGUE_SPECS.forEach((spec, i) => {
      expect(leagueTeam(spec, i)).toEqual(LEAGUE[i]);
    });
  });

  it("gives spoof ids no other team uses, so a match never mixes up two teams' spoofs", () => {
    const ids = [...LEAGUE, SPOOFS, EMBERS].flatMap((t) => t.spoofs.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    // A drafted team's spoofs are the pool's p1 to p10.
    expect(ids.some((id) => /^p\d+$/.test(id))).toBe(false);
  });

  it('raises the level every day of the week (the owner, on #86)', () => {
    const levels = LEAGUE_SPECS.map((s) => s.level);
    levels.slice(1).forEach((level, i) => {
      expect(level).toBeGreaterThan(levels[i] ?? Infinity);
    });
  });

  it("sets Sunday's team far above Monday's in hidden skills", () => {
    const perSkill = (i: number) => {
      const team = LEAGUE[i];
      if (!team) throw new Error('no team');
      const total = team.spoofs.reduce(
        (sum, s) => sum + skillNames.reduce((a, n) => a + s.skills[n], 0),
        0,
      );
      return total / team.spoofs.length / skillNames.length;
    };
    expect(perSkill(6)).toBeGreaterThan(perSkill(0) + 10);
  });
});

describe('leagueOpponent', () => {
  it('draws the same team from the same seed, so a match replays', () => {
    expect(leagueOpponent(TEST_SEED)).toBe(leagueOpponent(TEST_SEED));
  });

  it('draws every team, about equally often', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 1400; seed += 1) {
      const name = leagueOpponent(seed).name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    expect(counts.size).toBe(LEAGUE.length);
    // 200 each on average: allow plenty of room for chance.
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(150);
      expect(count).toBeLessThan(250);
    }
  });

  it('never draws the Embers or the Spoofs', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      expect([EMBERS, SPOOFS]).not.toContain(leagueOpponent(seed));
    }
  });
});
