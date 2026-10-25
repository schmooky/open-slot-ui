import {
  BLOCK_CSS,
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
  type JurisdictionConfig,
  type NoticeOptions,
  type RgsErrorOptions,
  readoutElement,
  persistSettings,
  type PersistOptions,
} from '@open-slot-ui/core';
import {
  TPL_PROGRESS_INDICATOR,
  menuItemsHtml,
  TPL_FULLSCREEN_INDICATOR,
  TPL_DIALOG_WINDOW,
  TPL_NOTIFICATION_HOLDER,
  TPL_GAME_INFO_WINDOW,
  TPL_BET_HISTORY_WINDOW,
  TPL_FEATURE_BUY_WINDOW,
  TPL_CORE_OVERLAY,
  TPL_UI_WRAPPER,
} from './template';
import { resolveIcons, applyIcons, type IconSet } from './icons';
import { themeVars, resolveMotion, type MotionSetting } from './theme';
import { bindKeyboard, type KeyboardOptions } from './keyboard';
import { keepFocusOff } from './focus';
import { closeOnOutsideTap } from './outside';
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
  /**
   * The promotion pill's art. Defaults to `ui/images/promotion_button.png` resolved
   * against `href`, which is where a skin keeps it — set this when yours does not.
   */
  promotionImage?: string;
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
  /**
   * Show the boot spinner while the game loads. Default OFF.
   *
   * A HUD that is on screen before the game is the point of mounting it first, and
   * a spinner over it says the opposite — most clients have their own loading
   * screen behind the bar and do not want a second one. Hosts that do want it ask
   * for it, and hide it with `ready()` as before.
   */
  spinner?: boolean;
  /**
   * Swap any of the bar's glyphs. Defaults are the reference skin's own classes;
   * a studio whose icon font names them differently — or who wants another arrow
   * on the bet changers — passes the ones it has.
   */
  icons?: Partial<IconSet>;
  /**
   * How much the HUD is allowed to move. `'auto'` (the default) follows the
   * player's own `prefers-reduced-motion` setting; `'full'` and `'none'` are the
   * host overriding it, and `'reduced'` keeps the fades and drops the travel.
   */
  motion?: MotionSetting;
  /**
   * The keys the HUD answers. Spacebar spins, Escape closes what is in front, the
   * arrows step the stake; `{ enabled: false }` leaves the keyboard to the game.
   */
  keyboard?: KeyboardOptions;
  /**
   * Whether the bar's controls take the keyboard focus. Default `false`: they are out
   * of the Tab order and a press does not leave the focus on them (the next spacebar
   * would press the control again instead of spinning, and the skin's focus ring would
   * stay drawn); text fields still focus when tapped. `true` leaves every control as
   * the browser has it. See `focus.ts`.
   */
  focus?: boolean;
  /**
   * Remember what the player chose, under this key.
   *
   * Opt-in, because storage is the host's business. Given a key, the HUD restores
   * the sound and music levels, the master mute, every speed's base/bonus switches
   * and SPACEBAR TO SPIN at mount, and writes them back whenever they change. Pass
   * an object to put them somewhere other than `localStorage`.
   */
  persist?: string | PersistOptions;
  /** Design width of the desktop bar in px, for the fit. Default 840 (52.5rem). */
  designWidth?: number;
  /** Clamp on the fit scale. Default `[0.7, 1.6]`. */
  scaleRange?: [number, number];
  /**
   * Force the channel the stylesheet lays out for. The reference takes this from the
   * URL the operator opens the game with (`channel=desktop`), because it is a
   * statement about the DEVICE, not about the window size — so a narrow desktop
   * window is still a desktop. Default: auto (touch → mobile, else size).
   */
  channel?: 'desktop' | 'mobile';
}

