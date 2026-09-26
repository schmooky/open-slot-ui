import { describe, it, expect } from 'vitest';
import raw from '../src/skin.capture.json';
import { Skin, type RawCapture } from '../src/capture';
import { anchorOf, cssColor, parseShadow } from '../src/measure';

/**
 * THE CAPTURE IS THE DESIGN, so it is the thing worth guarding.
 *
 * `scripts/capture.mjs` measures the markup HUD at every size the stylesheet lays it
 * out differently and writes down what the browser painted; the canvas binding
 * replays it. A re-capture that loses a button, a window, a breakpoint or a layer
 * would produce a HUD that looks right and cannot be used, so the shape of the
 * capture is checked here rather than noticed later.
 */
const STATES = ['idle', 'menu', 'autoplay', 'info', 'buy', 'spinning', 'stopping', 'history'] as const;
const skin = new Skin(raw as unknown as RawCapture);

describe('the captured skin', () => {
  it('holds every size the stylesheet lays out differently', () => {
    expect(skin.sizes.length).toBeGreaterThanOrEqual(5);
    const widths = skin.sizes.map((s) => s.w);
    expect(widths).toContain(1920);
    expect(widths).toContain(1440);
    expect(widths).toContain(430);
    expect(skin.sizes.some((s) => s.channel === 'mobile')).toBe(true);
    expect(skin.sizes.some((s) => s.channel === 'desktop')).toBe(true);
  });

  it('holds every state a player can put the HUD into, at every size', () => {
    for (let at = 0; at < skin.sizes.length; at++) {
      expect(skin.states(at).sort(), `size ${at}`).toEqual([...STATES].sort());
    }
  });

  it('draws the bar at every size', () => {
    for (let at = 0; at < skin.sizes.length; at++) {
      for (const state of STATES) {
        // The desktop bar sits on a plate; the touch one is transparent, so what is
        // checked is that the bar's own readouts are there.
        const nodes = skin.nodes(at, state);
        const bar = nodes.find((n) => n.cls === 'UiRibbonUserPanel__container') ?? nodes.find((n) => n.cls?.startsWith('DataPanelItem'));
        expect(bar, `${skin.sizes[at]!.w}px ${state} has no bar`).toBeTruthy();
      }
    }
  });

  it('gives every box a zone and a paint rank', () => {
    for (const state of STATES) {
      for (const n of skin.nodes(1, state)) {
        expect(n.zone, `${state}: ${String(n.cls)}`).toBeTruthy();
        expect(typeof n.rank).toBe('number');
      }
    }
  });

  it('keeps the buttons the binding binds, at every size', () => {
    const needs: Record<string, string[]> = {
      idle: ['MainMenuToggle', 'PlaceBetBtn', 'AutoplayBtn', 'FeatureBuyToggle', 'BetAmountIncrease', 'BetAmountDecrease'],
      menu: ['GameInfoBtn', 'BetHistoryBtn', 'SoundToggle', 'MusicToggle'],
      info: ['GameInfoClose'],
      history: ['BetHistoryClose'],
      buy: ['FeatureBuyClose'],
      autoplay: ['StartAutoplayBtn'],
    };
    for (let at = 0; at < skin.sizes.length; at++) {
      for (const [state, ids] of Object.entries(needs)) {
        const have = skin.hits(at, state);
        for (const id of ids) expect(have.has(id), `${skin.sizes[at]!.w}px ${state} lost ${id}`).toBe(true);
      }
    }
  });

  it('puts a window behind a dim that covers the screen', () => {
    for (const state of ['info', 'buy', 'history'] as const) {
      const nodes = skin.nodes(1, state);
      expect(nodes.some((n) => n.zone === 'window'), `${state} has no window`).toBe(true);
      const dim = nodes.find((n) => n.w >= 1440 && n.h >= 900);
      expect(dim, `${state} has no backdrop`).toBeTruthy();
      expect(String(dim!.bg)).toMatch(/rgba?\(/);
    }
  });

  it('dims the round button while a round is in flight', () => {
    const idle = skin.nodes(1, 'idle').find((n) => n.id === 'PlaceBetBtn');
    const busy = skin.nodes(1, 'spinning').find((n) => n.id === 'PlaceBetBtn');
    expect(idle!.opacity ?? 1).toBe(1);
    expect(busy!.opacity ?? 1).toBeLessThan(1);
  });

  it('measures where each line of text landed', () => {
    const lines = skin.nodes(1, 'info').filter((n) => n.lines?.length);
    expect(lines.length).toBeGreaterThan(20);
    for (const n of lines) for (const l of n.lines!) {
      expect(l.text.trim().length).toBeGreaterThan(0);
      expect(l.w).toBeGreaterThan(0);
    }
  });

  it("measures where each icon's ink landed", () => {
    const glyphs = skin.nodes(1, 'idle').filter((n) => n.glyph);
    expect(glyphs.length).toBeGreaterThan(3);
    for (const n of glyphs) {
      expect(n.glyph!.ch.codePointAt(0)!).toBeGreaterThanOrEqual(0xe000);
      expect(n.glyph!.ink?.w, String(n.cls)).toBeGreaterThan(0);
    }
  });

  it('expands colours, fonts and clips out of their tables', () => {
    const plate = skin.nodes(1, 'idle').find((n) => n.cls === 'UiRibbonUserPanel__container');
    expect(plate!.bg).toMatch(/^rgba?\(/);
    const text = skin.nodes(1, 'idle').find((n) => n.font);
    expect(typeof text!.font!.size).toBe('number');
    expect(typeof text!.font!.family).toBe('string');
    const clipped = skin.nodes(1, 'info').find((n) => n.clip);
    expect(clipped!.clip).toHaveLength(4);
  });
});

describe('choosing a breakpoint for a window', () => {
  it('draws a desktop window at the widest design that fits', () => {
    expect(skin.sizes[skin.pick(1920, 1080)]!.w).toBe(1920);
    expect(skin.sizes[skin.pick(1600, 900)]!.w).toBe(1440);
    expect(skin.sizes[skin.pick(1300, 800)]!.w).toBe(1180);
  });
  it('keeps a portrait window on a portrait design', () => {
    const phone = skin.sizes[skin.pick(390, 844)]!;
    expect(phone.h).toBeGreaterThan(phone.w);
    expect(phone.channel).toBe('mobile');
  });
  it('gives a phone on its side the design measured on its side', () => {
    const landscape = skin.sizes[skin.pick(844, 390)]!;
    expect(landscape.w).toBeGreaterThan(landscape.h);
    expect(landscape.channel).toBe('mobile');
  });
  it('falls back to the narrowest design for a window narrower than any of them', () => {
    expect(skin.sizes[skin.pick(320, 700)]!.w).toBe(430);
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
