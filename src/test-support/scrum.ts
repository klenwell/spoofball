import { PRESET_HOME, PRESET_VISITOR } from '../game/preset-teams';
import type { ScrumEntry } from '../game/scrum';
import { lineupEntries } from '../game/teams';

export { lineupEntries };

/** The two preset teams' 6 placed spoofs, as a scrum starts. */
export function presetScrumEntries(): ScrumEntry[] {
  return [...lineupEntries(PRESET_HOME), ...lineupEntries(PRESET_VISITOR)];
}
