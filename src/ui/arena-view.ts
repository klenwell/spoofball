import type { Bounds } from '../game/arena';

/** How the arena maps from court units onto a canvas: px = cx + x * scale. */
export interface ArenaView {
  scale: number;
  cx: number;
  cy: number;
}

/** Fits the arena inside a canvas of this CSS size, centered, keeping its proportions. */
export function fitArena(bounds: Bounds, width: number, height: number, padding = 8): ArenaView {
  const arenaWidth = bounds.maxX - bounds.minX;
  const arenaHeight = bounds.maxY - bounds.minY;
  const scale = Math.max(
    0,
    Math.min((width - padding * 2) / arenaWidth, (height - padding * 2) / arenaHeight),
  );
  return {
    scale,
    cx: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    cy: height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
  };
}

/** Canvas size (CSS px) for the arena at a given width, keeping its proportions. */
export function arenaHeightFor(bounds: Bounds, width: number, padding = 8): number {
  const ratio = (bounds.maxY - bounds.minY) / (bounds.maxX - bounds.minX);
  return Math.round((width - padding * 2) * ratio + padding * 2);
}
