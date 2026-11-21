import { COURT_RADIUS, zoneAt, zoneMultiplier } from './court';
import type { Random } from './random';
import { comps } from './skills';
import { SCRUM_SECONDS, SECONDS_PER_FRAME } from './spoof-motion';
import type { Goal, ScrumView, SpoofView } from './scrum';
import { distance, length, rotate, scale, subtract, ZERO, type Vec } from './vec';

/**
 * The spoof AI (#37): how a spoof picks a goal when it thinks.
 *
 * It's built on what the prototype meant (`ClusterRookAi` and `BruteRookAi`
 * in `lib/minrook/rook_ai.py`), not on how it actually played, by the owner's
 * choice on #37 (2026-11-21). The prototype's cluster values ignored each
 * cluster's own contents, so its spoofs mostly drifted toward the nearest
 * group. Here a spoof surveys the spots it can see and values each one the
 * way scoring will: by zone, and by how many teammates share it.
 */

/** How far beyond its own edge a spoof can see at vision 100 (the prototype's 144). */
export const MAX_VISION_RANGE = 144;
/** The finest and coarsest spacing between surveyed spots, in court units. */
export const FINEST_LOOK = 6;
export const COARSEST_LOOK = 24;

/**
 * How long a charge at opponents lasts before the spoof gives up, in seconds
 * of game time (the prototype's 1.5). Other goals don't expire: they're
 * re-valued every time the spoof thinks (the owner, on #48).
 */
export const CRASH_SECONDS = 1.5;

/** How much a far spot is discounted against a near one: up to half, at the edge of vision. */
const DISTANCE_DISCOUNT = 0.5;

/** How far a spoof sees: its own radius plus up to `MAX_VISION_RANGE`, by vision. */
export function visionRadius(self: SpoofView): number {
  return self.radius + self.skills.vision * 0.01 * MAX_VISION_RANGE;
}

/** The spacing between the spots a spoof surveys: finer with higher iq. */
export function lookSpacing(self: SpoofView): number {
  return FINEST_LOOK + (100 - self.skills.iq) * 0.01 * (COARSEST_LOOK - FINEST_LOOK);
}

/**
 * What a spot is worth to this spoof, if it were sitting there: the zone's
 * multiplier times one plus the teammates covering the spot. That's the same
 * rule scoring uses (#38): overlapping teammates multiply each other's score.
 */
export function spotValue(self: SpoofView, spot: Vec, scrum: ScrumView): number {
  const zone = zoneMultiplier[zoneAt(spot.x, spot.y)];
  if (zone === 0) return 0;
  let teammates = 0;
  for (const other of scrum.spoofs) {
    if (other.id === self.id || other.team !== self.team) continue;
    if (distance(other.position, spot) <= other.radius) teammates += 1;
  }
  return zone * (1 + teammates);
}

/** How many opponents cover a spot. */
export function opponentsAt(self: SpoofView, spot: Vec, scrum: ScrumView): number {
  let count = 0;
  for (const other of scrum.spoofs) {
    if (other.team === self.team) continue;
    if (distance(other.position, spot) <= other.radius) count += 1;
  }
  return count;
}

/**
 * The prototype's "fudge": a spoof misjudges a spot by up to ±10% at smarts
 * 0, and not at all at smarts 100.
 */
function misjudge(value: number, smarts: number, random: Random): number {
  const fudge = 0.1 - 0.001 * smarts;
  return value * (1 + random.uniform(-fudge, fudge));
}

/** The spots a spoof surveys: a square grid within its vision, on the court. */
export function surveySpots(self: SpoofView): Vec[] {
  const range = visionRadius(self);
  const spacing = lookSpacing(self);
  const steps = Math.floor(range / spacing);
  const spots: Vec[] = [];
  for (let i = -steps; i <= steps; i += 1) {
    for (let j = -steps; j <= steps; j += 1) {
      const offset = { x: i * spacing, y: j * spacing };
      if (length(offset) > range) continue;
      const spot = { x: self.position.x + offset.x, y: self.position.y + offset.y };
      if (length(spot) <= COURT_RADIUS) spots.push(spot);
    }
  }
  return spots;
}

/**
 * When a spoof sees nothing worth going for, it gropes toward the center,
 * wobbling more the less constant it is (the prototype's `grope_forward`).
 */
function gropeForward(self: SpoofView, random: Random): Vec {
  const toCenter = subtract(ZERO, self.position);
  const reach = length(toCenter);
  if (reach === 0) return self.position;
  const wobble = 1 - 0.01 * self.skills.constancy;
  const stride = Math.min(reach, visionRadius(self) * (1 - random.uniform(0, wobble)));
  const turn = (60 * random.uniform(-wobble, wobble) * Math.PI) / 180;
  const step = rotate(scale(toCenter, stride / reach), turn);
  return { x: self.position.x + step.x, y: self.position.y + step.y };
}

