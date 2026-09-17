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

describe('the round button is one button in three phases', () => {
  const panel = (): HTMLElement => document.querySelector<HTMLElement>('.ActionPanel')!;
  const visible = (x: string): boolean => id(x)!.classList.contains('is-visible');

  it('press dims it, the result turns it into STOP, the round hands it back', () => {
    // idle: the play button, and slam-stop is off (there is nothing to slam)
    expect(visible('PlaceBetBtn')).toBe(true);
    expect(visible('StopBtn')).toBe(false);
    expect(panel().classList.contains('disabled-slam-stop')).toBe(true);

    // pressed, waiting on the server: STILL the play button — dimmed by the
    // stylesheet, and refusing a second press — with no stop button beside it
    hud.ui.spin.busy();
    expect(visible('PlaceBetBtn')).toBe(true);
    expect(visible('StopBtn')).toBe(false);
    expect(id<HTMLButtonElement>('PlaceBetBtn')!.disabled).toBe(true);
    expect(panel().classList.contains('disabled-slam-stop')).toBe(true);

    // the result arrived: now it CAN be slammed, so the button becomes STOP
    hud.ui.spin.stopState();
    expect(visible('PlaceBetBtn')).toBe(false);
    expect(visible('StopBtn')).toBe(true);
    expect(panel().classList.contains('disabled-slam-stop')).toBe(false);

    hud.ui.spin.idle();
    expect(visible('PlaceBetBtn')).toBe(true);
    expect(visible('StopBtn')).toBe(false);
  });

  it('a jurisdiction that forbids slam-stop never reaches the STOP phase', () => {
    hud.ui.spin.allowSlamStop.set(false);
    hud.ui.spin.busy();
    hud.ui.spin.stopState();
    expect(visible('StopBtn')).toBe(false);
    expect(visible('PlaceBetBtn')).toBe(true);
    expect(panel().classList.contains('disabled-slam-stop')).toBe(true);
  });
});

describe('the buy sheet', () => {
  const FEATURES = [
    { id: 'fs', name: 'Free Spins', variant: 'buy' as const, cost: 100, description: 'Ten of them.', volatility: 'Volatility: High' },
    { id: 'ante', name: 'Ante Bet', variant: 'boost' as const, cost: 0.25 },
  ];

  beforeEach(() => {
    hud.dispose();
    hud = mountDomHud({ betLadder: { levels: [1, 2, 5], index: 0 }, currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 } }, { features: FEATURES });
  });

  it('sizes its own grid and prices every card off the bet', () => {
    // the stylesheet widths the grid from this attribute
    expect(id('FeatureBuyWindow')!.dataset.totalItemCount).toBe('2');
    const prices = Array.from(document.querySelectorAll('.FeatureBuyGridCard__description--value')).map((e) => e.textContent);
    expect(prices).toEqual(['$100.00', '$1.25']); // a buy is cost × bet; a boost adds to 1
    // …and the card carries the title, the odds line and the volatility line
    expect(document.querySelector('.FeatureBuyGridCard__title')!.textContent).toBe('Free Spins');
    expect(document.querySelector('.FeatureBuyGridCard__description')!.textContent).toBe('Ten of them.');
    expect(document.querySelector('.FeatureBuyGridCard__description--volatility')!.textContent).toBe('Volatility: High');
  });

  it("the sheet's own BET selector drives the SAME bet as the bar, and re-prices", () => {
    id('FeatureBuyAmountIncrease')!.click();
    expect(hud.ui.betStepper.value).toBe(2);
    expect(id('FeatureBuyAmountValue')!.textContent).toBe('$2.00');
    expect(id('BetAmountValue')!.textContent).toBe('$2.00'); // the bar moved too
    const prices = Array.from(document.querySelectorAll('.FeatureBuyGridCard__description--value')).map((e) => e.textContent);
    expect(prices).toEqual(['$200.00', '$2.50']);
  });

  it('nothing is bought until OK — BACK returns to the grid', () => {
    let bought: Array<[string, number]> = [];
    hud.dispose();
    hud = mountDomHud({ betLadder: { levels: [1, 2, 5], index: 0 }, currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 } }, { features: FEATURES, onBuy: (id_, cost) => bought.push([id_, cost]) });

    document.querySelector<HTMLElement>('.FeatureBuyGridCard__button')!.click();
    expect(id('FeatureBuyConfirmBody')!.classList.contains('is-visible')).toBe(true);
    expect(id('FeatureBuyBody')!.classList.contains('is-visible')).toBe(false);
    expect(id('FeatureBuyConfirmTitle')!.textContent).toBe('Free Spins');
    expect(bought).toEqual([]); // still nothing

    id('FeatureBuyConfirmBackButton')!.click();
    expect(id('FeatureBuyBody')!.classList.contains('is-visible')).toBe(true);
    expect(bought).toEqual([]);

    document.querySelector<HTMLElement>('.FeatureBuyGridCard__button')!.click();
    id('FeatureBuyConfirmButton')!.click();
    expect(bought).toEqual([['fs', 100]]); // …and only now
  });
});

