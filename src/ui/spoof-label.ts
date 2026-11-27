import type { DiscColors } from '../design/kits';
import { shownType, type MarkName, type SpoofType } from '../game/spoof-types';
import { createCanvas } from './canvas';
import { el } from './dom';
import { drawSpoofDisc } from './spoof-disc';

/**
 * A spoof as a row shows it: a small disc with its mark, and its name (#28,
 * #74). Shared by a scrum's result, the match scorecard and the Stats tab's
 * spoof lines (#92).
 */

/** A spoof's type as shown, capitalized: a pawn's subtype stays hidden (#18). */
export function shownTypeName(type: SpoofType): string {
  const name = shownType(type);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * A spoof's name. Its mark shows its type to the eye; a screen reader hears
 * the type after the name, since the mark is a picture it skips.
 */
export function spoofLabel(spoof: {
  readonly name: string;
  readonly type: SpoofType;
}): HTMLElement {
  const label = el('span', 'spoof-name', spoof.name);
  label.append(el('span', 'visually-hidden', `, ${shownTypeName(spoof.type).toLowerCase()}`));
  return label;
}

/** A spoof's disc with its mark, `size` CSS px square, hidden from screen readers. */
export function markDisc(
  mark: MarkName,
  kit: DiscColors,
  size: number,
  radius: number,
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(size, size);
  canvas.setAttribute('aria-hidden', 'true');
  drawSpoofDisc(ctx, { x: size / 2, y: size / 2, radius, mark, kit });
  return canvas;
}

/** What each mark is called, for screen readers and the picker (#74). */
export const MARK_LABELS: Readonly<Record<MarkName, string>> = {
  crown: 'crown',
  gem: 'gem',
  mallet: 'mallet',
  starburst: 'starburst',
  shield: 'shield',
  dot: 'dot',
  heart: 'heart',
  bolt: 'lightning bolt',
  infinity: 'infinity sign',
  anchor: 'anchor',
  bulb: 'light bulb',
  star: 'star',
  glove: 'boxing glove',
  diamond: 'diamond',
  club: 'club',
  spade: 'spade',
};
