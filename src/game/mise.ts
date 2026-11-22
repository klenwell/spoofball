import type { BenchSide } from './arena';
import { DEFAULT_COURT, courtRadius, type Court } from './court';
import type { Random } from './random';
import type { ScrumEntry } from './scrum';
import type { Spoof } from './teams';
import type { Vec } from './vec';

/**
 * The mise (#39): before each scrum, the two teams take turns placing their
 * spoofs on the court. Rules from docs/design.md (Decisions for later epics,
 * Match), after the prototype's `mise.py` and `coaches.py`.
 *
 * A pure state machine: the screen shows a `MiseState` and passes taps in;
 * nothing here touches the DOM. Every random choice (the turn order, the
 * computer's picks) comes from a seeded `Random`, so a match can be replayed.
 */

/** Spoofs each team places before a scrum. The other 2 stay on the bench. */
export const SPOOFS_PLACED = 3;
/** Turns in a mise: 3 for each team. */
export const MISE_TURNS = 2 * SPOOFS_PLACED;
/** Of a team's 3, at most this many may go anywhere on the court; the rest go on the apron. */
export const ANYWHERE_ALLOWED = 1;

/**
 * How far a tap may be moved to the nearest valid spot, in court units,
 * rather than refused. About half the smallest spoof's width.
 */
export const NUDGE_LIMIT = 10;

/** Whose turn each of the 6 is. */
export type MiseOrder = readonly BenchSide[];

const other = (side: BenchSide): BenchSide => (side === 'home' ? 'visitor' : 'home');

/**
 * Every turn order the rules allow, for a given host:
 * - the host places last (turn 6);
 * - the other team places on turn 4 or 5 (or both);
 * - the host's other 2 turns fall anywhere in turns 1 to 5.
 * That's 9 orders. The prototype's rule that a team can't take its last turn
 * while the other hasn't taken its first can't be broken with two teams: the
 * host's last turn is always 6, and the other team always has turn 4 or 5.
 */
export function allowedOrders(host: BenchSide): MiseOrder[] {
  const orders: MiseOrder[] = [];
  for (let a = 0; a < 5; a += 1) {
    for (let b = a + 1; b < 5; b += 1) {
      // Turns 4 and 5 (indexes 3 and 4) can't both be the host's.
      if (a === 3 && b === 4) continue;
      const order = Array.from({ length: 5 }, (_, i) => (i === a || i === b ? host : other(host)));
      orders.push([...order, host]);
    }
  }
  return orders;
}

/** A new turn order for a scrum: one of the allowed orders, equally likely. */
export function drawOrder(host: BenchSide, random: Random): MiseOrder {
  return random.pick(allowedOrders(host));
}

