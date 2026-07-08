import { describe, it, expect } from 'vitest';
import { findForbiddenPhrases, checkSocialPhrases } from '../src/spec/socialPhrases';
import { createUI } from '../src/spec/createUI';
import type { SpecIssue } from '../src/spec/types';

describe('social-mode forbidden-phrase check', () => {
  it('catches the restricted roots incl. "paytable" (the dice-cascade case)', () => {
    expect(findForbiddenPhrases('Paytable').map((m) => m.term)).toContain('pay*');
    expect(findForbiddenPhrases('see the paytable above')[0]!.term).toBe('pay*');
    expect(findForbiddenPhrases('Place your bet').map((m) => m.term)).toContain('bet');
    expect(findForbiddenPhrases('Insufficient funds').map((m) => m.term)).toContain('funds');
    expect(findForbiddenPhrases('Cash out now').map((m) => m.term)).toContain('cash');
    expect(findForbiddenPhrases('no gambling here').map((m) => m.term)).toContain('gamble');
    expect(findForbiddenPhrases('deposit real money').map((m) => m.term).sort()).toEqual(['deposit', 'money', 'real money'].sort());
  });

  it('does NOT over-flag safe words', () => {
    for (const t of ['between two reels', 'a better game', 'open the window', 'the player wins a prize', 'display the prize', 'play for coins']) {
      expect(findForbiddenPhrases(t), t).toEqual([]);
    }
  });

  it('every match carries a compliant replacement', () => {
    expect(findForbiddenPhrases('paytable')[0]!.replacement).toMatch(/prize/i);
    expect(findForbiddenPhrases('bet')[0]!.replacement).toBe('play');
  });

  it('walks menu blocks, section titles, game name and the en dictionary', () => {
    const issues = checkSocialPhrases({
      menu: { rules: [{ kind: 'text', id: 'r', text: 'See the paytable for every payout.' }], titles: { paytable: 'Paytable' } },
      game: { name: 'Lucky Bet' },
      locale: { locale: 'en', messages: { en: { x: 'Cash out anytime' } } },
    });
    const src = issues.map((i) => i.source);
    expect(src.some((s) => s.startsWith('menu.rules'))).toBe(true);
    expect(src).toContain('menu.titles.paytable');
    expect(src).toContain('game.name');
    expect(src.some((s) => s.startsWith('locale.en'))).toBe(true);
  });

  it('createUI runs it in social mode → onDataIssue, and never throws', () => {
    const issues: SpecIssue[] = [];
    expect(() =>
      createUI({ social: true, menu: { rules: [{ kind: 'heading', id: 'h', text: 'Paytable' }] } }, { onDataIssue: (i) => issues.push(i) }),
    ).not.toThrow();
    expect(issues.some((i) => i.code === 'social-forbidden-phrase')).toBe(true);
  });

  it('does NOT run when social mode is off', () => {
    const issues: SpecIssue[] = [];
    createUI({ menu: { rules: [{ kind: 'heading', id: 'h', text: 'Paytable' }] } }, { onDataIssue: (i) => issues.push(i) });
    expect(issues.some((i) => i.code === 'social-forbidden-phrase')).toBe(false);
  });
});
