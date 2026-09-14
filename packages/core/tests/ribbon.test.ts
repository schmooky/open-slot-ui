import { describe, it, expect } from 'vitest';
import {
  computeScreen,
  defaultLayoutConfig,
  defaultHudChrome,
  resolveHudChrome,
  solveRibbon,
  barHeightFor,
  channelFor,
  remFor,
  type HudChrome,
} from '../src/index';

const screen = (w: number, h: number) => computeScreen(w, h, defaultLayoutConfig);
const parts = { items: 3, buy: true, promo: false };

describe('hud chrome config', () => {
  it('defaults to the full bar', () => {
    expect(defaultHudChrome.dock).toBe('bottom');
    expect(defaultHudChrome.features.menu).toBe(true);
    expect(defaultHudChrome.features.buyFeature).toBe(true);
  });

  it('turns a feature off without touching the rest', () => {
    const c = resolveHudChrome({ features: { buyFeature: false, promotion: true } });
    expect(c.features.buyFeature).toBe(false);
    expect(c.features.promotion).toBe(true);
    expect(c.features.menu).toBe(true);
  });

  it('reports and drops junk instead of breaking (Charter P8)', () => {
    const issues: string[] = [];
    const c = resolveHudChrome(
      // deliberately wrong: unknown flag, wrong type, bad enum, absurd number
      { features: { nope: true, menu: 'yes' } as never, dock: 'middle' as never, scale: Number.NaN, maxWidth: 5000 },
      (i) => issues.push(i.code),
    );
    expect(c.features.menu).toBe(true); // kept the default
    expect(c.dock).toBe('bottom');
    expect(c.scale).toBe(1);
    expect(c.maxWidth).toBe(96); // clamped, not dropped
    expect(issues).toEqual(['unknown-feature', 'bad-feature', 'bad-value', 'bad-number']);
  });
});

describe('ribbon layout', () => {
  it('classifies the channel off the device bucket', () => {
    expect(channelFor(screen(1920, 1080))).toBe('desktop');
    expect(channelFor(screen(390, 844))).toBe('mobile');
    expect(channelFor(screen(768, 1024))).toBe('mobile'); // a portrait tablet: touch bar
    expect(channelFor(screen(1366, 768))).toBe('desktop'); // a laptop is not a tablet
  });

  it('docks the bar at the bottom and reserves exactly its height', () => {
    const s = screen(1920, 1080);
    const m = solveRibbon(s, defaultHudChrome, parts);
    expect(m.bar.height).toBeCloseTo(barHeightFor(s, defaultHudChrome));
    expect(m.bar.y + m.bar.height).toBeCloseTo(1080);
    expect(m.bar.width).toBe(1920);
  });

  it('mirrors to the top when docked there', () => {
    const s = screen(1920, 1080);
    const m = solveRibbon(s, resolveHudChrome({ dock: 'top' }), parts);
    expect(m.bar.y).toBe(0);
    expect(m.sheet.up).toBe(false);
  });

  it('caps the desktop plate width and centres it', () => {
    const s = screen(2560, 1440);
    const m = solveRibbon(s, defaultHudChrome, parts);
    expect(m.panel.x + m.panel.width / 2).toBeCloseTo(1280);
    expect(m.panel.width).toBeCloseTo(defaultHudChrome.maxWidth * m.rem);
  });

  it('lets the round button overflow the plate — the reference look', () => {
    const m = solveRibbon(screen(1920, 1080), defaultHudChrome, parts);
    expect(m.round.r * 2).toBeGreaterThan(m.panel.height);
  });

  it('keeps every part inside the viewport on a phone', () => {
    for (const [w, h] of [[390, 844], [360, 640], [430, 932], [844, 390]] as const) {
      const s = screen(w, h);
      const m = solveRibbon(s, defaultHudChrome, parts);
      expect(m.round.x - m.round.r).toBeGreaterThanOrEqual(0);
      expect(m.round.x + m.round.r).toBeLessThanOrEqual(w);
      expect(m.menuButton.x - m.menuButton.r).toBeGreaterThanOrEqual(0);
      expect(m.autoplayButton.x + m.autoplayButton.r).toBeLessThanOrEqual(w);
      // …and vertically: the round button overflows the plate, never the screen.
      expect(m.round.y - m.round.r).toBeGreaterThanOrEqual(0);
      expect(m.round.y + m.round.r).toBeLessThanOrEqual(h);
      for (const it of m.items) expect(it.x + it.width).toBeLessThanOrEqual(w + 0.001);
    }
  });

  it('stacks readouts over the action box in phone portrait, one row otherwise', () => {
    const portrait = solveRibbon(screen(390, 844), defaultHudChrome, parts);
    expect(portrait.items[0].y + portrait.items[0].height).toBeLessThanOrEqual(portrait.actionPanel.y + 0.001);

    const landscape = solveRibbon(screen(1920, 1080), defaultHudChrome, parts);
    const overlapY = Math.min(landscape.items[0].y + landscape.items[0].height, landscape.actionPanel.y + landscape.actionPanel.height) - Math.max(landscape.items[0].y, landscape.actionPanel.y);
    expect(overlapY).toBeGreaterThan(0); // same row
  });

  it('narrows the action box when its parts are switched off', () => {
    const s = screen(1920, 1080);
    const full = solveRibbon(s, defaultHudChrome, parts);
    const bare: HudChrome = resolveHudChrome({ features: { betWidget: false, betChangers: false, autoplay: false } });
    const lean = solveRibbon(s, bare, parts);
    expect(lean.actionPanel.width).toBeLessThan(full.actionPanel.width);
    expect(lean.round.r).toBeCloseTo(full.round.r); // the round button never shrinks
  });

  it('scales everything off one rem knob', () => {
    const s = screen(1920, 1080);
    const one = solveRibbon(s, defaultHudChrome, parts);
    const big = solveRibbon(s, resolveHudChrome({ scale: 1.5 }), parts);
    expect(big.rem).toBeCloseTo(one.rem * 1.5);
    expect(big.round.r).toBeCloseTo(one.round.r * 1.5);
    expect(remFor(s, defaultHudChrome)).toBeCloseTo(one.rem);
  });
});

describe('the phone bar drops what does not fit', () => {
  it('shows the bet ONCE on a phone — in the strip, not twice', () => {
    const portrait = solveRibbon(screen(390, 844), defaultHudChrome, parts);
    const landscape = solveRibbon(screen(844, 390), defaultHudChrome, parts);
    expect(portrait.betWidget.width).toBe(0);
    expect(landscape.betWidget.width).toBe(0);
    // …while the desktop bar keeps its bet widget in the action box.
    expect(solveRibbon(screen(1440, 900), defaultHudChrome, parts).betWidget.width).toBeGreaterThan(0);
  });

  it('never lets the landscape strip spill its readouts off screen', () => {
    const s = screen(844, 390);
    const m = solveRibbon(s, defaultHudChrome, parts);
    for (const it of m.items) expect(it.y + it.height).toBeLessThanOrEqual(390);
    expect(m.buyButton.y + m.buyButton.height).toBeLessThanOrEqual(390);
  });
});
