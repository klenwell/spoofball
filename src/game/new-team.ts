import { MAX_TEAM_NAME_LENGTH, characterCount } from './teams';

/**
 * The create screen's name rule (#71), also used for renaming a spoof in the
 * combine (#72): both allow 16 characters. Until the combine, this module
 * also generated a new team's 5 spoofs, as the prototype's `Team.new` did;
 * the combine replaced that.
 */

/** What's wrong with a typed name: nothing left once trimmed, or too long. */
export type NameProblem = 'empty' | 'long';

/** The problem with a name as typed, or null. Spaces at either end don't count. */
export function teamNameProblem(name: string): NameProblem | null {
  const length = characterCount(name.trim());
  if (length === 0) return 'empty';
  if (length > MAX_TEAM_NAME_LENGTH) return 'long';
  return null;
}
