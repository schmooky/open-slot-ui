import {
  PanelControl,
  composeMenu,
  createUI,
  type OpenUI,
  type UISpec,
  type HostHooks,
  type OpenUIEvents,
  type Dispose,
  type HistoryRow,
  type HudState,
  type CurrencySpec,
} from '@open-slot-ui/core';
import {
  TPL_PROGRESS_INDICATOR,
  TPL_FULLSCREEN_INDICATOR,
  TPL_DIALOG_WINDOW,
  TPL_NOTIFICATION_HOLDER,
  TPL_GAME_INFO_WINDOW,
  TPL_BET_HISTORY_WINDOW,
  TPL_FEATURE_BUY_WINDOW,
  TPL_CORE_OVERLAY,
  TPL_UI_WRAPPER,
} from './template';
import { bindReadouts, bindActions, bindMainMenu, bindAutoplay, bindWindows, bindOverlay, stateAttr, type BindContext } from './bindings';
import { translateTree } from './i18n';
import { $, on, toggleClass } from './dom';

/** How the bar is docked — the stylesheet keys its whole layout off these two. */
export type DomLayoutType = 'ribbon' | 'aside_panel' | 'ada_plain';
export type DomDockPosition = 'dock_bottom' | 'dock_top' | 'dock_left' | 'dock_right';

/**
 * The stylesheet that DRESSES the markup. open-ui ships the tree and the wiring; the
 * look is yours — point `href` at your game's UI stylesheet (or hand over the CSS
 * text) and the HUD wears it.
 */
export interface DomSkin {
  href?: string;
  css?: string;
  /** An icon `@font-face` the skin expects (the markup keys glyphs off `icon-*`). */
  font?: { family: string; src: string };
  /** Base font size for the skin's rem units. Default 16. */
  rootFontSize?: number;
}

export interface DomHudOptions {
  /** Where to mount. Default `document.body`. */
  container?: HTMLElement;
  skin?: DomSkin;
  layout?: { type?: DomLayoutType; position?: DomDockPosition };
  hooks?: HostHooks;
  /** Buy-feature cards (the sheet is inert without them). */
  features?: BindContext['features'];
  /** Content for the INFO window. Default: the spec's own menu + rules blocks. */
  info?: BindContext['infoBlocks'];
  onBuy?: BindContext['onBuy'];
  /** Design width of the desktop bar in px, for the fit. Default 840 (52.5rem). */
  designWidth?: number;
  /** Clamp on the fit scale. Default `[0.7, 1.6]`. */
  scaleRange?: [number, number];
}

/** What `mountDomHud` hands back: the core, the tree, and the day-to-day verbs. */
export interface DomHud {
  readonly ui: OpenUI;
  /** The mounted root (`.HacksawCasinoUiContainer`-shaped). */
  readonly root: HTMLElement;
  on<K extends keyof OpenUIEvents>(type: K, fn: (p: OpenUIEvents[K]) => void): Dispose;
  setBalance(major: number): void;
  setBet(major: number): void;
  setWin(major: number): void;
  setTotalWin(major: number): void;
  setCurrency(spec: CurrencySpec): void;
  setFreeSpins(n: number): void;
  setFreeRounds(n: number): void;
  setHistory(rows: HistoryRow[]): void;
  setMaxWin(multiplier?: number, odds?: string): void;
  setHudState(state: HudState): void;
  showFeedback(text: string, opts?: { tone?: 'info' | 'good' | 'warn'; ms?: number }): void;
  reportRound(win: number, bet: number): void;
  /** Hide the boot spinner — the game calls it when it is ready to play. */
  ready(): void;
  dispose(): void;
}

/**
 * Mount the HUD as REAL DOM.
 *
 * This is the second renderer binding: `@open-slot-ui/core` owns every control's
 * state machine, and this package binds that state to the markup a slot HUD is
 * actually built from — ids, `icon-*` classes, `data-state`, `data-channel`. Nothing
 * here draws: your stylesheet does that, which is why the HUD can look exactly like
 * the design it was cut from instead of like a redrawing of it.
 */
