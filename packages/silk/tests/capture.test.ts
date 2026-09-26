import { describe, it, expect } from 'vitest';
import capture from '../src/skin.capture.json';
import { anchorOf, cssColor, parseShadow } from '../src/measure';

/**
 * THE CAPTURE IS THE DESIGN, so it is the thing worth guarding.
 *
 * `scripts/capture.mjs` measures the markup HUD and writes what it saw; the canvas
 * binding replays it. A re-capture that loses a button, a window or a layer would
 * silently produce a HUD that looks right and cannot be used, so the shape of the
 * capture is checked here rather than noticed later.
 */
const STATES = ['idle', 'menu', 'autoplay', 'info', 'buy', 'history'] as const;
const cap = capture as unknown as {
  viewport: { w: number; h: number };
  states: Record<string, Array<Record<string, unknown>>>;
  hits: Record<string, Array<{ id: string; x: number; y: number; w: number; h: number; zone?: string }>>;
};

describe('the captured skin', () => {
  it('has every state a player can put the HUD into', () => {
    expect(Object.keys(cap.states).sort()).toEqual([...STATES].sort());
    expect(Object.keys(cap.hits).sort()).toEqual([...STATES].sort());
  });

  it('was measured at one known size', () => {
    expect(cap.viewport).toEqual({ w: 1440, h: 900 });
  });

  it('draws the bar in every state', () => {
    for (const state of STATES) {
      const plate = cap.states[state]!.find((n) => n['cls'] === 'UiRibbonUserPanel__container');
      expect(plate, `${state} has no bar`).toBeTruthy();
      expect(plate!['w']).toBe(840);
    }
  });

  it('gives every box a zone and a paint rank', () => {
    for (const state of STATES) {
      for (const n of cap.states[state]!) {
        expect(n['zone'], `${state}: ${String(n['cls'])}`).toBeTruthy();
        expect(typeof n['rank']).toBe('number');
      }
    }
  });

  it('keeps the buttons the binding binds', () => {
    const needs: Record<string, string[]> = {
      idle: ['MainMenuToggle', 'PlaceBetBtn', 'AutoplayBtn', 'FeatureBuyToggle', 'BetAmountIncrease', 'BetAmountDecrease'],
      menu: ['GameInfoBtn', 'BetHistoryBtn', 'SoundToggle', 'MusicToggle', 'TurboToggle'],
      info: ['GameInfoClose'],
      history: ['BetHistoryClose'],
      buy: ['FeatureBuyClose'],
      autoplay: ['StartAutoplayBtn'],
    };
    for (const [state, ids] of Object.entries(needs)) {
      const have = new Set(cap.hits[state]!.map((h) => h.id));
      for (const id of ids) expect(have.has(id), `${state} lost ${id}`).toBe(true);
    }
  });

  it('puts a window behind a dim that covers the screen', () => {
    for (const state of ['info', 'buy', 'history'] as const) {
      const nodes = cap.states[state]!;
      expect(nodes.some((n) => n['zone'] === 'window'), `${state} has no window`).toBe(true);
      const dim = nodes.find((n) => Number(n['w']) >= 1440 && Number(n['h']) >= 900);
      expect(dim, `${state} has no backdrop`).toBeTruthy();
      expect(String(dim!['bg'])).toMatch(/rgba?\(/);
    }
  });

  it('measures where each line of text landed', () => {
    const lines = cap.states.info!.filter((n) => Array.isArray(n['lines']) && (n['lines'] as unknown[]).length);
    expect(lines.length).toBeGreaterThan(20);
    for (const n of lines) {
      for (const l of n['lines'] as Array<{ text: string; w: number }>) {
        expect(l.text.trim().length).toBeGreaterThan(0);
        expect(l.w).toBeGreaterThan(0);
      }
    }
  });

  it("measures where each icon's ink landed", () => {
    const glyphs = cap.states.idle!.filter((n) => n['glyph']);
    expect(glyphs.length).toBeGreaterThan(3);
    for (const n of glyphs) {
      const g = n['glyph'] as { ch: string; ink?: { w: number; h: number } };
      expect(g.ch.codePointAt(0)!).toBeGreaterThanOrEqual(0xe000);
      expect(g.ink?.w, String(n['cls'])).toBeGreaterThan(0);
    }
  });
});

describe('filing a box under an edge', () => {
  const view = { w: 1440, h: 900 };
  it('sends the bar down, the strip up and a window to the middle', () => {
    expect(anchorOf({ x: 350, y: 790, w: 840, h: 90, zone: 'bottom' }, view)).toBe('bottom');
    expect(anchorOf({ x: 4, y: 4, w: 240, h: 26, zone: 'top' }, view)).toBe('top');
    expect(anchorOf({ x: 300, y: 90, w: 840, h: 700, zone: 'window' }, view)).toBe('center');
  });
  it('stretches anything that covers the screen', () => {
    expect(anchorOf({ x: 0, y: 0, w: 1440, h: 900, zone: 'window' }, view)).toBe('full');
  });
  it('falls back to where the box sits when a capture has no zones', () => {
    expect(anchorOf({ x: 0, y: 820, w: 100, h: 40 }, view)).toBe('bottom');
    expect(anchorOf({ x: 0, y: 10, w: 100, h: 20 }, view)).toBe('top');
    expect(anchorOf({ x: 0, y: 400, w: 100, h: 40 }, view)).toBe('center');
  });
});

describe('reading a colour the browser hands back', () => {
  it('reads rgb and rgba', () => {
    expect(cssColor('rgb(255, 198, 55)')).toEqual({ color: 0xffc637, alpha: 1 });
    expect(cssColor('rgba(0, 0, 0, 0.6)')).toEqual({ color: 0x000000, alpha: 0.6 });
  });
  it('reads a wide-gamut colour', () => {
    const c = cssColor('color(srgb 0.980392 0.980392 0.980392 / 0.75)');
    expect(c.color).toBe(0xfafafa);
    expect(c.alpha).toBe(0.75);
  });
  it('reads hex, short and long', () => {
    expect(cssColor('#fff')).toEqual({ color: 0xffffff, alpha: 1 });
    expect(cssColor('#ffc637')).toEqual({ color: 0xffc637, alpha: 1 });
  });
  it('treats a colour it cannot read as opaque black, and transparent as nothing', () => {
    expect(cssColor('transparent').alpha).toBe(0);
    expect(cssColor('rebeccapurple')).toEqual({ color: 0x000000, alpha: 1 });
  });
});

describe('reading a box shadow', () => {
  it('takes the colour, the offset and the blur', () => {
    expect(parseShadow('rgba(0, 0, 0, 0.3) 0px 3px 5px 3px')).toEqual({
      color: 'rgba(0, 0, 0, 0.3)',
      dx: 0,
      dy: 3,
      blur: 5,
    });
  });
  it('gives up on a shadow with no numbers', () => {
    expect(parseShadow('none')).toBeNull();
  });
});
