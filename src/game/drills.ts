import { courtRadius, courtWithMosh, type Court } from './court';
import { createRandom } from './random';
import {
  simulateScrum,
  type Brain,
  type Goal,
  type Message,
  type ScrumEntry,
  type ScrumResult,
} from './scrum';
import { messageDelayFrames, persuasion } from './spoof-ai';
import { FRAMES_PER_SCRUM, SCRUM_SECONDS, SECONDS_PER_FRAME } from './spoof-motion';
import { createSpoof, type Spoof } from './teams';
import { distance, ZERO, type Vec } from './vec';

/**
 * The combine's drills (#73): short runs of the match simulation on a small
 * court, one spoof at a time, each showing one or two of its traits without
 * numbers. A drill is a scrum (`simulateScrum`) with a drill's own brain, so
 * a spoof moves, grows, tires and heeds by exactly the match's rules.
 *
 * - **Sprint:** dash across the court and back, again and again (burst,
 *   stamina).
 * - **Blow:** stand still and grow (size, growth).
 * - **Hold:** stay in the middle while a dummy pushes (mass).
 * - **Teamwork:** you tap a spot, left or right, to send a message, and the spoof
 *   heeds it or not, then heads there (cooperation, iq).
 *
 * Every drill plays for about 3 seconds (the owner, 2026-11-24, on #73).
 * Stamina and growth only show over time, so sprint and blow simulate a whole
 * scrum (8 seconds) and play it back faster, about 2.7×. Hold and teamwork
 * show their traits in 3 seconds at match speed. Constancy shows in no short
 * drill: in a match it only makes a spoof stop more cleanly at its goal and
 * think more often late in a scrum, so it shows only in matches.
 *
 * Each run has its own seed, so a rerun varies a little, as in a match.
 */

export const drillNames = ['sprint', 'blow', 'hold', 'teamwork'] as const;
export type DrillName = (typeof drillNames)[number];

/** A drill plays for about 3 seconds. */
export const DRILL_SECONDS = 3;

/** A match-speed drill simulates 3 seconds' worth: 113 of the match's frames. */
export const DRILL_FRAMES = Math.round((DRILL_SECONDS / SCRUM_SECONDS) * FRAMES_PER_SCRUM);

/** The drills that simulate a whole scrum and play it back sped up to fit. */
const SPED_UP: readonly DrillName[] = ['sprint', 'blow'];

/** How many frames a drill simulates. */
export function drillFrames(drill: DrillName): number {
  return SPED_UP.includes(drill) ? FRAMES_PER_SCRUM : DRILL_FRAMES;
}

/**
 * How fast a drill plays back: 1 is match speed. A sped-up drill fits its
 * whole scrum into the drill's 3 seconds: 8 ÷ 3, about 2.7.
 */
export function playbackSpeed(drill: DrillName): number {
  return (drillFrames(drill) * SECONDS_PER_FRAME) / DRILL_SECONDS;
}

/** The drill court: a mosh of 60 inside the usual apron, so a court radius of 110. */
export const DRILL_COURT: Court = courtWithMosh(60);

/** The candidate's id in a drill. */
export const DRILLER_ID = 'driller';
/** Hold's dummy: a practice body that keeps charging the candidate. */
export const DUMMY_ID = 'dummy';

/**
 * The dummy is an average spoof (50 in every skill), so every candidate is
 * pushed by the same opponent.
 */
export const DUMMY: Spoof = createSpoof(DUMMY_ID, 'Dummy', 'pawn-basic', {
  size: 50,
  mass: 50,
  growth: 50,
  burst: 50,
  stamina: 50,
  iq: 50,
  vision: 50,
  charisma: 50,
  cooperation: 50,
  impact: 50,
  constancy: 50,
});

/**
 * The player's message in the teamwork drill comes from an average sender:
 * charisma 50 and burst 50. So it's heeded as often as the spoof's
 * cooperation, as a share (cooperation 70: 7 times in 10), and it arrives a
 * quarter of a second after the tap, as a teammate's would.
 */
export const PLAYER_CHARISMA = 50;
export const PLAYER_BURST = 50;

/** Which way to send the spoof in the teamwork drill. */
export type Direction = 'left' | 'right';

/** Where a spoof of this radius can stand at the edge of the drill court, left or right. */
export function edgeFor(side: -1 | 1, radius: number): Vec {
  return { x: side * (courtRadius(DRILL_COURT) - radius - 4), y: 0 };
}

