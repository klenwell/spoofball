import { isMatchOver, miseRandom, nextMise, playScrum, startMatch, type Match } from './match';
import { computerMove, placeSpoof, whoseTurn, type MiseState } from './mise';
import type { Team } from './teams';

/**
 * Matches played by the computer for both teams: for tests, and for the
 * dev-only QA console (#117), which records them as play does. Moved here
 * from `src/test-support/` so the console doesn't import test code.
 */

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
