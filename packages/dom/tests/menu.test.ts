import { describe, it, expect, afterEach } from 'vitest';
import { mountDomHud, type DomHud } from '../src/mountDomHud';

/**
 * THE MENU IS WHAT THE GAME SAYS IT IS.
 *
 * Its rows used to be frozen into the markup — two speeds, in one order, for every
 * game. They are now written from `ui.chrome.menu`, so these check that what a host
 * declares is what a player gets, wearing the classes the skin dresses.
 */
let hud: DomHud | undefined;
const mount = (spec: Parameters<typeof mountDomHud>[0], opts?: Parameters<typeof mountDomHud>[1]): DomHud => {
  document.body.innerHTML = '';
  hud = mountDomHud(spec, opts);
  return hud;
};
const rows = (): string[] => [...document.querySelectorAll('#MainMenu li')].map((li) => li.id || (li.className.match(/MainMenuItem--([\w-]+)/)?.[1] ?? ''));

afterEach(() => {
  hud?.dispose();
  hud = undefined;
});

describe('the main menu the markup binding writes', () => {
  it('shows the rows the flags leave on', () => {
    mount({ hud: { features: { superTurbo: true, lobby: true } } });
    expect(rows()).toEqual(['SoundToggle', 'MusicToggle', 'turbo', 'super-turbo', 'BetHistoryBtn', 'GameInfoBtn', 'LobbyAnchor']);
  });

  it('writes a row per declared speed, with its own ids, icon and switches', () => {
    mount({ hud: { speeds: [{ id: 'nitro', name: 'NITRO', icon: 'icon-bolt' }, { id: 'warp', scopes: ['base'] }] } });
    expect(rows()).toEqual(['SoundToggle', 'MusicToggle', 'nitro', 'warp', 'BetHistoryBtn', 'GameInfoBtn']);
    const nitro = document.getElementById('NitroToggle');
    expect(nitro).not.toBeNull();
    expect(nitro!.querySelector('[class^=icon-]')!.className).toBe('icon-bolt-off');
    expect(document.getElementById('NitroBaseGameToggler')).not.toBeNull();
    expect(document.getElementById('NitroBonusGameToggler')).not.toBeNull();
    // A speed with one scope gets one switch, not two greyed ones.
    expect(document.getElementById('WarpBaseGameToggler')).not.toBeNull();
    expect(document.getElementById('WarpBonusGameToggler')).toBeNull();
  });

  it('flips the row, its icon and its switches when a speed is pressed', () => {
    const h = mount({ hud: { speeds: [{ id: 'nitro' }] } });
    const title = document.getElementById('NitroToggle')!;
    title.click();
    expect(h.ui.speeds[0]!.isOn).toBe(true);
    expect(title.className).toContain('nitro-on');
    expect(title.querySelector('[class^=icon-]')!.className).toBe('icon-nitro-on');
    expect(title.closest('.Accordion')!.className).toContain('is-open');
    expect((document.getElementById('NitroBaseGameToggler') as HTMLInputElement).checked).toBe(true);
    title.click();
    expect(h.ui.speeds[0]!.isOn).toBe(false);
    expect(title.className).toContain('nitro-off');
  });

  it('switches one scope at a time from the accordion', () => {
    const h = mount({ hud: { speeds: [{ id: 'nitro' }] } });
    const bonus = document.getElementById('NitroBonusGameToggler') as HTMLInputElement;
    bonus.dispatchEvent(new Event('change'));
    expect(h.ui.speeds[0]!.bonus.isOn).toBe(true);
    expect(h.ui.speeds[0]!.base.isOn).toBe(false);
    expect(h.ui.turbo.isOn).toBe(true); // the shared control a game reads follows
  });

  it('reports a press on a row the game added itself', () => {
    const h = mount({ hud: { menu: [{ kind: 'action', id: 'support', label: 'SUPPORT', icon: 'icon-help' }] } });
    const pressed: string[] = [];
    h.on('buttonActivated', (p) => pressed.push(p.id));
    const row = document.getElementById('MenuAction-support');
    expect(row).not.toBeNull();
    expect(row!.querySelector('[class^=icon-]')!.className).toBe('icon-help');
    row!.click();
    expect(pressed).toEqual(['support']);
  });

  it('puts the menu over the bar, and takes the bar out of reach while it is up', () => {
    mount({});
    const panel = document.getElementById('MainPanel')!;
    expect(panel.className).not.toContain('main-menu-active');
    document.getElementById('MainMenuToggle')!.click();
    expect(panel.className).toContain('main-menu-active');
  });
});

describe('the boot spinner', () => {
  it('is not there unless a host asks for it', () => {
    mount({});
    expect(document.getElementById('ProgressIndicator')).toBeNull();
  });

  it('is there when a host does, and ready() takes it away', () => {
    const h = mount({}, { spinner: true });
    const spinner = document.getElementById('ProgressIndicator')!;
    expect(spinner.className).toContain('is-visible');
    h.ready();
    expect(spinner.className).not.toContain('is-visible');
  });
});
