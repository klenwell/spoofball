import {
  isMatchOver,
  miseRandom,
  nextMise,
  playScrum,
  startMatch,
  type Match,
} from '../game/match';
import { computerMove, placeSpoof, whoseTurn, type MiseState } from '../game/mise';
import type { Team } from '../game/teams';

/** Places every spoof of a match's next mise with the computer's moves, for both teams. */
export function computerMise(match: Match): MiseState {
  let mise = nextMise(match);
  const random = miseRandom(match);
  for (let team = whoseTurn(mise); team; team = whoseTurn(mise)) {
    const move = computerMove(mise, team, match.teams[team].spoofs, random);
    mise = placeSpoof(mise, move.spoof, team, move.spot);
  }
  return mise;
}

/** A whole match from its seed, with the computer placing for both teams. */
export function computerMatch(home: Team, visitor: Team, seed: number): Match {
  let match = startMatch(home, visitor, seed);
  while (!isMatchOver(match)) match = playScrum(match, computerMise(match));
  return match;
}
