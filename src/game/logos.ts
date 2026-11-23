/**
 * The emoji a team can take as its logo: 24, picked by the owner (#77, #71).
 * 👻 is the Spoofs'. The create screen shows them as a grid, and computer
 * teams draw from the same set (docs/design.md, Draft (New Team)). Each is a
 * long-standing emoji, so it shows on older phones too. Computer teams
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
  '👻',
  '🦊',
  '🐸',
  '🦈',
  '🦉',
  '🚀',
  '👑',
  '🍕',
];

export function isTeamLogo(value: string): boolean {
  return TEAM_LOGOS.includes(value);
}
