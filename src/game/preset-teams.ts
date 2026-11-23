import { createRandom } from './random';
import { skillNames } from './skills';
import type { SpoofType } from './spoof-types';
import { NEW_SPOOF_SKILL_TOTAL, generateSpoof, type Lineup, type Spoof, type Team } from './teams';

/**
 * Two preset teams: the Spoofs, for a quick start (#71), and the Embers, the
 * opponent until the league (#75). Since #39 the Match screen places them with the mise; the
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
 * Each preset spoof's hidden skills and name come from the generator with a
 * fixed seed (#35, #28), so they're the same on every load and in every test.
 */
function presetSpoof(id: string, type: SpoofType, seed: number, takenNames: string[]): Spoof {
  const random = createRandom(seed);
  const total = NEW_SPOOF_SKILL_TOTAL + random.int(-PRESET_TOTAL_SPREAD, PRESET_TOTAL_SPREAD);
  return generateSpoof(id, type, total, random, takenNames);
}

/** A preset team's spoofs, in order, each named unlike the ones before it. */
function presetSpoofs(specs: readonly (readonly [string, SpoofType, number])[]): Spoof[] {
  const spoofs: Spoof[] = [];
  for (const [id, type, seed] of specs) {
    spoofs.push(
      presetSpoof(
        id,
        type,
        seed,
        spoofs.map((s) => s.name),
      ),
    );
  }
  return spoofs;
}

/** The Spoofs: the team you play as without creating your own (#71), the Comets until v0.2.0. */
export const SPOOFS: Team = {
  name: 'Spoofs',
  color: 'blue',
  logo: '👻',
  spoofs: presetSpoofs([
    ['c1', 'queen', 101],
    ['c2', 'rook', 102],
    ['c3', 'bishop', 103],
    ['c4', 'pawn-basic', 104],
    ['c5', 'pawn-noble', 105],
  ]),
};

export const EMBERS: Team = {
  name: 'Embers',
  color: 'orange',
  logo: '🔥',
  spoofs: presetSpoofs([
    ['e1', 'king', 201],
    ['e2', 'knight', 202],
    ['e3', 'knight', 203],
    ['e4', 'rook', 204],
    ['e5', 'pawn-basic', 205],
  ]),
};

/** Your team: home kit, bench below the court. */
export const PRESET_HOME: Lineup = {
  side: 'home',
  team: SPOOFS,
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
