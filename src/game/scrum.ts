import { DEFAULT_COLLISION_RULE, resolveCollision, type Body, type CollisionRule } from './body';
import type { Random } from './random';
import {
  FRAMES_PER_SCRUM,
  MAX_BLOW_RADIUS,
  SCRUM_SECONDS,
  SECONDS_PER_FRAME,
  blowRate,
  burstSpeed,
  fade,
  fatigueProbability,
  keepOnCourt,
  limitSpeed,
  move,
  skid,
  steerToward,
  thoughtProbability,
  type ScrumSkills,
} from './spoof-motion';
import type { Spoof } from './teams';
import { distance, ZERO, type Vec } from './vec';

/**
 * One scrum's simulation (#36): 8 seconds of spoofs moving on their own. It's
 * pure: the same entries, rules and random seed always give the same frames,
 * so a scrum is simulated up front in milliseconds and then played back (the
 * plan's default 1, #33).
 *
 * Each frame, in order, as in the prototype's `MatchRound.sim_frame`:
 * 1. every spoof, in entry order: checks whether it reached its goal (and
 *    skids), then thinks (picks a goal and steers) or else blows (grows),
 *    moves, and may tire;
 * 2. collisions between every pair of opponents;
 * 3. every spoof is kept on the court;
 * 4. the clock ticks; speeds and sizes are kept within their limits.
 */

/** A spoof as it starts a scrum: where it was placed, and how tired it already is. */
export interface ScrumEntry {
  readonly spoof: Spoof;
  /** Spoofs on the same team never collide. */
  readonly team: string;
  readonly position: Vec;
  /** Fatigue carried in from earlier scrums (#40). 0 when fresh. */
  readonly fatigue: number;
}

/** What a spoof's brain can see when it thinks. */
export interface SpoofView {
  readonly id: string;
  readonly team: string;
  readonly position: Vec;
  readonly velocity: Vec;
  readonly radius: number;
  readonly skills: Readonly<ScrumSkills>;
}

export interface ScrumView {
  readonly spoofs: readonly SpoofView[];
  /** Seconds since the scrum started. */
  readonly secondsGone: number;
}

/**
 * Picks a spoof's next goal when it thinks, or null to keep going as it is.
 * The spoof AI (#37) replaces the stand-in below.
 */
export type Brain = (self: SpoofView, scrum: ScrumView, random: Random) => Vec | null;

/** A stand-in brain until the spoof AI (#37): always head for the crush. */
export const headForCrush: Brain = () => ZERO;

export interface ScrumOptions {
  readonly random: Random;
  readonly collision?: CollisionRule;
  readonly brain?: Brain;
}

/** One spoof in one frame: everything playback needs. */
export interface SpoofFrame {
  readonly id: string;
  readonly team: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly fatigue: number;
}

export interface ScrumFrame {
  /** Seconds left on the clock after this frame. */
  readonly clock: number;
  readonly spoofs: readonly SpoofFrame[];
}

/** A spoof as the scrum ends, for carrying fatigue and tired skills forward (#40). */
export interface ScrumFinish {
  readonly id: string;
  readonly skills: Readonly<ScrumSkills>;
  readonly fatigue: number;
}

export interface ScrumResult {
  /** `FRAMES_PER_SCRUM` frames, one after each simulated step. */
  readonly frames: readonly ScrumFrame[];
  readonly finish: readonly ScrumFinish[];
}

/** The working state of one spoof, changed in place as the frames run. */
interface Runner {
  readonly id: string;
  readonly team: string;
  readonly mass: number;
  position: Vec;
  velocity: Vec;
  radius: number;
  skills: ScrumSkills;
  blowRate: number;
  fatigue: number;
  goal: Vec | null;
}

function startRunner(entry: ScrumEntry): Runner {
  const { spoof } = entry;
  return {
    id: spoof.id,
    team: entry.team,
    mass: spoof.skills.mass,
    position: entry.position,
    velocity: ZERO,
    radius: spoof.radius,
    skills: { ...spoof.skills },
    blowRate: blowRate(spoof.radius, spoof.skills.growth),
    fatigue: entry.fatigue,
    goal: null,
  };
}

