import { describe, it, expect } from 'vitest';
import { createUI } from '../src/spec/createUI';
import { OpenUI } from '../src/OpenUI';
import { resolvePlacement } from '../src/layout/anchor';
import { landscapeDefaultLayouts, portraitDefaultLayouts } from '../src/layout/defaultLayouts';

// The v0.2.x regression this file guards: the base layouts carried the MOBILE
// arrangement (spin offset -440), which on any landscape screen (1080-tall
// reference) parked the spin button at ~59% of the screen height — mid-reels.
// The defaults are now per-orientation: landscape = Figma "Desk DEF", portrait
// = Figma "Mobile DEF" (installed by createUI as a built-in responsive bucket).

const DESKTOP = [1920, 1080] as const;
const PHONE = [390, 844] as const;

describe('built-in per-orientation default layouts', () => {
  it('keeps the whole bottom cluster in the lower fifth of a desktop screen', () => {
    const ui = createUI();
    ui.setScreen(...DESKTOP);
    const screen = ui.screen.get();
    for (const id of ['spin', 'autoplay', 'turbo', 'balance', 'bet', 'bet-plus', 'bet-minus']) {
      const c = ui.control(id)!;
      const p = resolvePlacement(c.layout, screen);
      expect(p.y / screen.height, `${id} sits low`).toBeGreaterThan(0.8);
    }
  });

  it('reflows to the portrait (Mobile DEF) layout on a phone and restores on rotate', () => {
    const ui = createUI();
    ui.setScreen(...PHONE);
    expect(ui.spin.layout.offset).toEqual(portraitDefaultLayouts.spin!.offset);
    expect(ui.spin.layout.scale).toBe(portraitDefaultLayouts.spin!.scale);
    ui.setScreen(...DESKTOP);
    expect(ui.spin.layout.offset).toEqual(landscapeDefaultLayouts.spin!.offset);
  });

  it('plain `new OpenUI()` constructs with the landscape defaults', () => {
    const ui = new OpenUI();
    expect(ui.spin.layout.anchor).toBe('bottom-center');
    expect(ui.spin.layout.offset).toEqual(landscapeDefaultLayouts.spin!.offset);
  });

  it('a host static layout wins over the built-in portrait bucket, across rotations', () => {
    const ui = createUI({ controls: { spin: { layout: { anchor: 'bottom-center', offset: [0, -99] } } } });
    ui.setScreen(...PHONE);
    expect(ui.spin.layout.offset).toEqual([0, -99]);
    ui.setScreen(...DESKTOP);
    expect(ui.spin.layout.offset).toEqual([0, -99]);
  });

  it('a host responsive.portrait entry wins over the built-in one for that control only', () => {
    const ui = createUI({
      responsive: { portrait: { controls: { spin: { layout: { anchor: 'bottom-center', offset: [0, -777] } } } } },
    });
    ui.setScreen(...PHONE);
    expect(ui.spin.layout.offset).toEqual([0, -777]); // host wins for spin
    expect(ui.turbo.layout.offset).toEqual(portraitDefaultLayouts.turbo!.offset); // built-in still covers the rest
  });

  it('every built-in id names a real control', () => {
    const ui = new OpenUI();
    for (const id of Object.keys({ ...landscapeDefaultLayouts, ...portraitDefaultLayouts })) {
      expect(ui.control(id), `control '${id}' exists`).toBeTruthy();
    }
  });
});
