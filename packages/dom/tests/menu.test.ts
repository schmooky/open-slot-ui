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

describe('the look a host can configure', () => {
  it('writes only the theme tokens the host changed', () => {
    mount({ theme: { color: { accent: '#00ff00' } } });
    const root = document.querySelector<HTMLElement>('.OpenSlotUiContainer')!;
    expect(root.style.getPropertyValue('--hg-bg-accent')).toBe('#00ff00');
    // ...and its faded copies, or the HUD ends up two-toned
    expect(root.style.getPropertyValue('--hg-bg-accent-rgb')).toBe('0, 255, 0');
    // untouched tokens are left to the stylesheet
    expect(root.style.getPropertyValue('--hg-text-primary')).toBe('');
    expect(root.style.getPropertyValue('--hg-bg-secondary')).toBe('');
  });

  it('leaves the skin alone when no theme is given', () => {
    mount({});
    const root = document.querySelector<HTMLElement>('.OpenSlotUiContainer')!;
    expect(root.getAttribute('style') ?? '').not.toContain('--hg-');
  });

  it('publishes the motion durations a theme asks for', () => {
    mount({ theme: { overrides: { motion: { base: 400 } } } });
    const root = document.querySelector<HTMLElement>('.OpenSlotUiContainer')!;
    expect(root.style.getPropertyValue('--ohm-motion-base')).toBe('400ms');
    expect(root.style.getPropertyValue('--hg-ui-transition-duration')).toBe('400ms');
  });

  it('says how much may move, and takes the host over the player', () => {
    mount({});
    expect(document.querySelector<HTMLElement>('.OpenSlotUiContainer')!.dataset.motion).toBe('full');
    hud!.dispose();
    hud = mountDomHud({}, { motion: 'none' });
    expect(document.querySelector<HTMLElement>('.OpenSlotUiContainer')!.dataset.motion).toBe('none');
  });

  it('swaps the glyphs a host names, and keeps the skin classes beside them', () => {
    mount({}, { icons: { spin: 'icon-play', betUp: 'icon-plus', menu: 'icon-dots' } });
    expect(document.querySelector('#PlaceBetBtn [class^="icon-"]')!.className).toBe('icon-play branding-logo');
    expect(document.querySelector('#BetAmountIncrease [class^="icon-"]')!.className).toBe('icon-plus');
    expect(document.querySelector('#MainMenuToggle [class^="icon-"]')!.className).toBe('icon-dots');
    // the ones it did not name keep the reference's
    expect(document.querySelector('#BetAmountDecrease [class^="icon-"]')!.className).toBe('icon-arrow-down');
  });

  it("uses a host's sound glyphs when the row is switched", () => {
    const h = mount({}, { icons: { soundOff: 'icon-quiet' } });
    document.getElementById('MainMenuToggle')!.click();
    document.getElementById('SoundToggle')!.click();
    expect(h.ui.sfxSlider.value.get()).toBe(0);
    expect(document.querySelector('#SoundToggle [class^="icon-"]')!.className).toBe('icon-quiet');
  });

  it('marks a readout that changed so the stylesheet can say so', () => {
    const h = mount({});
    const value = document.getElementById('BalanceValue')!;
    // The first paint is not a change — nothing moved, the HUD just arrived.
    expect(value.className).not.toContain('is-changed');
    h.setBalance(20);
    expect(value.className).toContain('is-changed');
  });
});

