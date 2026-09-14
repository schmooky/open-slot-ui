import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountDomHud, type DomHud } from '../src/mountDomHud';

let hud: DomHud;

const id = <T extends HTMLElement = HTMLElement>(x: string): T | null => document.getElementById(x) as T | null;

beforeEach(() => {
  document.body.innerHTML = '';
  hud = mountDomHud({
    currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 },
    betLadder: { levels: [0.5, 1, 2, 5], index: 1 },
    autoplay: { options: [10, 25, 50], lossLimits: [5, 20], winLimits: [10, 20] },
    game: { name: 'Test Game' },
  });
});

afterEach(() => hud.dispose());

describe('mountDomHud', () => {
  it('mounts the tree the stylesheet expects', () => {
    const root = document.querySelector<HTMLElement>('.HacksawCasinoUiContainer');
    expect(root).not.toBeNull();
    expect(root!.dataset.layoutType).toBe('ribbon');
    expect(root!.dataset.layoutPosition).toBe('dock_bottom');
    // the parts a bar is made of
    for (const x of ['MainPanel', 'DataPanel', 'ActionPanel', 'PlaceBetBtn', 'BetAmountIncrease', 'BalanceValue', 'MainMenuToggle', 'AutoplayBtn']) {
      expect(id(x), x).not.toBeNull();
    }
  });

  it("labels itself from the markup keys, in the design's own casing", () => {
    expect(id('BalanceLabel')?.textContent).toBe('BALANCE');
    expect(id('WinAmountLabel')?.textContent).toBe('WIN');
  });

  it('shows the money the core holds, formatted by the core', () => {
    hud.setBalance(1234.5);
    hud.setWin(12.25);
    expect(id('BalanceValue')?.textContent).toBe('$1,234.50');
    expect(id('WinAmountValue')?.textContent).toBe('$12.25');
  });

  it('the round button asks the core for a spin', () => {
    let spins = 0;
    hud.on('spinRequested', () => spins++);
    id('PlaceBetBtn')!.click();
    expect(spins).toBe(1);
  });

  it('the bet changers walk the ladder, and the ladder bar tracks it', () => {
    id('BetAmountIncrease')!.click();
    expect(hud.ui.betStepper.value).toBe(2);
    expect(id('BetAmountValue')?.textContent).toBe('$2.00');
    expect(id('BetAmountIndicatorProgress')!.style.width).toBe('75%');
    id('BetAmountDecrease')!.click();
    expect(hud.ui.betStepper.value).toBe(1);
  });

  it('the ☰ opens the menu as state, and marks the markup with it', () => {
    expect(hud.ui.mainMenuPanel.isOpen).toBe(false);
    id('MainMenuToggle')!.click();
    expect(hud.ui.mainMenuPanel.isOpen).toBe(true);
    expect(id('MainMenu')!.classList.contains('is-visible')).toBe(true);
    expect(id('MainPanel')!.classList.contains('main-menu-active')).toBe(true);
  });

  it('the autoplay panel picks a count and starts a real run', () => {
    id('AutoplayBtn')!.click();
    expect(id('AutoplayNav')!.classList.contains('is-visible')).toBe(true);
    const chips = id('AutoplayNavList')!.querySelectorAll('li');
    expect(chips).toHaveLength(3);
    (chips[1] as HTMLElement).click(); // 25 rounds
    id('StartAutoplayBtn')!.click();
    expect(hud.ui.autoplay.isActive).toBe(true);
    expect(hud.ui.autoplay.count.get()).toBe(25);
    // …and the stop button is the one showing now
    expect(id('StopAutoplayBtn')!.classList.contains('is-visible')).toBe(true);
    expect(id('AutoplayCounter')!.textContent).toBe('25');
  });

  it('a free-spins round tells the stylesheet what state it is in', () => {
    hud.setFreeSpins(8);
    hud.setHudState('featurePlay');
    const root = document.querySelector<HTMLElement>('.HacksawCasinoUiContainer')!;
    expect(root.dataset.state).toBe('featurePlay-freespins');
    expect(id('FeatureCounterValue')?.textContent).toBe('8');
    expect(id('WinAmountItem')!.classList.contains('is-visible')).toBe(false);
  });

  it('history rows land in the reference table', () => {
    hud.setHistory([{ date: '12:00', bet: '$1.00', win: '$25.00', won: true }]);
    const rows = id('BetHistoryTableBody')!.querySelectorAll('tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('$25.00');
  });

  it('teardown removes the tree and every listener', () => {
    hud.dispose();
    expect(document.querySelector('.HacksawCasinoUiContainer')).toBeNull();
    // a fresh mount for afterEach to dispose
    hud = mountDomHud({});
  });
});

describe('feature flags', () => {
  it('deletes the rows a game does not have (never hides them)', () => {
    hud.dispose();
    hud = mountDomHud({ hud: { features: { history: false, buyFeature: false, autoplayAdvanced: false, turbo: false } } });
    expect(id('BetHistoryBtn')).toBeNull();
    expect(id('BetHistoryWindow')).toBeNull();
    expect(id('FeatureBuyToggle')).toBeNull();
    expect(id('AdvancedAutoplaySections')).toBeNull();
    expect(id('TurboToggle')).toBeNull();
    // …and what it kept still works
    expect(id('PlaceBetBtn')).not.toBeNull();
  });
});

describe('the ☰ menu behaves the way the design does', () => {
  it('the TURBO row toggles the feature for both scopes, and the accordion follows', () => {
    const turbo = id('TurboToggle')!;
    const accordion = turbo.closest('.Accordion')!;
    // turbo starts off, so the row is collapsed and marked off
    id('MainMenuToggle')!.click();
    expect(hud.ui.turboBase.isOn).toBe(false);
    expect(accordion.classList.contains('is-open')).toBe(false);
    expect(turbo.classList.contains('turbo-off')).toBe(true);

    turbo.click(); // one tap turns turbo ON for base AND bonus
    expect(hud.ui.turboBase.isOn).toBe(true);
    expect(hud.ui.turboBonus.isOn).toBe(true);
    expect(accordion.classList.contains('is-open')).toBe(true);
    expect(turbo.classList.contains('turbo-on')).toBe(true);

    turbo.click(); // …and back off
    expect(hud.ui.turboBase.isOn).toBe(false);
    expect(accordion.classList.contains('is-open')).toBe(false);
  });

  it('a scope switch adjusts one half and keeps the shared turbo control honest', () => {
    id<HTMLInputElement>('TurboBonusGameToggler')!.click(); // bonus only
    expect(hud.ui.turboBonus.isOn).toBe(true);
    expect(hud.ui.turboBase.isOn).toBe(false);
    expect(hud.ui.turbo.isOn).toBe(true); // a game reading the shared control sees turbo

    id<HTMLInputElement>('TurboBonusGameToggler')!.click();
    expect(hud.ui.turbo.isOn).toBe(false); // nothing left on
  });

  it('SOUND is the master: with it off, MUSIC refuses to toggle', () => {
    id('SoundToggle')!.click(); // sound off
    expect(hud.ui.sfxSlider.value.get()).toBe(0);
    const before = hud.ui.musicSlider.value.get();
    id('MusicToggle')!.click();
    expect(hud.ui.musicSlider.value.get()).toBe(before); // refused, as the CSS implies
    id('SoundToggle')!.click(); // sound back on
    id('MusicToggle')!.click();
    expect(hud.ui.musicSlider.value.get()).toBe(0); // now it takes
  });

  it('tapping the sheet itself closes the menu', () => {
    id('MainMenuToggle')!.click();
    expect(hud.ui.mainMenuPanel.isOpen).toBe(true);
    id('MainMenu')!.click();
    expect(hud.ui.mainMenuPanel.isOpen).toBe(false);
  });

  it('an autoplay run puts the HUD in the state the stylesheet dims rows from', () => {
    const root = document.querySelector<HTMLElement>('.HacksawCasinoUiContainer')!;
    expect(root.dataset.state).toBe('idle');
    hud.ui.autoplay.begin(10);
    expect(root.dataset.state).toBe('autoplay');
    hud.ui.autoplay.stop();
    expect(root.dataset.state).toBe('idle');
  });
});
