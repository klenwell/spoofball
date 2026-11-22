import { palette } from '../design/tokens';
import type { Hit, ScrumFrame, SpoofFrame } from '../game/scrum';
import { SECONDS_PER_FRAME } from '../game/spoof-motion';
import type { ArenaView } from './arena-view';

/**
 * Impact cues (#53): a brief mark where two opponents hit, so a hit reads as
 * a hit. A contact usually lasts a single simulated frame, about 1/37 of a
 * second, and without a cue the eye reads it as spoofs stopping just short.
 *
 * Purely visual: cues are drawn from the hits the simulation records on its
 * frames, and nothing here feeds back into play. Timing comes from the
 * playback clock alone, so cues play the same at any display frame rate and
 * freeze when playback pauses. The timing and shapes are pure, so they're
 * unit-tested without a browser; only the `draw…` functions touch a canvas.
 */

/** How an impact shows: an expanding ring, the two discs squashing, both, or nothing. */
export type ImpactCue = 'ring' | 'squash' | 'both' | 'none';

export const IMPACT_CUES: readonly ImpactCue[] = ['ring', 'squash', 'both', 'none'];

/** The cue to show until the owner picks one on #53's review. */
export const DEFAULT_IMPACT_CUE: ImpactCue = 'ring';

/** How long a cue lasts, in seconds: about a sixth of a second (#53). */
export const IMPACT_SECONDS = 1 / 6;

/** A hit whose cue is showing, with how far through the cue it is. */
export interface Impact extends Hit {
  /** 0 at the moment of the hit, rising to 1 as the cue ends. */
  readonly age: number;
}

/**
 * The hits whose cues are showing `seconds` into playback. `frames` starts
 * with the start frame, as for `frameAt`, so frame k is reached k frames into
 * playback; a hit's cue starts there and lasts `length` seconds.
 */
export function impactsAt(
  frames: readonly ScrumFrame[],
  seconds: number,
  length: number = IMPACT_SECONDS,
): Impact[] {
  if (length <= 0) return [];
  const newest = Math.min(Math.floor(seconds / SECONDS_PER_FRAME), frames.length - 1);
  const showing: Impact[] = [];
  for (let k = newest; k >= 0; k -= 1) {
    const age = (seconds - k * SECONDS_PER_FRAME) / length;
    if (age >= 1) break;
    for (const hit of frames[k]?.hits ?? []) showing.push({ ...hit, age });
  }
  return showing;
}

/** Whether a cue style draws the ring, and whether it squashes the discs. */
export function showsRing(cue: ImpactCue): boolean {
  return cue === 'ring' || cue === 'both';
}

export function showsSquash(cue: ImpactCue, reducedMotion: boolean): boolean {
  // A squash is motion, so it's left out when the player has asked for less.
  return !reducedMotion && (cue === 'squash' || cue === 'both');
}

/** A ring's size and strength, in court units. */
export interface RingShape {
  readonly radius: number;
  readonly width: number;
  /** 1 is fully drawn, 0 gone. */
  readonly opacity: number;
}

const RING_START = 3;
const RING_END = 13;
const RING_WIDTH_START = 2.5;
const RING_WIDTH_END = 0.75;
/** With reduced motion, the ring doesn't grow: it shows at this size and fades. */
const RING_STILL = 8;

/**
 * The ring at a point in its cue: it bursts outward fast, then slows (an ease
 * out), thinning and fading as it goes. With reduced motion it stays one size
 * and only fades, which is gentler.
 */
export function ringAt(age: number, reducedMotion: boolean): RingShape {
  const t = Math.min(Math.max(age, 0), 1);
  const opacity = 1 - t;
  if (reducedMotion) return { radius: RING_STILL, width: RING_WIDTH_END * 2, opacity };
  const eased = 1 - (1 - t) * (1 - t);
  return {
    radius: RING_START + (RING_END - RING_START) * eased,
    width: RING_WIDTH_START + (RING_WIDTH_END - RING_WIDTH_START) * eased,
    opacity,
  };
}

/** How much a disc is flattened at the moment of a hit: 0.2 is 20% along the line of the hit. */
export const SQUASH_DEPTH = 0.2;

/** A squashed disc: flattened along `angle` (radians, toward the hit) by `amount`. */
export interface Squash {
  readonly angle: number;
  readonly amount: number;
}

/**
 * How a spoof on the court is squashed: by the strongest showing impact it's
 * part of, flattened toward where it was hit, easing back as the cue ends.
 * Null when it isn't in any.
 */
export function squashOf(spoof: SpoofFrame, impacts: readonly Impact[]): Squash | null {
  let strongest: Squash | null = null;
  for (const impact of impacts) {
    if (impact.hitter !== spoof.id && impact.hit !== spoof.id) continue;
    const amount = SQUASH_DEPTH * (1 - impact.age);
    if (amount <= 0 || (strongest && strongest.amount >= amount)) continue;
    strongest = { angle: Math.atan2(impact.y - spoof.y, impact.x - spoof.x), amount };
  }
  return strongest;
}

/** Draws an impact's ring at its contact point, in the dark highlight ink, which reads on every zone. */
export function drawImpactRing(
  ctx: CanvasRenderingContext2D,
  view: ArenaView,
  impact: Impact,
  reducedMotion: boolean,
): void {
  const ring = ringAt(impact.age, reducedMotion);
  if (ring.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = ring.opacity;
  ctx.beginPath();
  ctx.arc(
    view.cx + impact.x * view.scale,
    view.cy + impact.y * view.scale,
    ring.radius * view.scale,
    0,
    Math.PI * 2,
  );
  ctx.lineWidth = ring.width * view.scale;
  ctx.strokeStyle = palette.highlight;
  ctx.stroke();
  ctx.restore();
}

/**
 * The point a squashed disc flattens against: its edge, on the side it was
 * hit. Squashing around this point keeps that edge touching the other disc,
 * while the far side comes in. Squashing around the center instead pulled
 * both edges in, so squashed discs looked further apart, not closer.
 */
export function squashPivot(
  center: { x: number; y: number },
  radius: number,
  squash: Squash,
): { x: number; y: number } {
  return {
    x: center.x + radius * Math.cos(squash.angle),
    y: center.y + radius * Math.sin(squash.angle),
  };
}

/**
 * Runs `draw` with the canvas squashed for a disc (`center` and `radius` in
 * pixels): flattened along the squash's angle against `squashPivot`, and a
 * little wider across it.
 */
export function withSquash(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radius: number,
  squash: Squash | null,
  draw: () => void,
): void {
  if (!squash) {
    draw();
    return;
  }
  const pivot = squashPivot(center, radius, squash);
  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(squash.angle);
  ctx.scale(1 - squash.amount, 1 + squash.amount / 2);
  ctx.rotate(-squash.angle);
  ctx.translate(-pivot.x, -pivot.y);
  draw();
  ctx.restore();
}
