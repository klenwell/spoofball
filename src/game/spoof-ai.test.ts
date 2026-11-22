import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { COURT_RADIUS, DEFAULT_COURT, courtWithMosh, zoneAt } from './court';
import { createRandom } from './random';
import { skillNames, type Skills } from './skills';
import type { ScrumView, SpoofView } from './scrum';
import {
  CRASH_SECONDS,
  SHY_BELOW,
  appetite,
  charges,
  currentValue,
  MAX_VISION_RANGE,
  heedProbability,
  leadership,
  lookSpacing,
  messageDelayFrames,
  messageProbability,
  opponentsAt,
  persuasion,
  spoofBrain,
  spotAppeal,
  spotValue,
  surveySpots,
  visionRadius,
} from './spoof-ai';
import { SECONDS_PER_FRAME } from './spoof-motion';
import { distance, length, vec, type Vec } from './vec';

function skills(overrides: Partial<Skills> = {}): Skills {
  return { ...(Object.fromEntries(skillNames.map((n) => [n, 50])) as Skills), ...overrides };
}

function spoof(
  id: string,
  team: string,
  at: Vec,
  overrides: Partial<Skills> = {},
  radius = 15,
  temperament = 1,
): SpoofView {
  return {
    id,
    team,
    position: at,
    velocity: vec(0, 0),
    radius,
    skills: skills(overrides),
    temperament,
  };
}

/** A scrum with no aggression, the AI as it was before #51, unless given one. */
function scrumOf(...spoofs: SpoofView[]): ScrumView {
  return { spoofs, secondsGone: 0, court: DEFAULT_COURT, aggression: 0 };
}

function aggressive(aggression: number, ...spoofs: SpoofView[]): ScrumView {
  return { ...scrumOf(...spoofs), aggression };
}

describe('visionRadius', () => {
  it('reaches from the spoof edge out to 144 more at vision 100', () => {
    expect(visionRadius(spoof('a', 'home', vec(0, 0), { vision: 100 }))).toBe(
      15 + MAX_VISION_RANGE,
    );
    expect(visionRadius(spoof('a', 'home', vec(0, 0), { vision: 50 }))).toBe(15 + 72);
  });
});

describe('lookSpacing', () => {
  it('looks more finely with higher iq', () => {
    expect(lookSpacing(spoof('a', 'home', vec(0, 0), { iq: 95 }))).toBeLessThan(
      lookSpacing(spoof('a', 'home', vec(0, 0), { iq: 10 })),
    );
  });
});

describe('spotValue', () => {
  const me = spoof('me', 'home', vec(0, 0));

  it("is the spot's zone multiplier when it would be alone there", () => {
    expect(spotValue(me, vec(0, 0), scrumOf(me))).toBe(3);
    expect(spotValue(me, vec(60, 0), scrumOf(me))).toBe(1);
    expect(spotValue(me, vec(130, 0), scrumOf(me))).toBe(0);
  });

  it('multiplies by one plus each teammate covering the spot, the overlap bonus', () => {
    const mate = spoof('m', 'home', vec(60, 0));
    const mate2 = spoof('m2', 'home', vec(65, 0));
    expect(spotValue(me, vec(60, 0), scrumOf(me, mate))).toBe(2);
    expect(spotValue(me, vec(62, 0), scrumOf(me, mate, mate2))).toBe(3);
  });

  it('does not count opponents covering the spot', () => {
    const rival = spoof('r', 'visitor', vec(60, 0));
    expect(spotValue(me, vec(60, 0), scrumOf(me, rival))).toBe(1);
  });
});

describe('opponentsAt', () => {
  it('counts opponents covering a spot, not teammates', () => {
    const me = spoof('me', 'home', vec(0, 0));
    const scrum = scrumOf(
      me,
      spoof('r1', 'visitor', vec(50, 0)),
      spoof('r2', 'visitor', vec(55, 5)),
      spoof('m', 'home', vec(52, 0)),
    );
    expect(opponentsAt(me, vec(52, 2), scrum)).toBe(2);
  });
});