/** What `mountDomHud` hands back: the core, the tree, and the day-to-day verbs. */
export interface DomHud {
  readonly ui: OpenUI;
  /** The mounted root (`.OpenSlotUiContainer`-shaped). */
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
  /**
   * The compliance verbs. They were on the canvas handle and not on this one, which
   * left a DOM host unable to do the things a platform actually requires: apply the
   * per-player switchboard, state the RTP, show the error the RGS returned, or mark
   * a replay. They are the same calls, on both bindings.
   */
  applyJurisdiction(jurisdiction: JurisdictionConfig): void;
  setRtp(percent: number): void;
  showError(message: string, opts?: NoticeOptions): void;
  showRgsError(code: string, opts?: RgsErrorOptions): void;
  showFatal(message: string, opts?: NoticeOptions): void;
  setReplay(on: boolean): void;
  /** Say whether this is a demo (play-money) session — the balance gets a DEMO badge. */
  setDemo(on: boolean): void;
  /**
   * Hide the boot spinner — the game calls it when it is ready to play. With no
   * spinner asked for there is nothing to hide, and this does nothing.
   */
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
  root.className = 'OpenSlotUiContainer';
  root.id = 'open-slot-ui';
  root.dataset.theme = 'default';
  root.dataset.state = 'idle';
  root.dataset.layoutType = opts.layout?.type ?? 'ribbon';
  root.dataset.layoutPosition = opts.layout?.position ?? 'dock_bottom';
  root.innerHTML = [
    opts.spinner ? TPL_PROGRESS_INDICATOR : '',
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

  // The menu's rows are the chrome's, not the template's: however many speeds the
  // game declared, in the order it listed them, plus whatever rows its flags left on.
  const menuList = root.querySelector('#MainMenu ul');
  if (menuList) menuList.innerHTML = menuItemsHtml(ui.chrome.menu, ui.chrome.speeds);

  // A theme reaches the markup the only way a stylesheet can be reasoned with:
  // through the custom properties it already reads. Only what the host changed is
  // written, so a game that themed its accent keeps the skin's everything else.
  for (const [name, value] of Object.entries(themeVars(ui.theme))) root.style.setProperty(name, value);

  // How much is allowed to move. The rules this package adds are gated on it, and
  // a host that says nothing gets what the player asked their system for.
  const motion = resolveMotion(opts.motion);
  root.dataset.motion = motion;

  // A demo session is marked on the root, which is what the badge hangs off. The
  // attribute is namespaced because `data-demo` is a name a host may already be
  // using for its own purposes — and a library that silently reacts to someone
  // else's attribute draws a pill nobody asked for.
  const syncDemo = (): void => {
    root.dataset.openuiDemo = String(ui.demo.get());
  };
  syncDemo();

  const icons = resolveIcons(opts.icons);
  applyIcons(root, icons);

  // The data panel reads left to right in the order the chrome resolved, and shows
  // only what it listed. The markup ships all five in the reference's order; this
  // moves them and drops the rest, so an operator who wants the stake first — or
  // no balance at all, which some jurisdictions ask for — gets it.
  const dataPanel = root.querySelector('.DataPanel__container');
  if (dataPanel) {
    const wanted = ui.chrome.readouts.map(readoutElement);
    for (const el of [...dataPanel.children]) if (!wanted.includes(el.id)) el.remove();
    for (const id of wanted) {
      const el = root.querySelector(`#${id}`);
      if (el) dataPanel.appendChild(el);
    }
  }

  /**
   * THE FIRST FRAMES.
   *
   * The skin arrives as a `<link>`, and a stylesheet does not block rendering of a
   * tree that was appended after it started loading: the bar would paint once as
   * raw markup — full-size icon glyphs, a column of unstyled rows — and then jump
   * into place when the sheet lands. That flash is what the HUD is hidden for.
   *
   * Hidden means `visibility`, not `display`: the tree keeps its boxes, so the fit
   * can measure the real bar before anyone sees it. It reveals on the frame after
   * the stylesheet settles, and a deadline guarantees it reveals at all — a skin
   * that 404s costs a plain-looking HUD, never an invisible one.
   */
  root.style.visibility = 'hidden';
  let revealed = false;
  const reveal = (): void => {
    if (revealed) return;
    revealed = true;
    root.style.removeProperty('visibility');
  };
  const dressed = (): void => {
    if (revealed) return;
    // One frame later: the sheet has been applied, so this fit measures the bar the
    // player is about to see, and the reveal carries no re-layout with it.
    requestAnimationFrame(() => {
      syncScreen();
      reveal();
    });
  };
  const revealDeadline = setTimeout(reveal, 2000);

  const disposers: Dispose[] = [];
  const disposersEarly = disposers;
  disposers.push(() => clearTimeout(revealDeadline));
  if (opts.focus !== true) disposers.push(keepFocusOff(root));
  // The skin arrives as a <link>: until it loads, the tree measures NOTHING like its
  // final size, so the fit has to run again once it lands (and whenever the bar's own
  // box changes afterwards).
  const skin = mountSkin(opts.skin, () => {
    syncScreen();
    dressed();
  });
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
  // The promotion pill is ART, and art belongs to the skin. The template used to
  // carry `src="ui/images/promotion_button.png"` — a RELATIVE url, so every page
  // that was not served from the skin's own directory fetched a 404, and fetched it
  // even with the feature switched off, because the browser starts loading the
  // moment the markup is parsed. It is resolved here instead, against the
  // stylesheet's URL, which is how the skin's own CSS resolves its images.
  if (f.promotion) {
    const img = $(root, 'FeaturePromotionImage') as HTMLImageElement | null;
    const src =
      opts.skin?.promotionImage ??
      (opts.skin?.href ? new URL('ui/images/promotion_button.png', new URL(opts.skin.href, location.href)).href : undefined);
    if (img && src) img.src = src;
  }
  if (!f.autoplay) $(root, 'AutoplayBtn')?.closest('.ActionPanel__container--autoplay')?.remove();
  if (!f.betChangers) $(root, 'BetAmountIncrease')?.closest('.BetAmountChangersWidget')?.remove();
  if (!f.betWidget) $(root, 'BetAmountItem')?.remove();
  if (!f.betProgress) $(root, 'BetAmountIndicatorProgress')?.closest('.BetAmountProgressbar')?.remove();
  if (!f.autoplayAdvanced) $(root, 'AdvancedAutoplaySections')?.remove();
  // STOP ON ANY WIN is a stop a game opts into; without it the row would promise
  // something no jurisdiction asked for and no host is feeding.
  if (!spec.autoplay?.stopOnAnyWin) $(root, 'StopOnAnyWinSection')?.remove();
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

  // How many of the HUD's locks the open windows hold (see below): the buy sheet's own BET
  // selector answers while those are the only ones.
  const windowLock = { held: 0 };
  const ctx: BindContext = {
    root,
    icons,
    buyPanel,
    windowLocks: () => windowLock.held,
    panel: $(root, 'MainPanel'),
    features: opts.features ?? [],
    onBuy: opts.onBuy,
    // The INFO window renders the SAME declarative blocks the canvas renderer does.
    infoBlocks: opts.info ?? composeMenu(spec.menu, { rulesFallback: spec.rules }),
    rulesBlocks: spec.menu?.rules ?? spec.rules,
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
    bindKeyboard(ui, opts.keyboard),
    // `hud.closeOnOutsideTap`: a tap on the game closes the ☰ menu and the autoplay panel.
    ui.chrome.closeOnOutsideTap ? closeOnOutsideTap(ui, root) : () => undefined,
    ui.demo.subscribe(syncDemo),
    // Settings are restored HERE, after every binding is listening, so a restored
    // mute or speed paints itself on the way in instead of being applied to a tree
    // that has not been wired up yet.
    opts.persist ? persistSettings(ui, typeof opts.persist === 'string' ? { key: opts.persist } : opts.persist) : () => undefined,
  );

  // ── the attributes the stylesheet lays out from ───────────────────────────
  const wrapper = $(root, 'UiWrapper');
  const [minScale] = opts.scaleRange ?? [0.55, 1];

  const syncScreen = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ui.setScreen(w, h);
    // Touch decides the channel; size only breaks the tie for genuinely small
    // screens. A 900×700 desktop window is not a phone, and dressing it as one is
    // what makes a resized browser look broken.
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const channel = opts.channel ?? (coarse || Math.min(w, h) <= 600 ? 'mobile' : 'desktop');
    root.dataset.channel = channel;
    // A phone has no spacebar, so the row that switches it is desktop-only. It is
    // removed rather than hidden: a setting a player cannot act on is not a setting,
    // and leaving it in the list would say the game has one.
    if (channel !== 'desktop') $(root, 'SpacebarToggle')?.remove();
    root.dataset.orientation = w >= h ? 'landscape' : 'portrait';
    fitBar(w);
  };

