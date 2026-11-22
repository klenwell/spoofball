import { describe, expect, it } from 'vitest';
import { benchSeats } from '../game/arena';
import { MOSH_RADIUS, COURT_RADIUS } from '../game/court';
import { placeSpoof, startMise, whoseTurn, type MiseOrder } from '../game/mise';
import { PRESET_HOME } from '../game/preset-teams';
import {
  GRACE_SECONDS,
  TAP_SLOP,
  aim,
  cancel,
  drag,
  graceProgress,
  press,
  release,
  startHand,
  tick,
  type Hand,
} from './mise-hand';

const TEAM = PRESET_HOME.team.spoofs;
const ORDER: MiseOrder = ['home', 'visitor', 'home', 'visitor', 'visitor', 'home'];
const seat = (k: number) => {
  const s = benchSeats('home')[k];
  if (!s) throw new Error('no seat');
  return { x: s.x, y: s.y };
};
/** The middle of the apron, at an angle in degrees. */
const apron = (degrees: number) => {
  const r = MOSH_RADIUS + (COURT_RADIUS - MOSH_RADIUS) / 2;
  const a = (degrees * Math.PI) / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
};
const CENTER = { x: 0, y: 0 };

/** Drags from one point to another and lets go, at a time in seconds. */
function dragTo(
  hand: Hand,
  from: { x: number; y: number },
  to: { x: number; y: number },
  now = 0,
): Hand {
  return release(drag(press(hand, 'home', TEAM, from), to), 'home', to, now);
}
/** A tap: press and release at the same point. */
function tap(hand: Hand, at: { x: number; y: number }, now = 0): Hand {
  return release(press(hand, 'home', TEAM, at), 'home', at, now);
}
const fresh = () => startHand(startMise(ORDER));

describe('dragging a spoof from the bench', () => {
  it('puts it down, pending, where it lands; the mise has no placement yet', () => {
    const hand = dragTo(fresh(), seat(0), apron(0));
    expect(hand.pending?.spoof.id).toBe(TEAM[0]?.id);
    expect(hand.pending?.spot.x).toBeCloseTo(apron(0).x);
    expect(hand.mise.placements).toHaveLength(0);
  });

  it('says where it would land while dragging, and whether it would use the spot inside', () => {
    const held = drag(press(fresh(), 'home', TEAM, seat(0)), apron(90));
    expect(aim(held, 'home')).toMatchObject({ kind: 'spot', inside: false });
    expect(aim(drag(held, CENTER), 'home')).toMatchObject({ kind: 'spot', inside: true });
    expect(aim(drag(held, seat(3)), 'home')).toEqual({ kind: 'bench' });
  });

  it('says why a spot is refused while dragging over it', () => {
    let mise = startMise(['home', 'home', 'visitor', 'visitor', 'visitor', 'home']);
    const first = TEAM[0];
    if (!first) throw new Error('no spoof');
    mise = placeSpoof(mise, first, 'home', CENTER);
    const held = drag(press(startHand(mise), 'home', TEAM, seat(1)), { x: 45, y: 0 });
    expect(aim(held, 'home')).toMatchObject({ kind: 'refused', refusal: 'apron-rule' });
  });

  it('sends it back to its seat when dropped on a spot that is not allowed, with the reason', () => {
    const hand = dragTo(fresh(), seat(0), { x: COURT_RADIUS + 40, y: 0 });
    expect(hand.pending).toBeNull();
    expect(hand.held.kind).toBe('empty');
    expect(hand.refusal).toBe('off-court');
  });

  it('sends it back to its seat when dropped on the bench, with no complaint', () => {
    const hand = dragTo(fresh(), seat(0), seat(4));
    expect(hand.pending).toBeNull();
    expect(hand.refusal).toBeNull();
  });

  it('ignores a press when it is not your turn', () => {
    const theirs = startHand(startMise(['visitor', 'home', 'visitor', 'home', 'home', 'visitor']));
    expect(press(theirs, 'home', TEAM, seat(0))).toBe(theirs);
  });

  it("can't pick up a spoof that is already placed", () => {
    const first = TEAM[0];
    if (!first) throw new Error('no spoof');
    const mise = placeSpoof(
      startMise(['home', 'home', 'visitor', 'visitor', 'visitor', 'home']),
      first,
      'home',
      apron(0),
    );
    const hand = startHand(mise);
    expect(press(hand, 'home', TEAM, seat(0))).toBe(hand);
  });
});

