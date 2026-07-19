import { describe, it, expect } from 'vitest';
import { auditRules, mergeFacts, modeStatsItems, formatRtp, formatTimes, type GameFacts } from '../src/spec/facts';
import { createUI } from '../src/spec/createUI';
import { validateSpec } from '../src/spec/validateSpec';
import type { BlockSpec } from '../src/spec/types';

// The dice-cascade shape: a base game + three boosts + one buy bonus, one RTP,
// per-mode max wins, exactly-3 free spins that can NOT be retriggered.
const FACTS: GameFacts = {
  modes: [
    { id: 'base', name: 'Base', kind: 'base', rtp: 95.5, maxWinX: 2208 },
    { id: 'lucky', name: 'Lucky Bet', kind: 'ante', cost: 1, rtp: 95.5, maxWinX: 5000 },
    { id: 'bonus', name: 'Golden Rush', kind: 'buy', cost: 185, rtp: 95.5, maxWinX: 5000 },
  ],
  freeSpins: { count: 3, retrigger: false },
  volatility: 'Very high',
  maxWinCapX: 5000,
};

const codes = (facts: GameFacts | undefined, rules: BlockSpec[] | undefined): string[] =>
  auditRules(facts, rules).map((i) => `${i.level}:${i.code}:${i.topic}`);

// A COMPLETE rules document under the strict model: every declared mode has its
// OWN section (a heading naming it + real prose, costs stated inside), the free
// spins are fully specified, and mode-stats covers all RTP / max-win figures.
const GOOD: BlockSpec[] = [
  { kind: 'heading', id: 'h-how', text: 'How to play' },
  { kind: 'text', id: 't-how', text: 'Press SPIN to play a round at the current bet; matching faces pay their value.' },
  { kind: 'heading', id: 'h-lucky', text: 'Lucky Bet' },
  { kind: 'text', id: 't-lucky', text: 'Lucky Bet is an optional ante: every spin costs 2× your bet and boosts the bonus chance.' },
  { kind: 'heading', id: 'h-bonus', text: 'Golden Rush bonus' },
  { kind: 'text', id: 't-bonus', text: 'Buy Golden Rush for 185× your bet: exactly 3 free spins, and free spins cannot be retriggered.' },
  { kind: 'mode-stats', id: 'ms' },
  { kind: 'heading', id: 'hc', text: 'Controls' },
  { kind: 'text', id: 'tc', text: 'SPIN plays a round; − / + change your bet; the menu opens these rules.' },
  { kind: 'legal', id: 'l', text: 'Malfunction voids all wins and plays.' },
];

