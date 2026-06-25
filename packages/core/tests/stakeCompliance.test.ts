import { describe, it, expect, vi } from 'vitest';
import { createUI } from '../src/spec/createUI';
import { AutoplayControl } from '../src/controls/AutoplayControl';
import { ReadoutControl } from '../src/controls/ReadoutControl';
import { SpinControl } from '../src/controls/SpinControl';
import { EventBus } from '../src/events';
import { resolveCurrency, formatAmount, isSocialCurrency } from '../src/format/currency';
import type { OpenUIEvents } from '../src/types';

const layout = { anchor: 'center' } as const;

describe('jurisdiction switchboard', () => {
  it('disabled* flags hide controls and force-hide them (resize-proof)', () => {
    const ui = createUI({ turbo: { modes: 3 }, jurisdiction: { disabledTurbo: true, disabledAutoplay: true, disabledBuyFeature: true, disabledFullscreen: true } });
    for (const id of ['turbo', 'autoplay', 'bonus', 'fullscreen']) {
      expect(ui.hidden.has(id)).toBe(true);
      expect(ui.forceHidden.has(id)).toBe(true);
    }
    // A force-hidden control can never be re-shown (e.g. by a responsive resize).
    ui.setHidden('turbo', false);
    expect(ui.hidden.has('turbo')).toBe(true);
  });

  it('disabledSuperTurbo collapses a 3-mode switcher to a 2-mode toggle', () => {
    const ui = createUI({ turbo: { modes: 3 }, jurisdiction: { disabledSuperTurbo: true } });
    expect(ui.turbo.modeCount).toBe(2);
  });

  it('disabledSlamstop locks the spin button mid-spin; disabledSpacebar kills hold-to-spin', () => {
    const ui = createUI({ spin: { press: 'hold-to-spin' }, jurisdiction: { disabledSlamstop: true, disabledSpacebar: true } });
    expect(ui.spin.allowSlamStop.get()).toBe(false);
    expect(ui.spin.holdToSpin).toBe(false);
  });

  it('display* flags reveal the mandated readouts; others stay hidden', () => {
    const ui = createUI({ jurisdiction: { displayRTP: true, displaySessionTimer: true } });
    expect(ui.hidden.has('rtp')).toBe(false);
    expect(ui.hidden.has('session-timer')).toBe(false);
    expect(ui.sessionTimer.running.get()).toBe(true);
    expect(ui.hidden.has('net-position')).toBe(true); // not requested → stays hidden
  });

  it('stores social mode + the round-duration hint (game-enforced)', () => {
    const ui = createUI({ jurisdiction: { socialCasino: true, minimumRoundDuration: 2500 } });
    expect(ui.social.get()).toBe(true);
    expect(ui.minimumRoundDuration).toBe(2500);
  });

  it('runtime applyJurisdiction works on a live HUD', () => {
    const ui = createUI({});
    expect(ui.hidden.has('rtp')).toBe(true);
    ui.applyJurisdiction({ displayRTP: true, disabledAutoplay: true });
    expect(ui.hidden.has('rtp')).toBe(false);
    expect(ui.forceHidden.has('autoplay')).toBe(true);
  });
});

describe('autoplay responsible-gambling limits', () => {
  it('stops when the count is exhausted (via reportResult)', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(3);
    a.reportResult(0, 1);
    a.reportResult(0, 1);
    expect(a.isActive).toBe(true);
    a.reportResult(0, 1);
    expect(a.isActive).toBe(false);
  });

  it('stops when cumulative net loss reaches the loss limit', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(100, { lossLimit: 3 });
    a.reportResult(0, 1);
    a.reportResult(0, 1);
    expect(a.isActive).toBe(true);
    a.reportResult(0, 1); // net loss 3 ≥ 3×1
    expect(a.isActive).toBe(false);
  });

  it('stops on a single win at/above the single-win limit', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(100, { singleWinLimit: 10 });
    a.reportResult(5, 1);
    expect(a.isActive).toBe(true);
    a.reportResult(12, 1); // win 12 ≥ 10×1
    expect(a.isActive).toBe(false);
  });

  it('a win offsets prior losses for the loss limit', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(100, { lossLimit: 2 });
    a.reportResult(0, 1); // net 1
    a.reportResult(5, 1); // net -3 (a win)
    a.reportResult(0, 1); // net -2
    expect(a.isActive).toBe(true);
  });
});

