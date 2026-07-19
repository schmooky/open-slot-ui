import { describe, it, expect } from 'vitest';
import { applyRulesDoc, auditRulesDoc, isRulesDoc, type RulesDoc } from '../src/spec/rulesDoc';
import { factsVars, type GameFacts } from '../src/spec/facts';
import { createUI } from '../src/spec/createUI';

const FACTS: GameFacts = {
  modes: [
    { id: 'base', name: 'Base game', kind: 'base', rtp: 96.5, maxWinX: 5000 },
    { id: 'bonus', name: 'Golden Rush', kind: 'buy', cost: 185, rtp: 95.5, maxWinX: 5000 },
  ],
  freeSpins: { count: 3, retrigger: false },
  volatility: 'High',
  maxWinCapX: 5000,
};

// A doc whose copy states EVERY number via interpolation tokens — by construction
// it can never drift from the config, and the audit must accept it as rendered.
const DOC: RulesDoc = {
  version: 1,
  facts: FACTS,
  blocks: [
    { kind: 'heading', id: 'h', text: 'rules.about' },
    { kind: 'text', id: 't1', text: 'rules.body' },
    { kind: 'text', id: 't2', text: 'rules.fs' },
    { kind: 'heading', id: 'hc', text: 'rules.controls' },
    { kind: 'legal', id: 'l', text: 'rules.legal' },
  ],
  messages: {
    en: {
      'rules.about': 'About {{game.name}}',
      'rules.body':
        'The Base game pays {{rtp.base}} up to {{maxWin.base}}. Buy {{name.bonus}} for {{cost.bonus}} your bet — RTP {{rtp.bonus}}, max win {{maxWin.bonus}}.',
      'rules.fs': 'The bonus awards exactly {{freeSpins.count}} free spins; free spins {{freeSpins.retrigger}} be retriggered.',
      'rules.controls': 'Controls',
      'rules.legal': 'Malfunction voids all wins and plays.',
    },
    ru: { 'rules.about': 'Об игре {{game.name}}' },
  },
};

describe('factsVars — the interpolation contract', () => {
  it('exposes rtp/maxWin/cost/name per mode + freeSpins/volatility/cap', () => {
    const v = factsVars(FACTS);
    expect(v['rtp.base']).toBe('96.50%');
    expect(v['maxWin.bonus']).toBe('5,000×');
    expect(v['cost.bonus']).toBe('185×');
    expect(v['name.bonus']).toBe('Golden Rush');
    expect(v['freeSpins.count']).toBe(3);
    expect(v['freeSpins.retrigger']).toBe('cannot');
    expect(v['volatility']).toBe('High');
    expect(v['maxWinCap']).toBe('5,000×');
  });

  it('dotted tokens interpolate through the translator (ui.t)', () => {
    const ui = createUI({ facts: FACTS });
    const out = ui.t('RTP is {{rtp.base}}, cap {{maxWinCap}}', factsVars(ui.facts.get()));
    expect(out).toBe('RTP is 96.50%, cap 5,000×');
  });
});

describe('applyRulesDoc — one call folds the document into a UISpec', () => {
  it('installs blocks as menu.rules and merges messages UNDER the host dictionary', () => {
    const spec = applyRulesDoc(
      { locale: { locale: 'en', messages: { en: { 'rules.about': 'HOST WINS' } } }, menu: { sound: 'toggle' } },
      DOC,
    );
    expect(spec.menu?.rules).toBe(DOC.blocks);
    expect(spec.menu?.sound).toBe('toggle'); // rest of the menu untouched
    expect(spec.locale?.messages.en?.['rules.about']).toBe('HOST WINS');
    expect(spec.locale?.messages.en?.['rules.body']).toContain('{{rtp.base}}');
    expect(spec.locale?.messages.ru?.['rules.about']).toBe('Об игре {{game.name}}');
    expect(spec.facts?.modes).toHaveLength(2); // doc facts folded in
  });

  it('spec facts win over doc facts on merge; malformed docs are skipped unchanged', () => {
    const spec = applyRulesDoc({ facts: { modes: [{ id: 'base', name: 'Base game', rtp: 97 }] } }, DOC);
    expect(spec.facts?.modes?.find((m) => m.id === 'base')?.rtp).toBe(97);
    const untouched = { rtp: 96 };
    expect(applyRulesDoc(untouched, {} as RulesDoc)).toBe(untouched);
    expect(isRulesDoc(null)).toBe(false);
    expect(isRulesDoc({ version: 2, blocks: [] })).toBe(false);
  });

  it('the whole path renders through createUI: doc string → locale dict → interpolated', () => {
    const ui = createUI(applyRulesDoc({}, DOC));
    ui.gameInfo = { name: 'Scrolls of Fate' };
    const vars = factsVars(ui.facts.get(), { 'game.name': ui.gameInfo.name! });
    expect(ui.t('rules.about', vars)).toBe('About Scrolls of Fate');
    expect(ui.t('rules.body', vars)).toContain('96.50%');
    ui.setLocale('ru');
    expect(ui.t('rules.about', vars)).toBe('Об игре Scrolls of Fate');
  });
});

describe('auditRulesDoc — stand-alone validation, AS RENDERED', () => {
  it('token-stated numbers satisfy the audit (they cannot drift by construction)', () => {
    expect(auditRulesDoc(DOC)).toEqual([]);
  });

  it('a forgotten declaration still trips it', () => {
    const broken: RulesDoc = { ...DOC, blocks: DOC.blocks.filter((b) => b.id !== 't2') }; // drop the FS text
    const codes = auditRulesDoc(broken).map((i) => i.code);
    expect(codes).toContain('rules-missing-freespins');
  });

  it('audits in a chosen locale falling back to the key itself', () => {
    // ru only translates the heading — body strings fall back to their keys, which
    // carry no numbers → the audit reports the missing statements for that locale.
    const codes = auditRulesDoc(DOC, { locale: 'ru' }).map((i) => i.code);
    expect(codes).toContain('rules-missing-rtp');
  });
});
