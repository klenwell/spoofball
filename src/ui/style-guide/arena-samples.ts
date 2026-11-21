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
// the zones. Positions are in court units (court radius 150).
export const SAMPLES: Sample[] = [
  { side: 'visitor', type: 'knight', radius: 15, at: 0 },
  { side: 'visitor', type: 'pawn-basic', radius: 12, at: 3 },
  { side: 'visitor', type: 'bishop', radius: 16, at: 5 },
  { side: 'visitor', type: 'rook', radius: 18, at: { x: -122, y: -42 } },
  { side: 'visitor', type: 'pawn-angry', radius: 13, at: { x: 92, y: -100 } },
  { side: 'visitor', type: 'queen', radius: 17, at: { x: 42, y: -48 } },
  { side: 'home', type: 'rook', radius: 16, at: 1 },
  { side: 'home', type: 'pawn-noble', radius: 12, at: 2 },
  { side: 'home', type: 'queen', radius: 15, at: 4 },
  { side: 'home', type: 'bishop', radius: 15, at: { x: -80, y: 100 } },
  { side: 'home', type: 'king', radius: 19, at: { x: -48, y: 36 } },
  { side: 'home', type: 'knight', radius: 14, at: { x: 6, y: 4 } },
];
