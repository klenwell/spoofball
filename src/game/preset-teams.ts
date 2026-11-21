import { createRandom } from './random';
import { skillNames } from './skills';
import type { SpoofType } from './spoof-types';
import { NEW_SPOOF_SKILL_TOTAL, generateSpoof, type Lineup, type Spoof, type Team } from './teams';

/**
 * Two preset teams for the Match screen's static court (#22), until the
 * Expansion epic lets you build your own. The lineups show the moment a scrum
 * starts: each team has placed 3 spoofs on the court, following the mise
 * rule (at least 2 on the apron, at most 1 anywhere), and 3 wait on its bench.
 * Positions are in court units (court radius 150, y down).
 */

/**
 * How far a preset spoof's skill total may stray from a new team's level:
 * up to 2 points a skill either way, so ±22. Chosen here so the presets vary
 * a little but stay close in strength. (The prototype varied new spoofs
 * differently, by sharing out a team-wide pool: `distribute_team_points`.)
 */
const PRESET_SPREAD_PER_SKILL = 2;
const PRESET_TOTAL_SPREAD = PRESET_SPREAD_PER_SKILL * skillNames.length;

/**
 * Each preset spoof's hidden skills come from the generator with a fixed seed
 * (#35), so they're the same on every load and in every test.
 */
function presetSpoof(id: string, type: SpoofType, seed: number): Spoof {
  const random = createRandom(seed);
  const total = NEW_SPOOF_SKILL_TOTAL + random.int(-PRESET_TOTAL_SPREAD, PRESET_TOTAL_SPREAD);
  return generateSpoof(id, type, total, random);
}

export const COMETS: Team = {
  name: 'Comets',
  color: 'blue',
  spoofs: [
    presetSpoof('c1', 'queen', 101),
    presetSpoof('c2', 'rook', 102),
    presetSpoof('c3', 'bishop', 103),
    presetSpoof('c4', 'pawn-basic', 104),
    presetSpoof('c5', 'pawn-noble', 105),
    presetSpoof('c6', 'pawn-angry', 106),
  ],
};

export const EMBERS: Team = {
  name: 'Embers',
  color: 'orange',
  spoofs: [
    presetSpoof('e1', 'king', 201),
    presetSpoof('e2', 'knight', 202),
    presetSpoof('e3', 'knight', 203),
    presetSpoof('e4', 'rook', 204),
    presetSpoof('e5', 'pawn-basic', 205),
    presetSpoof('e6', 'pawn-basic', 206),
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
