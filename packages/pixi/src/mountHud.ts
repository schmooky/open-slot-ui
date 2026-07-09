import { type Application } from 'pixi.js';
import {
  createUI,
  buildPanel,
  composeMenu,
  formatAmount,
  type OpenUI,
  type UISpec,
  type HostHooks,
  type CurrencySpec,
  type EventLog,
  type ControlSnapshot,
  type Signal,
  type OpenUIEvents,
  type Dispose,
  type JurisdictionConfig,
  type BlockSpec,
  type NoticeAction,
  type NoticeOptions,
  type RgsErrorOptions,
} from '@open-slot-ui/core';
import { OpenUIPixi, type OpenUIPixiOptions } from './OpenUIPixi';
import { PanelBodyView } from './views/PanelBodyView';
import { mountInfoMenu } from './infoMenu';

/** Shared BLOCKING replay modal — the round's facts + one button, non-dismissible
 *  (no ✕, no backdrop close; only the button advances). Used for both the start ("Play")
 *  and the end ("Replay") of a replay so it's a strict modal → round → modal loop. */
function showReplayModal(ui: OpenUI, info: ReplayInfo, buttonKey: string, onSelect: () => void): void {
  const cur = info.currency ?? ui.balance.currency.get();
  const money = (n: number): string => formatAmount(n, cur);
  ui.showNotice(
    [
      { kind: 'heading', id: 'openui-replay-h', text: 'openui.replay.title' },
      {
        kind: 'stat-grid',
        id: 'openui-replay-g',
        items: [
          { label: 'openui.replay.baseBet', value: money(info.baseBet) },
          { label: 'openui.replay.costMultiplier', value: `${info.costMultiplier}×` },
          { label: 'openui.replay.payoutMultiplier', value: `${info.payoutMultiplier}×` },
          { label: 'openui.replay.amount', value: money(info.amount) },
        ],
      },
    ],
    [{ label: buttonKey, variant: 'primary', onSelect: () => { ui.hideNotice(); onSelect(); } }],
    { blocking: true },
  );
}

/** The round facts shown at the start of a replay (Stake "Replay Support"). */
export interface ReplayInfo {
  /** The base bet (before the mode's cost multiplier). */
  baseBet: number;
  /** The mode's cost multiplier (×), e.g. a 185× bonus buy. */
  costMultiplier: number;
  /** The round's payout multiplier (× the base bet). */
  payoutMultiplier: number;
  /** The final amount the round paid. */
  amount: number;
  /** Currency for the money values (defaults to the balance currency). */
  currency?: CurrencySpec;
}

export interface HudOptions extends OpenUIPixiOptions {
  hooks?: HostHooks;
  /**
   * Render the library's white HTML **info menu** (Settings · Paytable · Rules) — the Figma
   * design, driven by `spec.menu`, label-left / control-right, fully modular + localized —
   * instead of the in-canvas Pixi menu. Default `true`. `menu: false` opts out of BOTH (the
   * host supplies its own menu). Set `infoMenu: false` to keep the old Pixi menu.
   */
  infoMenu?: boolean;
}

/**
 * The complete-HUD handle returned by `mountHud`. Wraps the headless OpenUI + the
 * Pixi controller with the day-to-day game verbs, so the host rarely touches the
 * lower layers. `dispose()` is the single, leak-free teardown (Charter P12).
 */
