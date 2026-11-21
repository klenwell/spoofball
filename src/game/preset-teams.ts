import type { Lineup, Team } from './teams';

/**
 * Two preset teams for the Match screen's static court (#22), until the
 * Expansion epic lets you build your own. The lineups show the moment a scrum
 * starts: each team has placed 3 spoofs on the court, following the mise
 * rule (at least 2 on the apron, at most 1 anywhere), and 3 wait on its bench.
 * Positions are in court units (court radius 150, y down).
 */

export const COMETS: Team = {
  name: 'Comets',
  color: 'blue',
  spoofs: [
    { id: 'c1', type: 'queen', radius: 18 },
    { id: 'c2', type: 'rook', radius: 17 },
    { id: 'c3', type: 'bishop', radius: 15 },
    { id: 'c4', type: 'pawn-basic', radius: 13 },
    { id: 'c5', type: 'pawn-noble', radius: 12 },
    { id: 'c6', type: 'pawn-angry', radius: 14 },
  ],
};

export const EMBERS: Team = {
  name: 'Embers',
  color: 'orange',
  spoofs: [
    { id: 'e1', type: 'king', radius: 19 },
    { id: 'e2', type: 'knight', radius: 16 },
    { id: 'e3', type: 'knight', radius: 15 },
    { id: 'e4', type: 'rook', radius: 14 },
    { id: 'e5', type: 'pawn-basic', radius: 12 },
    { id: 'e6', type: 'pawn-basic', radius: 13 },
  ],
};

/** Your team: home kit, bench below the court. */
export const PRESET_HOME: Lineup = {
  side: 'home',
  team: COMETS,
  spots: {
    c1: { x: -30, y: 25 }, // the queen: the one spoof placed anywhere, here in the mosh
    c2: { x: -95, y: 85 }, // apron
    c3: { x: 120, y: 50 }, // apron
    c4: { seat: 1 },
    c5: { seat: 3 },
    c6: { seat: 4 },
  },
};

/** The visitor: away kit, bench above the court. */
export const PRESET_VISITOR: Lineup = {
  side: 'visitor',
  team: EMBERS,
  spots: {
    e1: { x: 35, y: -40 }, // the king: placed anywhere, here in the mosh
    e2: { x: 70, y: -110 }, // apron
    e4: { x: -125, y: -30 }, // apron
    e3: { seat: 0 },
    e5: { seat: 2 },
    e6: { seat: 5 },
  },
};
