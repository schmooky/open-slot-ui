import { describe, it, expect } from 'vitest';
import { createUI } from '../src/spec/createUI';
import { validateSpec } from '../src/spec/validateSpec';
import { resolveHudChrome, defaultHudChrome, type ChromeIssue } from '../src/chrome/hud';

/**
 * The switches a certification lab's checklist asks for. Each is off by default, so
 * a spec that does not name them gets the reference HUD exactly as before.
 */
describe('certification switches in the spec', () => {
  it('autoplay: the reference picks a count for START, and the round button stops a run', () => {
    const ui = createUI();
    expect(ui.autoplay.startOnSelect).toBe(false);
    expect(ui.autoplay.stopControl).toBe('round-button');
  });

  it('autoplay.startOnSelect and autoplay.stopControl reach the autoplay control', () => {
    const ui = createUI({ autoplay: { startOnSelect: true, stopControl: 'autoplay-button' } });
    expect(ui.autoplay.startOnSelect).toBe(true);
    expect(ui.autoplay.stopControl).toBe('autoplay-button');
  });

  it('an unknown stopControl is reported and the round button keeps the stop', () => {
    const spec = { autoplay: { stopControl: 'spin' as never } };
    const { issues } = validateSpec(spec);
    expect(issues.some((i) => i.path === 'autoplay.stopControl' && i.level === 'warn')).toBe(true);
    expect(createUI(spec).autoplay.stopControl).toBe('round-button');
  });

  it('hud.speedRow and hud.closeOnOutsideTap default to the reference', () => {
    expect(defaultHudChrome.speedRow).toBe('toggle');
    expect(defaultHudChrome.closeOnOutsideTap).toBe(false);
    const chrome = resolveHudChrome({ features: { turbo: true } });
    expect(chrome.speedRow).toBe('toggle');
    expect(chrome.closeOnOutsideTap).toBe(false);
  });

  it('resolve when asked for, and a bad value keeps the default with a warning', () => {
    const chrome = resolveHudChrome({ speedRow: 'expand', closeOnOutsideTap: true });
    expect(chrome.speedRow).toBe('expand');
    expect(chrome.closeOnOutsideTap).toBe(true);
    const issues: ChromeIssue[] = [];
    const bad = resolveHudChrome({ speedRow: 'open' as never, closeOnOutsideTap: 'yes' as never }, (i) => issues.push(i));
    expect(bad.speedRow).toBe('toggle');
    expect(bad.closeOnOutsideTap).toBe(false);
    expect(issues.map((i) => i.path).sort()).toEqual(['hud.closeOnOutsideTap', 'hud.speedRow']);
  });

  it('a UI built from the spec carries the chrome switches', () => {
    const ui = createUI({ hud: { speedRow: 'expand', closeOnOutsideTap: true } });
    expect(ui.chrome.speedRow).toBe('expand');
    expect(ui.chrome.closeOnOutsideTap).toBe(true);
  });
});
