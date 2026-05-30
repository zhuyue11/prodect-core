import { describe, expect, it } from 'vitest';
import { keyBetween, keyForAppend, keyForPrepend } from '@/lib/workItems/positioning';

// Unit tests for the fractional-indexing wrappers (lib/workItems/positioning).
// Fixtures are the known base-62 outputs of `generateKeyBetween` (verified
// against the library): the first append key is "a0", subsequent appends
// increment ("a1", "a2"), a prepend before "a0" is "Zz", and a midpoint
// between adjacent keys gets a longer key ("a0V"). No DB — pure functions.

describe('keyForAppend', () => {
  it('returns "a0" for an empty list (last = null)', () => {
    expect(keyForAppend(null)).toBe('a0');
  });

  it('returns a key that sorts strictly after the current last', () => {
    const first = keyForAppend(null); // "a0"
    const second = keyForAppend(first); // "a1"
    const third = keyForAppend(second); // "a2"
    expect(second).toBe('a1');
    expect(third).toBe('a2');
    expect(first < second).toBe(true);
    expect(second < third).toBe(true);
  });
});

describe('keyForPrepend', () => {
  it('returns "a0" for an empty list (first = null)', () => {
    expect(keyForPrepend(null)).toBe('a0');
  });

  it('returns a key that sorts strictly before the current first', () => {
    const before = keyForPrepend('a0');
    expect(before).toBe('Zz');
    expect(before < 'a0').toBe(true);
  });
});

describe('keyBetween', () => {
  it('returns a key strictly between two adjacent neighbours', () => {
    const mid = keyBetween('a0', 'a1');
    expect(mid).toBe('a0V');
    expect('a0' < mid && mid < 'a1').toBe(true);
  });

  it('returns a key between two non-adjacent neighbours', () => {
    const mid = keyBetween('a0', 'a2');
    expect(mid).toBe('a1');
    expect('a0' < mid && mid < 'a2').toBe(true);
  });

  it('treats null bounds as open ends (append / prepend equivalents)', () => {
    expect(keyBetween(null, null)).toBe('a0');
    expect(keyBetween('a0', null)).toBe('a1');
    expect(keyBetween(null, 'a0')).toBe('Zz');
  });

  it('throws when the bounds are out of order (prev >= next)', () => {
    expect(() => keyBetween('a1', 'a0')).toThrow();
  });
});