describe('auditRules — the "can\'t forget" rules audit', () => {
  it('per-mode sections + mode-stats + full free-spins info = clean', () => {
    expect(auditRules(FACTS, GOOD)).toEqual([]);
  });

  it('EVERY declared mode needs its OWN section — a passing mention does not count', () => {
    // Lucky Bet + Golden Rush are both named in a shared paragraph, but have no
    // sections of their own → both are REQUIRED findings.
    const rules: BlockSpec[] = [
      ...GOOD.filter((b) => !['h-lucky', 't-lucky', 'h-bonus', 't-bonus'].includes(b.id)),
      { kind: 'text', id: 't-mention', text: 'Lucky Bet doubles your stake. Golden Rush is the bonus: exactly 3 free spins, and free spins cannot be retriggered.' },
    ];
    const found = codes(FACTS, rules);
    expect(found).toContain('required:rules-missing-mode-section:section:lucky');
    expect(found).toContain('required:rules-missing-mode-section:section:bonus');
    expect(found).not.toContain('required:rules-missing-mode-section:section:base'); // "How to play" explains the base game
  });

  it('a section heading with no real prose underneath is called out', () => {
    const rules = GOOD.map((b) => (b.id === 't-bonus' ? { ...b, text: 'Fun!' } : b));
    expect(codes(FACTS, rules)).toContain('required:rules-mode-section-empty:section:bonus');
  });

  it('a costed feature must state its price INSIDE its own section', () => {
    const rules = GOOD.map((b) =>
      b.id === 't-bonus' ? { ...b, text: 'Golden Rush plays exactly 3 free spins on richer reels; free spins cannot be retriggered.' } : b,
    );
    expect(codes(FACTS, rules)).toContain('required:rules-mode-missing-cost:cost:bonus');
    // the ante states its cost as the TOTAL (2× = 1 + surcharge 1) — accepted
    expect(codes(FACTS, GOOD)).not.toContain('required:rules-mode-missing-cost:cost:lucky');
    // percentage phrasing for a fractional surcharge is accepted too (+50%)
    const pct: GameFacts = { modes: [{ id: 'dc', name: 'Double Chance', kind: 'boost', cost: 0.5, rtp: 96, maxWinX: 100 }], freeSpins: false };
    const pctRules: BlockSpec[] = [
      { kind: 'heading', id: 'h', text: 'Double Chance' },
      { kind: 'text', id: 't', text: 'A stronger ante at +50% per spin for better bonus odds, toggled from the bonus button.' },
      { kind: 'mode-stats', id: 'ms' },
      { kind: 'heading', id: 'hc', text: 'Controls' },
      { kind: 'legal', id: 'l', text: 'Malfunction voids.' },
    ];
    expect(codes(pct, pctRules)).not.toContain('required:rules-mode-missing-cost:cost:dc');
  });

  it('blocks tagged explains: "<modeId>" form a section without needing a matching heading', () => {
    const rules: BlockSpec[] = [
      ...GOOD.filter((b) => !['h-bonus', 't-bonus'].includes(b.id)),
      { kind: 'text', id: 't-tagged', explains: 'bonus', text: 'The bonus buy costs 185× your bet and plays exactly 3 free spins; free spins cannot be retriggered.' },
    ];
    // the tagged block lives inside the LAST section but explains the bonus mode
    expect(codes(FACTS, rules)).not.toContain('required:rules-missing-mode-section:section:bonus');
  });

  it('forgetting a mode\'s RTP / max win in the rules is a REQUIRED finding', () => {
    // sections are all present, but the mode-stats grid is gone and only the base
    // figures are stated in prose → the other modes\' maxwins are caught.
    const rules = GOOD.filter((b) => b.id !== 'ms').map((b) =>
      b.id === 't-how' ? { ...b, text: 'The Base game pays to an RTP of 95.50% with wins up to 2,208× your stake per round.' } : b,
    );
    const found = codes(FACTS, rules);
    expect(found).not.toContain('required:rules-missing-rtp:rtp:base');
    expect(found).not.toContain('required:rules-missing-maxwin:maxwin:base');
    // the shared 95.50% figure + the mode names cover RTP globally (deliberate:
    // "every mode keeps the same 95.50% RTP" must never false-flag)…
    expect(found).not.toContain('required:rules-missing-rtp:rtp:lucky');
    // …but the FORGOTTEN 5,000× max wins of Lucky Bet + Golden Rush are caught.
    expect(found).toContain('required:rules-missing-maxwin:maxwin:lucky');
    expect(found).toContain('required:rules-missing-maxwin:maxwin:bonus');
  });

  it('text heuristics accept the natural forms: "95.5%" ≡ "95.50%", "5,000×" ≡ "5000x"', () => {
    const mk = (text: string): BlockSpec[] => [
      { kind: 'heading', id: 'h', text: 'About the game' },
      { kind: 'text', id: 't', text },
      { kind: 'heading', id: 'hc', text: 'Controls' },
      { kind: 'legal', id: 'l', text: 'Malfunction voids.' },
    ];
    const facts: GameFacts = { modes: [{ id: 'base', name: 'Base', kind: 'base', rtp: 95.5, maxWinX: 5000 }], freeSpins: false };
    expect(codes(facts, mk('The Base game pays to a 95.5% RTP overall, capped at 5000x per single round.'))).toEqual([]);
    expect(codes(facts, mk('The Base game pays to a 95.50 % RTP overall, capped at 5,000× per single round.'))).toEqual([]);
    expect(codes(facts, mk('Base is great and plenty of prose lives here to fill its section out.'))).toContain('required:rules-missing-rtp:rtp:base');
  });

  it('covers tags mark hand-written prose as covering a topic the heuristics miss', () => {
    const rules: BlockSpec[] = [
      { kind: 'text', id: 't', text: 'The golden bonus round and the double-stake option are described here at length.', covers: ['feature:base', 'feature:bonus', 'feature:lucky', 'cost:lucky', 'cost:bonus', 'rtp:base', 'maxwin:base', 'rtp:lucky', 'maxwin:lucky', 'rtp:bonus', 'maxwin:bonus', 'freespins', 'freespins:count', 'freespins:retrigger', 'controls'] },
      { kind: 'legal', id: 'l', text: 'Malfunction voids.' },
    ];
    expect(auditRules(FACTS, rules)).toEqual([]);
  });

  it('free-spins info is HIGHLY RECOMMENDED: undeclared facts, missing count, missing retrigger', () => {
    // sections all present, but the bonus section says nothing about free spins.
    const base = GOOD.map((b) =>
      b.id === 't-bonus' ? { ...b, text: 'Buy Golden Rush for 185× your bet — a bonus round played on richer reels.' } : b,
    );
    // facts don't declare freeSpins at all → recommend declaring them (or false).
    expect(codes({ ...FACTS, freeSpins: undefined }, base)).toContain('recommended:facts-missing-freespins:freespins');
    // declared but the rules never mention free spins.
    expect(codes(FACTS, base)).toContain('recommended:rules-missing-freespins:freespins');
    // mentioned, but count + retrigger policy missing.
    const some = [...base, { kind: 'text', id: 'fs', text: 'The bonus awards free spins.' } as BlockSpec];
    expect(codes(FACTS, some)).toContain('recommended:rules-missing-fs-count:freespins:count');
    expect(codes(FACTS, some)).toContain('recommended:rules-missing-fs-retrigger:freespins:retrigger');
    // fully stated → clean.
    const full = [...base, { kind: 'text', id: 'fs', text: 'The bonus awards exactly 3 free spins; free spins cannot be retriggered.' } as BlockSpec];
    expect(codes(FACTS, full)).toEqual([]);
    // a game may declare it HAS no free spins → nothing recommended.
    expect(codes({ ...FACTS, freeSpins: false }, base)).toEqual([]);
  });

  it('a mode declared without rtp/maxWinX facts is itself a REQUIRED finding', () => {
    const facts: GameFacts = { modes: [{ id: 'x', name: 'Mystery', kind: 'buy' }], freeSpins: false };
    const found = codes(facts, [{ kind: 'text', id: 't', text: 'Mystery mode.' }, { kind: 'heading', id: 'hc', text: 'Controls' }, { kind: 'legal', id: 'l', text: 'Malfunction voids.' }]);
    expect(found).toContain('required:facts-missing-rtp:rtp:x');
    expect(found).toContain('required:facts-missing-maxwin:maxwin:x');
  });

  it('legal disclaimer + controls guide are recommended for any rules', () => {
    const found = codes({ modes: [], freeSpins: false }, [{ kind: 'text', id: 't', text: 'Spin and win.' }]);
    expect(found).toContain('recommended:rules-missing-legal:legal');
    expect(found).toContain('recommended:rules-missing-controls:controls');
  });

  it('required findings sort before recommended ones', () => {
    const issues = auditRules(FACTS, [{ kind: 'text', id: 't', text: 'nothing.' }]);
    const levels = issues.map((i) => i.level);
    expect(levels.indexOf('recommended')).toBeGreaterThan(levels.lastIndexOf('required') === -1 ? -1 : 0);
    expect(levels.slice(levels.indexOf('recommended'))).not.toContain('required');
  });

  it('never throws on garbage', () => {
    expect(auditRules(undefined, undefined)).toEqual([]);
    expect(auditRules({} as GameFacts, [])).toEqual([]);
    expect(auditRules({ modes: [{ id: '', name: '' }] } as GameFacts, [{ kind: 'group', id: 'g', children: [] }])).toBeInstanceOf(Array);
  });
});