function view(runner: Runner): SpoofView {
  return {
    id: runner.id,
    team: runner.team,
    position: runner.position,
    velocity: runner.velocity,
    radius: runner.radius,
    skills: runner.skills,
  };
}

function toBody(runner: Runner): Body {
  return {
    position: runner.position,
    velocity: runner.velocity,
    radius: runner.radius,
    mass: runner.mass,
    team: runner.team,
  };
}

function snapshot(runners: readonly Runner[], clock: number): ScrumFrame {
  return {
    clock,
    spoofs: runners.map((r) => ({
      id: r.id,
      team: r.team,
      x: r.position.x,
      y: r.position.y,
      radius: r.radius,
      fatigue: r.fatigue,
    })),
  };
}

function checkEntries(entries: readonly ScrumEntry[]): void {
  const ids = entries.map((e) => e.spoof.id);
  if (new Set(ids).size !== ids.length) {
    throw new RangeError(`Every spoof in a scrum needs a different id, got ${ids.join(', ')}`);
  }
}

export function simulateScrum(entries: readonly ScrumEntry[], options: ScrumOptions): ScrumResult {
  checkEntries(entries);
  const { random } = options;
  const collision = options.collision ?? DEFAULT_COLLISION_RULE;
  const brain = options.brain ?? headForCrush;
  const runners = entries.map(startRunner);
  const frames: ScrumFrame[] = [];

  for (let frame = 0; frame < FRAMES_PER_SCRUM; frame += 1) {
    const secondsGone = frame * SECONDS_PER_FRAME;

    // 1. Each spoof acts.
    for (const runner of runners) {
      if (runner.goal && distance(runner.position, runner.goal) <= runner.radius) {
        runner.velocity = skid(runner.velocity, runner.skills, random);
        runner.goal = null;
      }
      if (random.chance(thoughtProbability(runner.skills, secondsGone))) {
        const scrum: ScrumView = { spoofs: runners.map(view), secondsGone };
        const goal = brain(view(runner), scrum, random);
        if (goal) {
          runner.goal = goal;
          runner.velocity = steerToward(runner.position, goal, burstSpeed(runner.skills));
        }
      } else {
        runner.radius += runner.radius * runner.blowRate;
      }
      runner.position = move(runner.position, runner.velocity);
      if (random.chance(fatigueProbability(runner.skills))) {
        const faded = fade(runner.skills, runner.blowRate, random);
        runner.skills = faded.skills;
        runner.blowRate = faded.blowRate;
        runner.fatigue += 1;
      }
    }

    // 2. Collisions between opponents.
    for (let i = 0; i < runners.length; i += 1) {
      for (let j = i + 1; j < runners.length; j += 1) {
        const a = runners[i];
        const b = runners[j];
        if (!a || !b) continue;
        const [bodyA, bodyB] = resolveCollision(toBody(a), toBody(b), collision);
        a.position = bodyA.position;
        a.velocity = bodyA.velocity;
        b.position = bodyB.position;
        b.velocity = bodyB.velocity;
      }
    }

    // 3 and 4. Stay on the court, and within the limits.
    for (const runner of runners) {
      runner.radius = Math.min(runner.radius, MAX_BLOW_RADIUS);
      runner.velocity = limitSpeed(runner.velocity);
      const onCourt = keepOnCourt(runner.position, runner.velocity, runner.radius);
      runner.position = onCourt.position;
      runner.velocity = onCourt.velocity;
    }

    const clock = SCRUM_SECONDS - (frame + 1) * SECONDS_PER_FRAME;
    frames.push(snapshot(runners, Math.max(0, clock)));
  }

  return {
    frames,
    finish: runners.map((r) => ({ id: r.id, skills: { ...r.skills }, fatigue: r.fatigue })),
  };
}
