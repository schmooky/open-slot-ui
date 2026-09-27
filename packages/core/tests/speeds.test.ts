import { describe, it, expect } from 'vitest';
import { createUI } from '../src';
import { resolveHudChrome, defaultHudChrome, type ChromeIssue } from '../src/chrome/hud';

/**
 * SPEEDS ARE DATA.
 *
 * The reference ships TURBO and SUPER TURBO™, and for a long time so did this
 * library — two hard-wired rows, because that is what the markup had. A game with
 * three speeds, or one, or one of its own name, now declares them; the HUD shows
 * however many there are, and each gets its own switches.
 */
describe('the speeds a game declares', () => {
  it('ships turbo by default, and super turbo only when asked', () => {
    expect(defaultHudChrome.speeds.map((s) => s.id)).toEqual(['turbo']);
    expect(resolveHudChrome({ features: { superTurbo: true } }).speeds.map((s) => s.id)).toEqual(['turbo', 'super-turbo']);
    expect(resolveHudChrome({ features: { turbo: false } }).speeds).toEqual([]);
  });

  it('takes as many as the game lists, in the order it lists them', () => {
    const chrome = resolveHudChrome({
      speeds: [{ id: 'quick' }, { id: 'quicker', name: 'QUICKER', icon: 'icon-bolt' }, { id: 'ludicrous', scopes: ['base'] }],
    });
    expect(chrome.speeds.map((s) => s.id)).toEqual(['quick', 'quicker', 'ludicrous']);
    expect(chrome.speeds[1]).toMatchObject({ name: 'QUICKER', icon: 'icon-bolt' });
    expect(chrome.speeds[2]!.scopes).toEqual(['base']);
  });

  it('names and dresses a speed from its id when the game says no more', () => {
    const [speed] = resolveHudChrome({ speeds: [{ id: 'hyper' }] }).speeds;
    expect(speed).toMatchObject({ id: 'hyper', name: 'hyper', icon: 'icon-hyper', scopes: ['base', 'bonus'] });
  });

  it('reports a speed with no id, and a second one under the same id, and keeps going', () => {
    const issues: ChromeIssue[] = [];
    const chrome = resolveHudChrome(
      { speeds: [{ id: 'turbo' }, { id: '' }, { id: 'turbo' }, { id: 'nitro' }] },
      (i) => issues.push(i),
    );
    expect(chrome.speeds.map((s) => s.id)).toEqual(['turbo', 'nitro']);
    expect(issues.map((i) => i.code)).toEqual(['bad-speed', 'duplicate-speed']);
  });

  it('gives every declared speed its own pair of switches', () => {
    const ui = createUI({ hud: { speeds: [{ id: 'turbo' }, { id: 'nitro' }, { id: 'warp' }] } });
    expect(ui.speeds.map((s) => s.id)).toEqual(['turbo', 'nitro', 'warp']);
    const warp = ui.speeds[2]!;
    expect(warp.isOn).toBe(false);
    warp.base.toggle();
    expect(warp.isOn).toBe(true);
    // ...and the others are not dragged along with it.
    expect(ui.speeds[1]!.isOn).toBe(false);
    warp.set(false);
    expect(warp.base.isOn).toBe(false);
    expect(warp.bonus.isOn).toBe(false);
  });

  it('keeps ui.turboBase and friends pointing at the speeds they are named after', () => {
    const ui = createUI({ hud: { features: { superTurbo: true } } });
    ui.speeds[0]!.base.toggle();
    expect(ui.turboBase.isOn).toBe(true);
    ui.superTurboBonus.toggle();
    expect(ui.speeds[1]!.isOn).toBe(true);
  });

  it('leaves the legacy toggles standing when a game replaces the speeds', () => {
    const ui = createUI({ hud: { speeds: [{ id: 'nitro' }] } });
    expect(ui.speeds.map((s) => s.id)).toEqual(['nitro']);
    // A host still reading ui.turboBase gets a switch, not a crash — it simply is
    // not one of this game's speeds.
    expect(ui.turboBase.isOn).toBe(false);
    ui.turboBase.toggle();
    expect(ui.speeds[0]!.isOn).toBe(false);
  });

  it('starts a speed on when the game says it starts on', () => {
    const ui = createUI({ hud: { speeds: [{ id: 'turbo', initial: true }] } });
    expect(ui.speeds[0]!.isOn).toBe(true);
  });
});