describe('mergeFacts + declareFacts — modes merge BY ID', () => {
  it('merges spec facts with the buy-modal declaration without losing either side', () => {
    const fromSpec: GameFacts = { modes: [{ id: 'bonus', name: 'Golden Rush', rtp: 95.5, maxWinX: 5000 }], freeSpins: { count: 3, retrigger: false } };
    const fromModal: GameFacts = { modes: [{ id: 'bonus', name: 'Golden Rush', kind: 'buy', cost: 185 }, { id: 'lucky', name: 'Lucky Bet', kind: 'boost', cost: 1 }] };
    const merged = mergeFacts(fromSpec, fromModal);
    expect(merged.modes).toHaveLength(2);
    expect(merged.modes![0]).toMatchObject({ id: 'bonus', kind: 'buy', cost: 185, rtp: 95.5, maxWinX: 5000 });
    expect(merged.freeSpins).toEqual({ count: 3, retrigger: false });
  });

  it('ui.declareFacts merges live (createUI seeds from spec.facts)', () => {
    const ui = createUI({ facts: { modes: [{ id: 'base', name: 'Base', kind: 'base', rtp: 96, maxWinX: 1000 }] } });
    ui.declareFacts({ modes: [{ id: 'buy1', name: 'Bonus Buy', kind: 'buy', cost: 100 }] });
    expect(ui.facts.get().modes).toHaveLength(2);
    expect(ui.facts.get().modes![0]!.rtp).toBe(96);
  });
});