  /**
   * Fit the bar to the window.
   *
   * Two things to get right, and I got both wrong first time. The bar is WIDER than
   * its plate — the buy coin hangs outside it (`right: 100%`) — so the box to fit is
   * the plate plus its overhangs, not the plate. And it must never scale UP: blowing
   * the bar past its design size is what pushed that coin off the left edge.
   */
  const fitBar = (viewportWidth: number): void => {
    if (!wrapper) return;
    wrapper.style.removeProperty('transform');
    wrapper.style.removeProperty('left');
    if (root.dataset.channel !== 'desktop') return; // the touch bar is already fluid

    const plate = root.querySelector<HTMLElement>('.UiRibbonUserPanel__container');
    if (!plate) return;
    const wrapRect = wrapper.getBoundingClientRect();
    const box = plate.getBoundingClientRect();
    let left = box.left;
    let right = box.right;
    // Everything that hangs OUTSIDE the plate: the buy coin and the promotion pill on
    // the left, the round button on the right. Measuring the plate alone is how the
    // spin button ended up off the screen in a currency whose numbers are long enough
    // to stretch the bar (`?currency=IRR`).
    for (const sel of [OVERHANG_LEFT, OVERHANG_PROMO, OVERHANG_RIGHT]) {
      const node = root.querySelector<HTMLElement>(sel);
      if (!node || !node.offsetParent) continue;
      const b = node.getBoundingClientRect();
      if (b.width === 0) continue;
      left = Math.min(left, b.left);
      right = Math.max(right, b.right);
    }
    // Offsets from the wrapper's own left edge, which is what we get to move.
    const offLeft = left - wrapRect.left;
    const needed = right - left;
    if (needed <= 0) return;

    const margin = 16;
    const k = Math.max(minScale, Math.min(1, (viewportWidth - margin * 2) / needed));
    // Scaling happens about the wrapper's bottom-left (the stylesheet's own origin),
    // so place that edge such that the scaled BOX lands centred.
    wrapper.style.left = `${Math.round((viewportWidth - needed * k) / 2 - offLeft * k)}px`;
    if (k < 0.999) wrapper.style.transform = `scale(${k.toFixed(4)})`;
  };