/** The menu is a list, and a game can write its own. */
describe('the main menu a game declares', () => {
  it('lists the rows its flags leave on, speeds in the middle', () => {
    const rows = resolveHudChrome({ features: { superTurbo: true, lobby: true } }).menu;
    expect(rows.map((r) => r.id)).toEqual(['sound', 'music', 'turbo', 'super-turbo', 'history', 'info', 'lobby']);
    expect(rows.find((r) => r.id === 'super-turbo')).toMatchObject({ kind: 'speed', speed: 'super-turbo', icon: 'icon-super-turbo-off' });
  });

  it('drops the rows their features switched off', () => {
    const rows = resolveHudChrome({ features: { music: false, history: false, info: false } }).menu;
    expect(rows.map((r) => r.id)).toEqual(['sound', 'turbo']);
  });

  it("takes the game's own list, in the game's own order", () => {
    const rows = resolveHudChrome({
      speeds: [{ id: 'nitro' }],
      menu: [
        { kind: 'info' },
        { kind: 'speed', speed: 'nitro', label: 'NITRO' },
        { kind: 'action', id: 'support', label: 'SUPPORT', icon: 'icon-help' },
        { kind: 'sound' },
      ],
    }).menu;
    expect(rows.map((r) => r.id)).toEqual(['info', 'nitro', 'support', 'sound']);
    expect(rows[1]).toMatchObject({ kind: 'speed', label: 'NITRO' });
    expect(rows[2]).toMatchObject({ kind: 'action', icon: 'icon-help' });
  });

  it('reports a row it does not know and one pointing at a speed that is not there', () => {
    const issues: ChromeIssue[] = [];
    const rows = resolveHudChrome(
      // @ts-expect-error — a host can send anything; the library must survive it
      { menu: [{ kind: 'teleport' }, { kind: 'speed', speed: 'nitro' }, { kind: 'action' }, { kind: 'info' }] },
      (i) => issues.push(i),
    ).menu;
    expect(rows.map((r) => r.id)).toEqual(['info']);
    expect(issues.map((i) => i.code)).toEqual(['unknown-menu-item', 'unknown-speed', 'bad-menu-item']);
  });
});

/** A support row, a link, a readout order, a stop the player understands. */
describe('the rest of the switchboard', () => {
  it('gives a support row a page to open, in a tab of its own', () => {
    const rows = resolveHudChrome({ menu: [{ kind: 'support', href: 'https://help.example' }] }).menu;
    expect(rows[0]).toMatchObject({ id: 'support', kind: 'support', href: 'https://help.example', target: '_blank' });
  });

  it('lets any row carry a link, and keeps the lobby in the same window', () => {
    const rows = resolveHudChrome({ menu: [{ kind: 'lobby', href: '/lobby' }, { kind: 'action', id: 'terms', href: 'https://t.example' }] }).menu;
    expect(rows[0]).toMatchObject({ href: '/lobby', target: '_self' });
    expect(rows[1]).toMatchObject({ href: 'https://t.example', target: '_blank' });
  });

  it('orders the readouts the way the game asks, and drops what it left out', () => {
    expect(defaultHudChrome.readouts).toEqual(['freeRounds', 'balance', 'bet', 'freeRoundsWin', 'win']);
    expect(resolveHudChrome({ readouts: ['bet', 'balance'] }).readouts).toEqual(['bet', 'balance']);
    expect(resolveHudChrome({ features: { win: false, freeRounds: false } }).readouts).toEqual(['balance', 'bet']);
  });

  it('reports a readout it does not know and keeps the rest', () => {
    const issues: ChromeIssue[] = [];
    // @ts-expect-error — a host can send anything
    const out = resolveHudChrome({ readouts: ['balance', 'jackpot'] }, (i) => issues.push(i));
    expect(out.readouts).toEqual(['balance']);
    expect(issues[0]!.code).toBe('unknown-readout');
  });

  it('stops an autoplay run on any win when the player asked it to', () => {
    const ui = createUI({ autoplay: { options: [10], stopOnAnyWin: true } });
    ui.autoplay.begin(10, { stopOnAnyWin: true });
    expect(ui.autoplay.isActive).toBe(true);
    ui.autoplay.reportResult(0, 1); // a losing round does not stop it
    expect(ui.autoplay.isActive).toBe(true);
    ui.autoplay.reportResult(0.5, 1); // any win does
    expect(ui.autoplay.isActive).toBe(false);
  });

  it('leaves the run alone on a small win when nobody asked', () => {
    const ui = createUI({ autoplay: { options: [10] } });
    ui.autoplay.begin(10, {});
    ui.autoplay.reportResult(0.5, 1);
    expect(ui.autoplay.isActive).toBe(true);
  });
});
