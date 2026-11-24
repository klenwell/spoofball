import { describe, expect, it } from 'vitest';
import { teamNameProblem } from './new-team';

describe('teamNameProblem', () => {
  it('accepts 1 to 16 characters, not counting spaces at either end', () => {
    expect(teamNameProblem('A')).toBeNull();
    expect(teamNameProblem(`  ${'A'.repeat(16)}  `)).toBeNull();
  });

  it('counts an emoji as one character', () => {
    expect(teamNameProblem('👻'.repeat(16))).toBeNull();
    expect(teamNameProblem('👻'.repeat(17))).toBe('long');
  });

  it('needs a name', () => {
    expect(teamNameProblem('')).toBe('empty');
    expect(teamNameProblem('   ')).toBe('empty');
  });

  it('refuses more than 16 characters', () => {
    expect(teamNameProblem('A'.repeat(17))).toBe('long');
  });
});
