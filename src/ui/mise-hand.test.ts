import { describe, expect, it } from 'vitest';
import { benchSeats } from '../game/arena';
import { MOSH_RADIUS, COURT_RADIUS } from '../game/court';
import { isOnApron, placeSpoof, startMise, whoseTurn, type MiseOrder } from '../game/mise';
import { PRESET_HOME, PRESET_VISITOR } from '../game/preset-teams';
import {
  GRACE_SECONDS,
  RED_LINE_PULL,
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
const VISITOR = PRESET_VISITOR.team.spoofs;
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

describe('Hand', () => {
  describe('when a spoof is dragged from the bench', () => {
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
      const held = drag(press(fresh(), 'home', TEAM, seat(1)), { x: COURT_RADIUS + 40, y: 0 });
      expect(aim(held, 'home')).toMatchObject({ kind: 'refused', refusal: 'off-court' });
    });

    it('lands where you let go, even if the last move was reported somewhere else', () => {
      const held = drag(press(fresh(), 'home', TEAM, seat(0)), apron(0));
      expect(release(held, 'home', apron(60), 0).pending?.spot.x).toBeCloseTo(apron(60).x);
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
      const theirs = startHand(
        startMise(['visitor', 'home', 'visitor', 'home', 'home', 'visitor']),
      );
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

  describe('when a spoof is placed but not yet locked in', () => {
    const placed = dragTo(fresh(), seat(0), apron(0), 10);

    it(`locks the spoof in after ${String(GRACE_SECONDS)} s, and the turn passes`, () => {
      expect(GRACE_SECONDS).toBe(1);
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

  describe('when a spoof is tapped instead of dragged', () => {
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

    it('ignores a tap on an empty seat of your bench while a spoof is picked', () => {
      const first = TEAM[0];
      if (!first) throw new Error('no spoof');
      const mise = placeSpoof(
        startMise(['home', 'home', 'visitor', 'visitor', 'visitor', 'home']),
        first,
        'home',
        apron(0),
      );
      const picked = tap(startHand(mise), seat(1));

      const after = tap(picked, seat(0));

      expect(after.held.kind).toBe('picked');
      expect(after.refusal).toBeNull();
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

  describe('when dragging on a touch screen', () => {
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

  describe('when a press is cancelled', () => {
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

  describe('when a spoof is dragged toward the red line', () => {
    const spoof = TEAM[0];
    if (!spoof) throw new Error('no spoof');
    /** Where a spoof's center is when it just touches the red line from the apron. */
    const edge = MOSH_RADIUS + spoof.radius;
    const east = (d: number) => ({ x: d, y: 0 });
    const dragged = (...points: { x: number; y: number }[]) =>
      points.reduce((hand, at) => drag(hand, at), press(fresh(), 'home', TEAM, seat(0)));

    it(`holds a spoof from the apron on the apron until it's pushed ${String(RED_LINE_PULL)} units past the line, even with the spot inside unused`, () => {
      expect(RED_LINE_PULL).toBe(24);
      const held = aim(dragged(apron(0), east(edge - RED_LINE_PULL + 1)), 'home');
      expect(held).toMatchObject({ kind: 'spot', inside: false, resisted: true });
      if (held?.kind !== 'spot') throw new Error('no spot');
      expect(Math.hypot(held.spot.x, held.spot.y)).toBeCloseTo(edge);
    });

    it("doesn't let the nudge carry a held-back spoof across the line (#56 review)", () => {
      // Your smallest spoof, held at the line just inside east, and a small
      // Embers spoof against the court's edge just north of east, overlapping
      // it by 1.5 units. Their spoof is further out, so the nearest way clear
      // is inward, across the line: the nudge must find an apron spot instead.
      const mine = TEAM[2];
      const theirs = VISITOR[1];
      if (!mine || !theirs) throw new Error('no spoofs');
      const line = MOSH_RADIUS + mine.radius;
      const out = COURT_RADIUS - theirs.radius;
      const apart = mine.radius + theirs.radius - 1.5;
      const a = -Math.acos((line * line + out * out - apart * apart) / (2 * line * out));
      const mise = placeSpoof(
        startMise(['visitor', 'home', 'home', 'visitor', 'visitor', 'home']),
        theirs,
        'visitor',
        { x: out * Math.cos(a), y: out * Math.sin(a) },
      );
      const at = { x: line - 10, y: 0 };

      const held = drag(drag(press(startHand(mise), 'home', TEAM, seat(2)), apron(0)), at);

      expect(aim(held, 'home')).toMatchObject({ kind: 'spot', inside: false, resisted: true });
      const pending = release(held, 'home', at, 0).pending;
      expect(pending && isOnApron(pending.spot.x, pending.spot.y, mine.radius, mise.court)).toBe(
        true,
      );
    });

    it('lets it cross once pushed past the pull', () => {
      expect(aim(dragged(apron(0), east(edge - RED_LINE_PULL)), 'home')).toMatchObject({
        kind: 'spot',
        inside: true,
        resisted: false,
      });
    });

    it('lets a spoof that has crossed move freely inside, right up to the line', () => {
      const back = aim(dragged(apron(0), east(40), east(edge - 2)), 'home');
      expect(back).toMatchObject({ kind: 'spot', inside: true, resisted: false });
    });

    it('holds it back again once it has been dragged back out onto the apron', () => {
      const again = aim(dragged(apron(0), east(40), east(edge + 5), east(edge - 2)), 'home');
      expect(again).toMatchObject({ kind: 'spot', inside: false, resisted: true });
    });

    it('holds it right against the line at every angle, never a nudge away', () => {
      // Rounding at some angles would otherwise put it a hair inside the line,
      // and the apron-only nudge would push it a whole unit out.
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const a = (degrees * Math.PI) / 180;
        const toward = { x: (edge - 5) * Math.cos(a), y: (edge - 5) * Math.sin(a) };
        const from = { x: 110 * Math.cos(a), y: 110 * Math.sin(a) };

        const landing = aim(
          drag(drag(press(fresh(), 'home', TEAM, seat(0)), from), toward),
          'home',
        );

        if (landing?.kind !== 'spot') continue; // a seat may be in the way of the drag
        expect(Math.hypot(landing.spot.x, landing.spot.y), `${String(degrees)}°`).toBeCloseTo(
          edge,
          6,
        );
      }
    });

    it('places it against the line when let go there', () => {
      const at = east(edge - 5);
      const placed = release(dragged(apron(0), at), 'home', at, 0);
      expect(placed.pending?.spot.x).toBeCloseTo(edge);
    });

    it('lets a pending spoof already inside the line move freely there', () => {
      const inside = dragTo(fresh(), seat(0), east(30), 0);
      const moved = drag(
        drag(press(inside, 'home', TEAM, east(30)), east(edge - 3)),
        east(edge - 2),
      );
      expect(aim(moved, 'home')).toMatchObject({ kind: 'spot', inside: true, resisted: false });
    });

    it("doesn't hold back a tap: it goes where you aim", () => {
      const placed = tap(tap(fresh(), seat(0)), east(edge - 5));
      expect(placed.pending?.spot.x).toBeCloseTo(edge - 5);
    });
  });

  describe('when your one spot inside the red line is used', () => {
    const first = TEAM[0];
    const second = TEAM[1];
    if (!first || !second) throw new Error('no spoofs');
    const used = startHand(
      placeSpoof(
        startMise(['home', 'home', 'visitor', 'visitor', 'visitor', 'home']),
        first,
        'home',
        CENTER,
      ),
    );
    const edge = MOSH_RADIUS + second.radius;
    const east = (d: number) => ({ x: d, y: 0 });

    it('stops a dragged spoof at the line, however far it is pushed', () => {
      const pushed = drag(
        drag(press(used, 'home', TEAM, seat(1)), apron(0)),
        east(edge - RED_LINE_PULL - 20),
      );
      const landing = aim(pushed, 'home');
      expect(landing).toMatchObject({ kind: 'spot', inside: false, resisted: true });
      if (landing?.kind !== 'spot') throw new Error('no spot');
      expect(Math.hypot(landing.spot.x, landing.spot.y)).toBeCloseTo(edge);
    });

    it('places it against the line when let go there', () => {
      const at = east(45);
      const placed = release(
        drag(drag(press(used, 'home', TEAM, seat(1)), apron(0)), at),
        'home',
        at,
        0,
      );
      expect(placed.pending?.spot.x).toBeCloseTo(edge);
    });

    it('stops even a spoof dragged straight to the center, on its line from the center', () => {
      const at = { x: 0, y: 20 };
      const landing = aim(drag(press(used, 'home', TEAM, seat(1)), at), 'home');
      if (landing?.kind !== 'spot') throw new Error('no spot');
      expect(landing.spot.x).toBeCloseTo(0);
      expect(landing.spot.y).toBeCloseTo(edge);
    });

    it('stops a placed spoof picked up again at the line too', () => {
      const placed = dragTo(used, seat(1), apron(0), 0);

      const moved = drag(press(placed, 'home', TEAM, apron(0)), east(40));

      expect(aim(moved, 'home')).toMatchObject({ kind: 'spot', inside: false, resisted: true });
    });

    it('holds a spoof dragged to the exact center against the line too', () => {
      const landing = aim(drag(press(used, 'home', TEAM, seat(1)), CENTER), 'home');
      expect(landing).toMatchObject({ kind: 'spot', inside: false });
    });

    it('still refuses a tap well inside the line, with the reason', () => {
      expect(tap(tap(used, seat(1)), east(45)).refusal).toBe('apron-rule');
    });
  });

  describe('when a spoof is dragged over another spoof (#61)', () => {
    const mine = TEAM[0];
    const theirs = VISITOR[0];
    if (!mine || !theirs) throw new Error('no spoofs');
    const touching = mine.radius + theirs.radius;
    const order: MiseOrder = ['visitor', 'home', 'home', 'visitor', 'visitor', 'home'];
    /** The Embers' spoof placed in the crush, then your turn. */
    const inCrush = startHand(placeSpoof(startMise(order), theirs, 'visitor', CENTER));
    /** Drags your first spoof in from the bench, across the red line, then on through the points. */
    const dragThrough = (hand: Hand, ...points: { x: number; y: number }[]) =>
      points.reduce(
        (h, at) => drag(h, at),
        drag(drag(press(hand, 'home', TEAM, seat(0)), apron(90)), { x: 0, y: 60 }),
      );

    it('stops it against the other spoof, just touching, instead of over it', () => {
      const landing = aim(dragThrough(inCrush, { x: 5, y: 30 }), 'home');

      expect(landing).toMatchObject({ kind: 'spot', blocked: true });
      if (landing?.kind !== 'spot') throw new Error('no spot');
      expect(Math.hypot(landing.spot.x, landing.spot.y)).toBeCloseTo(touching, 6);
    });

    it('slides it around the other spoof as you keep dragging', () => {
      const spots = [
        { x: 30, y: 5 },
        { x: 5, y: 30 },
        { x: -30, y: 5 },
      ].map((at) => {
        const landing = aim(dragThrough(inCrush, at), 'home');
        if (landing?.kind !== 'spot') throw new Error('no spot');
        return landing.spot;
      });

      for (const spot of spots) expect(Math.hypot(spot.x, spot.y)).toBeCloseTo(touching, 6);
      expect(new Set(spots.map((s) => Math.round(Math.atan2(s.y, s.x) * 10))).size).toBe(3);
    });

    it('places it where it stopped when let go', () => {
      const at = { x: 5, y: 30 };
      const placed = release(dragThrough(inCrush, at), 'home', at, 0);

      expect(placed.pending).not.toBeNull();
      const spot = placed.pending?.spot ?? CENTER;
      expect(Math.hypot(spot.x, spot.y)).toBeCloseTo(touching, 6);
    });

    it('stops it against your own placed spoofs too', () => {
      // Yours on the apron (not inside, which would use your spot inside the red line).
      const other = TEAM[1];
      if (!other) throw new Error('no spoof');
      const yours = startHand(
        placeSpoof(
          startMise(['home', 'home', 'visitor', 'visitor', 'visitor', 'home']),
          other,
          'home',
          apron(0),
        ),
      );

      const held = drag(drag(press(yours, 'home', TEAM, seat(0)), apron(90)), apron(8));
      const landing = aim(held, 'home');

      if (landing?.kind !== 'spot') throw new Error('no spot');
      expect(landing.blocked).toBe(true);
      const o = apron(0);
      expect(Math.hypot(landing.spot.x - o.x, landing.spot.y - o.y)).toBeGreaterThanOrEqual(
        mine.radius + other.radius,
      );
    });

    it("isn't blocked when nothing is in the way", () => {
      expect(aim(dragThrough(inCrush, { x: 0, y: 70 }), 'home')).toMatchObject({
        kind: 'spot',
        blocked: false,
      });
    });

    it("doesn't let another spoof push it across the red line before it has crossed", () => {
      // A small Embers spoof against the court's edge, just outward of where
      // yours is dragged along the apron: pushed straight out of it, yours
      // would go inside.
      const small = TEAM[2];
      const blocker = VISITOR[1];
      if (!small || !blocker) throw new Error('no spoofs');
      const out = COURT_RADIUS - blocker.radius;
      const hand = startHand(placeSpoof(startMise(order), blocker, 'visitor', { x: out, y: 0 }));
      const line = MOSH_RADIUS + small.radius;

      const held = drag(drag(press(hand, 'home', TEAM, seat(2)), apron(90)), { x: line + 2, y: 3 });
      const landing = aim(held, 'home');

      expect(landing).not.toMatchObject({ kind: 'spot', inside: true });
      if (landing?.kind === 'spot') {
        expect(Math.hypot(landing.spot.x - out, landing.spot.y)).toBeGreaterThanOrEqual(
          small.radius + blocker.radius,
        );
      }
    });

    it('never shows it over another spoof, wherever it is dragged', () => {
      const second = VISITOR[1];
      if (!second) throw new Error('no spoof');
      const busy = startHand(
        placeSpoof(
          placeSpoof(
            startMise(['visitor', 'visitor', 'home', 'visitor', 'home', 'home']),
            theirs,
            'visitor',
            CENTER,
          ),
          second,
          'visitor',
          apron(30),
        ),
      );
      let spots = 0;
      for (let x = -120; x <= 120; x += 8) {
        for (let y = -120; y <= 120; y += 8) {
          const landing = aim(dragThrough(busy, { x, y }), 'home');
          if (landing?.kind !== 'spot') continue;
          spots += 1;
          for (const p of busy.mise.placements) {
            expect(Math.hypot(landing.spot.x - p.x, landing.spot.y - p.y)).toBeGreaterThanOrEqual(
              p.radius + mine.radius,
            );
          }
        }
      }
      expect(spots).toBeGreaterThan(100);
    });

    it('still refuses a tap on another spoof, with the reason', () => {
      expect(tap(tap(inCrush, seat(0)), CENTER).refusal).toBe('overlap');
    });
  });
});
