import { isOnBench, seatAt, type BenchSide } from '../game/arena';
import {
  insideSpotsLeft,
  isOnApron,
  placeSpoof,
  spotForTap,
  whoseTurn,
  type MiseState,
  type Refusal,
} from '../game/mise';
import type { Spoof } from '../game/teams';
import type { Vec } from '../game/vec';

/**
 * Your hand during the mise (#39): picking up, dragging, tapping and placing
 * your spoofs, as in the prototype. Pure, so every rule of it is unit-tested
 * without a browser: the screen turns pointer events into `press`, `drag`
 * and `release` (in court units, at a time in seconds) and calls `tick` each
 * frame, then draws whatever the hand says.
 *
 * - **Drag** a spoof from your bench onto the court. While you drag, `aim`
 *   says where it would land (after the same nudge as a tap) and whether it
 *   may. Let go on a spot that isn't allowed, and it goes back to its seat.
 * - **Or tap** a bench spoof to pick it, then tap the court.
 * - **A grace period:** a placed spoof stays yours to move for
 *   `GRACE_SECONDS`. Drag it elsewhere, or back onto your bench, before it
 *   locks and the turn passes. Picking another bench spoof meanwhile swaps it
 *   in, and sends the placed one back to the bench.
 */

/** How long a placed spoof can still be moved before it locks: 1 s (the owner, 2026-11-22; the prototype's was 1.5 s). */
export const GRACE_SECONDS = 1;

/**
 * How far past the red line a spoof dragged from the apron must be pushed
 * before it crosses, in court units (the owner, 2026-11-22: 12, then a little
 * more). Until then it stays on the apron, against the line, so your one spot
 * inside is never used by accident. Once that spot is used, the line stops a
 * dragged spoof altogether.
 */
export const RED_LINE_PULL = 18;

/** How far a press may move, in court units, and still count as a tap rather than a drag. */
export const TAP_SLOP = 4;

/** A spoof placed this turn but not yet locked in. */
export interface Pending {
  readonly spoof: Spoof;
  readonly spot: Vec;
  /** When the grace period started, in seconds. */
  readonly since: number;
}

export type Held =
  /** Nothing in hand. */
  | { readonly kind: 'empty' }
  /** A spoof picked by a tap, waiting for a tap on the court. */
  | { readonly kind: 'picked'; readonly spoof: Spoof }
  /** A spoof being dragged, from the bench or from its pending spot. */
  | {
      readonly kind: 'dragging';
      readonly spoof: Spoof;
      readonly from: 'bench' | 'pending';
      readonly start: Vec;
      readonly at: Vec;
      readonly moved: boolean;
      /** Whether it was already picked by a tap when this press began. */
      readonly wasPicked: boolean;
      /**
       * How far above the finger the spoof is held, in court units, so the
       * finger doesn't hide it on a touch screen. 0 for a mouse.
       */
      readonly lift: number;
      /** Whether it has been pushed past the red line's pull, so it may go inside. */
      readonly crossed: boolean;
      /** Whether it may cross at all: false once your one spot inside is used. */
      readonly canCross: boolean;
    };

export interface Hand {
  readonly mise: MiseState;
  readonly held: Held;
  readonly pending: Pending | null;
  /** The latest refusal, to show its reason, or null. */
  readonly refusal: Refusal | null;
}

export function startHand(mise: MiseState): Hand {
  return { mise, held: { kind: 'empty' }, pending: null, refusal: null };
}

/** Where a spoof being dragged would land, and whether it may. */
export type Aim =
  | { readonly kind: 'bench' }
  | {
      readonly kind: 'spot';
      readonly spot: Vec;
      readonly inside: boolean;
      /** Whether the red line is holding it on the apron. */
      readonly resisted: boolean;
    }
  | { readonly kind: 'refused'; readonly at: Vec; readonly refusal: Refusal };

type Dragging = Extract<Held, { kind: 'dragging' }>;

