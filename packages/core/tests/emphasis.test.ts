import { describe, it, expect } from 'vitest';
import { ValueDisplay } from '../src/controls/ValueDisplay';

describe('ValueDisplay emphasis (accent value tint)', () => {
  it('defaults off, toggles strictly on boolean true, and emits', () => {
    const vd = new ValueDisplay({ id: 'bet' });
    expect(vd.emphasized.get()).toBe(false);
    const seen: boolean[] = [];
    vd.emphasized.subscribe((v) => seen.push(v));
    vd.setEmphasis(true);
    expect(vd.emphasized.get()).toBe(true);
    vd.setEmphasis(false);
    expect(vd.emphasized.get()).toBe(false);
    vd.setEmphasis(1 as unknown as boolean); // never-reject boundary: truthy ≠ true
    expect(vd.emphasized.get()).toBe(false);
    expect(seen).toEqual([true, false]);
  });
});