  syncScreen();
  disposers.push(on(window, 'resize', syncScreen), on(window, 'orientationchange', syncScreen));
  // Late layout — a web font landing, a feature flag flipping, the buy pill appearing
  // — changes the width the bar needs; re-fit rather than trusting the first pass.
  if (typeof ResizeObserver === 'function' && wrapper) {
    let fitting = false;
    const ro = new ResizeObserver(() => {
      if (fitting) return; // our own transform must not feed the loop
      fitting = true;
      requestAnimationFrame(() => {
        fitBar(window.innerWidth);
        fitting = false;
      });
    });
    const plate = root.querySelector('.UiRibbonUserPanel__container');
    if (plate) ro.observe(plate);
    disposers.push(() => ro.disconnect());
  }

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

  // A window that is up locks the game behind it. The reference does this too: you
  // cannot spin while the rules are open, and a spin that started under an open window
  // would be a round the player never saw. The lock is ref-counted, so overlapping
  // windows cannot leave it stuck on.
  const windows = [ui.settingsPanel, ui.historyPanel, buyPanel];
  const syncWindowLock = (): void => {
    const want = windows.some((w) => w.isOpen) ? 1 : 0;
    // Count the hold first: the lock notifies as it changes, and what repaints then must
    // already know whose lock it is.
    while (windowLock.held < want) {
      windowLock.held++;
      ui.lock();
    }
    while (windowLock.held > want) {
      windowLock.held--;
      ui.unlock();
    }
  };
  for (const w of windows) disposers.push(w.state.subscribe(syncWindowLock));
  disposers.push(() => {
    while (windowLock.held > 0) {
      windowLock.held--;
      ui.unlock();
    }
  });

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
    applyJurisdiction: (j) => ui.applyJurisdiction(j),
    setRtp: (p) => ui.rtp.set(p),
    showError: (message, opts) => ui.showError(message, opts),
    showRgsError: (code, opts) => ui.showRgsError(code, opts),
    showFatal: (message, opts) => ui.showFatal(message, opts),
    setReplay: (on) => ui.setReplay(on),
    setDemo: (on) => ui.setDemo(on),
    ready: () => progress?.classList.remove('is-visible'),
    dispose: () => {
      for (const d of disposers.splice(0)) d();
      root.remove();
      ui.dispose();
    },
  };
}

/**
 * A handful of rules for behaviour the REFERENCE implemented in JavaScript, which a
 * binding has to supply some other way. Nothing here restyles anything: it only makes
 * clipped content reachable. Injected before the skin so the skin always wins.
 */
/**
 * The rules BLOCK vocabulary, inside the skin's own info window.
 *
 * The skin styles ITS markup — a body of paragraphs and tables — and knows nothing
 * of the blocks a spec is written in, so a tab strip or a meter would land in the
 * window as naked HTML. `BLOCK_CSS` is the vocabulary's own stylesheet; all it
 * needs is its six colour properties, which are mapped here onto the skin's so the
 * blocks inherit the game's palette instead of a second one.
 */
/**
 * Scope a stylesheet under a prefix, so it can out-specify the skin it lands in.
 *
 * The skin styles its own info window with selectors like
 * `[data-channel="mobile"] .GameInfoWindow .GameInfo__body p` — three classes and
 * an element. A bare `.ohm-body p` loses that cascade no matter how late it is
 * injected, and the blocks inherit the skin's paragraph margins instead of their
 * own rhythm. Prefixing every rule fixes the specificity honestly, rather than by
 * sprinkling `!important` through the vocabulary's stylesheet.
 *
 * Comments are dropped first: they are for whoever reads the source, and a comma
 * inside one would split a selector list.
 */
