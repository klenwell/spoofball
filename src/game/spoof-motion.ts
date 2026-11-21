import { COURT_RADIUS } from './court';
import type { Random } from './random';
import { clampSkill, type SkillName, type Skills } from './skills';
import { add, dot, length, normalize, rotate, scale, subtract, ZERO, type Vec } from './vec';

/**
 * How a single spoof moves, grows and tires during a scrum (#36). Each
 * function is small and pure, so each behavior is tested on its own; the frame
 * loop in `scrum.ts` puts them together.
 *
 * The prototype is the reference (`RoundRook` in `lib/minrook/rooks.py`). Its
 * model has no acceleration or friction: when a spoof thinks, its velocity is
 * set straight to its burst speed toward its goal, and it coasts until it
 * thinks again, reaches the goal (and skids), or hits something.
 */

/** A scrum lasts 8 seconds. */
export const SCRUM_SECONDS = 8;
/**
 * Simulated frames in a scrum: the prototype's 300 (37.5 a second). Every rate
 * below is scaled by it, so changing it keeps a spoof's speed, growth and
 * tiring per second the same (the owner, on #27).
 */
export const FRAMES_PER_SCRUM = 300;
export const SECONDS_PER_FRAME = SCRUM_SECONDS / FRAMES_PER_SCRUM;

/** A spoof at burst 100 would cover 500 court units a second (the prototype's "Usain Rook"). */
export const MAX_SPEED_PER_SECOND = 500;
/** The fastest any spoof may move, in court units a frame. */
export const MAX_SPEED = MAX_SPEED_PER_SECOND * SECONDS_PER_FRAME;

/** The largest a spoof can grow during a scrum, in court units. */
export const MAX_BLOW_RADIUS = 40;

/**
 * Tuning for how lively a scrum is (#49). The owner found scrums slow: spoofs
 * sat nearly still about half the time. These are set while watching scrums,
 * on review-only sliders, then fixed.
 */
export interface Tuning {
  /**
   * How much faster than the prototype spoofs think. It scales the whole iq
   * curve, so a smart spoof still thinks as many times more often as a dim one.
   */
  readonly thinkingPace: number;
  /**
   * The least share of its speed a spoof keeps when it skids at its goal,
   * from 0 (the prototype: as little as 1%) toward 1. Grace still decides the
   * rest, so a graceful spoof keeps less than a clumsy one.
   */
  readonly skidFloor: number;
}

/** Thinking twice the prototype's pace (the owner, on #49); skids as in the prototype. */
export const DEFAULT_TUNING: Tuning = { thinkingPace: 2, skidFloor: 0 };

/** Skills a scrum changes as a spoof tires. */
export type ScrumSkills = Record<SkillName, number>;

/** A spoof's speed at full burst, in court units a frame. */
export function burstSpeed(skills: Skills): number {
  return clampSkill(skills.burst) * 0.01 * MAX_SPEED;
}

/** A weighted average of skills, rounded and kept within 1–99. */
function composite(skills: Skills, weights: Partial<Record<SkillName, number>>): number {
  let weighted = 0;
  let total = 0;
  for (const [name, weight] of Object.entries(weights) as [SkillName, number][]) {
    weighted += skills[name] * weight;
    total += weight;
  }
  return clampSkill(Math.round(weighted / total));
}

/**
 * The chance a spoof thinks this frame, picking a new goal. A spoof with iq 1
 * thinks about 0.4 times a second, iq 50 once, and iq 99 about 4 times (the
 * prototype's curve). As the clock runs down it thinks more often, more so
 * with high impact and constancy (the prototype's "urgency").
 */
export function thoughtProbability(
  skills: Skills,
  secondsGone: number,
  pace = DEFAULT_TUNING.thinkingPace,
): number {
  const iq = skills.iq;
  const thoughtsPerSecond = pace * (0.00047882 * iq * iq - 0.0121413 * iq + 0.4104679);
  const clutch = (skills.impact + skills.constancy) / 300;
  const urgency = clutch * (secondsGone / SCRUM_SECONDS);
  const probability = thoughtsPerSecond * SECONDS_PER_FRAME * (1 + urgency);
  return Math.min(1, Math.max(0, probability));
}

/**
 * The chance a spoof tires this frame. On average 20 times a scrum, from
 * about 40 at stamina 1 down to about 10 at stamina 99 (the prototype's rule).
 */
