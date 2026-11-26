import { describe, expect, it } from 'vitest';
import { contrastRatio } from './color';
import { cssVariables, cssVariablesRule, palette, teamColorNames, teamColors } from './tokens';

describe('teamColors', () => {
  it('defines a base and deep shade for each of the 8 team colors', () => {
    expect(Object.keys(teamColors)).toEqual([...teamColorNames]);
    expect(teamColorNames).toHaveLength(8);
  });
});

describe('cssVariables', () => {
  it('exposes palette colors in kebab case', () => {
    expect(cssVariables()['--color-mosh']).toBe(palette.mosh);
    expect(cssVariables()['--color-text-muted']).toBe(palette.textMuted);
  });

  it('exposes both shades of every team color', () => {
    const vars = cssVariables();
    for (const name of teamColorNames) {
      expect(vars[`--team-${name}`]).toBe(teamColors[name].base);
      expect(vars[`--team-${name}-deep`]).toBe(teamColors[name].deep);
    }
  });

  it('exposes type, spacing and radius scales', () => {
    const vars = cssVariables();
    expect(vars['--text-md']).toBe('1rem');
    expect(vars['--space-4']).toBe('1rem');
    expect(vars['--radius-pill']).toBe('999px');
  });
});

describe('cssVariablesRule', () => {
  it('wraps every variable in a :root rule', () => {
    const rule = cssVariablesRule();

    expect(rule.startsWith(':root {\n')).toBe(true);
    expect(rule).toContain(`  --color-mosh: ${palette.mosh};`);
    expect(rule.endsWith('\n}')).toBe(true);
  });
});

describe('page colors', () => {
  describe.each([
    ['page', palette.background],
    ['surface', palette.surface],
  ])('on the %s', (_name, behind) => {
    it.each([
      ['text', palette.text],
      ['muted text', palette.textMuted],
      ['accent text', palette.accentText],
    ])('%s has at least 4.5:1 contrast (WCAG AA)', (_label, color) => {
      expect(contrastRatio(color, behind)).toBeGreaterThanOrEqual(4.5);
    });

    it('the accent has at least 3:1 contrast, for graphics such as the tab ring', () => {
      expect(contrastRatio(palette.accent, behind)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('the match log (#95)', () => {
    it.each([
      ['won', palette.resultWon],
      ['lost', palette.resultLost],
    ])('the %s color has at least 4.5:1 contrast on surfaces, as text', (_label, color) => {
      expect(contrastRatio(color, palette.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it("a tie's gray stripe has at least 3:1 contrast on surfaces", () => {
      expect(contrastRatio(palette.resultNeutral, palette.surface)).toBeGreaterThanOrEqual(3);
    });

    it('text and muted text keep 4.5:1 on a forfeit row', () => {
      expect(contrastRatio(palette.text, palette.forfeitRow)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.textMuted, palette.forfeitRow)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('the placing halo has at least 3:1 contrast on the mosh and the apron', () => {
    expect(contrastRatio(palette.placeOk, palette.mosh)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.placeOk, palette.apron)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['text', palette.text],
    ['muted text', palette.textMuted],
    ['accent text', palette.accentText],
  ])('%s has at least 4.5:1 contrast on a selected cell (#73)', (_label, color) => {
    expect(contrastRatio(color, palette.selected)).toBeGreaterThanOrEqual(4.5);
  });

  it('the countdown ring has at least 3:1 contrast on the white ring under it (#76)', () => {
    expect(contrastRatio(palette.graceRing, palette.white)).toBeGreaterThanOrEqual(3);
  });

  it("the hold drill's dummy has a ring with at least 3:1 contrast on the mosh, the apron and the crush", () => {
    for (const behind of [palette.mosh, palette.apron, palette.crush]) {
      expect(contrastRatio(palette.dummyTrim, behind)).toBeGreaterThanOrEqual(3);
    }
  });

  it("the court's edge has at least 3:1 contrast on the page, so you can see where the court ends", () => {
    expect(contrastRatio(palette.courtEdge, palette.background)).toBeGreaterThanOrEqual(3);
  });
});
