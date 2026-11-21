import { palette, teamColors, type TeamColorName } from './tokens';

/**
 * Home and away kits, like sports uniforms. Teams pick from only 8 colors,
 * so two teams in a scrum can share one. When they do, the visitor wears
 * the away kit (a white disc trimmed in its color's deep shade) so the teams stay
 * distinguishable on the court.
 */

export type KitStyle = 'home' | 'away';

export interface Kit {
  style: KitStyle;
  color: TeamColorName;
  /** Disc fill. */
  fill: string;
  /** Disc ring. */
  trim: string;
  /** The spoof's type mark. */
  mark: string;
}

export function kit(color: TeamColorName, style: KitStyle): Kit {
  const { base, deep } = teamColors[color];
  if (style === 'home') {
    return { style, color, fill: base, trim: deep, mark: palette.white };
  }
  // Deep, not base, for the trim: it has to stand out on the gray apron as well as the white mosh.
  return { style, color, fill: palette.white, trim: deep, mark: deep };
}

export interface ScrumKits {
  home: Kit;
  visitor: Kit;
}

/** The kits two teams wear in a scrum, given each team's color. */
export function scrumKits(homeColor: TeamColorName, visitorColor: TeamColorName): ScrumKits {
  const clash = homeColor === visitorColor;
  return {
    home: kit(homeColor, 'home'),
    visitor: kit(visitorColor, clash ? 'away' : 'home'),
  };
}
