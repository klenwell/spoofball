import type { MatchRecord } from '../game/match';
import { emptyStats } from '../game/scrum';

type SpoofLine = MatchRecord['spoofs'][number];

/** One of a match record's spoof lines, worked out from its points by scrum (null: sat out). */
export function spoofLine(
  id: string,
  pointsByScrum: readonly (number | null)[],
  overrides: Partial<SpoofLine> = {},
): SpoofLine {
  return {
    team: 'home',
    id,
    name: `Spoof ${id}`,
    scrumsPlayed: pointsByScrum.filter((p) => p !== null).length,
    points: pointsByScrum.reduce<number>((a, p) => a + (p ?? 0), 0),
    pointsByScrum,
    stats: emptyStats(),
    ...overrides,
  };
}

/**
 * A finished match's record, made by hand so its numbers are easy to check:
 * your team (home) wins 12–9 against the Pawns, scrum by scrum 5–3, 4–4 and
 * 3–2. Each test overrides only what it cares about.
 */
export function aMatchRecord(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    seed: 1,
    host: 'home',
    teams: { home: 'Yours', visitor: 'Pawns' },
    logos: { home: '👻', visitor: '🍕' },
    scoreByScrum: { home: [5, 4, 3], visitor: [3, 4, 2] },
    score: { home: 12, visitor: 9 },
    result: 'won',
    spoofs: [
      spoofLine('a', [2, null, 1]),
      spoofLine('b', [2, 2, null]),
      spoofLine('c', [1, 2, 2]),
      spoofLine('d', [null, 0, 0]),
      spoofLine('e', [null, null, null]),
      spoofLine('x', [3, 4, 2], { team: 'visitor' }),
    ],
    ...overrides,
  };
}
