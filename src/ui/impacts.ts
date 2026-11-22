import { palette } from '../design/tokens';
import type { Hit, ScrumFrame } from '../game/scrum';
import { SECONDS_PER_FRAME } from '../game/spoof-motion';
import type { ArenaView } from './arena-view';

/**
 * Impact cues (#53): a ring bursting from where two opponents hit, so a hit
 * reads as a hit. The owner picked the ring burst over a squash of the two
 * discs, or both (2026-11-22). A contact usually lasts a single simulated frame, about 1/37 of a
 * second, and without a cue the eye reads it as spoofs stopping just short.
 *
 * Purely visual: cues are drawn from the hits the simulation records on its
 * frames, and nothing here feeds back into play. Timing comes from the
 * playback clock alone, so cues play the same at any display frame rate and
 * freeze when playback pauses. The timing and shapes are pure, so they're
 * unit-tested without a browser; only `drawImpactRing` touches a canvas.
 */

/**
 * How long a cue lasts, in seconds: a quarter of a second, the owner's pick
 * on #53 (2026-11-22), from 0.1 to 0.4 on review-only controls.
 */
export const IMPACT_SECONDS = 0.25;

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
