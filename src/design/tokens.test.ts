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

  it("the court's edge has at least 3:1 contrast on the page, so you can see where the court ends", () => {
    expect(contrastRatio(palette.courtEdge, palette.background)).toBeGreaterThanOrEqual(3);
  });
});