describe('the grace period', () => {
  const placed = dragTo(fresh(), seat(0), apron(0), 10);

  it(`locks the spoof in after ${String(GRACE_SECONDS)} s, and the turn passes`, () => {
    expect(GRACE_SECONDS).toBe(1.5);
    expect(tick(placed, 'home', 10 + GRACE_SECONDS * 0.99).pending).not.toBeNull();
    const locked = tick(placed, 'home', 10 + GRACE_SECONDS);
    expect(locked.pending).toBeNull();
    expect(locked.mise.placements.map((p) => p.spoofId)).toEqual([TEAM[0]?.id]);
    expect(whoseTurn(locked.mise)).toBe('visitor');
  });

  it('shows how far through it is', () => {
    expect(graceProgress(placed, 10)).toBe(0);
    expect(graceProgress(placed, 10 + GRACE_SECONDS / 2)).toBeCloseTo(0.5);
    expect(graceProgress(placed, 10 + GRACE_SECONDS * 3)).toBe(1);
    expect(graceProgress(fresh(), 10)).toBe(0);
  });

  it('never locks a spoof while it is being dragged', () => {
    const holding = drag(press(placed, 'home', TEAM, apron(0)), apron(30));
    expect(tick(holding, 'home', 99).pending).not.toBeNull();
  });

  it('lets you grab it anywhere on the disc, not just its center', () => {
    const r = TEAM[0]?.radius ?? 10;
    const edge = { x: apron(0).x, y: apron(0).y + r - 1 };
    expect(press(placed, 'home', TEAM, edge).held).toMatchObject({
      kind: 'dragging',
      from: 'pending',
    });
    expect(press(placed, 'home', TEAM, { x: apron(0).x, y: apron(0).y + r + 1 }).held.kind).toBe(
      'empty',
    );
  });

  it('lets you drag it somewhere else, starting the grace period again', () => {
    const moved = dragTo(placed, apron(0), apron(180), 11);
    expect(moved.pending?.spot.x).toBeCloseTo(apron(180).x);
    expect(moved.pending?.since).toBe(11);
  });

  it("doesn't let a pending spoof block its own new spot", () => {
    const nudged = dragTo(placed, apron(0), { x: apron(0).x, y: apron(0).y + 6 }, 11);
    expect(nudged.pending?.spot.y).toBeCloseTo(apron(0).y + 6);
  });

  it('lets you drag it back onto your bench', () => {
    const back = dragTo(placed, apron(0), seat(2), 11);
    expect(back.pending).toBeNull();
    expect(back.mise.placements).toHaveLength(0);
  });

  it('sends it back to the bench if moved to a spot that is not allowed', () => {
    const back = dragTo(placed, apron(0), { x: COURT_RADIUS + 40, y: 0 }, 11);
    expect(back.pending).toBeNull();
    expect(back.refusal).toBe('off-court');
  });

  it('swaps in another bench spoof dragged onto the court, sending the pending one back', () => {
    const swapped = dragTo(placed, seat(1), apron(90), 11);
    expect(swapped.pending?.spoof.id).toBe(TEAM[1]?.id);
  });
});