describe('the rest of the switchboard, in the markup', () => {
  it('orders the data panel the way the spec asks', () => {
    mount({ hud: { readouts: ['bet', 'balance'] } });
    const items = [...document.querySelectorAll('.DataPanel__container > *')].map((el) => el.id);
    expect(items).toEqual(['BetAmountStaticItem', 'BalanceItem']);
  });

  it('opens a row that was given a page, without a handle back to the game', () => {
    const opened: unknown[] = [];
    const realOpen = window.open;
    (window as { open: unknown }).open = (...args: unknown[]) => {
      opened.push(args);
      return null;
    };
    const h = mount({ hud: { menu: [{ kind: 'support', href: 'https://help.example' }] } });
    const pressed: string[] = [];
    h.on('buttonActivated', (p) => pressed.push(p.id));
    document.getElementById('SupportBtn')!.click();
    expect(opened).toEqual([['https://help.example', '_blank', 'noopener,noreferrer']]);
    // the press is still reported, so a host can handle it instead
    expect(pressed).toEqual(['support']);
    (window as { open: unknown }).open = realOpen;
  });

  it('offers STOP ON ANY WIN only when the game does', () => {
    mount({});
    expect(document.getElementById('StopOnAnyWinSection')).toBeNull();
    hud!.dispose();
    hud = mountDomHud({ autoplay: { options: [10], stopOnAnyWin: true } });
    const toggle = document.getElementById('StopOnAnyWinToggle') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    toggle.dispatchEvent(new Event('change'));
    expect(hud.ui.stopOnAnyWin.isOn).toBe(true);
  });

  it('spins on the spacebar, and not while a window is up or a field has the caret', () => {
    const h = mount({});
    const spins: number[] = [];
    h.on('spinRequested', () => spins.push(1));
    const press = (key: string, target: EventTarget = document.body): void => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(e);
    };
    press(' ');
    expect(spins.length).toBe(1);
    // a window in front takes the keyboard
    h.ui.settingsPanel.openPanel();
    press(' ');
    expect(spins.length).toBe(1);
    press('Escape');
    expect(h.ui.settingsPanel.isOpen).toBe(false);
    // ...and a field the player is typing in owns its own space bar
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(' ', input);
    expect(spins.length).toBe(1);
    input.remove();
  });

  it('steps the stake with the arrows, and can be switched off entirely', () => {
    const h = mount({});
    const before = h.ui.bet.get();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(h.ui.bet.get()).toBeGreaterThan(before);
    hud!.dispose();
    hud = mountDomHud({}, { keyboard: { enabled: false } });
    const stake = hud.ui.bet.get();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(hud.ui.bet.get()).toBe(stake);
  });
});

describe('the round button and the colours a game owns', () => {
  it('paints the buy coin from the accent and the activation from the feature colour', () => {
    mount({ theme: { overrides: { color: { accent: '#7fe7f5', featureBuy: '#a25bff', featureBuyText: '#04202a' } } } });
    const root = document.querySelector<HTMLElement>('.OpenSlotUiContainer')!;
    // the coin, and every highlight on the bar
    expect(root.style.getPropertyValue('--hg-bg-accent')).toBe('#7fe7f5');
    // what a bought feature lights up: the banner, the round button, the stake, the bar
    expect(root.style.getPropertyValue('--hg-bg-feature-buy')).toBe('#a25bff');
    expect(root.style.getPropertyValue('--hg-bg-feature-buy-rgb')).toBe('162, 91, 255');
    expect(root.style.getPropertyValue('--ohm-feature-buy-text')).toBe('#04202a');
  });

  it('turns the coin into DISABLE while a bought modifier is on', () => {
    const h = mount({});
    const coin = document.getElementById('FeatureBuyToggle')!;
    const wrapper = document.querySelector('.UiUserPanelWrapper')!;
    expect(wrapper.className).not.toContain('bet-modifier-active');
    h.ui.setBetModifier({ id: 'ante', name: 'ANTE BET', cost: 0.25 });
    expect(wrapper.className).toContain('bet-modifier-active');
    expect(coin.textContent!.trim()).toBe('DISABLE');
    const pressed: string[] = [];
    h.on('buttonActivated', (p) => pressed.push(p.id));
    coin.click();
    expect(pressed).toEqual(['disable-modifier']); // it disables; it does not re-open the sheet
  });

  it('counts an autoplay run down on the round button', () => {
    const h = mount({ autoplay: { options: [10, 25] } });
    h.ui.autoplay.begin(10, {});
    expect(document.querySelector<HTMLElement>('.OpenSlotUiContainer')!.dataset.state).toBe('autoplay');
    expect(document.getElementById('AutoplayCounter')!.textContent).toBe('10');
    h.ui.autoplay.reportResult(0, 1);
    expect(document.getElementById('AutoplayCounter')!.textContent).toBe('9');
  });

  it('shows the free-spins strip instead of the action panel inside a feature', () => {
    const h = mount({});
    h.setFreeSpins(10);
    h.setHudState('featurePlay');
    expect(document.querySelector<HTMLElement>('.OpenSlotUiContainer')!.dataset.state).toBe('featurePlay-freespins');
    expect(document.getElementById('FeatureCounterValue')!.textContent).toBe('10');
  });

  it('ships the rules that size the stop square and draw the counter tile', () => {
    mount({});
    const sheets = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    expect(sheets).toContain('--ohm-stop-scale');
    expect(sheets).toContain('#StopAutoplayBtn .AutoplayCounter');
    expect(sheets).toContain('[data-state^="feature"] .ToggleButton--feature-buy');
  });
});