describe('modeStatsItems — the auto per-mode grid', () => {
  it('renders one RTP + Max win row per mode, then volatility + cap', () => {
    const items = modeStatsItems(FACTS);
    expect(items).toContainEqual({ label: 'RTP · Golden Rush', value: '95.50%' });
    expect(items).toContainEqual({ label: 'Max win · Golden Rush', value: '5,000×' });
    expect(items).toContainEqual({ label: 'Volatility', value: 'Very high' });
    expect(items).toContainEqual({ label: 'Round cap', value: '5,000×' });
    expect(items.filter((i) => i.label.startsWith('RTP'))).toHaveLength(3);
  });
  it('formats the Stake way', () => {
    expect(formatRtp(95.5)).toBe('95.50%');
    expect(formatRtp(96)).toBe('96.00%');
    expect(formatTimes(5000)).toBe('5,000×');
    expect(formatTimes(2208)).toBe('2,208×');
  });
  it('localizes the label parts through tr (social swap point)', () => {
    const tr = (s: string): string => (s === 'Max win' ? 'Max prize' : s);
    expect(modeStatsItems(FACTS, tr)).toContainEqual({ label: 'Max prize · Golden Rush', value: '5,000×' });
  });
});

describe('spec integration', () => {
  it('validateSpec accepts mode-stats and warns when no facts modes are declared', () => {
    const withFacts = validateSpec({ facts: FACTS, menu: { rules: [{ kind: 'mode-stats', id: 'ms' }] } });
    expect(withFacts.ok).toBe(true);
    expect(withFacts.issues.some((i) => i.code === 'mode-stats-no-facts')).toBe(false);
    const without = validateSpec({ menu: { rules: [{ kind: 'mode-stats', id: 'ms' }] } });
    expect(without.ok).toBe(true); // warn, not error
    expect(without.issues.some((i) => i.code === 'mode-stats-no-facts' && i.level === 'warn')).toBe(true);
  });
});

describe('autoplay stopping on insufficient balance pops the ERR_IPB modal', () => {
  it('shows the insufficient-funds notice when autoplay stops broke', () => {
    const ui = createUI();
    ui.balance.set(1);
    ui.bet.set(2);
    ui.autoplay.begin(10);
    ui.autoplay.stop();
    expect(ui.noticePanel.isOpen).toBe(true);
    expect(ui.noticeBlocks.get().some((b) => 'text' in b && b.text === 'openui.err.insufficient.message')).toBe(true);
  });

  it('the built-in RG enforcement path (reportRound auto-stop) also pops it', () => {
    const ui = createUI();
    ui.balance.set(0.5);
    ui.bet.set(1);
    ui.autoplay.begin(Infinity);
    ui.reportRound(0, 1); // net loss; balance can no longer cover the next round → auto-stop
    expect(ui.autoplay.isActive).toBe(false);
    expect(ui.noticePanel.isOpen).toBe(true);
  });

  it('a normal stop with funds in hand shows nothing', () => {
    const ui = createUI();
    ui.balance.set(100);
    ui.bet.set(1);
    ui.autoplay.begin(10);
    ui.autoplay.stop();
    expect(ui.noticePanel.isOpen).toBe(false);
  });

  it('never stomps a notice that is already open (another RGS error stopped autoplay)', () => {
    const ui = createUI();
    ui.balance.set(0);
    ui.bet.set(1);
    ui.autoplay.begin(10);
    ui.showRgsError('ERR_MAINTENANCE'); // stops autoplay first, then presents ITS message
    expect(ui.noticeBlocks.get().some((b) => 'text' in b && b.text === 'openui.err.maintenance.message')).toBe(true);
  });

  it('spec.autoplay.insufficientFundsNotice: false opts out', () => {
    const ui = createUI({ autoplay: { insufficientFundsNotice: false } });
    ui.balance.set(0);
    ui.bet.set(1);
    ui.autoplay.begin(10);
    ui.autoplay.stop();
    expect(ui.noticePanel.isOpen).toBe(false);
  });
});
