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
    it('makes the disc white, trimmed and marked in the deep shade of the team color', () => {
      expect(kit('gold', 'away')).toEqual({
        style: 'away',
        color: 'gold',
        fill: palette.white,
        trim: teamColors.gold.deep,
        mark: teamColors.gold.deep,
      });
    });
  });
});

describe('scrumKits', () => {
  it('puts the home team in home and the visitor in away', () => {
    const kits = scrumKits('blue', 'orange');

    expect(kits.home).toEqual(kit('blue', 'home'));
    expect(kits.visitor).toEqual(kit('orange', 'away'));
  });

  it('puts the visitor in away whatever the two colors', () => {
    for (const home of teamColorNames) {
      for (const visitor of teamColorNames) {
        expect(scrumKits(home, visitor).visitor.style, `${home} vs ${visitor}`).toBe('away');
      }
    }
  });

  describe('when the teams have the same color', () => {
    it('gives the two teams different disc fills', () => {
      for (const color of teamColorNames) {
        const kits = scrumKits(color, color);
        expect(kits.home.fill, color).not.toBe(kits.visitor.fill);
      }
    });
  });
});

describe('team colors in the arena', () => {
  const kits = teamColorNames.flatMap((color) =>
    (['home', 'away'] as const).map((style) => kit(color, style)),
  );
  const label = (k: ReturnType<typeof kit>) => `${k.color} ${k.style}`;

  describe.each([
    ['mosh', palette.mosh],
    ['apron', palette.apron],
  ])('on the %s', (_zone, surface) => {
    it.each(kits.map((k) => [label(k), k] as const))(
      '%s disc edge has at least 3:1 contrast',
      (_name, k) => {
        expect(contrastRatio(k.trim, surface)).toBeGreaterThanOrEqual(3);
      },
    );
  });

  // The crush is excluded on purpose: the owner chose a red that matches the
  // trims' brightness, so discs there stand out by hue and shadow. See #19.

  it.each(teamColorNames)('%s home fill has at least 3:1 contrast on the white mosh', (color) => {
    expect(contrastRatio(teamColors[color].base, palette.mosh)).toBeGreaterThanOrEqual(3);
  });

  it.each(teamColorNames)('%s home mark has at least 3:1 contrast on its disc', (color) => {
    const home = kit(color, 'home');
    expect(contrastRatio(home.mark, home.fill)).toBeGreaterThanOrEqual(3);
  });

  it.each(teamColorNames)('%s away mark has at least 4.5:1 contrast on the white disc', (color) => {
    const away = kit(color, 'away');
    expect(contrastRatio(away.mark, away.fill)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(teamColorNames)('%s has at least 3:1 contrast on the dark benches', (color) => {
    expect(contrastRatio(teamColors[color].base, palette.bench)).toBeGreaterThanOrEqual(3);
  });
});
