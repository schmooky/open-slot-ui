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
      // titles.paytable = 'Cash Prizes' has no built-in social default → still flags;
      // a bare 'Paytable' would auto-resolve to 'Prizes' (see the resolve test below).
      menu: { rules: [{ kind: 'text', id: 'r', text: 'See the paytable for every payout.' }], titles: { paytable: 'Cash Prizes' } },
      game: { name: 'Lucky Bet' },
      locale: { locale: 'en', messages: { en: { x: 'Cash out anytime' } } },
    });
    const src = issues.map((i) => i.source);
    expect(src.some((s) => s.startsWith('menu.rules'))).toBe(true);
    expect(src).toContain('menu.titles.paytable');
    expect(src).toContain('game.name');
    expect(src.some((s) => s.startsWith('locale.en'))).toBe(true);
  });

  it('resolves through the social dictionary — a phrase WITH a social override passes', () => {
    // The dice-cascade pattern: base copy carries "bet"/"paytable"; social overrides fix them.
    const spec = {
      game: { name: 'Lucky Bet' },
      menu: { rules: [{ kind: 'text' as const, id: 'r', text: 'See the paytable above.' }] },
      locale: {
        locale: 'en',
        messages: { en: {} },
        socialMessages: { en: { 'Lucky Bet': 'Lucky Boost', 'See the paytable above.': 'See the prizes above.' } },
      },
    };
    expect(checkSocialPhrases(spec)).toEqual([]);
    // Drop the override for the rules line → it renders "paytable" and IS flagged.
    spec.locale.socialMessages.en = { 'Lucky Bet': 'Lucky Boost' } as Record<string, string>;
    expect(checkSocialPhrases(spec).map((i) => i.source)).toEqual(['menu.rules[0]']);
  });

  it('auto-resolves built-in restricted headings (Paytable → Prizes) so they pass', () => {
    // 'Paytable' has a built-in social default (→ 'Prizes'), so a bare heading is compliant.
    expect(checkSocialPhrases({ menu: { rules: [{ kind: 'heading', id: 'h', text: 'Paytable' }] } })).toEqual([]);
  });

  it('createUI runs it in social mode → onDataIssue, and never throws', () => {
    const issues: SpecIssue[] = [];
    expect(() =>
      // 'Big Cash Prizes' has no social default → renders forbidden ("cash") in social mode.
      createUI({ social: true, menu: { rules: [{ kind: 'heading', id: 'h', text: 'Big Cash Prizes' }] } }, { onDataIssue: (i) => issues.push(i) }),
    ).not.toThrow();
    expect(issues.some((i) => i.code === 'social-forbidden-phrase')).toBe(true);
  });

  it('does NOT run when social mode is off', () => {
    const issues: SpecIssue[] = [];
    createUI({ menu: { rules: [{ kind: 'heading', id: 'h', text: 'Big Cash Prizes' }] } }, { onDataIssue: (i) => issues.push(i) });
    expect(issues.some((i) => i.code === 'social-forbidden-phrase')).toBe(false);
  });
});