/** Where a dragged spoof is held: above the finger once it moves, by its lift. */
export function heldPoint(held: Dragging): Vec {
  return held.moved ? { x: held.at.x, y: held.at.y - held.lift } : held.at;
}

/** How far from the center a spoof's center is when it just touches the red line from the apron. */
const apronEdge = (mise: MiseState, spoof: Spoof) => mise.court.moshRadius + spoof.radius;

/**
 * Where a dragged spoof would be after the red line's pull: held against the
 * line on the apron side, unless it has crossed (`crossedNow`, which `drag`
 * keeps up to date). Null when it isn't held back.
 */
function heldBack(mise: MiseState, held: Dragging): Vec | null {
  if (held.crossed) return null;
  const p = heldPoint(held);
  const d = Math.hypot(p.x, p.y);
  const edge = apronEdge(mise, held.spoof);
  if (d >= edge) return null;
  // Dead center has no direction to push back along; hold it to the east.
  if (d === 0) return { x: edge, y: 0 };
  return { x: (p.x * edge) / d, y: (p.y * edge) / d };
}

/** Whether the dragged spoof has crossed the red line: pushed past its pull, and not since back on the apron. */
function crossedNow(mise: MiseState, held: Dragging): boolean {
  if (!held.canCross) return false;
  const p = heldPoint(held);
  const d = Math.hypot(p.x, p.y);
  const edge = apronEdge(mise, held.spoof);
  if (held.crossed) return d < edge;
  return d <= edge - RED_LINE_PULL;
}

function aimAt(mise: MiseState, side: BenchSide, held: Dragging): Aim {
  const raw = heldPoint(held);
  if (isOnBench(side, raw.x, raw.y, mise.court)) return { kind: 'bench' };
  const back = heldBack(mise, held);
  const at = back ?? raw;
  const spoof = held.spoof;
  const result = spotForTap(mise, side, at, spoof.radius);
  if ('refusal' in result) return { kind: 'refused', at, refusal: result.refusal };
  const inside = !isOnApron(result.spot.x, result.spot.y, spoof.radius, mise.court);
  return { kind: 'spot', spot: result.spot, inside, resisted: back !== null };
}

/** Where the spoof in hand would land now, or null when nothing is being dragged. */
export function aim(hand: Hand, side: BenchSide): Aim | null {
  const held = hand.held;
  return held.kind === 'dragging' ? aimAt(hand.mise, side, held) : null;
}

/** How far through its grace period the pending spoof is, from 0 to 1. It starts again each time it's put down. */
export function graceProgress(hand: Hand, now: number): number {
  if (!hand.pending) return 0;
  return Math.min(1, Math.max(0, (now - hand.pending.since) / GRACE_SECONDS));
}

const isYourTurn = (hand: Hand, side: BenchSide) => whoseTurn(hand.mise) === side;

/** The spoof on your bench under a point, if it's still there to pick. */
function benchSpoofAt(hand: Hand, side: BenchSide, team: readonly Spoof[], at: Vec): Spoof | null {
  const seat = seatAt(side, at.x, at.y, hand.mise.court);
  const spoof = seat ? team[seat.index] : undefined;
  if (!spoof) return null;
  const placed = hand.mise.placements.some((p) => p.team === side && p.spoofId === spoof.id);
  return placed ? null : spoof;
}

/** A finger or button goes down at a point. */
export function press(
  hand: Hand,
  side: BenchSide,
  team: readonly Spoof[],
  at: Vec,
  lift = 0,
): Hand {
  if (!isYourTurn(hand, side)) return hand;
  const pending = hand.pending;
  if (pending && Math.hypot(pending.spot.x - at.x, pending.spot.y - at.y) <= pending.spoof.radius) {
    return {
      ...hand,
      refusal: null,
      held: {
        kind: 'dragging',
        spoof: pending.spoof,
        from: 'pending',
        start: at,
        at,
        moved: false,
        wasPicked: false,
        lift,
        // Already inside the red line, it moves freely there.
        crossed: !isOnApron(pending.spot.x, pending.spot.y, pending.spoof.radius, hand.mise.court),
        canCross: insideSpotsLeft(hand.mise, side) > 0,
      },
    };
  }
  const spoof = benchSpoofAt(hand, side, team, at);
  if (spoof) {
    const wasPicked = hand.held.kind === 'picked' && hand.held.spoof.id === spoof.id;
    return {
      ...hand,
      refusal: null,
      held: {
        kind: 'dragging',
        spoof,
        from: 'bench',
        start: at,
        at,
        moved: false,
        wasPicked,
        lift,
        crossed: false,
        canCross: insideSpotsLeft(hand.mise, side) > 0,
      },
    };
  }
  return hand;
}