describe('surveySpots', () => {
  it('keeps every spot within vision and on the court', () => {
    const me = spoof('me', 'home', vec(0, 120), { vision: 90 });
    const spots = surveySpots(me);
    expect(spots.length).toBeGreaterThan(50);
    for (const s of spots) {
      expect(distance(s, me.position)).toBeLessThanOrEqual(visionRadius(me));
      expect(length(s)).toBeLessThanOrEqual(COURT_RADIUS);
    }
  });
});

describe('spoofBrain', () => {
  const random = () => createRandom(TEST_SEED);

  it('heads for the crush when it can see it from the mosh', () => {
    const me = spoof('me', 'home', vec(60, 0), { vision: 80, iq: 80 });
    const goal = spoofBrain(me, scrumOf(me), random(), null);
    expect(goal.kind).toBe('goto');
    expect(zoneAt(goal.point.x, goal.point.y)).toBe('crush');
    expect(goal.expires).toBeNull();
  });

  it('heads for a teammate in the mosh over an empty mosh spot, for the overlap bonus', () => {
    const me = spoof('me', 'home', vec(-70, 0), { vision: 30 });
    const mate = spoof('m', 'home', vec(-50, 0), {}, 20);
    const goal = spoofBrain(me, scrumOf(me, mate), random(), null);
    expect(distance(goal.point, mate.position)).toBeLessThanOrEqual(mate.radius);
  });

  it('holds its spot when nothing it can see beats where it is', () => {
    const me = spoof('me', 'home', vec(0, 0), { vision: 40 });
    const goal = spoofBrain(me, scrumOf(me), random(), null);
    expect(goal.kind).toBe('hold');
    expect(goal.point).toEqual(me.position);
  });

  it('charges a spot crowded with 2 or more opponents', () => {
    // Both opponents are big enough to cover the whole crush, the best spot it sees.
    const me = spoof('me', 'home', vec(60, 0), { vision: 80, iq: 99 });
    const scrum = scrumOf(
      me,
      spoof('r1', 'visitor', vec(0, 0), {}, 30),
      spoof('r2', 'visitor', vec(2, 2), {}, 30),
    );
    const goal = spoofBrain(me, scrum, random(), null);
    expect(goal.kind).toBe('crash');
    expect(goal.expires).toBe(CRASH_SECONDS);
  });

  it('charges only at 2 or more opponents: a best spot with 1 is an ordinary goal', () => {
    const me = spoof('me', 'home', vec(60, 0), { vision: 80, iq: 99 });
    const scrum = scrumOf(me, spoof('r1', 'visitor', vec(0, 0), {}, 30));
    expect(spoofBrain(me, scrum, random(), null).kind).toBe('goto');
  });

  describe('misjudging by smarts', () => {
    // From (12, -60) in the mosh, two crush spots are in sight about 3.7% apart
    // in appeal. Smarts comes from iq and vision (comps): iq 1 gives smarts 21,
    // misjudging by up to ±7.9%; iq 99 gives 86, at most ±1.4%.
    const shortfall = (iq: number) => {
      const me = spoof('me', 'home', vec(12, -60), { vision: 60, iq });
      const scrum = scrumOf(me);
      const best = Math.max(...surveySpots(me).map((s) => spotAppeal(me, s, scrum)));
      const shortfalls: number[] = [];
      for (let seed = 0; seed < 60; seed += 1) {
        const goal = spoofBrain(me, scrum, createRandom(seed), null);
        shortfalls.push(1 - spotAppeal(me, goal.point, scrum) / best);
      }
      return shortfalls;
    };

    it('sometimes picks a less appealing spot with low smarts', () => {
      expect(shortfall(1).some((s) => s > 0.03)).toBe(true);
    });

    it('picks the most appealing spot, or within a hair of it, with high smarts', () => {
      for (const s of shortfall(99)) expect(s).toBeLessThan(0.03);
    });
  });

  it('gropes toward the center when it can see nothing of value', () => {
    const me = spoof('me', 'home', vec(0, 140), { vision: 1 }, 10);
    const goal = spoofBrain(me, scrumOf(me), random(), null);
    expect(goal.kind).toBe('goto');
    expect(length(goal.point)).toBeLessThan(length(me.position));
  });
});