export interface BootedHud {
  readonly ui: OpenUI;
  readonly pixi: OpenUIPixi;
  on<K extends keyof OpenUIEvents>(type: K, fn: (p: OpenUIEvents[K]) => void): Dispose;
  setBalance(major: number): void;
  setBet(major: number): void;
  /** Set the bonus total-win amount (major units). Shown in the buy-feature slot while
   *  the spin button is in free-spins mode (`setFreeSpins(n > 0)`). */
  setTotalWin(major: number): void;
  setCurrency(spec: CurrencySpec): void;
  /** Apply a Stake Engine jurisdiction config (the compliance switchboard) at runtime. */
  applyJurisdiction(jur: JurisdictionConfig): void;
  /** Report a settled round (major units): updates net position + enforces autoplay limits. */
  reportRound(win: number, bet: number): void;
  /** Set the RTP percentage shown by the RTP readout (when `displayRTP`). */
  setRtp(percent: number): void;
  /** Master mute / unmute (music + sfx). */
  setMuted(muted: boolean): void;
  /** Show a menu-style notice modal: declarative blocks + optional action buttons. */
  showNotice(blocks: BlockSpec[], actions?: NoticeAction[]): void;
  /** Show a menu-style error modal — `message`/`opts.title` are literal text OR i18n
   *  keys, and `opts.actions` adds custom buttons (e.g. a "Reload"). */
  showError(message: string, opts?: NoticeOptions): void;
  /** Show the default (localizable, per-call overridable) message for an RGS status
   *  code (e.g. `'ERR_IPB'`, `'ERR_IS'`, `'ERR_MAINTENANCE'`). */
  showRgsError(code: string, opts?: RgsErrorOptions): void;
  /** Show a FATAL error: a blocking modal that LOCKS the HUD and is dismissable only
   *  in code (`hideNotice`) — for unrecoverable RGS states. */
  showFatal(message: string, opts?: NoticeOptions): void;
  /** Dismiss the notice / error modal. */
  hideNotice(): void;
  /** Social / sweepstakes mode: one switch swaps gambling wording (+ a coin → GC/SC). */
  setSocial(on: boolean, coin?: string): void;
  /** Switch the spin button to / from its free-spins face: `n > 0` shows "N FS". */
  setFreeSpins(n: number): void;
  /** Enter/leave replay mode (Stake `replay=true`) — locks the HUD + shows a REPLAY badge. */
  setReplay(on: boolean): void;
  /** Replay support (Stake "Replay Support"): at the START of a replay show the round's
   *  Base Bet, its Cost + Payout multipliers and the final amount in an open-ui panel;
   *  `onPlay` begins the playback. Labels are social-aware (Base Bet → Base Play, etc.);
   *  amounts format with `info.currency` (defaults to the balance currency). Also flips
   *  the HUD into replay mode (badge + lock). */
  replayStart(info: ReplayInfo, onPlay?: () => void): void;
  /** At the END of a replay, show the SAME facts + a "Replay" button that re-runs it.
   *  Non-dismissible (no ✕ / backdrop close) — it's a strict modal → round → modal loop. */
  replayEnd(info: ReplayInfo, onReplay: () => void): void;
  /** Show a buy-feature confirm modal (Cancel / Confirm). Texts are literal-or-key. */
  confirmBuy(opts: { title?: string; message?: string; onConfirm: () => void; confirmLabel?: string; cancelLabel?: string }): void;
  /** Confirm-GATE a buy / bet-mode activation: when its `cost` (× base bet) exceeds
   *  the configured `confirmBuyAboveCost` threshold, show a confirm popup naming the
   *  feature + `price` and run `onConfirm` only on confirm; otherwise run `onConfirm`
   *  straight away. This is how a game honors Stake's "no one-click activation above
   *  2×" rule — the library owns the threshold + popup, the game just calls this. */
  requestBuyFeature(opts: {
    cost: number;
    name?: string;
    price?: string;
    onConfirm: () => void;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }): void;
  /** Read-back: would a play of this `cost` (× base bet) require confirmation? */
  shouldConfirmBuy(cost: number): boolean;
  /** Slide the whole interactive HUD in / out — bottom controls go down, top ones up
   *  (behind the status-bar plaque). Non-interactive while moving. */
  showControls(): void;
  hideControls(): void;
  setControlsVisible(visible: boolean): void;
  snapshot(): ControlSnapshot[];
  readonly events: EventLog | undefined;
  readonly inputLocked: Signal<boolean>;
  lockInput(): void;
  unlockInput(): void;
  unmount(): void;
  dispose(): void;
}

/**
 * The one-call, out-of-the-box entry: `mountHud(app)` boots the full reference
 * HUD; `mountHud(app, spec, opts)` configures it from one JSON UISpec + renderer
 * art/skins. Pure assembly over `createUI` + `OpenUIPixi` (Charter B9).
 */
