import type { BenchSide } from '../../game/arena';
import type { SpoofType } from '../../game/spoof-types';

export interface Sample {
  side: BenchSide;
  type: SpoofType;
  radius: number;
  /** A seat index on the team's bench, or a court position in court units. */
  at: number | { x: number; y: number };
}

// One match, a scrum in: some spoofs on the bench, the rest spread across
// the zones. Positions are in court units (court radius 130).
export const SAMPLES: Sample[] = [
  { side: 'visitor', type: 'knight', radius: 15, at: 0 },
  { side: 'visitor', type: 'bishop', radius: 16, at: 4 },
  { side: 'visitor', type: 'rook', radius: 18, at: { x: -103, y: -35 } },
  { side: 'visitor', type: 'pawn-angry', radius: 13, at: { x: 78, y: -85 } },
  { side: 'visitor', type: 'queen', radius: 17, at: { x: 35, y: -40 } },
  { side: 'home', type: 'rook', radius: 16, at: 1 },
  { side: 'home', type: 'queen', radius: 15, at: 4 },
  { side: 'home', type: 'bishop', radius: 15, at: { x: -68, y: 84 } },
  { side: 'home', type: 'king', radius: 19, at: { x: -41, y: 30 } },
  { side: 'home', type: 'knight', radius: 14, at: { x: 6, y: 4 } },
];
