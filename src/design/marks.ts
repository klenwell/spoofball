import type { MarkName } from '../game/spoof-types';

/**
 * Marks: the shapes on a spoof's disc, 16 in all (#74), defined in disc-relative units where the
 * disc's radius is 1 and its center is (0, 0), with y pointing down. The
 * renderer scales them to any disc size, so a refined shape can replace a
 * definition here without touching the drawing code.
 *
 * Filled shapes use the kit's mark color. Stroked shapes (`ring`, `line`)
 * carry their own width, also in disc units.
 */

export type Point = readonly [number, number];

export type MarkShape =
  | { kind: 'polygon'; points: readonly Point[] }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ring'; cx: number; cy: number; r: number; width: number }
  | { kind: 'line'; points: readonly Point[]; width: number };

/** Marks must stay inside this radius, clear of the disc's trim. */
export const MARK_SAFE_RADIUS = 0.62;

function star(points: number, outer: number, inner: number): Point[] {
  const vertices: Point[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    vertices.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return vertices;
}

const STROKE = 0.13;

/** Turns points about the center by this many degrees, clockwise on screen. */
function turned(points: readonly Point[], degrees: number): Point[] {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return points.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
}

/** A rectangle's corners, from its top-left and bottom-right. */
function box(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** Points along an arc of a circle, from one angle to another (radians, y down). */
function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 12): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });
}

/** A figure-eight, sideways: the infinity sign. Drawn as one closed stroke. */
function lemniscate(width: number, height: number, steps = 32): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (Math.PI * 2 * i) / steps;
    const d = 1 + Math.sin(t) ** 2;
    return [(width * Math.cos(t)) / d, (height * 2 * Math.sin(t) * Math.cos(t)) / d];
  });
}

/** How far the glove leans clockwise, in degrees. */
const GLOVE_TILT = 12;

/** A circle's center, tilted with the glove. */
function at(x: number, y: number): { cx: number; cy: number } {
  const [[cx, cy]] = turned([[x, y]], GLOVE_TILT) as [Point];
  return { cx, cy };
}

/**
 * Every mark (#74). The first six are the shown types' defaults (crown for a
 * king, gem for a queen, mallet for a rook, starburst for a bishop, shield
 * for a knight, dot for every pawn). Diamond, club and spade keep the shapes
 * the bishop, rook and knight wore before #74.
 */
