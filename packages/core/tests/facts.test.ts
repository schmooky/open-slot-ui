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

describe('auditRules — the "can\'t forget" rules audit', () => {
  it('a mode-stats block satisfies every per-mode RTP/max-win requirement at once', () => {
    const rules: BlockSpec[] = [
      { kind: 'text', id: 't', text: 'Lucky Bet doubles your stake. Golden Rush is the bonus: exactly 3 free spins, and free spins cannot be retriggered.' },
      { kind: 'mode-stats', id: 'ms' },
      { kind: 'legal', id: 'l', text: 'Malfunction voids all wins and plays.' },
      { kind: 'heading', id: 'hc', text: 'Controls' },
    ];
    expect(auditRules(FACTS, rules)).toEqual([]);
  });

  it('forgetting a mode\'s RTP / max win in the rules is a REQUIRED finding', () => {
    const rules: BlockSpec[] = [
      { kind: 'text', id: 't', text: 'Golden Rush: 3 free spins, no retrigger. Lucky Bet is an ante. Base game RTP 95.50% up to 2,208×.' },
      { kind: 'heading', id: 'hc', text: 'Controls' },
      { kind: 'legal', id: 'l', text: 'Malfunction voids all plays.' },
    ];
    const found = codes(FACTS, rules);
    // base is fully covered by the prose (name + 95.50% + 2,208×). The shared RTP figure
    // also covers the other modes (they're named + the value is stated — the heuristic is
    // deliberately global, so "every mode keeps the same 95.50% RTP" never false-flags)…
    expect(found).not.toContain('required:rules-missing-rtp:rtp:base');
    expect(found).not.toContain('required:rules-missing-maxwin:maxwin:base');
    expect(found).not.toContain('required:rules-missing-rtp:rtp:lucky');
    // …but the FORGOTTEN 5,000× max wins of Lucky Bet + Golden Rush are still caught.
    expect(found).toContain('required:rules-missing-maxwin:maxwin:lucky');
    expect(found).toContain('required:rules-missing-maxwin:maxwin:bonus');
  });

  it('text heuristics accept the natural forms: "95.5%" ≡ "95.50%", "5,000×" ≡ "5000x"', () => {
    const mk = (text: string): BlockSpec[] => [
      { kind: 'text', id: 't', text },
      { kind: 'heading', id: 'hc', text: 'Controls' },
      { kind: 'legal', id: 'l', text: 'Malfunction voids.' },
    ];
    const facts: GameFacts = { modes: [{ id: 'base', name: 'Base', kind: 'base', rtp: 95.5, maxWinX: 5000 }], freeSpins: false };
    expect(codes(facts, mk('Base pays to 95.5% RTP, capped at 5000x.'))).toEqual([]);
    expect(codes(facts, mk('Base pays to 95.50 % RTP, capped at 5,000×.'))).toEqual([]);
    expect(codes(facts, mk('Base is great.'))).toContain('required:rules-missing-rtp:rtp:base');
  });

  it('a feature configured in the buy modal but never described is a REQUIRED finding', () => {
    const rules: BlockSpec[] = [{ kind: 'mode-stats', id: 'ms' }, { kind: 'heading', id: 'hc', text: 'Controls' }, { kind: 'legal', id: 'l', text: 'Malfunction voids.' }];
    const found = codes(FACTS, rules);
    // mode-stats covers RTP/max-win — but the FEATURES still need prose (their NAME).
    expect(found).toContain('required:rules-missing-feature:feature:lucky');
    expect(found).toContain('required:rules-missing-feature:feature:bonus');
  });

  it('covers tags mark hand-written prose as covering a topic the heuristics miss', () => {
    const rules: BlockSpec[] = [
      { kind: 'text', id: 't', text: 'The golden bonus round and the double-stake option are described here at length.', covers: ['feature:bonus', 'feature:lucky', 'rtp:base', 'maxwin:base', 'rtp:lucky', 'maxwin:lucky', 'rtp:bonus', 'maxwin:bonus', 'freespins', 'freespins:count', 'freespins:retrigger', 'controls'] },
      { kind: 'legal', id: 'l', text: 'Malfunction voids.' },
    ];
    expect(auditRules(FACTS, rules)).toEqual([]);
  });

  it('free-spins info is HIGHLY RECOMMENDED: undeclared facts, missing count, missing retrigger', () => {
    const base: BlockSpec[] = [{ kind: 'mode-stats', id: 'ms' }, { kind: 'text', id: 't', text: 'Lucky Bet & Golden Rush.' }, { kind: 'heading', id: 'hc', text: 'Controls' }, { kind: 'legal', id: 'l', text: 'Malfunction voids.' }];
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
