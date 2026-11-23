/**
 * The emoji a team can take as its logo (#70): 16, the last 8 added on the
 * owner's review of #77. Step 2 of the Draft (New Team) epic (#71) shows
 * them as a grid and checks they render well across devices. Computer teams
 * draw from the same set (docs/design.md, Draft (New Team)).
 */
export const TEAM_LOGOS: readonly string[] = [
  '☄️',
  '🔥',
  '⭐',
  '🌙',
  '⚡',
  '🌊',
  '🍀',
  '🐝',
  '🐼',
  '🐯',
  '🐱',
  '🐶',
  '🍆',
  '🍑',
  '❤️',
  '☠️',
];

export function isTeamLogo(value: string): boolean {
  return TEAM_LOGOS.includes(value);
}