function scopeCss(css: string, prefix: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // After a `}` — the previous rule — or a `{`, which is the FIRST rule inside an
    // at-rule block such as `@container`. Preludes containing `@` are skipped, so
    // the at-rule itself is left alone while the rules inside it are prefixed.
    .replace(/(^|[{}])([^{}@]+)\{/g, (_m, brace: string, selectors: string) =>
      `${brace}${selectors.split(',').map((sel) => `${prefix} ${sel.trim()}`).join(',')}{`,
    );
}

/**
 * The rules BLOCK vocabulary, inside the skin's own info window.
 *
 * A skin styles ITS markup — a body of paragraphs — and knows nothing of what a tab
 * strip, a symbol table or a reel grid is, so those blocks would land in the window
 * as naked HTML. `BLOCK_CSS` is the vocabulary's own stylesheet; all it needs is its
 * six colour properties, mapped here onto the skin's so the blocks wear the game's
 * palette instead of a second one.
 *
 * The gutter is the one thing added on top: the skin pads this body for a column of
 * paragraphs and leaves the left edge flush, and a table or a card sitting against
 * the window edge reads as broken.
 */
const BLOCK_SCOPE = 'div[data-channel] .GameInfoWindow';
const BLOCKS_CSS_SCOPED = `
${BLOCK_SCOPE} .GameInfo__body {
  --accent: var(--hg-bg-accent, #ffc529);
  --accent-text: var(--hg-text-color-inverse, #000);
  --surface: var(--hg-bg-secondary, #2a2a2a);
  --surface-alt: var(--hg-bg-tertiary, #2b2b2d);
  --text: var(--hg-text-color, #fafafa);
  --text-dim: var(--hg-text-color-secondary, #adb5bd);
}
${BLOCK_SCOPE} .GameInfo__body *, ${BLOCK_SCOPE} .GameInfo__body *::before, ${BLOCK_SCOPE} .GameInfo__body *::after { box-sizing: border-box; }
${BLOCK_SCOPE} .GameInfo__body.ohm-body { padding-left: clamp(14px, 3vw, 26px); padding-right: clamp(10px, 2vw, 18px); }
${scopeCss(BLOCK_CSS, BLOCK_SCOPE)}`;

/** The parts of the bar that stick out past the plate, and so decide the fit. */
const OVERHANG_LEFT = '.ToggleButton__container--feature-buy';
const OVERHANG_PROMO = '.ToggleButton__container--feature-promotion';
const OVERHANG_RIGHT = '.ActionPanel__container--game-actions';

const BEHAVIOUR_CSS = `
/* The buy sheet's card list is CLIPPED by the design (it fades its top and bottom
   edges) and the reference scrolls it with its own JS. Without that, every card below
   the fold is unreachable. Two things are needed, not one: the container has to
   scroll, AND it has to stop centring its content on the cross axis — a centred flex
   child that overflows cannot be scrolled back to, which is why the cards were cut off
   at the top as well as the bottom. */
div[data-layout-type="ribbon"][data-channel="mobile"] .FeatureBuyWindow .FeatureBuy__items-container {
  overflow-y: auto;
  align-items: flex-start;
  -webkit-overflow-scrolling: touch;
}
div[data-layout-type="ribbon"][data-channel="mobile"] .FeatureBuyWindow .FeatureBuyItemList {
  align-content: flex-start;
}
/* Same for the history table and the info window on small screens. */
div[data-channel="mobile"] .BetHistoryWindow .BetHistory__table-container,
div[data-channel="mobile"] .GameInfoWindow .GameInfo__body { overflow-y: auto; }

/* THE MENU IS A SCREEN, NOT A FLYOUT.
   It used to grow out of the bar and share it: the balance, the stake, the round
   button and the buy coin all stayed lit underneath, which reads as two things
   open at once and, on a short window, puts menu rows on top of the controls they
   are not part of. While the menu is up the bar's own panels step back — only the
   ☰, now an ✕, stays, because that is what closes it — and the menu sits above
   everything the bar draws. */
.MainPanel.main-menu-active .DataPanel__container,
.MainPanel.main-menu-active .FeaturePanel,
.MainPanel.main-menu-active .ActionPanel,
.MainPanel.main-menu-active .divider--vertical,
.MainPanel.main-menu-active #FeedbackMsg,
.MainPanel.main-menu-active .ToggleButton__container--feature-buy,
.MainPanel.main-menu-active .ToggleButton__container--feature-promotion {
  visibility: hidden;
  pointer-events: none;
}
.MainPanel.main-menu-active .MainMenu {
  z-index: 20;
}
.MainPanel.main-menu-active .ToggleButton__container--main-menu {
  z-index: 21;
}
/* A menu taller than the window scrolls instead of running off the top of it. */
.MainPanel .MainMenu {
  max-height: calc(100vh - 7rem);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* ── THE ROUND BUTTON'S THREE FACES ─────────────────────────────────────────
   The skin sizes the slam-stop square at 3.25rem in a 7rem button — under half of
   it — and next to the spin arrow (5.4rem) it reads as a hesitation rather than a
   stop. It is scaled here through a variable, so a game that wants the reference's
   exact proportion sets --ohm-stop-scale to 1.

   The scale is applied to the BUTTON, not to the glyph: the skin sizes its icons
   with font-size: inherit, and every channel sets its own --hg-btn-font-size, so
   scaling the button's own font size follows the skin wherever it goes instead of
   fighting a more specific rule with a hard-coded number. */
.CircleButton--stop-round {
  font-size: calc(var(--hg-btn-font-size, 3.25rem) * var(--ohm-stop-scale, 1.34));
}

/* ── THE ± CHANGERS DO NOT TUCK UNDER THE ROUND BUTTON ──────────────────────
   On a touch bar the skin flanks the round button with the changers and nudges
   each one 3-4px INWARD, so the translucent circle laps over their inner corners.
   On the reference's own near-black bar nobody sees it; on a game whose buttons
   are a lighter grey it reads as a smudge where three controls collide. The nudge
   becomes a clearance, which is the same layout with the overlap taken out. */
div[data-channel="mobile"] #BetAmountDecrease {
  left: calc(var(--ohm-changer-gap, 6px) * -1);
  right: auto;
}
div[data-channel="mobile"] #BetAmountIncrease {
  left: var(--ohm-changer-gap, 6px);
  right: auto;
}

/* WHILE AN AUTOPLAY RUN IS GOING the round button counts it down. The reference
   draws that as a white tile with the number in it — but only on a portrait phone;
   everywhere else the count is grey text laid over the stop glyph, which is hard to
   read and says less. The tile is the better idea, so it is used at every size. */
[data-state="autoplay"] #StopAutoplayBtn span[class^="icon-"],
[data-state="gameRoundEnterAutoplay"] #StopAutoplayBtn span[class^="icon-"] {
  visibility: hidden;
}
[data-state="autoplay"] #StopAutoplayBtn .AutoplayCounter,
[data-state="gameRoundEnterAutoplay"] #StopAutoplayBtn .AutoplayCounter {
  background: var(--ohm-counter-bg, #fff);
  border-radius: var(--ohm-counter-radius, 8px);
  color: var(--ohm-counter-text, #000);
  display: flex;
  font-size: var(--ohm-counter-size, 1.5rem);
  font-weight: 800;
  inset: 50% auto auto 50%;
  justify-content: center;
  line-height: 1;
  min-width: 2.2em;
  padding: 0.35em 0.2em;
  position: absolute;
  transform: translate(-50%, -50%);
}

/* WHEN THE AUTOPLAY BUTTON IS THE RUN'S STOP (autoplay.stopControl: 'autoplay-button')
   it wears the count through the run, as the same white tile the round button wears
   in the reference, and its glyph steps aside. Out of a run the tile is not there. */
.AutoplayBtnCounter {
  display: none;
}
#AutoplayBtn.is-counting {
  position: relative;
}
#AutoplayBtn.is-counting span[class^="icon-"] {
  visibility: hidden;
}
#AutoplayBtn.is-counting .AutoplayBtnCounter {
  background: var(--ohm-counter-bg, #fff);
  border-radius: var(--ohm-autoplay-counter-radius, 6px);
  color: var(--ohm-counter-text, #000);
  display: flex;
  font-size: var(--ohm-autoplay-counter-size, 0.95rem);
  font-weight: 800;
  inset: 50% auto auto 50%;
  justify-content: center;
  line-height: 1;
  min-width: 2.2em;
  padding: 0.35em 0.25em;
  position: absolute;
  transform: translate(-50%, -50%);
}

/* A FEATURE YOU BOUGHT IS RUNNING, so there is nothing to buy: the coin steps back
   for as long as it lasts, the way it does at the end of an autoplay run. */
[data-state^="feature"] .ToggleButton--feature-buy,
.ToggleButton--feature-buy.is-disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* ── THE HUD IS NOT A DOCUMENT TO ZOOM ──────────────────────────────────────
   iOS ignores user-scalable=no, so a two-finger pinch on the bar zooms the whole
   game — easy to do by accident on a control strip you press with both thumbs, and
   impossible to undo in a fullscreen game frame. Panning stays: the rules and the
   history are long and must scroll. */
.OpenSlotUiContainer {
  touch-action: pan-x pan-y;
}

/* A SETTING ROW THAT IS OFF LOOKS OFF. The reference swaps a slashed glyph for
   SOUND and MUSIC, but not every icon font has a twin for every setting a game
   adds, so the row says it the way a muted row does: dimmed. */
.MainMenuItem.is-off [class^="icon-"],
.MainMenuItem.is-off [data-translation] {
  opacity: var(--ohm-row-off, 0.45);
}

/* ── A DEMO SESSION SAYS SO ─────────────────────────────────────────────────
   Play money has to be visible at a glance, next to the number it applies to —
   most markets require the word on screen, and a player who thinks they are
   winning real money is a complaint, not a styling detail. */
[data-openui-demo="true"] #BalanceLabel::after {
  background: var(--ohm-demo-bg, var(--hg-bg-accent, #ffc529));
  border-radius: 2px;
  color: var(--ohm-demo-text, #000);
  content: var(--ohm-demo-word, "DEMO");
  font-size: 0.8em;
  font-weight: 800;
  letter-spacing: 0.04em;
  margin-left: 0.5em;
  padding: 0 0.35em;
  vertical-align: baseline;
}

/* ── A FREE-ROUNDS CAMPAIGN TAKES THE BAR ───────────────────────────────────
   With hud.freeRounds: 'takeover', the HUD plays the campaign itself, so the whole
   action panel — the stake widget, the ± changers, the round button and autoplay —
   is a row of controls with nothing to control. It steps aside, and the campaign's
   two readouts take its place in a box shaped like the free-spins strip. Every rule
   is keyed on the attribute, so a skin that wants the changers back says so. */
/* The skin re-displays the action panel per data-state with three-attribute
   selectors, so standing it down takes a selector of its own weight. */
div[data-layout-type="ribbon"][data-openui-free-rounds="true"][data-channel] .MainPanel .ActionPanel {
  display: none;
}
/* With the action panel gone, the stake has nowhere else to be read — so the data
   panel's static one shows, exactly as it does during free spins. The skin hides it
   on desktop for every state but a feature, which is why this says otherwise.
   THE ID IS DELIBERATE: a game skin that hides this readout does it by id, and no
   stack of classes and attributes outweighs one id — so a host following a skin of
   their own lost the stake for the whole campaign and had to patch it back. The
   stake being readable is part of what the takeover promises, so the rule carries
   the weight to keep that promise. A skin that really wants it gone still wins by
   marking its own rule important. */
div[data-layout-type="ribbon"][data-openui-free-rounds="true"][data-channel="desktop"] #BetAmountStaticItem.DataPanelItem.is-visible {
  display: flex;
}
.FreeRoundsPanel {
  display: none;
}
.FreeRoundsPanel.is-visible {
  align-items: center;
  display: flex;
  gap: var(--ohm-free-rounds-gap, 1.25rem);
  justify-content: center;
}
/* The box is the free-spins strip, so it follows it: a row in the bar on desktop
   and portrait, and on a landscape phone the skin turns .FeaturePanel into a fixed
   column pinned to the right edge. Padding that suits the row would clip the label
   in the column, so it is only applied where the box is a row. */
div[data-channel="desktop"] .FreeRoundsPanel.is-visible,
div[data-orientation="portrait"] .FreeRoundsPanel.is-visible {
  padding: 0 var(--ohm-free-rounds-gap, 1.25rem);
  white-space: nowrap;
}
div[data-orientation="landscape"] .FreeRoundsPanel.is-visible {
  gap: 0.15rem;
  /* In the column the skin pins to the edge, the box must be as wide as its widest
     word — otherwise the readouts overflow it on both sides and read as "TAL WIN". */
  min-width: max-content;
  padding: 0.35rem 0.5rem;
}
/* Each readout is a label over its value, the way the free-spins strip reads — and
   as wide as its own widest line. Inside the data panel these items take their width
   from the strip they sit in; here there is no strip, so without this they collapse
   to the value's width and the label hangs out of the box on both sides. */
.FreeRoundsPanel .DataPanelItem,
.FreeRoundsPanel > div {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  min-width: max-content;
  row-gap: 0.1rem;
  width: auto;
}
/* The count is the thing a player is counting, so it is the biggest number on the
   bar — in the colour the campaign readout already wears. */
.FreeRoundsPanel #FreeRoundsCounterValue {
  color: var(--ohm-free-rounds-color, var(--hg-bg-accent, #ffc529));
  font-size: var(--ohm-free-rounds-count, 34px);
  line-height: 1.05;
}
div[data-channel="mobile"] .FreeRoundsPanel {
  min-height: var(--ohm-free-rounds-height, 56px);
}
div[data-channel="mobile"] .FreeRoundsPanel #FreeRoundsCounterValue {
  font-size: var(--ohm-free-rounds-count-mobile, 22px);
}
div[data-channel="mobile"] .FreeRoundsPanel .DataPanelItem__label {
  font-size: 10px;
}
div[data-channel="mobile"] .FreeRoundsPanel .DataPanelItem__value {
  font-size: 14px;
}

/* ── A SWITCH IS A PILL, NOT A DISC ─────────────────────────────────────────
   The track of a BASE GAME / BONUS GAME switch has no content of its own — the
   skin sets font-size 0 and draws the knob as a ::before — so its width comes
   entirely from one rule giving it 100% of the row. In a skin build where that row
   is laid out across instead of down, or where the rule is keyed to the two speeds
   the reference ships by name, 100% resolves against nothing: the label shrinks to
   its knob, and two of them read as a pair of rings stacked on each other.

   A floor under the track is the fix that does not care which skin is on: a switch
   stays a switch, and --ohm-switch-min moves it. */
.MainMenuItem.Accordion .Toggle,
.MainMenuItem.Accordion .Toggle--sm,
.MainMenuItem.Accordion .Toggle--md {
  flex: 0 0 auto;
  min-width: var(--ohm-switch-min, 3.25rem);
  width: 100%;
}
.MainMenuItem.Accordion .Toggle--label {
  min-width: var(--ohm-switch-min, 3.25rem);
  width: 100%;
}
/* ...and the rows that hold them keep their own space, so a short panel cannot
   stack one switch on top of another. */
.MainMenuItem.Accordion .Accordion__panel-inner > div {
  min-width: 0;
  row-gap: 0.25rem;
}

/* ── THE BUY COIN CAN BE READ ───────────────────────────────────────────────
   On a touch bar the skin sizes the coin's word by how long it is — 8px for
   DISABLE, 7.5px for a longer one — so the label fits a rotated 74px disc. It
   fits; it cannot be read. A floor puts it back above the legibility line, and
   --ohm-buy-label is the knob for a game whose word is longer than ours. */
div[data-channel="mobile"] .UiRibbonUserPanel .ToggleButton--feature-buy[data-charcount] {
  font-size: var(--ohm-buy-label, 10px);
  line-height: 1.1;
}

/* The buy coin's own ink. The skin hard-codes black on the coin; a game whose buy
   colour is dark needs to say otherwise, and theme.color.featureBuyText does. */
.ToggleButton--feature-buy {
  color: var(--ohm-feature-buy-text, #000);
}

/* A WINDOW ON A PHONE IS THE SCREEN, so it goes above the bar.
   The skin stacks the bar over the windows (1311 over 1300), which is right on a
   desktop: the sheet is a centred column and the bar stays lit either side of it.
   On a touch layout the same sheet fills the screen, so the bar lands ON TOP of the
   text — the round button through the rules, the coin over the paytable. There, and
   only there, the window comes forward. */
div[data-channel="mobile"] .Modal.is-visible {
  z-index: 1320;
}

/* ── MOTION ─────────────────────────────────────────────────────────────────
   The skin transitions its buttons and nothing else: a window appears, a sheet
   appears, a number changes, all instantly. These are the four the HUD is missing,
   written against the theme's own durations and gated on the data-motion attribute,
   so a host
   can turn them down or off and a player who asked their system for less motion
   gets less without asking anyone.

   Every rule is additive: with motion off the HUD is exactly what it was. */
[data-motion="full"] .Modal.is-visible,
[data-motion="reduced"] .Modal.is-visible {
  animation: ohm-fade var(--ohm-motion-base, 200ms) ease-out;
}
[data-motion="full"] .Modal.is-visible .Modal__container {
  animation: ohm-rise var(--ohm-motion-base, 200ms) cubic-bezier(0.2, 0.7, 0.3, 1);
}
[data-motion="full"] .MainMenu.is-visible,
[data-motion="full"] .AutoplayMenu.is-visible {
  animation: ohm-sheet var(--ohm-motion-base, 200ms) cubic-bezier(0.2, 0.7, 0.3, 1);
}
[data-motion="reduced"] .MainMenu.is-visible,
[data-motion="reduced"] .AutoplayMenu.is-visible {
  animation: ohm-fade var(--ohm-motion-fast, 125ms) ease-out;
}
/* A value that changed says so — the reference just swaps the text, and a balance
   that moves while the player is looking elsewhere is a balance they did not see
   move. */
[data-motion="full"] .DataPanelItem__value.is-changed,
[data-motion="full"] .BetAmountWidget__value.is-changed {
  animation: ohm-bump var(--ohm-motion-slow, 360ms) ease-out;
}
[data-motion="reduced"] .DataPanelItem__value.is-changed,
[data-motion="reduced"] .BetAmountWidget__value.is-changed {
  animation: ohm-tint var(--ohm-motion-base, 200ms) ease-out;
}
[data-motion="full"] #FeedbackMsg.is-visible {
  animation: ohm-feedback var(--ohm-motion-slow, 360ms) ease-out;
}
/* The ladder bar under the stake slides to its new length instead of jumping. */
[data-motion="full"] .BetAmountProgressbar__inner,
[data-motion="reduced"] .BetAmountProgressbar__inner {
  transition: width var(--ohm-motion-fast, 125ms) linear;
}

@keyframes ohm-fade { from { opacity: 0; } }
@keyframes ohm-rise { from { opacity: 0; transform: translateY(12px) scale(0.985); } }
@keyframes ohm-sheet { from { opacity: 0; transform: translateY(10px); } }
@keyframes ohm-bump { 0% { transform: scale(1); } 28% { transform: scale(1.07); color: var(--ohm-accent, var(--hg-bg-accent, #ffc529)); } 100% { transform: scale(1); } }
@keyframes ohm-tint { 0% { color: var(--ohm-accent, var(--hg-bg-accent, #ffc529)); } 100% { color: inherit; } }
@keyframes ohm-feedback { from { opacity: 0; transform: translateY(4px); } }
`;

/**
 * Load the skin: a `<link>`, a `<style>`, and (optionally) its icon `@font-face`.
 *
 * `onSettled` fires once the stylesheet has landed — or failed, or was never asked
 * for. Until then the markup measures and looks like nothing it is supposed to, so
 * the HUD stays hidden (see `revealWhenDressed`).
 */
function mountSkin(skin: DomSkin = {}, onSettled?: () => void): Dispose | undefined {
  const nodes: Element[] = [];
  if (skin.href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = skin.href;
    if (onSettled) {
      // An already-cached sheet can be applied before the listener is attached; a
      // missing one never loads at all. Both have to settle the boot.
      link.addEventListener('load', onSettled, { once: true });
      link.addEventListener('error', onSettled, { once: true });
    }
    document.head.appendChild(link);
    nodes.push(link);
  } else if (onSettled) {
    // No skin to wait for — but never synchronously, because the caller is still
    // half-built at this point (the fit it runs is declared below it).
    queueMicrotask(onSettled);
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
  // LAST, so that where the binding and the skin tie on specificity, the binding wins
  // — these rules only make clipped content reachable, never restyle it.
  const behaviour = document.createElement('style');
  behaviour.dataset.openui = 'behaviour';
  behaviour.textContent = `${BLOCKS_CSS_SCOPED}\n${BEHAVIOUR_CSS}`;
  document.head.appendChild(behaviour);
  nodes.push(behaviour);
  return () => nodes.forEach((n) => n.remove());
}