export const marks: Record<MarkName, readonly MarkShape[]> = {
  // A crown: a band with three points, the middle one tallest.
  crown: [
    {
      kind: 'polygon',
      points: [
        [-0.42, 0.3],
        [0.42, 0.3],
        [0.42, -0.24],
        [0.2, 0.02],
        [0, -0.34],
        [-0.2, 0.02],
        [-0.42, -0.24],
      ],
    },
  ],
  // A cut gem: a flat top, wide shoulders and a point below. Unlike the
  // diamond, which is pointed at both ends.
  gem: [
    {
      kind: 'polygon',
      points: [
        [-0.2, -0.32],
        [0.2, -0.32],
        [0.43, -0.08],
        [0, 0.42],
        [-0.43, -0.08],
      ],
    },
  ],
  // A mallet, tilted: a big block head on a handle.
  mallet: [
    { kind: 'polygon', points: turned(box(-0.36, -0.42, 0.36, -0.06), 40) },
    { kind: 'polygon', points: turned(box(-0.08, -0.08, 0.08, 0.47), 40) },
  ],
  // Many short points around a solid center, like ✸. Unlike the star's five long ones.
  starburst: [{ kind: 'polygon', points: star(12, 0.45, 0.3) }],
  // A shield: a flat top and a rounded point below.
  shield: [
    {
      kind: 'polygon',
      points: [
        [-0.36, -0.38],
        [0.36, -0.38],
        [0.36, 0.02],
        [0.31, 0.2],
        [0.17, 0.34],
        [0, 0.43],
        [-0.17, 0.34],
        [-0.31, 0.2],
        [-0.36, 0.02],
      ],
    },
  ],
  // A dot. Every pawn's, whatever its hidden subtype.
  dot: [{ kind: 'circle', cx: 0, cy: 0, r: 0.17 }],
  // A heart (♥): two lobes over a point.
  heart: [
    { kind: 'circle', cx: -0.17, cy: -0.12, r: 0.19 },
    { kind: 'circle', cx: 0.17, cy: -0.12, r: 0.19 },
    {
      kind: 'polygon',
      points: [
        [-0.355, -0.06],
        [0.355, -0.06],
        [0, 0.4],
      ],
    },
  ],
  // A lightning bolt.
  bolt: [
    {
      kind: 'polygon',
      points: [
        [0.14, -0.46],
        [-0.26, 0.07],
        [-0.02, 0.07],
        [-0.14, 0.46],
        [0.26, -0.09],
        [0.02, -0.09],
      ],
    },
  ],
  // The infinity sign (∞), stretched a little taller than a true one, to read when small.
  infinity: [{ kind: 'line', width: STROKE, points: lemniscate(0.44, 0.3) }],
  // An anchor: a ring, a shank with a stock across it, and curved arms.
  anchor: [
    { kind: 'ring', cx: 0, cy: -0.34, r: 0.08, width: 0.08 },
    {
      kind: 'line',
      width: STROKE,
      points: [
        [0, -0.26],
        [0, 0.4],
      ],
    },
    {
      kind: 'line',
      width: STROKE,
      points: [
        [-0.18, -0.13],
        [0.18, -0.13],
      ],
    },
    { kind: 'line', width: STROKE, points: arc(0, 0.06, 0.33, 0, Math.PI) },
  ],
  // A light bulb: a round glass on a narrow screw base.
  bulb: [
    { kind: 'circle', cx: 0, cy: -0.12, r: 0.28 },
    {
      kind: 'polygon',
      points: [
        [-0.17, 0.06],
        [0.17, 0.06],
        [0.13, 0.27],
        [-0.13, 0.27],
      ],
    },
    { kind: 'polygon', points: box(-0.11, 0.31, 0.11, 0.42) },
  ],
  // A five-point star.
  star: [{ kind: 'polygon', points: star(5, 0.47, 0.2) }],
  // A boxing glove, tilted a little clockwise (the owner, on #74): a tall
  // mitt, the thumb bulging on the left, and a wide cuff joined below. The
  // cuff is nearly as wide as the mitt, so it doesn't read as the bulb's
  // narrow base. It replaced a raised fist, which blurred when small.
  glove: [
    { kind: 'circle', ...at(0.06, -0.2), r: 0.27 },
    { kind: 'circle', ...at(0.06, -0.04), r: 0.27 },
    { kind: 'circle', ...at(-0.22, 0.02), r: 0.15 },
    { kind: 'polygon', points: turned(box(-0.2, 0.1, 0.3, 0.45), GLOVE_TILT) },
  ],
  // A diamond (♦), taller than wide. The bishop's mark before #74.
  diamond: [
    {
      kind: 'polygon',
      points: [
        [0, -0.44],
        [0.32, 0],
        [0, 0.44],
        [-0.32, 0],
      ],
    },
  ],
  // A club (♣): three lobes on a short stem. The rook's mark before #74.
  club: [
    { kind: 'circle', cx: 0, cy: -0.17, r: 0.155 },
    { kind: 'circle', cx: -0.165, cy: 0.06, r: 0.155 },
    { kind: 'circle', cx: 0.165, cy: 0.06, r: 0.155 },
    {
      kind: 'polygon',
      points: [
        [0, -0.02],
        [0.11, 0.38],
        [-0.11, 0.38],
      ],
    },
  ],
  // A spade (♠): a point, two rounded shoulders and a short stem. The knight's mark before #74.
  spade: [
    {
      kind: 'polygon',
      points: [
        [0, -0.42],
        [0.29, -0.06],
        [0, 0.12],
        [-0.29, -0.06],
      ],
    },
    { kind: 'circle', cx: -0.15, cy: 0.03, r: 0.155 },
    { kind: 'circle', cx: 0.15, cy: 0.03, r: 0.155 },
    {
      kind: 'polygon',
      points: [
        [0, 0.02],
        [0.11, 0.38],
        [-0.11, 0.38],
      ],
    },
  ],
};

/** The farthest any part of a shape reaches from the disc's center. */
export function shapeExtent(shape: MarkShape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.hypot(shape.cx, shape.cy) + shape.r;
    case 'ring':
      return Math.hypot(shape.cx, shape.cy) + shape.r + shape.width / 2;
    case 'polygon':
      return Math.max(...shape.points.map(([x, y]) => Math.hypot(x, y)));
    case 'line':
      return Math.max(...shape.points.map(([x, y]) => Math.hypot(x, y))) + shape.width / 2;
  }
}