export function mountHud(app: Application, spec: UISpec = {}, opts: HudOptions = {}): BootedHud {
  const { hooks, infoMenu, ...pixiOpts } = opts;
  const ui = createUI(spec, hooks);
  // The white HTML info menu (the Figma design) is the default; `menu:false` opts out of any
  // library menu; `infoMenu:false` falls back to the in-canvas Pixi menu.
  const useInfoMenu = infoMenu !== false && pixiOpts.menu !== false;
  // Compose the unified Pixi menu (Settings → Paytable → Rules) only when NOT using the HTML
  // menu. A Language switch is added when 2+ locales are configured; `spec.rules` folds in.
  const locales = spec.locale ? Array.from(new Set([spec.locale.locale, ...Object.keys(spec.locale.messages)])) : [];
  const menu = pixiOpts.menu === false || useInfoMenu ? false : composeMenu(spec.menu, { locales, localeSelectId: spec.localeSelectId, rulesFallback: spec.rules });
  // Game name + version footer (support / certification) — appended to the Pixi menu.
  if (menu && spec.game && (spec.game.name || spec.game.version)) {
    menu.push({ kind: 'legal', id: 'openui-game-info', text: [spec.game.name, spec.game.version ? `v${spec.game.version}` : ''].filter(Boolean).join('  ·  ') });
  }
  const pixi = new OpenUIPixi(ui, { ...pixiOpts, menu });
  pixi.mount(app);
  // Mount the white HTML info menu overlay (opens/closes off the canvas ☰).
  const disposeInfoMenu = useInfoMenu ? mountInfoMenu(app, ui) : undefined;

  // The reality-check reminder (RTS 13) is now wired in `createUI` (core), so it runs
  // on a wall-clock timer regardless of renderer — nothing to schedule here.

  // Extra declarative panels (beyond the settings menu) render as their own layers.
  const extra: PanelBodyView[] = [];
  if (spec.panels?.length) {
    for (const ps of spec.panels) {
      const built = buildPanel(ps, ui.bus);
      ui.register(built.panel);
      for (const c of built.controls) ui.register(c);
      const view = new PanelBodyView(built.panel, built.controls, built.blocks, ui, app.ticker, {
        controlSkins: pixiOpts.controlSkins,
      });
      pixi.root.addChild(view);
      view.applyLayout(ui.screen.get());
      extra.push(view);
    }
  }
  const offRelayout = ui.screen.subscribe(() => {
    const s = ui.screen.get();
    for (const v of extra) v.applyLayout(s);
  });

  const teardown = (): void => {
    offRelayout();
    disposeInfoMenu?.();
    for (const v of extra) v.dispose();
    extra.length = 0;
    pixi.unmount();
    ui.dispose(); // tear down the headless subscriptions too (Charter P12)
  };

  function on<K extends keyof OpenUIEvents>(type: K, fn: (p: OpenUIEvents[K]) => void): Dispose {
    return ui.on(type, fn);
  }

  return {
    ui,
    pixi,
    on,
    setBalance: (n) => ui.balance.set(n),
    setBet: (n) => ui.bet.set(n),
    setTotalWin: (n) => ui.totalWin.set(n),
    setCurrency: (c) => {
      ui.balance.setCurrency(c);
      ui.bet.setCurrency(c);
      ui.totalWin.setCurrency(c);
      ui.netPosition.setCurrency(c);
    },
    applyJurisdiction: (j) => ui.applyJurisdiction(j),
    reportRound: (win, bet) => ui.reportRound(win, bet),
    setRtp: (p) => ui.rtp.set(p),
    setMuted: (m) => ui.setMuted(m),
    showNotice: (blocks, actions) => ui.showNotice(blocks, actions),
    showError: (message, opts) => ui.showError(message, opts),
    showRgsError: (code, opts) => ui.showRgsError(code, opts),
    showFatal: (message, opts) => ui.showFatal(message, opts),
    hideNotice: () => ui.hideNotice(),
    setSocial: (on, coin) => ui.setSocial(on, coin),
    setFreeSpins: (n) => ui.spin.setFreeSpins(n),
    setReplay: (on) => ui.setReplay(on),
    replayStart: (info, onPlay) => {
      ui.setReplay(true); // REPLAY badge + locked HUD
      showReplayModal(ui, info, 'openui.replay.play', () => onPlay?.());
    },
    replayEnd: (info, onReplay) => {
      showReplayModal(ui, info, 'openui.replay.again', onReplay);
    },
    confirmBuy: (o) => {
      // Real guard: a jurisdiction that disabled buy-feature makes this a no-op.
      if (ui.isDisabled('buyFeature')) return;
      ui.showNotice(
        [
          { kind: 'heading', id: 'buy-title', text: o.title ?? 'openui.buyFeature.title' },
          { kind: 'text', id: 'buy-body', text: o.message ?? 'openui.buyFeature.message' },
        ],
        [
          { label: o.cancelLabel ?? 'openui.cancel', variant: 'secondary' },
          { label: o.confirmLabel ?? 'openui.confirm', variant: 'primary', onSelect: o.onConfirm },
        ],
      );
    },
    shouldConfirmBuy: (cost) => ui.shouldConfirmBuy(cost),
    requestBuyFeature: (o) => {
      if (ui.isDisabled('buyFeature')) return; // jurisdiction fully disabled the feature
      if (!ui.shouldConfirmBuy(o.cost)) {
        o.onConfirm(); // cost at/under the threshold → one click is allowed
        return;
      }
      // Pre-resolve the message (block text can't interpolate); social/locale at open time.
      const message =
        o.message ??
        (o.name
          ? ui.t('openui.buyFeature.confirm', { name: ui.t(o.name), price: o.price ?? '' })
          : 'openui.buyFeature.message');
      ui.showNotice(
        [
          { kind: 'heading', id: 'buy-title', text: o.title ?? 'openui.buyFeature.title' },
          { kind: 'text', id: 'buy-body', text: message },
        ],
        [
          { label: o.cancelLabel ?? 'openui.cancel', variant: 'secondary' },
          { label: o.confirmLabel ?? 'openui.confirm', variant: 'primary', onSelect: o.onConfirm },
        ],
      );
    },
    showControls: () => pixi.setControlsVisible(true),
    hideControls: () => pixi.setControlsVisible(false),
    setControlsVisible: (v) => pixi.setControlsVisible(v),
    snapshot: () => ui.snapshot(),
    events: pixi.eventLog,
    inputLocked: ui.locked,
    lockInput: () => ui.lock(),
    unlockInput: () => ui.unlock(),
    unmount: teardown,
    dispose: teardown,
  };
}
