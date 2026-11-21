import { describe, expect, it } from 'vitest';
import { TEST_SEED, sequenceRandom } from '../test-support/random';
import { COURT_RADIUS } from './court';
import { createRandom } from './random';
import { skillNames, type Skills } from './skills';
import {
  FRAMES_PER_SCRUM,
  MAX_BLOW_RADIUS,
  MAX_SPEED,
  SECONDS_PER_FRAME,
  blowRate,
  burstSpeed,
  fade,
  fatigueProbability,
  grace,
  keepOnCourt,
  limitSpeed,
  skid,
  steerToward,
  thoughtProbability,
} from './spoof-motion';
import { angle, length, vec } from './vec';

function skills(overrides: Partial<Skills> = {}): Skills {
  return { ...(Object.fromEntries(skillNames.map((n) => [n, 50])) as Skills), ...overrides };
}

describe('burstSpeed', () => {
  it('is the burst share of the top speed', () => {
    expect(burstSpeed(skills({ burst: 50 }))).toBeCloseTo(MAX_SPEED / 2);
  });

  it('crosses the court quickly: burst 50 covers 250 court units a second', () => {
    expect(burstSpeed(skills({ burst: 50 })) / SECONDS_PER_FRAME).toBeCloseTo(250);
  });
});

describe('thoughtProbability', () => {
  const perSecond = (s: Skills, secondsGone = 0) =>
    thoughtProbability(s, secondsGone) / SECONDS_PER_FRAME;

  it("follows the prototype's curve: about 0.4 thoughts a second at iq 1, 1 at iq 50, 4 at iq 99", () => {
    const calm = { impact: 1, constancy: 1 };
    expect(perSecond(skills({ iq: 1, ...calm }))).toBeCloseTo(0.4, 1);
    expect(perSecond(skills({ iq: 50, ...calm }))).toBeCloseTo(1, 1);
    expect(perSecond(skills({ iq: 99, ...calm }))).toBeCloseTo(4, 0);
  });

  it('rises as the clock runs down, more with high impact and constancy', () => {
    const clutch = skills({ impact: 99, constancy: 99 });
    const calm = skills({ impact: 1, constancy: 1 });
    expect(perSecond(clutch, 8)).toBeGreaterThan(perSecond(clutch, 0) * 1.6);
    expect(perSecond(calm, 8)).toBeLessThan(perSecond(calm, 0) * 1.01);
  });
});

describe('fatigueProbability', () => {
  const perScrum = (stamina: number) => fatigueProbability(skills({ stamina })) * FRAMES_PER_SCRUM;

  it('tires a spoof about 20 times a scrum on average, fewer with more stamina', () => {
    expect(perScrum(1)).toBeCloseTo(39.7, 0);
    expect(perScrum(67)).toBeCloseTo(19.9, 0);
    expect(perScrum(99)).toBeCloseTo(10.3, 0);
  });
});

describe('blowRate', () => {
  it('grows a spoof by its growth skill as a percentage over a whole scrum of blowing', () => {
    const rate = blowRate(16, 50);
    expect(16 * (1 + rate) ** FRAMES_PER_SCRUM).toBeCloseTo(24);
  });

  it('never grows a spoof past the largest size', () => {
    const rate = blowRate(30, 99);
    expect(30 * (1 + rate) ** FRAMES_PER_SCRUM).toBeCloseTo(MAX_BLOW_RADIUS);
  });

  describe('when the spoof is already at the largest size', () => {
    it('is 0', () => {
      expect(blowRate(MAX_BLOW_RADIUS, 80)).toBe(0);
    });
  });
});

describe('steerToward', () => {
  it('points the velocity at the target at the given speed', () => {
    const v = steerToward(vec(0, 0), vec(30, 40), 5);
    expect(v.x).toBeCloseTo(3);
    expect(v.y).toBeCloseTo(4);
  });

  describe('when the spoof is already at the target', () => {
    it('stops', () => {
      expect(steerToward(vec(5, 5), vec(5, 5), 5)).toEqual(vec(0, 0));
    });
  });
});

