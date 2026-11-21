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

  it('holds the last frame after the scrum ends, and the first before it starts', () => {
    expect(frameAt(frames, SCRUM_SECONDS + 3)).toEqual(frames[frames.length - 1]);
    expect(frameAt(frames, -1)).toEqual(frames[0]);
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

describe('advance and isOver', () => {
  it('moves the playback clock on by real time, stopping at 8 seconds', () => {
    expect(advance(1, 0.5)).toBe(1.5);
    expect(advance(7.9, 0.5)).toBe(SCRUM_SECONDS);
    expect(isOver(advance(7.9, 0.5))).toBe(true);
  });

  it('ignores time going backwards', () => {
    expect(advance(2, -1)).toBe(2);
  });
});