export function mountDomHud(spec: UISpec = {}, opts: DomHudOptions = {}): DomHud {
  const ui = createUI(spec, opts.hooks);
  const container = opts.container ?? document.body;
  const f = ui.chrome.features;

  // ── the tree ───────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.className = 'HacksawCasinoUiContainer';
  root.id = 'hacksaw-casino';
  root.dataset.theme = 'default';
  root.dataset.state = 'idle';
  root.dataset.layoutType = opts.layout?.type ?? 'ribbon';
  root.dataset.layoutPosition = opts.layout?.position ?? 'dock_bottom';
  root.innerHTML = [
    TPL_PROGRESS_INDICATOR,
    f.fullscreen ? TPL_FULLSCREEN_INDICATOR : '',
    TPL_DIALOG_WINDOW,
    TPL_NOTIFICATION_HOLDER,
    f.info ? TPL_GAME_INFO_WINDOW : '',
    f.history ? TPL_BET_HISTORY_WINDOW : '',
    f.buyFeature ? TPL_FEATURE_BUY_WINDOW : '',
    TPL_CORE_OVERLAY,
    TPL_UI_WRAPPER,
  ].join('');
  container.appendChild(root);

  const disposers: Dispose[] = [];
  const disposersEarly = disposers;
  const skin = mountSkin(opts.skin);
  if (skin) disposers.push(skin);

  // Rows the game hasn't asked for never reach the DOM.
  const dropIf = (off: boolean, id: string): void => {
    if (off) $(root, id)?.closest('li, .ToggleButton__container--feature-buy, .ToggleButton__container--feature-promotion')?.remove();
  };
  dropIf(!f.sound, 'SoundToggle');
  dropIf(!f.music, 'MusicToggle');
  dropIf(!f.turbo, 'TurboToggle');
  dropIf(!f.superTurbo, 'SuperTurboToggle');
  dropIf(!f.history, 'BetHistoryBtn');
  dropIf(!f.info, 'GameInfoBtn');
  dropIf(!f.realMoney, 'MoveToMoneyBtn');
  dropIf(!f.deposit, 'DepositBtn');
  dropIf(!f.lobby, 'LobbyAnchor');
  dropIf(!f.buyFeature, 'FeatureBuyToggle');
  dropIf(!f.promotion, 'FeaturePromotionToggle');
  if (!f.autoplay) $(root, 'AutoplayBtn')?.closest('.ActionPanel__container--autoplay')?.remove();
  if (!f.betChangers) $(root, 'BetAmountIncrease')?.closest('.BetAmountChangersWidget')?.remove();
  if (!f.betWidget) $(root, 'BetAmountItem')?.remove();
  if (!f.betProgress) $(root, 'BetAmountIndicatorProgress')?.closest('.BetAmountProgressbar')?.remove();
  if (!f.autoplayAdvanced) $(root, 'AdvancedAutoplaySections')?.remove();
  if (!f.feedback) $(root, 'FeedbackMsg')?.remove();
  if (!f.clock) $(root, 'Clock')?.remove();
  if (!f.sessionBar) $(root, 'SessionBar')?.remove();

  // The buy sheet gets its own control, so "is the sheet open" is state the core owns
  // and a test can read — not a class on a div.
  const buyPanel = new PanelControl({ id: 'buy-feature-panel', variant: 'modal', layout: { anchor: 'center' } }, ui.bus);
  ui.register(buyPanel);
  // One window at a time — the core already polices its own panels, so join them.
  const others = [ui.settingsPanel, ui.historyPanel, ui.mainMenuPanel, ui.autoplayPanel];
  disposersEarly.push(
    buyPanel.state.subscribe(() => {
      if (buyPanel.isOpen) for (const o of others) if (o.isOpen) o.closePanel();
    }),
    ...others.map((o) => o.state.subscribe(() => {
      if (o.isOpen && buyPanel.isOpen) buyPanel.closePanel();
    })),
  );

  const ctx: BindContext = {
    root,
    buyPanel,
    panel: $(root, 'MainPanel'),
    features: opts.features ?? [],
    onBuy: opts.onBuy,
    // The INFO window renders the SAME declarative blocks the canvas renderer does.
    infoBlocks: opts.info ?? composeMenu(spec.menu, { rulesFallback: spec.rules }),
  };
  // The core keeps the buy button hidden until a game says it HAS something to buy —
  // handing over feature cards is that statement.
  if (ctx.features.length) ui.setHidden('bonus', false);

  translateTree(ui, root);
  disposers.push(
    ui.locale.subscribe(() => translateTree(ui, root)),
    bindReadouts(ui, ctx),
    bindActions(ui, ctx),
    bindMainMenu(ui, ctx),
    bindAutoplay(ui, ctx),
    bindWindows(ui, ctx),
    bindOverlay(ui, ctx),
  );

  // ── the attributes the stylesheet lays out from ───────────────────────────
  const wrapper = $(root, 'UiWrapper');
  const designWidth = opts.designWidth ?? 840;
  const [minScale, maxScale] = opts.scaleRange ?? [0.7, 1.6];

  const syncScreen = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ui.setScreen(w, h);
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const channel = coarse || Math.min(w, h) <= 820 ? 'mobile' : 'desktop';
    root.dataset.channel = channel;
    root.dataset.orientation = w >= h ? 'landscape' : 'portrait';

    // The bar is authored at `designWidth`; scale it to the viewport, keeping it
    // centred. On the touch channel the stylesheet already spans the full width.
    if (wrapper) {
      if (channel === 'desktop') {
        const k = Math.min(maxScale, Math.max(minScale, w / (designWidth * 1.35)));
        const shift = (w / k - designWidth) / 2;
        wrapper.style.transform = `scale(${k.toFixed(4)}) translateX(${shift.toFixed(2)}px)`;
      } else {
        wrapper.style.transform = '';
      }
    }
  };
  syncScreen();
  disposers.push(on(window, 'resize', syncScreen), on(window, 'orientationchange', syncScreen));

  const syncState = (): void => {
    // An autoplay RUN is a HUD state in its own right — the stylesheet dims the menu
    // rows and the bet changers while one is going. The core knows autoplay is
    // active, so the binding says so; a host that drives its own feature states
    // still wins, since those are the states it sets.
    const base = stateAttr(ui.hudState.get(), ui.spin.freeSpins.get());
    const autoplaying = ui.autoplay.isActive && !base.startsWith('feature');
    root.dataset.state = autoplaying ? 'autoplay' : base;
    toggleClass(root, 'is-locked', ui.locked.get());
  };
  syncState();
  disposers.push(
    ui.hudState.subscribe(syncState),
    ui.spin.freeSpins.subscribe(syncState),
    ui.autoplay.state.subscribe(syncState),
    ui.locked.subscribe(syncState),
  );

  // Fullscreen: the markup only hints at it, so the binding owns the actual call.
  disposers.push(
    on($(root, 'FullscreenIndicator'), 'click', () => {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      else void (container as HTMLElement).requestFullscreen?.();
    }),
  );

  const progress = $(root, 'ProgressIndicator');

  return {
    ui,
    root,
    on: (type, fn) => ui.on(type, fn),
    setBalance: (n) => ui.balance.set(n),
    setBet: (n) => ui.bet.set(n),
    setWin: (n) => ui.win.set(n),
    setTotalWin: (n) => ui.totalWin.set(n),
    setCurrency: (c) => {
      ui.balance.setCurrency(c);
      ui.bet.setCurrency(c);
      ui.win.setCurrency(c);
      ui.totalWin.setCurrency(c);
      ui.netPosition.setCurrency(c);
    },
    setFreeSpins: (n) => ui.spin.setFreeSpins(n),
    setFreeRounds: (n) => ui.setFreeRounds(n),
    setHistory: (rows) => ui.setHistory(rows),
    setMaxWin: (m, o) => ui.setMaxWin(m, o),
    setHudState: (s) => ui.setHudState(s),
    showFeedback: (t, o) => ui.showFeedback(t, o),
    reportRound: (win, bet) => ui.reportRound(win, bet),
    ready: () => progress?.classList.remove('is-visible'),
    dispose: () => {
      for (const d of disposers.splice(0)) d();
      root.remove();
      ui.dispose();
    },
  };
}

/** Load the skin: a `<link>`, a `<style>`, and (optionally) its icon `@font-face`. */
function mountSkin(skin?: DomSkin): Dispose | undefined {
  if (!skin) return undefined;
  const nodes: Element[] = [];
  if (skin.href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = skin.href;
    document.head.appendChild(link);
    nodes.push(link);
  }
  const css: string[] = [];
  if (skin.font) css.push(`@font-face{font-family:"${skin.font.family}";src:url("${skin.font.src}");font-display:block}`);
  if (skin.rootFontSize) css.push(`:root{font-size:${skin.rootFontSize}px}`);
  if (skin.css) css.push(skin.css);
  if (css.length) {
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    document.head.appendChild(style);
    nodes.push(style);
  }
  return () => nodes.forEach((n) => n.remove());
}
