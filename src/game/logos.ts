/**
 * The emoji a team can take as its logo (#70). A placeholder set for now:
 * step 2 of the Draft (New Team) epic (#71) curates the real one with the
 * owner, as a grid of emoji that render well across devices. Computer teams
 * draw from the same set (docs/design.md, Draft (New Team)).
 */
export const TEAM_LOGOS: readonly string[] = ['☄️', '🔥', '⭐', '🌙', '⚡', '🌊', '🍀', '🐝'];

export function isTeamLogo(value: string): boolean {
  return TEAM_LOGOS.includes(value);
}