const goTo = (point: Vec): Goal => ({ kind: 'goto', point, weight: 1, expires: null });
const holdAt = (point: Vec): Goal => ({ kind: 'hold', point, weight: 1, expires: null });

/**
 * Sprint's brain: dash for the far edge, and on reaching it, back again. It
 * keeps its goal while it has one, re-aiming at each thought as in a match,
 * so a tiring spoof slows as its burst drops.
 */
function sprintBrain(left: Vec, right: Vec): Brain {
  return (self, _scrum, _random, current) => {
    if (current) return current;
    // A goal is dropped once it's reached: head for the other edge.
    return goTo(self.position.x > 0 ? left : right);
  };
}

/** Blow's brain: stand still in the middle, so every frame it doesn't think, it grows. */
const blowBrain: Brain = (self, _scrum, _random, current) => current ?? holdAt(self.position);

/**
 * Hold's brain: the candidate heads back to the middle whenever it's pushed
 * off it, and the dummy charges the candidate wherever it is.
 */
const holdBrain: Brain = (self, scrum, _random, current) => {
  if (self.id === DUMMY_ID) {
    const target = scrum.spoofs.find((s) => s.id === DRILLER_ID);
    // A charge lasts until it hits, or a second and a half.
    return target
      ? { kind: 'crash', point: target.position, weight: 1, expires: scrum.secondsGone + 1.5 }
      : current;
  }
  // Heading home: keep going. At home: stay put. Pushed off: head home again.
  if (current?.kind === 'goto') return current;
  const home = distance(self.position, ZERO) <= self.radius;
  return home ? (current ?? holdAt(self.position)) : goTo(ZERO);
};

/**
 * Teamwork's brain: until a message is heeded, the spoof waits where it is;
 * once one is, it keeps that goal until it gets there, then stays.
 */
const teamworkBrain: Brain = (self, _scrum, _random, current) => current ?? holdAt(self.position);

/** One run of a drill. */
export interface DrillRun {
  readonly drill: DrillName;
  /** Where everyone started, for the first frame of playback. */
  readonly entries: readonly ScrumEntry[];
  readonly result: ScrumResult;
  /** How fast to play it back: 1 is match speed. */
  readonly speed: number;
}

export interface DrillOptions {
  /** This run's seed: a new one for each rerun, so each varies a little. */
  readonly seed: number;
  /** The teamwork drill's message. Without one, the spoof just waits. */
  readonly direction?: Direction | undefined;
}

/** The candidate's start, and anyone else in the drill. */
function drillEntries(driller: Spoof, drill: DrillName): ScrumEntry[] {
  const entry = (spoof: Spoof, team: string, position: Vec): ScrumEntry => ({
    spoof,
    team,
    position,
    fatigue: 0,
  });
  if (drill === 'sprint') return [entry(driller, 'you', edgeFor(-1, driller.radius))];
  if (drill === 'hold') {
    return [entry(driller, 'you', ZERO), entry(DUMMY, 'dummy', edgeFor(1, DUMMY.radius))];
  }
  return [entry(driller, 'you', ZERO)];
}

/** The player's message in the teamwork drill, or none. */
function playerMessage(spoof: Spoof, direction: Direction | undefined): Message[] {
  if (!direction) return [];
  return [
    {
      to: DRILLER_ID,
      senderCharisma: PLAYER_CHARISMA,
      goal: {
        kind: 'goto',
        point: edgeFor(direction === 'left' ? -1 : 1, spoof.radius),
        weight: persuasion(PLAYER_CHARISMA),
        expires: null,
      },
      deliverOnFrame: messageDelayFrames(PLAYER_BURST),
    },
  ];
}

const brains: Readonly<Record<DrillName, (spoof: Spoof) => Brain>> = {
  sprint: (spoof) => sprintBrain(edgeFor(-1, spoof.radius), edgeFor(1, spoof.radius)),
  blow: () => blowBrain,
  hold: () => holdBrain,
  teamwork: () => teamworkBrain,
};

/** Runs a drill for a candidate, by the match's rules. */
export function runDrill(spoof: Spoof, drill: DrillName, options: DrillOptions): DrillRun {
  const driller: Spoof = { ...spoof, id: DRILLER_ID };
  const entries = drillEntries(driller, drill);
  const result = simulateScrum(entries, {
    random: createRandom(options.seed),
    brain: brains[drill](spoof),
    court: DRILL_COURT,
    frames: drillFrames(drill),
    messages: drill === 'teamwork' ? playerMessage(spoof, options.direction) : [],
  });
  return { drill, entries, result, speed: playbackSpeed(drill) };
}
