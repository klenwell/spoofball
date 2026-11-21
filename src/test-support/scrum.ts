import { PRESET_HOME, PRESET_VISITOR } from '../game/preset-teams';
import type { ScrumEntry } from '../game/scrum';
import type { Lineup } from '../game/teams';

/** The spoofs a lineup has placed on the court, as scrum entries. Benched spoofs sit out. */
export function lineupEntries(lineup: Lineup): ScrumEntry[] {
  return lineup.team.spoofs.flatMap((spoof) => {
    const spot = lineup.spots[spoof.id];
    return spot && 'x' in spot
      ? [{ spoof, team: lineup.side, position: { x: spot.x, y: spot.y }, fatigue: 0 }]
      : [];
  });
}

/** The two preset teams' 6 placed spoofs, as a scrum starts. */
export function presetScrumEntries(): ScrumEntry[] {
  return [...lineupEntries(PRESET_HOME), ...lineupEntries(PRESET_VISITOR)];
}