describe('an active bet modifier says so on the bar', () => {
  beforeEach(() => {
    hud.dispose();
    hud = mountDomHud(
      { betLadder: { levels: [1, 2, 5], index: 0 }, currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 } },
      { features: [{ id: 'ante', name: 'Ante Bet', variant: 'boost', cost: 0.25 }] },
    );
  });

  const wrapper = (): HTMLElement => document.querySelector<HTMLElement>('.UiUserPanelWrapper')!;

  it('banners the modifier, and turns the buy coin into DISABLE', () => {
    expect(wrapper().classList.contains('bet-modifier-active')).toBe(false);
    expect(id('FeatureBuyToggle')!.textContent).toBe('BUY BONUS');

    hud.ui.setBetModifier({ id: 'ante', name: 'Ante Bet', cost: 0.25 });

    // one class does most of it — the skin repaints the stake, the round button and
    // the bet bar in the feature colour off this
    expect(wrapper().classList.contains('bet-modifier-active')).toBe(true);
    const notice = id('FeatureBuyActiveModifierNotice')!;
    expect(notice.classList.contains('is-visible')).toBe(true);
    expect(notice.textContent).toBe('ANTE BET ACTIVATED');
    expect(id('FeatureBuyToggle')!.textContent).toBe('DISABLE');
  });

  it('the coin switches it OFF rather than opening the sheet', () => {
    hud.ui.setBetModifier({ id: 'ante', name: 'Ante Bet', cost: 0.25 });
    const seen: string[] = [];
    hud.on('buttonActivated', ({ id: i }) => seen.push(i));

    id('FeatureBuyToggle')!.click();
    expect(seen).toEqual(['disable-modifier']); // not 'bonus'
    expect(id('buy-feature-panel') === null || hud.ui.control('buy-feature-panel')?.current).not.toBe('open');

    hud.ui.setBetModifier(null);
    expect(wrapper().classList.contains('bet-modifier-active')).toBe(false);
    expect(id('FeatureBuyToggle')!.textContent).toBe('BUY BONUS');
  });
});

describe('a window locks the game behind it', () => {
  it('you cannot spin while the rules are open', () => {
    expect(hud.ui.locked.get()).toBe(false);
    expect(hud.ui.spin.interactable).toBe(true);

    hud.ui.settingsPanel.openPanel();
    expect(hud.ui.locked.get()).toBe(true);
    expect(hud.ui.spin.interactable).toBe(false);

    let spins = 0;
    hud.on('spinRequested', () => spins++);
    id('PlaceBetBtn')!.click();
    expect(spins).toBe(0); // the press is refused, not queued

    hud.ui.settingsPanel.closePanel();
    expect(hud.ui.locked.get()).toBe(false);
    expect(hud.ui.spin.interactable).toBe(true);
  });

  it('overlapping windows cannot leave the lock stuck on', () => {
    hud.ui.settingsPanel.openPanel();
    hud.ui.historyPanel.openPanel(); // the core closes the first as it opens this
    expect(hud.ui.locked.get()).toBe(true);
    hud.ui.historyPanel.closePanel();
    expect(hud.ui.locked.get()).toBe(false);
  });
});