describe('skid', () => {
  it('keeps a share of the speed', () => {
    // grace 50: keep 1–50% of the speed, turn up to ±50°. Draws: keep 50%, turn 0°.
    const random = sequenceRandom([0.99, 0.5]);
    const after = skid(vec(10, 0), skills(), random);
    expect(length(after)).toBeCloseTo(5);
    expect(after.y).toBeCloseTo(0);
  });

  it('turns by up to 100 − grace degrees', () => {
    // grace 50. Draws: keep 50%, then the sharpest turn one way, −50°.
    const after = skid(vec(10, 0), skills(), sequenceRandom([0.99, 0]));
    expect(angle(after)).toBeCloseTo((-50 * Math.PI) / 180);
  });

  // In the prototype a graceful spoof stops sharply, and a clumsy one drifts
  // on with more of its speed (it keeps up to 100 − grace percent).
  it('lets a clumsy spoof drift on with more of its speed than a graceful one, on average', () => {
    const random = createRandom(TEST_SEED);
    const averageKept = (s: Skills) => {
      let kept = 0;
      for (let i = 0; i < 500; i += 1) kept += length(skid(vec(10, 0), s, random));
      return kept / 500;
    };
    const graceful = skills({ burst: 95, constancy: 95, stamina: 95 });
    const clumsy = skills({ burst: 10, constancy: 10, stamina: 10 });
    expect(grace(graceful)).toBeGreaterThan(grace(clumsy));
    expect(averageKept(clumsy)).toBeGreaterThan(averageKept(graceful));
  });

  it('turns a clumsy spoof more than a graceful one, on average', () => {
    const random = createRandom(TEST_SEED);
    const averageTurn = (s: Skills) => {
      let total = 0;
      for (let i = 0; i < 500; i += 1) total += Math.abs(angle(skid(vec(10, 0), s, random)));
      return total / 500;
    };
    const graceful = skills({ burst: 95, constancy: 95, stamina: 95 });
    const clumsy = skills({ burst: 10, constancy: 10, stamina: 10 });
    expect(averageTurn(clumsy)).toBeGreaterThan(averageTurn(graceful));
  });
});

describe('fade', () => {
  it('drops growth and burst by 2–4% and iq by 1–3%, and slows growing by the same share', () => {
    // Draws: growth 4%, burst 2%, iq 3%.
    const random = sequenceRandom([0.99, 0, 0.99]);
    const { skills: after, blowRate: rate } = fade({ ...skills() }, 0.01, random);
    expect(after.growth).toBeCloseTo(48);
    expect(after.burst).toBeCloseTo(49);
    expect(after.iq).toBeCloseTo(48.5);
    expect(rate).toBeCloseTo(0.0096);
    expect(after.mass).toBe(50);
  });

  it('never drops a skill below 1', () => {
    const random = createRandom(TEST_SEED);
    let state = { ...skills({ growth: 1, burst: 1, iq: 1 }) };
    for (let i = 0; i < 50; i += 1) state = fade(state, 0.01, random).skills;
    expect([state.growth, state.burst, state.iq]).toEqual([1, 1, 1]);
  });
});

describe('keepOnCourt', () => {
  it('leaves a spoof that is wholly on the court alone', () => {
    const v = vec(1, 1);
    expect(keepOnCourt(vec(10, 20), v, 15)).toEqual({ position: vec(10, 20), velocity: v });
  });

  describe('when a spoof crosses the edge moving outward', () => {
    const { position, velocity } = keepOnCourt(vec(140, 0), vec(4, 3), 20);

    it('moves it straight in until it is wholly on the court', () => {
      expect(position.x).toBeCloseTo(COURT_RADIUS - 20);
      expect(position.y).toBeCloseTo(0);
    });

    it('bounces it off the edge, keeping its speed along the edge', () => {
      expect(velocity.x).toBeCloseTo(-4);
      expect(velocity.y).toBeCloseTo(3);
    });
  });

  // The prototype moved a spoof back along its last move, so one that grew
  // past the edge while standing still stayed poking out of the court.
  describe('regression: a spoof that grew past the edge without moving', () => {
    it('is moved back inside', () => {
      const { position } = keepOnCourt(vec(0, -135), vec(0, 0), 20);
      expect(length(position) + 20).toBeCloseTo(COURT_RADIUS);
    });
  });
});

describe('limitSpeed', () => {
  it('caps the speed, keeping the direction', () => {
    const v = limitSpeed(vec(MAX_SPEED * 3, 0));
    expect(v.x).toBeCloseTo(MAX_SPEED);
    expect(v.y).toBe(0);
  });

  it('leaves a slower speed alone', () => {
    expect(limitSpeed(vec(1, 2))).toEqual(vec(1, 2));
  });
});