describe('tapping instead of dragging', () => {
  it('picks a spoof with a tap, then places it with a tap on the court', () => {
    const picked = tap(fresh(), seat(1));
    expect(picked.held).toMatchObject({ kind: 'picked', spoof: { id: TEAM[1]?.id } });
    const placed = tap(picked, apron(45), 3);
    expect(placed.pending).toMatchObject({ spoof: { id: TEAM[1]?.id }, since: 3 });
  });

  it('puts a picked spoof back with a second tap on it', () => {
    expect(tap(tap(fresh(), seat(1)), seat(1)).held.kind).toBe('empty');
  });

  it('switches to another spoof tapped on the bench', () => {
    expect(tap(tap(fresh(), seat(1)), seat(2)).held).toMatchObject({
      kind: 'picked',
      spoof: { id: TEAM[2]?.id },
    });
  });

  it('keeps the pick, and gives the reason, when a court tap is refused', () => {
    const refused = tap(tap(fresh(), seat(1)), { x: COURT_RADIUS + 40, y: 0 });
    expect(refused.held.kind).toBe('picked');
    expect(refused.refusal).toBe('off-court');
  });

  it('counts a press that moves no more than 4 units as a tap, and further as a drag', () => {
    expect(TAP_SLOP).toBe(4);
    const nudge = (by: number) =>
      release(
        drag(press(fresh(), 'home', TEAM, seat(1)), { x: seat(1).x + by, y: seat(1).y }),
        'home',
        seat(1),
        0,
      );
    expect(nudge(4).held.kind).toBe('picked');
    // A drag that ends back on the bench puts the spoof back: nothing picked.
    expect(nudge(5).held.kind).toBe('empty');
  });

  it('sends the pending spoof back when another is picked by a tap', () => {
    const placed = dragTo(fresh(), seat(0), apron(0));
    const repicked = tap(placed, seat(2));
    expect(repicked.pending).toBeNull();
    expect(repicked.held).toMatchObject({ kind: 'picked', spoof: { id: TEAM[2]?.id } });
  });
});

describe('on a touch screen', () => {
  it('holds the spoof above the finger once it moves, and places it there', () => {
    const lift = 20;
    const held = drag(press(fresh(), 'home', TEAM, seat(0), lift), {
      x: apron(0).x,
      y: apron(0).y + lift,
    });
    const landing = aim(held, 'home');
    if (landing?.kind !== 'spot') throw new Error('no spot');
    expect(landing.spot.y).toBeCloseTo(apron(0).y);
    const placed = release(held, 'home', { x: apron(0).x, y: apron(0).y + lift }, 0);
    expect(placed.pending?.spot.y).toBeCloseTo(apron(0).y);
  });

  it("doesn't lift a spoof before it moves: pressed on the bench, it still aims at the bench", () => {
    expect(aim(press(fresh(), 'home', TEAM, seat(2), 60), 'home')).toEqual({ kind: 'bench' });
  });

  it("doesn't lift a spoof that hasn't moved, so a tap still picks it", () => {
    expect(tap(fresh(), seat(1)).held.kind).toBe('picked');
    const picked = release(press(fresh(), 'home', TEAM, seat(1), 20), 'home', seat(1), 0);
    expect(picked.held.kind).toBe('picked');
  });
});

describe('cancel', () => {
  it('puts back a spoof being dragged from the bench', () => {
    const held = drag(press(fresh(), 'home', TEAM, seat(0)), apron(0));
    const back = cancel(held);
    expect(back.held.kind).toBe('empty');
    expect(back.pending).toBeNull();
  });

  it('leaves a pending spoof where it was', () => {
    const placed = dragTo(fresh(), seat(0), apron(0), 5);
    const back = cancel(drag(press(placed, 'home', TEAM, apron(0)), apron(90)));
    expect(back.pending?.spot.x).toBeCloseTo(apron(0).x);
    expect(back.held.kind).toBe('empty');
  });

  it('keeps a tap pick', () => {
    const picked = tap(fresh(), seat(1));
    expect(cancel(picked)).toBe(picked);
  });
});
