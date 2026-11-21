import { describe, expect, it } from 'vitest';
import { SEATS_PER_BENCH } from './arena';
import { isOnCourt, zoneAt } from './court';
import { PRESET_HOME, PRESET_VISITOR } from './preset-teams';
import { sizeToRadius, skillTotal, typeProfiles } from './skills';
import { MAX_SPOOF_RADIUS, MIN_SPOOF_RADIUS } from './spoof-types';
import { FACE_TYPES, ROYAL_TYPES, SPOOFS_PER_TEAM, type Lineup } from './teams';

const lineups = [PRESET_HOME, PRESET_VISITOR];

function placed(lineup: Lineup) {
  return lineup.team.spoofs.flatMap((spoof) => {
    const spot = lineup.spots[spoof.id];
    return spot && 'x' in spot ? [{ ...spoof, x: spot.x, y: spot.y }] : [];
  });
}

describe('the preset lineups', () => {
  it('put your team at home and the other team on the visitor bench', () => {
    expect([PRESET_HOME.side, PRESET_VISITOR.side]).toEqual(['home', 'visitor']);
  });

  it('use two different team colors', () => {
    expect(PRESET_HOME.team.color).not.toBe(PRESET_VISITOR.team.color);
  });

  describe.each(lineups.map((l) => [l.team.name, l] as const))('%s', (_name, lineup) => {
    const { spoofs } = lineup.team;

    it(`has ${String(SPOOFS_PER_TEAM)} spoofs with unique ids`, () => {
      expect(spoofs).toHaveLength(SPOOFS_PER_TEAM);
      expect(new Set(spoofs.map((s) => s.id)).size).toBe(SPOOFS_PER_TEAM);
    });

    it('mixes spoof types', () => {
      expect(new Set(spoofs.map((s) => s.type)).size).toBeGreaterThanOrEqual(4);
    });

    it('keeps every base radius within the spoof limits', () => {
      for (const s of spoofs) {
        expect(s.radius, s.id).toBeGreaterThanOrEqual(MIN_SPOOF_RADIUS);
        expect(s.radius, s.id).toBeLessThanOrEqual(MAX_SPOOF_RADIUS);
      }
    });

    it('gives every spoof generated hidden skills within its type cap, and a radius from its size', () => {
      for (const s of spoofs) {
        expect(skillTotal(s.skills), s.id).toBeLessThanOrEqual(typeProfiles[s.type].maxTotal);
        expect(s.radius, s.id).toBe(sizeToRadius(s.skills.size));
      }
    });

    it('follows the roster limits: at most 1 royal and 2 of each face type', () => {
      expect(spoofs.filter((s) => ROYAL_TYPES.includes(s.type)).length).toBeLessThanOrEqual(1);
      for (const face of FACE_TYPES) {
        expect(spoofs.filter((s) => s.type === face).length, face).toBeLessThanOrEqual(2);
      }
    });

    it('gives every spoof exactly one spot, and no others', () => {
      expect(Object.keys(lineup.spots).sort()).toEqual(spoofs.map((s) => s.id).sort());
    });

    it('seats the waiting spoofs on different seats of the bench', () => {
      const seats = Object.values(lineup.spots).flatMap((spot) =>
        'seat' in spot ? [spot.seat] : [],
      );
      expect(new Set(seats).size).toBe(seats.length);
      for (const seat of seats) {
        expect(seat).toBeGreaterThanOrEqual(0);
        expect(seat).toBeLessThan(SEATS_PER_BENCH);
      }
    });

    describe('when a scrum starts', () => {
      const onCourt = placed(lineup);

      it('has 3 spoofs on the court', () => {
        expect(onCourt).toHaveLength(3);
      });

      it('follows the mise rule: at least 2 on the apron', () => {
        expect(onCourt.filter((s) => zoneAt(s.x, s.y) === 'apron').length).toBeGreaterThanOrEqual(
          2,
        );
      });

      it('keeps every placed spoof wholly on the court', () => {
        for (const s of onCourt) {
          expect(isOnCourt(s.x, s.y, s.radius), s.id).toBe(true);
        }
      });
    });
  });

  it('never overlaps two spoofs on the court', () => {
    const all = lineups.flatMap(placed);
    for (const [i, a] of all.entries()) {
      for (const b of all.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} and ${b.id}`).toBeGreaterThan(
          a.radius + b.radius,
        );
      }
    }
  });
});
