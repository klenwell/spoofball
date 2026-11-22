import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import type { BenchSide } from './arena';
import { COURT_RADIUS, MOSH_RADIUS } from './court';
import {
  MISE_TURNS,
  NUDGE_LIMIT,
  allowedOrders,
  checkSpot,
  computerMove,
  drawOrder,
  insideSpotsLeft,
  isMiseOver,
  isOnApron,
  leftToPlace,
  miseEntries,
  placeSpoof,
  spotForTap,
  startMise,
  unplaced,
  whoseTurn,
  type MiseOrder,
  type MiseState,
} from './mise';
import { PRESET_HOME, PRESET_VISITOR } from './preset-teams';
import { createRandom, type Random } from './random';
import type { Spoof } from './teams';

const HOME = PRESET_HOME.team.spoofs;
const VISITOR = PRESET_VISITOR.team.spoofs;
const TEAMS = { home: HOME, visitor: VISITOR };
/** Home first, then alternating: easy to follow in tests. */
const ORDER: MiseOrder = ['home', 'visitor', 'home', 'visitor', 'visitor', 'home'];

function spoof(team: BenchSide, index: number): Spoof {
  const s = TEAMS[team][index];
  if (!s) throw new Error(`no spoof ${String(index)}`);
  return s;
}

/** A spot in the middle of the apron ring, at an angle in degrees. */
function apronSpot(degrees: number) {
  const r = MOSH_RADIUS + (COURT_RADIUS - MOSH_RADIUS) / 2;
  const a = (degrees * Math.PI) / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/** A state with placements made directly, skipping the turn order, for checking spots. */
function withPlacements(...placements: MiseState['placements']): MiseState {
  return { ...startMise(ORDER), placements };
}

const placed = (
  team: BenchSide,
  x: number,
  y: number,
  radius = 15,
  spoofId = `${team}-${String(x)}`,
) => ({
  spoofId,
  team,
  x,
  y,
  radius,
});

describe('allowedOrders', () => {
  for (const host of ['home', 'visitor'] as const) {
    const orders = allowedOrders(host);
    const guest = host === 'home' ? 'visitor' : 'home';

    it(`gives 9 different orders when ${host} hosts`, () => {
      expect(orders).toHaveLength(9);
      expect(new Set(orders.map((o) => o.join())).size).toBe(9);
    });

    it(`gives each team 3 turns, with ${host}, the host, last`, () => {
      for (const order of orders) {
        expect(order).toHaveLength(MISE_TURNS);
        expect(order.filter((t) => t === host)).toHaveLength(3);
        expect(order[5]).toBe(host);
      }
    });

    it('gives the other team turn 4 or 5, and sometimes both', () => {
      for (const order of orders) expect(order[3] === guest || order[4] === guest).toBe(true);
      expect(orders.some((o) => o[3] === guest && o[4] === guest)).toBe(true);
    });

    it("never has a team take its last turn before the other's first", () => {
      for (const order of orders) {
        for (const team of ['home', 'visitor'] as const) {
          const rival = team === 'home' ? 'visitor' : 'home';
          expect(order.lastIndexOf(team)).toBeGreaterThan(order.indexOf(rival));
        }
      }
    });
  }
});

describe('drawOrder', () => {
  it('gives the same order for the same seed', () => {
    expect(drawOrder('home', createRandom(TEST_SEED))).toEqual(
      drawOrder('home', createRandom(TEST_SEED)),
    );
  });

  it('draws every allowed order about equally often', () => {
    const random = createRandom(TEST_SEED);
    const counts = new Map<string, number>();
    for (let i = 0; i < 9000; i += 1) {
      const key = drawOrder('visitor', random).join();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    for (const n of counts.values()) expect(n).toBeGreaterThan(850);
  });
});

describe('a mise in progress', () => {
  it('refuses an order that is not 6 turns', () => {
    expect(() => startMise(['home', 'visitor'])).toThrow(RangeError);
  });

  it('follows the order, then ends after the 6th placement', () => {
    let state = startMise(ORDER);
    const next = { home: 0, visitor: 0 };
    for (let turn = 0; turn < MISE_TURNS; turn += 1) {
      const team = whoseTurn(state);
      expect(team).toBe(ORDER[turn]);
      if (!team) throw new Error('no turn');
      state = placeSpoof(state, spoof(team, next[team]), team, apronSpot(turn * 60));
      next[team] += 1;
    }
    expect(whoseTurn(state)).toBeNull();
    expect(isMiseOver(state)).toBe(true);
  });

  it("counts each team's spoofs left to place", () => {
    const state = placeSpoof(startMise(ORDER), spoof('home', 0), 'home', apronSpot(0));
    expect(leftToPlace(state, 'home')).toBe(2);
    expect(leftToPlace(state, 'visitor')).toBe(3);
  });

  it("lists a team's spoofs still on the bench", () => {
    const state = placeSpoof(startMise(ORDER), spoof('home', 2), 'home', apronSpot(0));
    expect(unplaced(state, 'home', HOME).map((s) => s.id)).toEqual(['c1', 'c2', 'c4', 'c5']);
    expect(unplaced(state, 'visitor', VISITOR)).toHaveLength(5);
  });
});

describe('placeSpoof', () => {
  it('refuses a team placing out of turn', () => {
    expect(() =>
      placeSpoof(startMise(ORDER), spoof('visitor', 0), 'visitor', apronSpot(0)),
    ).toThrow(/turn/);
  });

  it('refuses a spoof placed twice', () => {
    let state = startMise(['home', 'home', 'visitor', 'visitor', 'visitor', 'home']);
    state = placeSpoof(state, spoof('home', 0), 'home', apronSpot(0));
    expect(() => placeSpoof(state, spoof('home', 0), 'home', apronSpot(90))).toThrow(
      /already placed/,
    );
  });

  it('refuses a spot the rules refuse', () => {
    expect(() =>
      placeSpoof(startMise(ORDER), spoof('home', 0), 'home', { x: COURT_RADIUS, y: 0 }),
    ).toThrow(/off-court/);
  });
});

describe('isOnApron', () => {
  it('is true for a disc touching the mosh from outside, or the court edge from inside', () => {
    expect(isOnApron(MOSH_RADIUS + 15, 0, 15, startMise(ORDER).court)).toBe(true);
    expect(isOnApron(COURT_RADIUS - 15, 0, 15, startMise(ORDER).court)).toBe(true);
  });

  it('is false for a disc reaching over the mosh, or past the edge', () => {
    expect(isOnApron(MOSH_RADIUS + 14, 0, 15, startMise(ORDER).court)).toBe(false);
    expect(isOnApron(COURT_RADIUS - 14, 0, 15, startMise(ORDER).court)).toBe(false);
  });
});

describe('checkSpot', () => {
  it('refuses a disc hanging off the court', () => {
    expect(checkSpot(startMise(ORDER), 'home', COURT_RADIUS - 10, 0, 15)).toBe('off-court');
  });

  it('refuses a disc overlapping any placed spoof, teammate or opponent', () => {
    const state = withPlacements(placed('home', 105, 0), placed('visitor', -105, 0));
    expect(checkSpot(state, 'home', 105, 20, 15)).toBe('overlap');
    expect(checkSpot(state, 'home', -105, 20, 15)).toBe('overlap');
  });

  it('allows a disc just touching another', () => {
    expect(checkSpot(withPlacements(placed('home', 105, 0)), 'home', 105, 30, 15)).toBeNull();
  });

  it("allows a team's first spoof anywhere on the court, even the crush", () => {
    expect(checkSpot(startMise(ORDER), 'home', 0, 0, 15)).toBeNull();
  });

  it('refuses a second spoof inside the apron, with the apron rule', () => {
    const state = withPlacements(placed('home', 0, 0));
    expect(checkSpot(state, 'home', 40, 0, 10)).toBe('apron-rule');
    expect(
      checkSpot(state, 'home', ...([apronSpot(90).x, apronSpot(90).y] as const), 15),
    ).toBeNull();
  });

  it("doesn't count the other team's spoof inside the apron against this team", () => {
    expect(checkSpot(withPlacements(placed('visitor', 0, 0)), 'home', 45, 0, 10)).toBeNull();
  });

  it('counts a disc reaching over the mosh as inside, not on the apron', () => {
    const state = withPlacements(placed('home', 0, 0));
    expect(checkSpot(state, 'home', MOSH_RADIUS + 5, 40, 15)).toBe('apron-rule');
  });
});

describe('insideSpotsLeft', () => {
  it("is 1 until a team places a spoof off the apron, then 0; the other team's don't count", () => {
    expect(insideSpotsLeft(startMise(ORDER), 'home')).toBe(1);
    expect(
      insideSpotsLeft(
        withPlacements(placed('home', ...([apronSpot(0).x, apronSpot(0).y] as const))),
        'home',
      ),
    ).toBe(1);
    expect(insideSpotsLeft(withPlacements(placed('home', 0, 0)), 'home')).toBe(0);
    expect(insideSpotsLeft(withPlacements(placed('visitor', 0, 0)), 'home')).toBe(1);
  });
});

describe('spotForTap', () => {
  it('places a spoof right where a valid tap lands', () => {
    expect(spotForTap(startMise(ORDER), 'home', { x: 0, y: 0 }, 15)).toEqual({
      spot: { x: 0, y: 0 },
    });
  });

  it('nudges a tap a little too close to another spoof to the nearest spot that fits', () => {
    const state = withPlacements(placed('visitor', 105, 0));
    const result = spotForTap(state, 'home', { x: 105, y: 27 }, 15);
    if (!('spot' in result)) throw new Error('refused');
    expect(checkSpot(state, 'home', result.spot.x, result.spot.y, 15)).toBeNull();
    // It needs 3 units to clear; the search steps a unit at a time.
    expect(Math.hypot(result.spot.x - 105, result.spot.y - 27)).toBeLessThan(5);
  });

  it('moves a tap as little as it can: 1.5 units into another spoof, by about 2', () => {
    // Diagonal to the other spoof, so a search with few directions, or one
    // that starts further out, has to move it further (#56 review).
    const state = withPlacements(placed('visitor', 0, 0, 15));
    const tap = { x: 28.5 * Math.SQRT1_2, y: 28.5 * Math.SQRT1_2 };

    const result = spotForTap(state, 'home', tap, 15);

    if (!('spot' in result)) throw new Error('refused');
    expect(Math.hypot(result.spot.x - tap.x, result.spot.y - tap.y)).toBeLessThan(2.5);
  });

  it('nudges a tap hanging just off the court back onto it', () => {
    const result = spotForTap(startMise(ORDER), 'home', { x: COURT_RADIUS - 12, y: 0 }, 15);
    if (!('spot' in result)) throw new Error('refused');
    expect(Math.hypot(result.spot.x, result.spot.y) + 15).toBeLessThanOrEqual(COURT_RADIUS + 1e-9);
  });

  it('nudges a tap just over the red line onto the apron, once the spot anywhere is used', () => {
    const state = withPlacements(placed('home', 0, 0));
    const result = spotForTap(state, 'home', { x: MOSH_RADIUS + 10, y: 0 }, 15);
    if (!('spot' in result)) throw new Error('refused');
    expect(isOnApron(result.spot.x, result.spot.y, 15, state.court)).toBe(true);
  });

  it('keeps to the apron when asked: a tap just inside the red line moves out onto it', () => {
    const tap = { x: MOSH_RADIUS + 10, y: 0 };

    const result = spotForTap(startMise(ORDER), 'home', tap, 15, { apronOnly: true });

    if (!('spot' in result)) throw new Error('refused');
    expect(isOnApron(result.spot.x, result.spot.y, 15, startMise(ORDER).court)).toBe(true);
  });

  it('refuses with the apron rule when asked to keep to the apron and no apron spot is near', () => {
    expect(spotForTap(startMise(ORDER), 'home', { x: 0, y: 0 }, 15, { apronOnly: true })).toEqual({
      refusal: 'apron-rule',
    });
  });

  it('refuses a tap too far from any valid spot, giving the reason', () => {
    const state = withPlacements(placed('home', 0, 0));
    expect(spotForTap(state, 'home', { x: 45, y: 0 }, 15)).toEqual({ refusal: 'apron-rule' });
  });

  it(`moves a tap no more than ${String(NUDGE_LIMIT)} units`, () => {
    const state = withPlacements(placed('home', 0, 0));
    // 11 units inside the apron's inner edge (center at the mosh edge + 15 - 11).
    expect(spotForTap(state, 'home', { x: MOSH_RADIUS + 4, y: 0 }, 15)).toEqual({
      refusal: 'apron-rule',
    });
    expect('spot' in spotForTap(state, 'home', { x: MOSH_RADIUS + 5, y: 0 }, 15)).toBe(true);
  });
});

describe('computerMove', () => {
  /** Plays a whole mise with the computer for both teams. */
  function computerMise(seed: number): MiseState {
    const random = createRandom(seed);
    let state = startMise(drawOrder('home', random));
    for (let team = whoseTurn(state); team; team = whoseTurn(state)) {
      const move = computerMove(state, team, TEAMS[team], random);
      state = placeSpoof(state, move.spoof, team, move.spot);
    }
    return state;
  }

  it('gives the same move for the same seed', () => {
    const state = startMise(ORDER);
    expect(computerMove(state, 'home', HOME, createRandom(TEST_SEED))).toEqual(
      computerMove(state, 'home', HOME, createRandom(TEST_SEED)),
    );
  });

  it('picks a spoof still on the bench', () => {
    let state = startMise(['home', 'home', 'visitor', 'visitor', 'visitor', 'home']);
    state = placeSpoof(state, spoof('home', 0), 'home', apronSpot(0));
    for (let seed = 0; seed < 30; seed += 1) {
      expect(computerMove(state, 'home', HOME, createRandom(seed)).spoof.id).not.toBe('c1');
    }
  });

  it('always plays by the rules: every mise of 100 completes, with no overlaps and 2 or more on each apron', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const state = computerMise(seed);
      expect(isMiseOver(state)).toBe(true);
      for (const team of ['home', 'visitor'] as const) {
        const mine = state.placements.filter((p) => p.team === team);
        expect(
          mine.filter((p) => isOnApron(p.x, p.y, p.radius, state.court)).length,
        ).toBeGreaterThanOrEqual(2);
      }
      state.placements.forEach((a, i) => {
        for (const b of state.placements.slice(i + 1)) {
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius);
        }
        expect(Math.hypot(a.x, a.y) + a.radius).toBeLessThanOrEqual(COURT_RADIUS + 1e-9);
      });
    }
  });

  it('usually places one spoof inside the red line, and never more than one', () => {
    let inside = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      const state = computerMise(seed);
      const mine = state.placements.filter((p) => p.team === 'visitor');
      const count = mine.filter((p) => !isOnApron(p.x, p.y, p.radius, state.court)).length;
      expect(count).toBeLessThanOrEqual(1);
      inside += count;
    }
    // Any valid spot is equally likely, and the inside is far bigger than the
    // ring of apron a whole spoof fits in, so its first spoof usually goes inside.
    expect(inside).toBeGreaterThan(80);
  });

  it('spreads its spots evenly over the court, not crowded at the center', () => {
    // On an empty court every spot is valid, so the first try is taken. With
    // spots even over the area, a quarter land within half the reach.
    let near = 0;
    const tries = 2000;
    for (let seed = 0; seed < tries; seed += 1) {
      const move = computerMove(startMise(ORDER), 'home', HOME, createRandom(seed));
      const reach = COURT_RADIUS - move.spoof.radius;
      if (Math.hypot(move.spot.x, move.spot.y) < reach / 2) near += 1;
    }
    expect(near / tries).toBeGreaterThan(0.2);
    expect(near / tries).toBeLessThan(0.3);
  });

  it('finds a spot around the apron when random spots keep failing', () => {
    // A random source stuck at its lowest values aims every try at the center.
    const stuck: Random = {
      next: () => 0,
      uniform: (min) => min,
      int: (min) => min,
      chance: () => false,
      pick: (items) => {
        const first = items[0];
        if (first === undefined) throw new Error('empty');
        return first;
      },
      weighted: (choices) => {
        const first = choices[0];
        if (!first) throw new Error('empty');
        return first[0];
      },
    };
    const state = withPlacements(placed('home', 0, 0, 20));
    const move = computerMove(state, 'home', HOME, stuck);
    expect(checkSpot(state, 'home', move.spot.x, move.spot.y, move.spoof.radius)).toBeNull();
    expect(isOnApron(move.spot.x, move.spot.y, move.spoof.radius, state.court)).toBe(true);
  });
});

describe('miseEntries', () => {
  it('refuses a mise that is not over', () => {
    expect(() => miseEntries(startMise(ORDER), TEAMS)).toThrow(/not over/);
  });

  it('lines up the 6 placed spoofs for the scrum, fresh, where they were placed', () => {
    let state = startMise(ORDER);
    const next = { home: 0, visitor: 0 };
    for (let turn = 0; turn < MISE_TURNS; turn += 1) {
      const team = whoseTurn(state);
      if (!team) throw new Error('no turn');
      state = placeSpoof(state, spoof(team, next[team]), team, apronSpot(turn * 60));
      next[team] += 1;
    }
    const entries = miseEntries(state, TEAMS);
    expect(entries.map((e) => [e.spoof.id, e.team])).toEqual([
      ['c1', 'home'],
      ['e1', 'visitor'],
      ['c2', 'home'],
      ['e2', 'visitor'],
      ['e3', 'visitor'],
      ['c3', 'home'],
    ]);
    expect(entries[1]?.position.x).toBeCloseTo(apronSpot(60).x);
    expect(entries.every((e) => e.fatigue === 0)).toBe(true);
  });
});