describe('re-valuing the current goal', () => {
  const random = () => createRandom(TEST_SEED);

  it('values a goal on the court as it is now', () => {
    const me = spoof('me', 'home', vec(60, 0));
    const goal = { kind: 'goto' as const, point: vec(0, 0), weight: 1, expires: null };
    expect(currentValue(me, goal, scrumOf(me))).toBe(3);
  });

  it("weights a teammate's suggestion by its persuasion", () => {
    const me = spoof('me', 'home', vec(60, 0));
    const followed = { kind: 'goto' as const, point: vec(60, 0), weight: 1.5, expires: null };
    expect(currentValue(me, followed, scrumOf(me))).toBe(1.5);
  });

  it('keeps a goal that is still worth as much as anything it sees', () => {
    const me = spoof('me', 'home', vec(60, 0), { vision: 80 });
    const current = { kind: 'goto' as const, point: vec(0, 0), weight: 1, expires: null };
    expect(spoofBrain(me, scrumOf(me), random(), current)).toBe(current);
  });

  it('leaves a hold whose teammates have gone, for a better spot it can see', () => {
    // It was holding a mosh spot shared with a teammate. The teammate has
    // left, so the spot is worth ×1 again, and the crush (×3) is in sight.
    const me = spoof('me', 'home', vec(40, 0), { vision: 80 });
    const holding = { kind: 'hold' as const, point: vec(40, 0), weight: 1, expires: null };
    const next = spoofBrain(me, scrumOf(me), random(), holding);
    expect(next).not.toBe(holding);
    expect(zoneAt(next.point.x, next.point.y)).toBe('crush');
  });
});

describe('messages', () => {
  it('are sent more often by a leader: charisma, impact and iq', () => {
    const leader = spoof('l', 'home', vec(0, 0), { charisma: 95, impact: 95, iq: 90 });
    const follower = spoof('f', 'home', vec(0, 0), { charisma: 10, impact: 10, iq: 10 });
    expect(leadership(leader)).toBeGreaterThan(leadership(follower));
    expect(messageProbability(leader, 0)).toBeGreaterThan(messageProbability(follower, 0));
  });

  it("are followed with twice the sender's charisma times the receiver's cooperation", () => {
    expect(heedProbability(50, 50)).toBeCloseTo(0.5);
    expect(heedProbability(90, 90)).toBe(1);
    expect(heedProbability(10, 20)).toBeCloseTo(0.04);
  });

  it('take up to half a second to arrive, quicker with more burst', () => {
    expect(messageDelayFrames(0)).toBe(Math.ceil(0.5 / SECONDS_PER_FRAME));
    expect(messageDelayFrames(90)).toBeLessThan(messageDelayFrames(10));
    expect(messageDelayFrames(100)).toBe(1);
  });

  it("persuade by the sender's charisma: up to 1.5 times a goal's value", () => {
    expect(persuasion(100)).toBeCloseTo(1.5);
    expect(persuasion(50)).toBeCloseTo(0.75);
  });
});

