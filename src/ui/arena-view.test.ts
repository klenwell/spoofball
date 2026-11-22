import { describe, expect, it } from 'vitest';
import { arenaHeightFor, courtPointAt, fitArena } from './arena-view';

const square = { minX: -100, maxX: 100, minY: -100, maxY: 100 };
const tall = { minX: -100, maxX: 100, minY: -150, maxY: 150 };

describe('fitArena', () => {
  it('centers the arena', () => {
    const view = fitArena(square, 400, 400, 0);
    expect(view).toEqual({ scale: 2, cx: 200, cy: 200 });
  });

  it('fits the tighter dimension, so nothing is cut off', () => {
    const view = fitArena(tall, 400, 300, 0);
    expect(view.scale).toBe(1); // height limits: 300 / 300
    expect(view.cx).toBe(200);
  });

  it('leaves the padding around the arena', () => {
    expect(fitArena(square, 220, 220, 10).scale).toBe(1);
  });

  it('centers an arena that is not centered on the origin', () => {
    const view = fitArena({ minX: 0, maxX: 100, minY: 0, maxY: 100 }, 100, 100, 0);
    expect(view).toEqual({ scale: 1, cx: 0, cy: 0 });
  });

  it('never returns a negative scale for a tiny canvas', () => {
    expect(fitArena(square, 4, 4, 8).scale).toBe(0);
  });
});

describe('arenaHeightFor', () => {
  it('keeps the arena proportions at a given width', () => {
    expect(arenaHeightFor(tall, 200, 0)).toBe(300);
    expect(arenaHeightFor(tall, 216, 8)).toBe(316);
  });
});

describe('courtPointAt', () => {
  it('turns a point on the canvas back into court units', () => {
    const view = { scale: 2, cx: 200, cy: 150 };
    expect(courtPointAt(view, 200, 150)).toEqual({ x: 0, y: 0 });
    expect(courtPointAt(view, 260, 110)).toEqual({ x: 30, y: -20 });
  });
});
