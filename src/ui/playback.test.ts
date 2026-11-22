import { describe, expect, it } from 'vitest';
import { createRandom } from '../game/random';
import { liveScores } from '../game/scoring';
import { simulateScrum } from '../game/scrum';
import { SCRUM_SECONDS, SECONDS_PER_FRAME } from '../game/spoof-motion';
import { TEST_SEED } from '../test-support/random';
import { presetScrumEntries } from '../test-support/scrum';
import { advance, frameAt, isOver, scoresAt, startFrame } from './playback';

const entries = presetScrumEntries();
const result = simulateScrum(entries, { random: createRandom(TEST_SEED) });
const frames = [startFrame(entries), ...result.frames];

describe('startFrame', () => {
  it('puts every spoof where it was placed, with the full clock', () => {
    const start = startFrame(entries);
    expect(start.clock).toBe(SCRUM_SECONDS);
    expect(start.spoofs.map((s) => [s.x, s.y])).toEqual(
      entries.map((e) => [e.position.x, e.position.y]),
    );
  });

  it('carries each spoof in with the fatigue it already has', () => {
    const tired = entries.map((e, i) => ({ ...e, fatigue: 10 + i }));
    expect(startFrame(tired).spoofs.map((s) => s.fatigue)).toEqual(tired.map((e) => e.fatigue));
  });
});

describe('frameAt', () => {
  it('shows the start at 0 seconds', () => {
    expect(frameAt(frames, 0)).toEqual(frames[0]);
  });

  it('shows a simulated frame exactly at its time', () => {
    expect(frameAt(frames, 10 * SECONDS_PER_FRAME)).toEqual(frames[10]);
  });

  it('blends halfway between two simulated frames', () => {
    const mid = frameAt(frames, 10.5 * SECONDS_PER_FRAME);
    const a = frames[10]?.spoofs[0];
    const b = frames[11]?.spoofs[0];
    if (!a || !b) throw new Error('missing frames');
    expect(mid.spoofs[0]?.x).toBeCloseTo((a.x + b.x) / 2);
    expect(mid.spoofs[0]?.radius).toBeCloseTo((a.radius + b.radius) / 2);
  });

  it('holds the last frame after the scrum ends', () => {
    expect(frameAt(frames, SCRUM_SECONDS + 3)).toEqual(frames[frames.length - 1]);
  });

  it('holds the first frame before it starts', () => {
    expect(frameAt(frames, -1)).toEqual(frames[0]);
  });

  describe('when fatigue changes between two frames', () => {
    // Fatigue is a count, so it steps to the new value only at the next frame.
    const tired = (fatigue: number) => ({
      clock: 0,
      spoofs: [{ id: 'a', team: 'home', x: 0, y: 0, radius: 15, fatigue }],
    });
    const pair = [tired(2), tired(3)];

    it('keeps the earlier fatigue while blending', () => {
      expect(frameAt(pair, 0.9 * SECONDS_PER_FRAME).spoofs[0]?.fatigue).toBe(2);
    });

    it('takes the new fatigue at the next frame', () => {
      expect(frameAt(pair, SECONDS_PER_FRAME).spoofs[0]?.fatigue).toBe(3);
    });
  });
});

describe('scoresAt', () => {
  const live = liveScores(result.frames);

  it('shows the scoreboard of the last simulated frame reached', () => {
    expect(scoresAt(live, 10.5 * SECONDS_PER_FRAME)).toBe(live[9]);
  });

  it('shows the final scoreboard at the end', () => {
    expect(scoresAt(live, SCRUM_SECONDS)).toBe(live[live.length - 1]);
  });
});

describe('advance', () => {
  it('moves the playback clock on by real time', () => {
    expect(advance(1, 0.5)).toBe(1.5);
  });

  it('stops at the end of the scrum, 8 seconds', () => {
    expect(advance(7.9, 0.5)).toBe(SCRUM_SECONDS);
  });

  it('ignores time going backwards', () => {
    expect(advance(2, -1)).toBe(2);
  });
});

describe('isOver', () => {
  it('is true at the end of the scrum', () => {
    expect(isOver(SCRUM_SECONDS)).toBe(true);
  });

  it('is false before it', () => {
    expect(isOver(SCRUM_SECONDS - 0.01)).toBe(false);
  });
});