export function fatigueProbability(skills: Skills): number {
  const eventsPerScrum = 20 * (2 - 0.015 * skills.stamina);
  return Math.min(1, Math.max(0, eventsPerScrum / FRAMES_PER_SCRUM));
}

/**
 * How much a spoof grows each frame it blows, as a fraction of its radius.
 * Chosen so that blowing every frame of a scrum grows it by its growth skill
 * as a percentage (growth 50: half again as big), up to `MAX_BLOW_RADIUS`.
 */
export function blowRate(radius: number, growth: number): number {
  const target = Math.min(radius * (1 + growth * 0.01), MAX_BLOW_RADIUS);
  if (target <= radius) return 0;
  return Math.pow(target / radius, 1 / FRAMES_PER_SCRUM) - 1;
}

/** Points the spoof's velocity at the target, at its burst speed. */
export function steerToward(position: Vec, target: Vec, speed: number): Vec {
  const route = subtract(target, position);
  return length(route) > 0 ? scale(normalize(route), speed) : ZERO;
}

/**
 * Grace: how cleanly a spoof stops on reaching its goal (the prototype's
 * `gracefulness`). A graceful spoof stops sharply: it keeps little of its
 * speed and turns little. A clumsy one drifts on with more of its speed, and
 * turns more.
 */
export function grace(skills: Skills): number {
  return composite(skills, { burst: 1, constancy: 1, stamina: 0.5 });
}

/**
 * Skidding, when a spoof reaches its goal: it keeps a random 1% to
 * (100 − grace)% of its speed (raised by the tuning's skid floor), and turns
 * by up to ±(100 − grace) degrees.
 * So the more graceful the spoof, the less it drifts and turns.
 */
export function skid(
  velocity: Vec,
  skills: Skills,
  random: Random,
  floor = DEFAULT_TUNING.skidFloor,
): Vec {
  const clumsiness = 100 - grace(skills);
  const prototypeKeep = random.int(1, Math.max(1, clumsiness)) * 0.01;
  const keep = floor + (1 - floor) * prototypeKeep;
  const degrees = random.int(-clumsiness, clumsiness);
  return rotate(scale(velocity, keep), (degrees * Math.PI) / 180);
}

/**
 * Tiring: growth and burst drop by 2–4%, and iq by 1–3%. Growth slows how
 * fast the spoof grows from now on, so `blowRate` drops by the same share.
 */
export function fade(
  skills: ScrumSkills,
  rate: number,
  random: Random,
): { skills: ScrumSkills; blowRate: number } {
  const growthDrop = random.int(2, 4) * 0.01;
  const burstDrop = random.int(2, 4) * 0.01;
  const iqDrop = random.int(1, 3) * 0.01;
  return {
    skills: {
      ...skills,
      growth: clampSkill(skills.growth * (1 - growthDrop)),
      burst: clampSkill(skills.burst * (1 - burstDrop)),
      iq: clampSkill(skills.iq * (1 - iqDrop)),
    },
    blowRate: rate * (1 - growthDrop),
  };
}

/**
 * Keeps a spoof wholly on the court. One poking over the edge is moved
 * straight in toward the center until it's inside, and if it's moving
 * outward, its velocity bounces off the edge (a perfectly elastic wall, as in
 * the prototype).
 *
 * The prototype instead moved it back along its last move
 * (`translate_body_inside_body`). A spoof that grew at the edge without
 * moving had no last move, so it stayed poking out. Moving it radially
 * handles both.
 */
export function keepOnCourt(
  position: Vec,
  velocity: Vec,
  radius: number,
): { position: Vec; velocity: Vec } {
  const limit = COURT_RADIUS - radius;
  const fromCenter = length(position);
  if (fromCenter <= limit) return { position, velocity };
  const outward = fromCenter > 0 ? normalize(position) : { x: 1, y: 0 };
  const inside = scale(outward, Math.max(0, limit));
  const outwardSpeed = dot(velocity, outward);
  const bounced =
    outwardSpeed > 0 ? subtract(velocity, scale(outward, 2 * outwardSpeed)) : velocity;
  return { position: inside, velocity: bounced };
}

/** Moves a position by a velocity for one frame. */
export function move(position: Vec, velocity: Vec): Vec {
  return add(position, velocity);
}

/** Keeps a speed within `MAX_SPEED`, keeping the direction. */
export function limitSpeed(velocity: Vec): Vec {
  const speed = length(velocity);
  return speed > MAX_SPEED ? scale(normalize(velocity), MAX_SPEED) : velocity;
}
