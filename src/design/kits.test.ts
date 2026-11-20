import { describe, expect, it } from 'vitest';
import { contrastRatio } from './color';
import { kit, scrumKits } from './kits';
import { palette, teamColorNames, teamColors } from './tokens';

describe('kit', () => {
  describe('home', () => {
    it('fills the disc with the team color and marks it in white', () => {
      expect(kit('blue', 'home')).toEqual({
        style: 'home',
        color: 'blue',
        fill: teamColors.blue.base,
        trim: teamColors.blue.deep,
        mark: palette.white,
      });
    });
  });

  describe('away', () => {
    it('makes the disc white, trimmed in the team color and marked in its deep shade', () => {
      expect(kit('gold', 'away')).toEqual({
        style: 'away',
        color: 'gold',
        fill: palette.white,
        trim: teamColors.gold.base,
        mark: teamColors.gold.deep,
      });
    });
  });
});

describe('scrumKits', () => {
  describe('when the teams have different colors', () => {
    it('puts both teams in their home kits', () => {
      const kits = scrumKits('blue', 'orange');

      expect(kits.home.style).toBe('home');
      expect(kits.visitor.style).toBe('home');
      expect(kits.visitor.color).toBe('orange');
    });
  });

  describe('when the teams have the same color', () => {
    it('keeps the home team in home and puts the visitor in away', () => {
      const kits = scrumKits('teal', 'teal');

      expect(kits.home.style).toBe('home');
      expect(kits.visitor.style).toBe('away');
    });

    it('gives the two teams different disc fills', () => {
      for (const color of teamColorNames) {
        const kits = scrumKits(color, color);
        expect(kits.home.fill, color).not.toBe(kits.visitor.fill);
      }
    });
  });
});

describe('team colors on the court', () => {
  it.each(teamColorNames)('%s has at least 3:1 contrast against the court', (color) => {
    expect(contrastRatio(teamColors[color].base, palette.court)).toBeGreaterThanOrEqual(3);
  });

  it.each(teamColorNames)('%s away mark has at least 3:1 contrast on the white disc', (color) => {
    const away = kit(color, 'away');
    expect(contrastRatio(away.mark, away.fill)).toBeGreaterThanOrEqual(3);
  });

  it('the white away disc has at least 3:1 contrast against the court', () => {
    expect(contrastRatio(palette.white, palette.court)).toBeGreaterThanOrEqual(3);
  });
});
