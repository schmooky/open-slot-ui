import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountDomHud, type DomHud } from '../src/mountDomHud';

/**
 * SPACEBAR TO SPIN, as a certification lab tests it: the setting exists and works wherever there
 * is a keyboard (a laptop, a game framed small in a lobby), and is not offered on a touch-only
 * phone. And in a lobby's iframe, pressing the bar must hand the keyboard to the game.
 */
let hud: DomHud | undefined;
const SPEC = { hud: { menu: [{ kind: 'sound' as const }, { kind: 'spacebar' as const }, { kind: 'info' as const }] } };
const row = (): HTMLElement | null => document.getElementById('SpacebarToggle');
const press = (key: string): void => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};
const size = (w: number, h: number): void => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
};
const touchOnly = (on: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: on && (q.includes('pointer: coarse') || q.includes('hover: none')), media: q, addEventListener() {}, removeEventListener() {} }),
  });
};

afterEach(() => {
  hud?.dispose();
  hud = undefined;
  document.body.innerHTML = '';
  size(1024, 768);
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.restoreAllMocks();
});

describe('SPACEBAR TO SPIN follows the device, not the window', () => {
  it('stays in the menu of a small window on a computer (a lobby iframe on a laptop), and spins', () => {
    size(960, 540); // the touch LAYOUT (a side of 600px or less), but a mouse and a keyboard
    touchOnly(false);
    hud = mountDomHud(SPEC);
    expect(hud.root.dataset.channel).toBe('mobile');
    expect(row()).not.toBeNull();
    const spins: number[] = [];
    hud.on('spinRequested', () => spins.push(1));
    press(' ');
    expect(spins).toHaveLength(1);
    // …and survives the window being resized
    window.dispatchEvent(new Event('resize'));
    expect(row()).not.toBeNull();
  });

  it('is not offered on a touch-only phone', () => {
    size(390, 844);
    touchOnly(true);
    hud = mountDomHud(SPEC);
    expect(row()).toBeNull();
  });

  it('is not offered when the operator says the device is a phone', () => {
    hud = mountDomHud(SPEC, { channel: 'mobile' });
    expect(row()).toBeNull();
  });

  it('is offered on a desktop the operator names, whatever the media query says', () => {
    touchOnly(true);
    hud = mountDomHud(SPEC, { channel: 'desktop' });
    expect(row()).not.toBeNull();
  });
});

describe('a press on the bar hands the keyboard to the game', () => {
  it('focuses the window when the page around it held the focus (a lobby iframe)', () => {
    hud = mountDomHud(SPEC);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    document.getElementById('PlaceBetBtn')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true); // the button still takes no focus of its own
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('leaves the focus alone when the game already has it', () => {
    hud = mountDomHud(SPEC);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    document.getElementById('PlaceBetBtn')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(focus).not.toHaveBeenCalled();
  });
});