/** A spoof placed during the mise. */
export interface Placement {
  readonly spoofId: string;
  readonly team: BenchSide;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface MiseState {
  readonly order: MiseOrder;
  readonly placements: readonly Placement[];
  readonly court: Court;
}

export function startMise(order: MiseOrder, court: Court = DEFAULT_COURT): MiseState {
  if (order.length !== MISE_TURNS) {
    throw new RangeError(`A mise has ${String(MISE_TURNS)} turns, got ${String(order.length)}`);
  }
  return { order, placements: [], court };
}

/** Whose turn it is, or null once all 6 spoofs are placed. */
export function whoseTurn(state: MiseState): BenchSide | null {
  return state.order[state.placements.length] ?? null;
}

export function isMiseOver(state: MiseState): boolean {
  return state.placements.length >= MISE_TURNS;
}

/** How many spoofs a team has still to place. */
export function leftToPlace(state: MiseState, team: BenchSide): number {
  return SPOOFS_PLACED - state.placements.filter((p) => p.team === team).length;
}

/** Whether a disc is wholly on the apron: on the court, and not over the mosh at all. */
export function isOnApron(x: number, y: number, radius: number, court: Court): boolean {
  const d = Math.hypot(x, y);
  return d - radius >= court.moshRadius && d + radius <= courtRadius(court);
}

/** Why a spot is refused, in the player's words. */
export type Refusal = 'off-court' | 'overlap' | 'apron-rule';

export const REFUSAL_TEXT: Readonly<Record<Refusal, string>> = {
  'off-court': 'Place it wholly on the court.',
  overlap: 'That spot overlaps another spoof.',
  'apron-rule':
    'Only one of your three can go inside the red line. Place this one on the gray apron.',
};

/** How many of its spoofs a team may still place off the apron: 1 until it has used its spot inside. */
export function insideSpotsLeft(state: MiseState, team: BenchSide): number {
  const used = state.placements.filter(
    (p) => p.team === team && !isOnApron(p.x, p.y, p.radius, state.court),
  ).length;
  return ANYWHERE_ALLOWED - used;
}

/** Why a spoof of this radius can't go at (x, y) for this team, or null if it can. */
export function checkSpot(
  state: MiseState,
  team: BenchSide,
  x: number,
  y: number,
  radius: number,
): Refusal | null {
  if (Math.hypot(x, y) + radius > courtRadius(state.court)) return 'off-court';
  for (const p of state.placements) {
    if (Math.hypot(p.x - x, p.y - y) < p.radius + radius) return 'overlap';
  }
  if (!isOnApron(x, y, radius, state.court) && insideSpotsLeft(state, team) <= 0) {
    return 'apron-rule';
  }
  return null;
}

/** Where a tap places a spoof: the tap itself, or the nearest valid spot within `NUDGE_LIMIT`. */
export type TapResult = { readonly spot: Vec } | { readonly refusal: Refusal };

export function spotForTap(state: MiseState, team: BenchSide, tap: Vec, radius: number): TapResult {
  const refusal = checkSpot(state, team, tap.x, tap.y, radius);
  if (!refusal) return { spot: tap };
  // Search outward in rings, nearest first, so the spoof moves as little as possible.
  for (let distance = 1; distance <= NUDGE_LIMIT; distance += 1) {
    const steps = Math.max(12, Math.ceil(2 * Math.PI * distance));
    for (let i = 0; i < steps; i += 1) {
      const angle = (2 * Math.PI * i) / steps;
      const x = tap.x + distance * Math.cos(angle);
      const y = tap.y + distance * Math.sin(angle);
      if (!checkSpot(state, team, x, y, radius)) return { spot: { x, y } };
    }
  }
  return { refusal };
}

/** Places a spoof for the team whose turn it is. Throws on a move the rules don't allow. */
export function placeSpoof(state: MiseState, spoof: Spoof, team: BenchSide, spot: Vec): MiseState {
  const turn = whoseTurn(state);
  if (turn !== team) throw new Error(`It isn't ${team}'s turn`);
  if (state.placements.some((p) => p.spoofId === spoof.id && p.team === team)) {
    throw new Error(`${spoof.id} is already placed`);
  }
  const refusal = checkSpot(state, team, spot.x, spot.y, spoof.radius);
  if (refusal) throw new Error(`Can't place ${spoof.id} there: ${refusal}`);
  const placement: Placement = {
    spoofId: spoof.id,
    team,
    x: spot.x,
    y: spot.y,
    radius: spoof.radius,
  };
  return { ...state, placements: [...state.placements, placement] };
}

/** A team's spoofs not yet placed, in team order. */
export function unplaced(state: MiseState, team: BenchSide, spoofs: readonly Spoof[]): Spoof[] {
  const placed = new Set(state.placements.filter((p) => p.team === team).map((p) => p.spoofId));
  return spoofs.filter((s) => !placed.has(s.id));
}

/** How many random spots the computer tries before searching the court in order. */
const RANDOM_TRIES = 200;

/**
 * The computer's move (#39): a random unplaced spoof, at a random valid spot,
 * any point on the court equally likely. So it uses its one spot anywhere on
 * the court at a random turn. (The prototype's coach only ever placed on the
 * apron, hugging the mosh's edge.)
 */
export function computerMove(
  state: MiseState,
  team: BenchSide,
  spoofs: readonly Spoof[],
  random: Random,
): { spoof: Spoof; spot: Vec } {
  const spoof = random.pick(unplaced(state, team, spoofs));
  const edge = courtRadius(state.court) - spoof.radius;
  for (let i = 0; i < RANDOM_TRIES; i += 1) {
    // Uniform over the disc's area: the square root keeps the center from crowding.
    const r = edge * Math.sqrt(random.next());
    const angle = random.uniform(0, 2 * Math.PI);
    const spot = { x: r * Math.cos(angle), y: r * Math.sin(angle) };
    if (!checkSpot(state, team, spot.x, spot.y, spoof.radius)) return { spoof, spot };
  }
  // A crowded court: take the first valid spot around the apron's middle ring.
  const ring = state.court.moshRadius + (courtRadius(state.court) - state.court.moshRadius) / 2;
  for (let degree = 0; degree < 360; degree += 1) {
    const angle = (degree * Math.PI) / 180;
    const spot = { x: ring * Math.cos(angle), y: ring * Math.sin(angle) };
    if (!checkSpot(state, team, spot.x, spot.y, spoof.radius)) return { spoof, spot };
  }
  throw new Error(`No room to place ${spoof.id}`);
}

/** The scrum's starting lineup once the mise is over, in the order spoofs were placed. */
export function miseEntries(
  state: MiseState,
  teams: Readonly<Record<BenchSide, readonly Spoof[]>>,
): ScrumEntry[] {
  if (!isMiseOver(state)) throw new Error('The mise is not over');
  return state.placements.map((p) => {
    const spoof = teams[p.team].find((s) => s.id === p.spoofId);
    if (!spoof) throw new Error(`No spoof ${p.spoofId} on ${p.team}`);
    return { spoof, team: p.team, position: { x: p.x, y: p.y }, fatigue: 0 };
  });
}
