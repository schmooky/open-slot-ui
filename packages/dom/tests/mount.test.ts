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