describe('the rules blocks, inside the skin’s info window', () => {
  const blockStyle = (): string =>
    [...document.querySelectorAll('style[data-openui="behaviour"]')].map((s) => s.textContent ?? '').join('\n');

  it('injects the block stylesheet, scoped so it out-specifies the skin', () => {
    const css = blockStyle();
    expect(css).toContain('.ohm-panel');
    // Every rule is prefixed — a bare `.ohm-…` selector would lose to the skin's
    // own `[data-channel] .GameInfoWindow .GameInfo__body p`.
    const selectors = [...css.matchAll(/(^|[{}])\s*([^{}@]+?)\s*\{/g)].map((m) => m[2] as string);
    const bare = selectors.filter((sel) => sel.split(',').some((s) => s.trim().startsWith('.ohm-')));
    expect(bare, `unscoped selectors: ${bare.join(' | ')}`).toEqual([]);
  });

  it('prefixes the rules INSIDE a container query too', () => {
    const css = blockStyle();
    const at = css.slice(css.indexOf('@container'));
    expect(at).toContain('@container ohm');
    // the first rule after the at-rule's `{` is the one a naive prefixer misses
    const firstInner = at.slice(at.indexOf('{') + 1).trim();
    expect(firstInner.startsWith('div[data-channel]')).toBe(true);
  });

  it('gives the block body a gutter and makes it a query container', () => {
    const css = blockStyle();
    expect(css).toContain('.GameInfo__body.ohm-body');
    expect(css).toContain('container-type: inline-size');
  });

  it('renders the rules into the window with the block classes', () => {
    hud.dispose();
    hud = mountDomHud({
      currency: { code: 'USD', decimals: 2 },
      game: { name: 'Test Game' },
      rules: [
        { kind: 'heading', id: 'h', text: 'Rules' },
        { kind: 'badges', id: 'b', items: [{ text: '20 lines' }] },
        { kind: 'sections', id: 't', items: [{ id: 'a', title: 'A', children: [{ kind: 'text', id: 'x', text: 'Pays left to right.' }] }] },
      ],
    });
    const body = id('GameInfoBody');
    expect(body!.className).toContain('ohm-body');
    expect(body!.querySelector('.ohm-badges')).not.toBeNull();
    expect(body!.querySelector('.ohm-panel-title')).not.toBeNull();
    expect(body!.textContent).toContain('Pays left to right.');
  });
});

describe('the compliance verbs', () => {
  it('applies a jurisdiction and reveals what it mandates', () => {
    hud.dispose();
    hud = mountDomHud({
      currency: { code: 'USD', decimals: 2 },
      rtp: 96.5,
      // The readouts are features a game opts into; the switchboard then reveals them.
      hud: { features: { rtp: true, sessionBar: true } },
    });
    const rtpRow = id('RtpOverlay');
    expect(rtpRow, 'the RTP readout was not built').not.toBeNull();
    expect(rtpRow!.classList.contains('is-visible')).toBe(false);

    hud.applyJurisdiction({ displayRTP: true, displayNetPosition: true, displaySessionTimer: true });

    expect(rtpRow!.classList.contains('is-visible'), 'a revealed readout stayed hidden').toBe(true);
    expect(id('NetPosition')!.classList.contains('is-visible')).toBe(true);
    expect(id('SessionTimer')!.classList.contains('is-visible')).toBe(true);
    // …and the strip they live in, which the stylesheet keeps display:none until it
    // has something to show.
    expect(id('CoreOverlay')!.classList.contains('is-visible')).toBe(true);
  });

  it('shows an RGS error, and its localized default text', () => {
    hud.showRgsError('ERR_IPB');
    const dialog = id('DialogWindow');
    expect(dialog!.classList.contains('is-visible')).toBe(true);
    expect(dialog!.textContent).toContain('Insufficient funds');
  });

  it('carries the rest of the platform verbs the canvas handle has', () => {
    expect(typeof hud.setRtp).toBe('function');
    expect(typeof hud.showError).toBe('function');
    expect(typeof hud.showFatal).toBe('function');
    expect(typeof hud.setReplay).toBe('function');
    hud.setReplay(true);
    expect(document.querySelector('.HacksawCasinoUiContainer')!.classList.contains('is-locked')).toBe(true);
  });
});

describe('the promotion pill', () => {
  it('asks for no art at all when the feature is off', () => {
    // The template used to carry a relative src, so every page fetched a 404 for a
    // button it had already removed.
    expect(document.querySelector('#FeaturePromotionImage')).toBeNull();
  });

  it('resolves its art against the skin stylesheet when the feature is on', () => {
    hud.dispose();
    hud = mountDomHud(
      { currency: { code: 'USD', decimals: 2 }, hud: { features: { promotion: true } } },
      { skin: { href: '/skin/ui.min.css' } },
    );
    const img = id<HTMLImageElement>('FeaturePromotionImage');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(`${location.origin}/skin/ui/images/promotion_button.png`);
  });

  it('takes the host own url when it has one', () => {
    hud.dispose();
    hud = mountDomHud(
      { currency: { code: 'USD', decimals: 2 }, hud: { features: { promotion: true } } },
      { skin: { href: '/skin/ui.min.css', promotionImage: 'https://cdn.example.test/promo.png' } },
    );
    expect(id<HTMLImageElement>('FeaturePromotionImage')!.src).toBe('https://cdn.example.test/promo.png');
  });
});