/** The finger or pointer moves while down. */
export function drag(hand: Hand, at: Vec): Hand {
  const held = hand.held;
  if (held.kind !== 'dragging') return hand;
  const moved = held.moved || Math.hypot(at.x - held.start.x, at.y - held.start.y) > TAP_SLOP;
  const next = { ...held, at, moved };
  return { ...hand, held: { ...next, crossed: crossedNow(hand.mise, next) } };
}

/** Puts a spoof down on a spot, pending, replacing whatever was pending. */
function putDown(hand: Hand, spoof: Spoof, spot: Vec, now: number): Hand {
  return { ...hand, held: { kind: 'empty' }, pending: { spoof, spot, since: now }, refusal: null };
}

/** The finger lifts, or the button comes up, at a point. */
export function release(hand: Hand, side: BenchSide, at: Vec, now: number): Hand {
  const held = hand.held;
  if (held.kind === 'picked') return tapCourt(hand, side, held.spoof, at, now);
  if (held.kind !== 'dragging') return hand;

  if (!held.moved) {
    if (held.from === 'pending') return { ...hand, held: { kind: 'empty' } };
    // A tap on a bench spoof picks it; a second tap puts it back.
    if (held.wasPicked) return { ...hand, held: { kind: 'empty' } };
    // Picking another spoof while one is pending swaps it: the pending one goes back.
    return { ...hand, held: { kind: 'picked', spoof: held.spoof }, pending: null };
  }

  // Where it lands is where it was last drawn, after this last move.
  const last = drag(hand, at).held;
  if (last.kind !== 'dragging') return hand;
  // A pending spoof isn't in the mise yet, so it never blocks its own new spot.
  const landing = aimAt(hand.mise, side, last);
  if (landing.kind === 'spot') {
    return putDown(hand, held.spoof, landing.spot, now);
  }
  // Dropped on the bench, or on a spot that isn't allowed: back to its seat.
  const pending = held.from === 'pending' ? null : hand.pending;
  const refusal = landing.kind === 'refused' ? landing.refusal : null;
  return { ...hand, held: { kind: 'empty' }, pending, refusal };
}

function tapCourt(hand: Hand, side: BenchSide, spoof: Spoof, at: Vec, now: number): Hand {
  if (isOnBench(side, at.x, at.y, hand.mise.court)) return hand;
  const result = spotForTap(hand.mise, side, at, spoof.radius);
  if ('refusal' in result) return { ...hand, refusal: result.refusal };
  return putDown(hand, spoof, result.spot, now);
}

/**
 * The press is cancelled (the browser took the gesture, say): whatever was
 * being dragged goes back where it was, a pending spoof to its spot.
 */
export function cancel(hand: Hand): Hand {
  return hand.held.kind === 'dragging' ? { ...hand, held: { kind: 'empty' } } : hand;
}

/**
 * Time passes. A pending spoof that has had its grace period, and isn't
 * being dragged, locks in: it's placed, and the turn passes.
 */
export function tick(hand: Hand, side: BenchSide, now: number): Hand {
  const pending = hand.pending;
  if (!pending || hand.held.kind === 'dragging') return hand;
  if (now - pending.since < GRACE_SECONDS) return hand;
  return {
    mise: placeSpoof(hand.mise, pending.spoof, side, pending.spot),
    held: hand.held,
    pending: null,
    refusal: null,
  };
}
