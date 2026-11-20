import { describe, expect, it } from 'vitest';
import { cssVariables, cssVariablesRule, palette, teamColorNames, teamColors } from './tokens';

describe('teamColors', () => {
  it('defines a base and deep shade for each of the 8 team colors', () => {
    expect(Object.keys(teamColors)).toEqual([...teamColorNames]);
    expect(teamColorNames).toHaveLength(8);
  });
});

describe('cssVariables', () => {
  it('exposes palette colors in kebab case', () => {
    expect(cssVariables()['--color-court']).toBe(palette.court);
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
    expect(rule).toContain(`  --color-court: ${palette.court};`);
    expect(rule.endsWith('\n}')).toBe(true);
  });
});