/**
 * What a goal the spoof already has is worth now, judged on the court as it
 * is, not as it was when the goal was picked. A goal followed from a
 * teammate's message is weighted by how persuasive that teammate was.
 */
export function currentValue(self: SpoofView, goal: Goal, scrum: ScrumView): number {
  const spot = goal.kind === 'hold' ? self.position : goal.point;
  return spotValue(self, spot, scrum) * goal.weight;
}

/**
 * The spoof AI's brain. It surveys the spots it can see and picks the most
 * valuable, discounting far ones a little and misjudging by its smarts. It
 * keeps its current goal if that's still truly worth as much as the best new
 * spot. Otherwise:
 * - if no spot is truly worth more than where it is, it holds its spot;
 * - if the best spot is crowded with 2 or more opponents, it charges them
 *   (a crash goal, the prototype's idea);
 * - if it sees nothing of value, it gropes toward the center.
 */
export function spoofBrain(
  self: SpoofView,
  scrum: ScrumView,
  random: Random,
  current: Goal | null,
): Goal {
  const now = scrum.secondsGone;
  const { smarts } = comps(self.skills);
  const range = visionRadius(self);
  const here = spotValue(self, self.position, scrum);

  let best: Vec | null = null;
  let bestValue = 0;
  let bestRaw = 0;
  for (const spot of surveySpots(self)) {
    const raw = spotValue(self, spot, scrum);
    if (raw === 0) continue;
    const near = 1 - DISTANCE_DISCOUNT * (distance(spot, self.position) / range);
    const value = misjudge(raw * near, smarts, random);
    if (value > bestValue) {
      best = spot;
      bestValue = value;
      bestRaw = raw;
    }
  }

  // Keep, hold and charge by true values, so misjudging an equal spot nearby
  // doesn't send it wandering off a good one.
  if (current) {
    const worth = currentValue(self, current, scrum);
    if (worth > 0 && worth >= Math.max(bestRaw, here)) return current;
  }
  if (!best) {
    return { kind: 'goto', point: gropeForward(self, random), weight: 1, expires: null };
  }
  if (here > 0 && here >= bestRaw) {
    return { kind: 'hold', point: self.position, weight: 1, expires: null };
  }
  if (opponentsAt(self, best, scrum) >= 2) {
    return { kind: 'crash', point: best, weight: 1, expires: now + CRASH_SECONDS };
  }
  return { kind: 'goto', point: best, weight: 1, expires: null };
}

/**
 * Leadership: how readily a spoof tells its teammates where to go (the
 * prototype's charisma 1.5, impact 1.5, iq 1).
 */
export function leadership(self: SpoofView): number {
  const { charisma, impact, iq } = self.skills;
  return (charisma * 1.5 + impact * 1.5 + iq) / 4;
}

/**
 * The chance a spoof with a goal messages its teammates this frame: the same
 * curve as thinking, driven by leadership instead of iq, and rising as the
 * clock runs down.
 */
export function messageProbability(self: SpoofView, secondsGone: number): number {
  const x = leadership(self);
  const perSecond = 0.00047882 * x * x - 0.0121413 * x + 0.4104679;
  const clutch = (self.skills.impact + self.skills.constancy) / 300;
  const urgency = clutch * (secondsGone / SCRUM_SECONDS);
  return Math.min(1, Math.max(0, perSecond * SECONDS_PER_FRAME * (1 + urgency)));
}

/**
 * The chance a spoof follows a teammate's message: twice the sender's
 * charisma times its own cooperation, as fractions (the prototype's rule).
 * Two spoofs at 71 each make it about even.
 */
export function heedProbability(senderCharisma: number, cooperation: number): number {
  return Math.min(1, 2 * (senderCharisma * 0.01) * (cooperation * 0.01));
}

/** How many frames a message takes to arrive: up to half a second, quicker with more burst. */
export function messageDelayFrames(senderBurst: number): number {
  const seconds = 0.5 - senderBurst * 0.005;
  return Math.max(1, Math.ceil(seconds / SECONDS_PER_FRAME));
}

/**
 * How persuasive a teammate's suggestion is: the sender's charisma × 0.015,
 * so up to 1.5 (the prototype's rule). A followed goal's value is multiplied
 * by it each time it's re-valued, so a charismatic teammate's idea sticks.
 */
export function persuasion(senderCharisma: number): number {
  return senderCharisma * 0.015;
}
