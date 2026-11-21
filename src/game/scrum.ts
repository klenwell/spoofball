import {
  DEFAULT_COLLISION_RULE,
  collides,
  resolveCollision,
  type Body,
  type CollisionRule,
} from './body';
import type { Random } from './random';
import {
  heedProbability,
  messageDelayFrames,
  messageProbability,
  persuasion,
  spoofBrain,
} from './spoof-ai';
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
import { distance, dot, subtract, ZERO, type Vec } from './vec';

/**
 * One scrum's simulation (#36, #37): 8 seconds of spoofs playing on their
 * own. It's pure: the same entries, rules and random seed always give the
 * same frames, so a scrum is simulated up front in milliseconds and then
 * played back (the plan's default 1, #33).
 *
 * Each frame, in order, as in the prototype's `MatchRound.sim_frame`:
 * 1. messages due this frame are delivered, and each is followed (taken on as
 *    the spoof's goal, to steer for at its next thought) or ignored;
 * 2. every spoof, in entry order: drops a goal it has reached or given up on
 *    (skidding at a goal it reached), then thinks (keeps or picks a goal,
 *    and aims for it) or else grows, may message its teammates, moves, and
 *    may tire;
 * 3. collisions between every pair of opponents, counting new hits;
 * 4. every spoof is kept on the court, its speed and size within limits;
 * 5. teammate overlaps are counted, and the clock ticks.
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

/**
 * Where a spoof is trying to go, and why:
 * - `goto`: head for a spot, and skid on reaching it;
 * - `hold`: stay put, because nothing it sees beats where it is;
 * - `crash`: charge a spot crowded with opponents, until it hits one.
 */
