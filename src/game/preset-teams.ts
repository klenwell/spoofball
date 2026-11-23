import { createRandom } from './random';
import { skillNames } from './skills';
import type { SpoofType } from './spoof-types';
import { NEW_SPOOF_SKILL_TOTAL, generateSpoof, type Lineup, type Spoof, type Team } from './teams';

/**
 * Two preset teams for the Match screen, until the Draft (New Team) epic lets you
 * build your own. Since #39 the Match screen places them with the mise; the
 * fixed lineups here are a ready-made scrum for tests (presetScrumEntries):
 * each team has 3 spoofs on the court, following the mise rule (at least 2 on
 * the apron, at most 1 anywhere), and 2 on its bench.
 * Positions are in court units (court radius 130, y down). They were moved
 * onto the smaller mosh with `fitToCourt` when the owner picked it on #51.
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
  logo: '☄️',
  spoofs: [
    presetSpoof('c1', 'queen', 101),
    presetSpoof('c2', 'rook', 102),
    presetSpoof('c3', 'bishop', 103),
    presetSpoof('c4', 'pawn-basic', 104),
    presetSpoof('c5', 'pawn-noble', 105),
  ],
};

export const EMBERS: Team = {
  name: 'Embers',
  color: 'orange',
  logo: '🔥',
  spoofs: [
    presetSpoof('e1', 'king', 201),
    presetSpoof('e2', 'knight', 202),
    presetSpoof('e3', 'knight', 203),
    presetSpoof('e4', 'rook', 204),
    presetSpoof('e5', 'pawn-basic', 205),
  ],
};

/** Your team: home kit, bench below the court. */
export const PRESET_HOME: Lineup = {
  side: 'home',
  team: COMETS,
  spots: {
    c1: { x: -27, y: 23 }, // the queen: the one spoof placed anywhere, here in the mosh
    c2: { x: -80, y: 72 }, // apron
    c3: { x: 102, y: 42 }, // apron
    c4: { seat: 1 },
    c5: { seat: 3 },
  },
};

/** The visitor: away kit, bench above the court. */
export const PRESET_VISITOR: Lineup = {
  side: 'visitor',
  team: EMBERS,
  spots: {
    e1: { x: 30, y: -34 }, // the king: placed anywhere, here in the mosh
    e2: { x: 59, y: -93 }, // apron
    e4: { x: -106, y: -25 }, // apron
    e3: { seat: 1 },
    e5: { seat: 3 },
  },
};
