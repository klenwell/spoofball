import { palette, teamColors, type TeamColorName } from './tokens';

/**
 * Home and away kits, like sports uniforms. In a match the home team (always
 * the player's) wears home, a disc in its color, and the visitor always
 * wears away, a white disc trimmed in its color's deep shade. So the rule
 * the player learns is constant: solid discs are mine, white discs are theirs.
 * It also keeps two teams of the same color apart.
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

/** The colors a disc is drawn in: a kit's, or the hold drill's dummy's. */
export type DiscColors = Pick<Kit, 'fill' | 'trim' | 'mark'>;

/**
 * The hold drill's dummy (#73): dark gray with a near-black ring, in neither
 * team's colors, so it reads as a practice body, not an opponent or a teammate.
 */
export const DUMMY_COLORS: DiscColors = {
  fill: palette.dummy,
  trim: palette.dummyTrim,
  mark: palette.white,
};

export interface MatchKits {
  home: Kit;
  visitor: Kit;
}

/** The kits two teams wear in a match: home in home, the visitor always in away. */
export function matchKits(homeColor: TeamColorName, visitorColor: TeamColorName): MatchKits {
  return {
    home: kit(homeColor, 'home'),
    visitor: kit(visitorColor, 'away'),
  };
}