describe('attacking (#51)', () => {
  const random = () => createRandom(TEST_SEED);

  describe('appetite', () => {
    it('is the level times twice how far the temperament is above 0.7', () => {
      const hot = spoof('h', 'home', vec(0, 0), {}, 15, 1.5);
      expect(appetite(hot, aggressive(0.8, hot))).toBeCloseTo(0.8 * 2 * (1.5 - 0.7));
    });

    it('is 0 at the neutral temperament, 0.7: neither drawn to opponents nor shy of them', () => {
      const neutral = spoof('n', 'home', vec(0, 0), {}, 15, SHY_BELOW);
      expect(appetite(neutral, aggressive(1, neutral))).toBe(0);
    });

    it('is negative for a calm spoof: it is shy of opponents', () => {
      const calm = spoof('c', 'home', vec(0, 0), {}, 15, 0.3);
      expect(appetite(calm, aggressive(1, calm))).toBeLessThan(0);
    });
  });

  describe('spotValue', () => {
    it('adds the pull of an opponent on the spot: appetite × zone for each one', () => {
      const me = spoof('me', 'home', vec(60, 0), {}, 15, 1.5);
      const scrum = aggressive(0.5, me, spoof('r', 'visitor', vec(60, 0)));
      expect(spotValue(me, vec(60, 0), scrum)).toBeCloseTo(1 + appetite(me, scrum) * 1);
      const inCrush = aggressive(0.5, me, spoof('r2', 'visitor', vec(0, 0)));
      expect(spotValue(me, vec(0, 0), inCrush)).toBeCloseTo(3 + appetite(me, inCrush) * 3);
    });

    it('makes a shy spoof value a spot less when an opponent is on it', () => {
      const shy = spoof('s', 'home', vec(60, 0), {}, 15, 0.3);
      const empty = aggressive(1, shy);
      const taken = aggressive(1, shy, spoof('r', 'visitor', vec(60, 0)));
      expect(spotValue(shy, vec(60, 0), taken)).toBeLessThan(spotValue(shy, vec(60, 0), empty));
    });

    it('ignores opponents when there is no aggression, as before #51', () => {
      const me = spoof('me', 'home', vec(60, 0));
      expect(spotValue(me, vec(60, 0), scrumOf(me, spoof('r', 'visitor', vec(60, 0))))).toBe(1);
    });
  });

  describe('charges', () => {
    const rival = spoof('r', 'visitor', vec(60, 0));

    it('charges a single opponent when the spoof is hot enough', () => {
      const hot = spoof('h', 'home', vec(0, 60), {}, 15, 1.5);
      expect(charges(hot, vec(60, 0), aggressive(1, hot, rival))).toBe(true);
    });

    it('does not charge a single opponent when the spoof is calm', () => {
      const calm = spoof('c', 'home', vec(0, 60), {}, 15, 0.3);
      expect(charges(calm, vec(60, 0), aggressive(1, calm, rival))).toBe(false);
    });

    it('never charges when shy, not even a crowd of 2', () => {
      const shy = spoof('c', 'home', vec(0, 60), {}, 15, 0.3);
      const second = spoof('r2', 'visitor', vec(62, 2));
      expect(charges(shy, vec(61, 1), aggressive(1, shy, rival, second))).toBe(false);
    });

    it('charges a crowd of 2 at the neutral temperament, as in the prototype', () => {
      const neutral = spoof('n', 'home', vec(0, 60), {}, 15, SHY_BELOW);
      const second = spoof('r2', 'visitor', vec(62, 2));
      expect(charges(neutral, vec(61, 1), aggressive(1, neutral, rival, second))).toBe(true);
    });
  });

  describe('spoofBrain', () => {
    it('sends a hot spoof after an opponent in the mosh rather than an empty spot', () => {
      const hot = spoof('h', 'home', vec(-60, 0), { vision: 40 }, 15, 1.8);
      const rival = spoof('r', 'visitor', vec(-40, 30), {}, 20);
      const goal = spoofBrain(hot, aggressive(1.5, hot, rival), random(), null);
      expect(goal.kind).toBe('crash');
      expect(distance(goal.point, rival.position)).toBeLessThanOrEqual(rival.radius);
    });

    it('leaves a calm spoof uninterested in the same opponent', () => {
      const calm = spoof('c', 'home', vec(-60, 0), { vision: 40 }, 15, 0.2);
      const rival = spoof('r', 'visitor', vec(-40, 30), {}, 20);
      const goal = spoofBrain(calm, aggressive(0.5, calm, rival), random(), null);
      expect(goal.kind).not.toBe('crash');
    });
  });

  describe('on a court with a smaller mosh', () => {
    const small = courtWithMosh(70);

    it('surveys only spots on that court', () => {
      const me = spoof('me', 'home', vec(0, 100), { vision: 90 });
      for (const s of surveySpots(me, small)) expect(length(s)).toBeLessThanOrEqual(120);
    });

    it("values a spot by that court's zones: radius 80 is apron there", () => {
      const me = spoof('me', 'home', vec(0, 80));
      expect(spotValue(me, vec(0, 80), { ...scrumOf(me), court: small })).toBe(0);
    });
  });
});