export interface Goal {
  readonly kind: 'goto' | 'hold' | 'crash';
  readonly point: Vec;
  /**
   * Multiplies the goal's value each time it's re-valued: 1 for the spoof's
   * own idea, or the sender's persuasion for a teammate's (up to 1.5).
   */
  readonly weight: number;
  /**
   * When the spoof gives up on it, in seconds since the scrum started. Only
   * charges expire; null means it lasts until reached or replaced.
   */
  readonly expires: number | null;
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
 * Picks a spoof's goal when it thinks. It's given the spoof's current goal,
 * and returns that same goal to keep it, a new one to switch, or null to
 * keep going as it is.
 */
export type Brain = (
  self: SpoofView,
  scrum: ScrumView,
  random: Random,
  current: Goal | null,
) => Goal | null;

/** A simple brain, for tests: always head for the crush. */
export const headForCrush: Brain = (_self, _scrum, _random, current) =>
  current ?? { kind: 'goto', point: ZERO, weight: 1, expires: null };

export interface ScrumOptions {
  readonly random: Random;
  readonly collision?: CollisionRule;
  /** The spoof AI (`spoofBrain`) unless given. */
  readonly brain?: Brain;
}

/**
 * Behavior stats, counted quietly and never shown (docs/design.md, Stats).
 * The prototype's list, from `ROOK_STATS` in `lib/minrook/constants.py`.
 */
export interface BehaviorStats {
  /** Ideas: times it thought and picked a goal. */
  imps: number;
  /** Messages it sent, one per teammate. */
  pings: number;
  /** Messages it received. */
  pongs: number;
  /** Messages it followed. */
  heeds: number;
  /** Messages it ignored. */
  jecks: number;
  /** Hits it gave an opponent. */
  dings: number;
  /** Hits it took from an opponent. */
  dongs: number;
  /** Frames it overlapped exactly 1 teammate. */
  doves: number;
  /** Frames it overlapped 2 teammates. */
  trees: number;
}

export function emptyStats(): BehaviorStats {
  return {
    imps: 0,
    pings: 0,
    pongs: 0,
    heeds: 0,
    jecks: 0,
    dings: 0,
    dongs: 0,
    doves: 0,
    trees: 0,
  };
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
  readonly stats: Readonly<BehaviorStats>;
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
  goal: Goal | null;
  /** True for the frame after it hit an opponent, to end a crash goal. */
  justHit: boolean;
  stats: BehaviorStats;
}

interface Message {
  readonly to: string;
  readonly senderCharisma: number;
  readonly goal: Goal;
  readonly deliverOnFrame: number;
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
    justHit: false,
    stats: emptyStats(),
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

/** Takes up a goal and steers there now (or stops, to hold its spot). */
function adopt(runner: Runner, goal: Goal): void {
  runner.goal = goal;
  runner.velocity =
    goal.kind === 'hold'
      ? ZERO
      : steerToward(runner.position, goal.point, burstSpeed(runner.skills));
}

/** Drops a goal that's done: reached (with a skid), hit (for a charge), or given up on. */
function reassess(runner: Runner, secondsGone: number, random: Random): void {
  const goal = runner.goal;
  if (!goal) return;
  if (goal.expires !== null && secondsGone >= goal.expires) {
    runner.goal = null;
  } else if (goal.kind === 'crash') {
    if (runner.justHit) runner.goal = null;
  } else if (goal.kind === 'goto' && distance(runner.position, goal.point) <= runner.radius) {
    runner.velocity = skid(runner.velocity, runner.skills, random);
    runner.goal = null;
  }
}

/** A pair's key, so a hit is counted once when contact starts, not every frame it lasts. */
function pairKey(a: Runner, b: Runner): string {
  return `${a.id}|${b.id}`;
}

/**
 * Who hit whom: the one moving harder toward the other gives the hit (a
 * ding) and the other takes it (a dong).
 */
function countHit(a: Runner, b: Runner): void {
  const aToB = subtract(b.position, a.position);
  const aPush = dot(a.velocity, aToB);
  const bPush = -dot(b.velocity, aToB);
  const [hitter, hit] = aPush >= bPush ? [a, b] : [b, a];
  hitter.stats.dings += 1;
  hit.stats.dongs += 1;
}

export function simulateScrum(entries: readonly ScrumEntry[], options: ScrumOptions): ScrumResult {
  checkEntries(entries);
  const { random } = options;
  const collision = options.collision ?? DEFAULT_COLLISION_RULE;
  const brain = options.brain ?? spoofBrain;
  const runners = entries.map(startRunner);
  const byId = new Map(runners.map((r) => [r.id, r]));
  const frames: ScrumFrame[] = [];
  let mail: Message[] = [];
  let contacts = new Set<string>();

  for (let frame = 0; frame < FRAMES_PER_SCRUM; frame += 1) {
    const secondsGone = frame * SECONDS_PER_FRAME;

    // 1. Deliver messages due now.
    const due = mail.filter((m) => m.deliverOnFrame <= frame);
    mail = mail.filter((m) => m.deliverOnFrame > frame);
    for (const message of due) {
      const to = byId.get(message.to);
      if (!to) continue;
      to.stats.pongs += 1;
      if (random.chance(heedProbability(message.senderCharisma, to.skills.cooperation))) {
        // It takes the goal on now, but only steers there at its next thought,
        // as in the prototype: a quick-thinking spoof acts on advice sooner.
        to.stats.heeds += 1;
        to.goal = message.goal;
      } else {
        to.stats.jecks += 1;
      }
    }

    // 2. Each spoof acts.
    for (const runner of runners) {
      reassess(runner, secondsGone, random);
      runner.justHit = false;

      if (random.chance(thoughtProbability(runner.skills, secondsGone))) {
        runner.stats.imps += 1;
        const scrum: ScrumView = { spoofs: runners.map(view), secondsGone };
        // Re-aim at every thought, at whatever goal it keeps or picks, as in
        // the prototype, so a spoof knocked off course heads back.
        const idea = brain(view(runner), scrum, random, runner.goal);
        if (idea) adopt(runner, idea);
      } else {
        runner.radius += runner.radius * runner.blowRate;
      }

      if (runner.goal && random.chance(messageProbability(view(runner), secondsGone))) {
        const shared: Goal = {
          kind: 'goto',
          point: runner.goal.kind === 'hold' ? runner.position : runner.goal.point,
          weight: persuasion(runner.skills.charisma),
          expires: null,
        };
        for (const mate of runners) {
          if (mate === runner || mate.team !== runner.team) continue;
          runner.stats.pings += 1;
          mail.push({
            to: mate.id,
            senderCharisma: runner.skills.charisma,
            goal: shared,
            deliverOnFrame: frame + messageDelayFrames(runner.skills.burst),
          });
        }
      }

      runner.position = move(runner.position, runner.velocity);
      if (random.chance(fatigueProbability(runner.skills))) {
        const faded = fade(runner.skills, runner.blowRate, random);
        runner.skills = faded.skills;
        runner.blowRate = faded.blowRate;
        runner.fatigue += 1;
      }
    }

    // 3. Collisions between opponents, counting each new contact as a hit.
    const touching = new Set<string>();
    for (let i = 0; i < runners.length; i += 1) {
      for (let j = i + 1; j < runners.length; j += 1) {
        const a = runners[i];
        const b = runners[j];
        if (!a || !b || !collides(toBody(a), toBody(b))) continue;
        const key = pairKey(a, b);
        touching.add(key);
        if (!contacts.has(key)) countHit(a, b);
        a.justHit = true;
        b.justHit = true;
        const [bodyA, bodyB] = resolveCollision(toBody(a), toBody(b), collision);
        a.position = bodyA.position;
        a.velocity = bodyA.velocity;
        b.position = bodyB.position;
        b.velocity = bodyB.velocity;
      }
    }
    contacts = touching;

    // 4. Stay on the court, and within the limits.
    for (const runner of runners) {
      runner.radius = Math.min(runner.radius, MAX_BLOW_RADIUS);
      runner.velocity = limitSpeed(runner.velocity);
      const onCourt = keepOnCourt(runner.position, runner.velocity, runner.radius);
      runner.position = onCourt.position;
      runner.velocity = onCourt.velocity;
    }

    // 5. Teammate overlaps, then the clock.
    for (const runner of runners) {
      let overlapping = 0;
      for (const mate of runners) {
        if (mate === runner || mate.team !== runner.team) continue;
        if (distance(mate.position, runner.position) < mate.radius + runner.radius)
          overlapping += 1;
      }
      if (overlapping === 1) runner.stats.doves += 1;
      if (overlapping >= 2) runner.stats.trees += 1;
    }

    const clock = SCRUM_SECONDS - (frame + 1) * SECONDS_PER_FRAME;
    frames.push(snapshot(runners, Math.max(0, clock)));
  }

  return {
    frames,
    finish: runners.map((r) => ({
      id: r.id,
      skills: { ...r.skills },
      fatigue: r.fatigue,
      stats: { ...r.stats },
    })),
  };
}
