import type { Scores } from '../game/scoring';
import type { ScrumEntry, ScrumFrame, SpoofFrame } from '../game/scrum';
import { SCRUM_SECONDS, SECONDS_PER_FRAME } from '../game/spoof-motion';

/**
 * Playing a simulated scrum back at the screen's own frame rate (#38). The
 * simulation runs at 37.5 frames a second; a display usually runs at 60 or
 * more, so each drawn frame blends the two simulated frames around it. Pure,
 * so the timing is unit-tested without a browser.
 */

/** The court as the scrum starts, before the first simulated step. */
export function startFrame(entries: readonly ScrumEntry[]): ScrumFrame {
  return {
    clock: SCRUM_SECONDS,
    spoofs: entries.map((e) => ({
      id: e.spoof.id,
      team: e.team,
      x: e.position.x,
      y: e.position.y,
      radius: e.spoof.radius,
      fatigue: e.fatigue,
    })),
  };
}

function blend(a: SpoofFrame, b: SpoofFrame, t: number): SpoofFrame {
  return {
    ...b,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    radius: a.radius + (b.radius - a.radius) * t,
    // Fatigue is a count, so it steps rather than blends.
    fatigue: t < 1 ? a.fatigue : b.fatigue,
  };
}

/**
 * The court at a moment of playback, `seconds` after the scrum started:
 * blended between the simulated frames on either side. `frames` starts with
 * the start frame, then one frame per simulated step.
 */
export function frameAt(frames: readonly ScrumFrame[], seconds: number): ScrumFrame {
  const last = frames[frames.length - 1];
  const first = frames[0];
  if (!first || !last) throw new RangeError('frameAt needs at least one frame');
  const position = Math.min(Math.max(seconds / SECONDS_PER_FRAME, 0), frames.length - 1);
  const index = Math.floor(position);
  const from = frames[index] ?? last;
  const to = frames[Math.min(index + 1, frames.length - 1)] ?? last;
  const t = position - index;
  return {
    clock: from.clock + (to.clock - from.clock) * t,
    spoofs: from.spoofs.map((s, i) => {
      const next = to.spoofs[i];
      return next ? blend(s, next, t) : s;
    }),
  };
}

/** The live scoreboard at a moment of playback: the last simulated frame reached. */
export function scoresAt(live: readonly Scores[], seconds: number): Scores {
  const index = Math.min(Math.max(Math.floor(seconds / SECONDS_PER_FRAME) - 1, 0), live.length - 1);
  const scores = live[index];
  if (!scores) throw new RangeError('scoresAt needs at least one scoreboard');
  return scores;
}

/** Moves a playback clock on by real time, stopping at the scrum's end. */
export function advance(seconds: number, elapsed: number): number {
  return Math.min(SCRUM_SECONDS, seconds + Math.max(0, elapsed));
}

/** True once playback has reached the end of the scrum. */
export function isOver(seconds: number): boolean {
  return seconds >= SCRUM_SECONDS;
}
