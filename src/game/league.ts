import { matchRandom } from './match';
import { createRandom } from './random';
import { minimumTotal, skillNames, typeProfiles } from './skills';
import type { SpoofType } from './spoof-types';
import type { TeamColorName } from '../design/tokens';
import { generateSpoof, type Spoof, type Team } from './teams';

/**
 * The league (#75): 7 computer teams your team plays, one drawn at random for
 * each match. They're ordered by the days of the week, the weakest on Monday
 * and the strongest on Sunday (the owner, 2026-11-24, on #75), though no
 * screen shows a team's day or strength: you find out by playing it.
 *
 * A team's strength is its spoofs' hidden skills: each team has a level, in
 * skill points a skill, and every spoof's total is drawn close to it. The
 * league is plain data from fixed seeds, the same for every player and on
 * every visit. The quick start's Spoofs still play the Embers.
 */

/** How far a league spoof's total may stray from its team's level: 2 points a skill either way. */
const SPREAD_PER_SKILL = 2;

export interface LeagueTeamSpec {
  /** The day the team stands for, weakest first. Not shown on screen. */
  readonly day: string;
  readonly name: string;
  readonly color: TeamColorName;
  readonly logo: string;
  /** Skill points a skill, on average, for its spoofs: its strength. */
  readonly level: number;
  /** Its spoofs' types, at most 1 royal and 2 of each face type. */
  readonly types: readonly SpoofType[];
}

/**
 * The owner's 7 teams (2026-11-24, on #75), weakest first. The levels were
 * tuned by measurement (in the PR): a typical drafted team, about 48 a skill,
 * beats Monday's team 88% of the time, then 78, 71, 48, 42 and 36%, and
 * Sunday's 16%. A level isn't the whole of a team's strength: its types
 * matter too. Tuesday's two knights make it harder than Monday's pawns even
 * a level lower, and a rook's skills can't go below its type's minimum, which
 * lifts Monday's rook above its level.
 */
export const LEAGUE_SPECS: readonly LeagueTeamSpec[] = [
  {
    day: 'Monday',
    name: 'Sacramento Pawns',
    color: 'pink',
    logo: '🍕',
    level: 41,
    types: ['pawn-basic', 'pawn-basic', 'pawn-noble', 'pawn-angry', 'rook'],
  },
  {
    day: 'Tuesday',
    name: 'Frisco Bros',
    color: 'gold',
    logo: '🐸',
    level: 40,
    types: ['knight', 'knight', 'bishop', 'pawn-basic', 'pawn-angry'],
  },
  {
    day: 'Wednesday',
    name: 'Middling Talents',
    color: 'teal',
    logo: '🐶',
    level: 46,
    types: ['rook', 'bishop', 'knight', 'pawn-noble', 'pawn-basic'],
  },
  {
    day: 'Thursday',
    name: 'Ohio Streamers',
    color: 'green',
    logo: '☄️',
    level: 47,
    types: ['queen', 'bishop', 'bishop', 'knight', 'pawn-basic'],
  },
  {
    day: 'Friday',
    name: 'Texas Muskrats',
    color: 'red',
    logo: '🍆',
    level: 49,
    types: ['king', 'rook', 'rook', 'knight', 'pawn-angry'],
  },
  {
    day: 'Saturday',
    name: 'Drag Queens',
    color: 'purple',
    logo: '👑',
    level: 51,
    types: ['queen', 'bishop', 'knight', 'rook', 'pawn-noble'],
  },
  {
    day: 'Sunday',
    name: 'Yosemite Goats',
    color: 'orange',
    logo: '⭐',
    level: 55,
    types: ['king', 'rook', 'bishop', 'knight', 'knight'],
  },
];

/** A league spoof's skills and name, from a fixed seed, near its team's level and within its type's limits. */
function leagueSpoof(
  id: string,
  type: SpoofType,
  level: number,
  seed: number,
  takenNames: readonly string[],
): Spoof {
  const random = createRandom(seed);
  const spread = SPREAD_PER_SKILL * skillNames.length;
  const drawn = level * skillNames.length + random.int(-spread, spread);
  const total = Math.min(Math.max(drawn, minimumTotal(type)), typeProfiles[type].maxTotal);
  return generateSpoof(id, type, total, random, takenNames);
}

/** A league team from its spec: its spoofs' seeds come from its place in the week. */
export function leagueTeam(spec: LeagueTeamSpec, index: number): Team {
  const spoofs: Spoof[] = [];
  spec.types.forEach((type, k) => {
    const id = `l${String(index + 1)}-${String(k + 1)}`;
    const seed = 7500 + index * 10 + k;
    spoofs.push(
      leagueSpoof(
        id,
        type,
        spec.level,
        seed,
        spoofs.map((s) => s.name),
      ),
    );
  });
  return { name: spec.name, color: spec.color, logo: spec.logo, spoofs };
}

/** The league's 7 teams, weakest (Monday's) first. */
export const LEAGUE: readonly Team[] = LEAGUE_SPECS.map(leagueTeam);

/**
 * The league team a match with this seed is against: drawn at random, each
 * equally likely, from the match's own seed, so a match replays exactly.
 */
export function leagueOpponent(seed: number): Team {
  const index = matchRandom({ seed }, 'opponent').int(0, LEAGUE.length - 1);
  const team = LEAGUE[index];
  if (!team) throw new Error('The league is empty');
  return team;
}
