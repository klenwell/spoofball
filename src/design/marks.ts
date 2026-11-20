import type { Avatar } from '../game/spoof-types';

/**
 * Avatar marks: one per avatar (pawn subtypes share the pawn's), defined in disc-relative units where the
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

/** Spokes radiating from the center, starting straight up, as separate strokes. */
function asteriskSpokes(count: number, inner: number, outer: number): MarkShape[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = ((Math.PI * 2) / count) * i - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      kind: 'line' as const,
      width: STROKE,
      points: [
        [inner * cos, inner * sin],
        [outer * cos, outer * sin],
      ] as const,
    };
  });
}
export const marks: Record<Avatar, readonly MarkShape[]> = {
  // A four-point star.
  king: [{ kind: 'polygon', points: star(4, 0.46, 0.17) }],
  // An asterisk: six spokes around a center dot.
  queen: [...asteriskSpokes(6, 0.1, 0.42), { kind: 'circle', cx: 0, cy: 0, r: 0.11 }],
  // A square.
  rook: [
    {
      kind: 'polygon',
      points: [
        [-0.29, -0.29],
        [0.29, -0.29],
        [0.29, 0.29],
        [-0.29, 0.29],
      ],
    },
  ],
  // A diamond, taller than wide.
  bishop: [
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
  // A chevron pointing up.
  knight: [
    {
      kind: 'line',
      width: STROKE,
      points: [
        [-0.3, 0.17],
        [0, -0.17],
        [0.3, 0.17],
      ],
    },
  ],
  // A dot. Every pawn, whatever its hidden subtype.
  pawn: [{ kind: 'circle', cx: 0, cy: 0, r: 0.17 }],
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