describe('currency table + formatter', () => {
  it('resolves display precision per currency, incl. zero-decimal + crypto', () => {
    expect(resolveCurrency('JPY').decimals).toBe(0);
    expect(resolveCurrency('BTC').decimals).toBe(8);
    expect(resolveCurrency('USD').decimals).toBe(2);
    expect(resolveCurrency('ZZZ').decimals).toBe(2); // unknown → safe default
  });

  it('maps social coins to GC/SC', () => {
    expect(resolveCurrency('XGC').code).toBe('GC');
    expect(resolveCurrency('XSC').code).toBe('SC');
    expect(isSocialCurrency('XGC')).toBe(true);
    expect(isSocialCurrency('USD')).toBe(false);
  });

  it('formats grouped amounts with sign + code position', () => {
    expect(formatAmount(1234.5, { code: 'USD', decimals: 2 })).toBe('1,234.50 USD');
    expect(formatAmount(-5, { code: 'USD', decimals: 2 }, { signed: true })).toBe('-5.00 USD');
    expect(formatAmount(5, { code: 'USD', decimals: 2 }, { signed: true })).toBe('+5.00 USD');
    expect(formatAmount(1000, { code: '$', decimals: 0, position: 'prefix' })).toBe('$ 1,000');
    expect(formatAmount(NaN, { code: 'USD', decimals: 2 })).toBe('0.00 USD');
  });
});

describe('ReadoutControl', () => {
  it('ticks a duration only while running', () => {
    const r = new ReadoutControl({ id: 'session-timer', kind: 'duration', layout });
    r.start();
    r.tick(5);
    r.tick(10);
    expect(r.get()).toBe(15);
    r.stop();
    r.tick(5);
    expect(r.get()).toBe(15);
    r.reset();
    expect(r.get()).toBe(0);
  });

  it('never-rejects malformed input', () => {
    const r = new ReadoutControl({ id: 'rtp', kind: 'percent', value: 96, layout });
    r.set(NaN);
    expect(r.get()).toBe(96);
    r.set(97.5);
    expect(r.get()).toBe(97.5);
  });
});

describe('OpenUI reportRound + mute', () => {
  it('reportRound updates net position and feeds autoplay limits', () => {
    const ui = createUI({});
    ui.applyJurisdiction({ displayNetPosition: true });
    ui.reportRound(5, 1);
    expect(ui.netPosition.get()).toBe(4);
    ui.reportRound(0, 1);
    expect(ui.netPosition.get()).toBe(3);
  });

  it('mute silences both sliders and restores the prior levels', () => {
    const ui = createUI({});
    ui.musicSlider.setNormalized(0.8);
    ui.sfxSlider.setNormalized(0.6);
    ui.setMuted(true);
    expect(ui.muted.get()).toBe(true);
    expect(ui.musicSlider.value.get()).toBe(0);
    expect(ui.sfxSlider.value.get()).toBe(0);
    ui.setMuted(false);
    expect(ui.musicSlider.value.get()).toBeCloseTo(0.8);
    expect(ui.sfxSlider.value.get()).toBeCloseTo(0.6);
  });
});

describe('SpinControl slam-stop guard', () => {
  it('locks the button (no skip) in auto when slam-stop is disabled', () => {
    const bus = new EventBus<OpenUIEvents>();
    const skip = vi.fn();
    bus.on('skipRequested', skip);
    const spin = new SpinControl({ layout }, bus);
    spin.auto();
    expect(spin.interactable).toBe(true);
    spin.activate();
    expect(skip).toHaveBeenCalledTimes(1);

    spin.allowSlamStop.set(false);
    expect(spin.interactable).toBe(false);
    spin.activate();
    expect(skip).toHaveBeenCalledTimes(1); // suppressed
  });
});
