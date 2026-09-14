import { Container, Graphics, Text, type Application, type Ticker } from 'pixi.js';
import {
  type OpenUI,
  type BlockSpec,
  type ScreenState,
  EventLog,
  buildBlocks,
  buttonBlocks,
  composeMenu,
  remFor,
  barHeightFor,
} from '@open-slot-ui/core';
import { type ControlView } from './views/ControlView';
import { MenuView } from './views/MenuView';
import { DialogView } from './views/DialogView';
import { type ControlViewFactory } from './views/blockColumn';
import { RibbonHud } from './chrome/RibbonHud';
import { TopOverlay } from './chrome/TopOverlay';
import { HistoryModal } from './chrome/HistoryModal';

export interface OpenUIPixiOptions {
  /** Expose `window.__OPENUI__` for e2e/introspection. Default true. */
  expose?: boolean;
  /**
   * The composed MENU blocks (Settings → Paytable → Rules) the INFO row opens in a
   * scrollable window. Usually built by `mountHud` via `composeMenu(spec.menu, …)`;
   * omitted → a default Settings-only menu. Pass `false` to skip the built-in window
   * entirely (e.g. when supplying your own HTML/DOM menu).
   */
  menu?: BlockSpec[] | false;
  /** Header title for the menu window (localizable). Default 'Menu'. */
  menuTitle?: string;
  /** Per-id view override for menu/dialog content controls (Charter P7). */
  controlSkins?: Partial<Record<string, ControlViewFactory>>;
  /**
   * How the HUD appears on mount: `'shown'` (default), `'hidden'` (off screen +
   * non-interactive; reveal later with `showControls()`), or `'slide-in'`.
   */
  intro?: 'shown' | 'hidden' | 'slide-in';
  /** Pressed when the player taps BUY BONUS (the host opens its own buy flow). */
  onBuy?: () => void;
}

/** Smooth S-curve for the show/hide slide (translation only — no scaling). */
function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/**
 * The controller: mounts ONE root Container onto the host's existing stage, shares
 * the host ticker/renderer, drives resize, and exposes introspection. `unmount()`
 * removes the layer and every listener it created (Charter P2/P12).
 *
 * What it mounts is the RIBBON — one docked bar that owns the everyday controls —
 * plus the overlays that belong with it: the top info strip, the ☰ menu window, the
 * history window and the notice/error modal. There are no free-floating controls
 * any more: if it is on screen, the ribbon put it there.
 */
export class OpenUIPixi {
  readonly root = new Container();
  private ribbon?: RibbonHud;
  private topOverlay?: TopOverlay;
  private historyModal?: HistoryModal;
  /** Overlays that own their own layout (menu window, dialog, replay badge). */
  private readonly overlays: Array<{ applyLayout(s: ScreenState): void; dispose(): void }> = [];
  private readonly disposers: Array<() => void> = [];
  private _eventLog?: EventLog;
  private slideProg = 0; // 0 = shown · 1 = fully hidden
  private slideTarget = 1;
  private slideHeld = false;
  private lastScreenH = 1080;
  private appTicker?: Ticker;
  private slideTickFn?: (t: Ticker) => void;

  constructor(
    private readonly ui: OpenUI,
    private readonly opts: OpenUIPixiOptions = {},
  ) {}

  /** The bus event log backing `window.__OPENUI__.events` (available after mount). */
  get eventLog(): EventLog | undefined {
    return this._eventLog;
  }

  /** The height of the docked bar in px — what the game keeps its reels clear of. */
  get barHeight(): number {
    return barHeightFor(this.ui.screen.get(), this.ui.chrome);
  }

  mount(app: Application): void {
    const { stage, renderer, ticker } = app;
    this.appTicker = ticker;
    stage.sortableChildren = true;
    this.root.zIndex = 10_000;
    this.root.sortableChildren = true;
    stage.addChild(this.root);

    // ── the bar ──────────────────────────────────────────────────────────────
    const ribbon = new RibbonHud(this.ui, ticker, { onBuy: this.opts.onBuy });
    ribbon.zIndex = 20;
    this.ribbon = ribbon;
    this.root.addChild(ribbon);

    // ── the overlays that belong with it ─────────────────────────────────────
    const top = new TopOverlay(this.ui, ticker, () => this.toggleFullscreen(app));
    top.zIndex = 10;
    this.topOverlay = top;
    this.root.addChild(top);

    if (this.ui.chrome.features.history) {
      const history = new HistoryModal(this.ui, ticker);
      history.zIndex = 300;
      this.historyModal = history;
      this.root.addChild(history);
    }

    // The INFO window: the composed Settings → Paytable → Rules blocks.
    if (this.opts.menu !== false) {
      const menuView = this.buildMenu(ticker);
      menuView.zIndex = 320;
      this.root.addChild(menuView);
      this.overlays.push(menuView);
    }

    // The menu-style notice / error modal (owns its open/closed visibility).
    const dialog = new DialogView(this.ui.noticePanel, this.ui.noticeBlocks, this.ui.noticeActions, this.ui, ticker, { controlSkins: this.opts.controlSkins });
    dialog.zIndex = 340;
    this.root.addChild(dialog);
    this.overlays.push(dialog);

    this.mountReplayBadge();
    this.wireKeyboard();
    this.wireFullscreen(app);

    // ── layout ───────────────────────────────────────────────────────────────
    const applyLayout = (): void => {
      const screen = this.ui.screen.get();
      const rem = remFor(screen, this.ui.chrome);
      ribbon.applyLayout(screen);
      top.applyLayout(screen, rem);
      this.historyModal?.applyLayout(screen, rem);
      this.lastScreenH = screen.height;
      this.applySlide();
      for (const o of this.overlays) o.applyLayout(screen);
    };
    const onResize = (): void => this.ui.setScreen(app.screen.width, app.screen.height);

    renderer.on('resize', onResize);
    const unsubScreen = this.ui.screen.subscribe(applyLayout);
    onResize();
    applyLayout();

    const intro = this.opts.intro ?? 'shown';
    if (intro === 'shown') {
      this.slideProg = 0;
      this.applySlide();
    } else {
      this.slideProg = 1;
      this.applySlide();
      this.ui.lock();
      this.slideHeld = true;
      if (intro === 'slide-in') this.setControlsVisible(true);
    }

    this.disposers.push(() => renderer.off('resize', onResize), unsubScreen);

    this._eventLog = new EventLog(this.ui.bus);
    if (this.opts.expose ?? true) this.expose();
  }

  /** Keyboard spin (Space / Enter), gated by jurisdiction + the lock. RTS 14D: one
   *  spin per press — holding the key never auto-repeats. */
  private wireKeyboard(): void {
    if (typeof window === 'undefined') return;
    let keyHeld = false;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' && e.key !== 'Enter') return;
      if (!this.ui.spin.allowKeyboard.get() || e.repeat || keyHeld) return;
      keyHeld = true;
      e.preventDefault();
      if (this.ui.spin.interactable) this.ui.spin.activate();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space' || e.key === 'Enter') keyHeld = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  private toggleFullscreen(app: Application): void {
    if (typeof document === 'undefined') return;
    const el = (app.canvas.parentElement ?? document.documentElement) as HTMLElement;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  }

  /** The view stays DOM-agnostic, so the controller owns the actual fullscreen call
   *  and repaints the overlay's icon when the document's state changes. */
  private wireFullscreen(app: Application): void {
    if (typeof document === 'undefined') return;
    this.disposers.push(
      this.ui.bus.on('buttonActivated', ({ id }) => {
        if (id === 'fullscreen') this.toggleFullscreen(app);
      }),
    );
    const onFsChange = (): void => this.topOverlay?.applyLayout(this.ui.screen.get(), remFor(this.ui.screen.get(), this.ui.chrome));
    document.addEventListener('fullscreenchange', onFsChange);
    this.disposers.push(() => document.removeEventListener('fullscreenchange', onFsChange));
  }

  /** REPLAY badge (Stake replay mode) — a pill shown while `ui.replay` is true. */
  private mountReplayBadge(): void {
    const badge = new Container();
    const bg = new Graphics();
    const label = new Text({ text: this.ui.t('openui.replay').toUpperCase(), style: { fontFamily: this.ui.theme.type.family, fontSize: 16, fontWeight: '800', fill: this.ui.theme.color.text, letterSpacing: 2 } });
    label.anchor.set(0.5);
    badge.addChild(bg, label);
    badge.zIndex = 310;
    badge.visible = this.ui.replay.get();
    this.root.addChild(badge);
    this.overlays.push({
      applyLayout: (s) => {
        const w = label.width + 36;
        const h = 32;
        bg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: this.ui.theme.color.menu }).stroke({ width: 2, color: this.ui.theme.color.accent });
        badge.position.set(s.width / 2, 40);
      },
      dispose: () => {
        if (!badge.destroyed) badge.destroy({ children: true });
      },
    });
    this.disposers.push(
      this.ui.replay.subscribe((v) => {
        badge.visible = v;
      }),
      this.ui.locale.subscribe(() => {
        if (!badge.destroyed) label.text = this.ui.t('openui.replay').toUpperCase();
      }),
    );
  }

  /**
   * Build the scrollable INFO window bound to the settings panel. Composed `menu`
   * blocks are given by `mountHud`; absent → a default Settings-only menu. Built-in
   * ids ('music'/'sfx') are reused, not shadowed (P10); button blocks wire `closePanel`.
   */
  private buildMenu(ticker: Application['ticker']): ControlView {
    const menu = this.opts.menu && this.opts.menu.length ? this.opts.menu : composeMenu(undefined, {});
    const controls = buildBlocks(menu, this.ui.bus, undefined, (id) => this.ui.control(id));
    for (const c of controls) if (!this.ui.control(c.id)) this.ui.register(c);
    const buttons = buttonBlocks(menu);
    this.disposers.push(
      this.ui.bus.on('buttonActivated', ({ id }) => {
        const b = buttons.find((x) => x.id === id);
        if (b?.action === 'closePanel') this.ui.settingsPanel.closePanel();
      }),
    );
    return new MenuView(this.ui.settingsPanel, controls, menu, this.ui, ticker, {
      controlSkins: this.opts.controlSkins,
      title: this.opts.menuTitle,
    });
  }

  /**
   * Slide the whole HUD in (`true`) or out (`false`). The bar travels toward its
   * dock edge; it is non-interactive while moving or hidden.
   */
  setControlsVisible(visible: boolean): void {
    const target = visible ? 0 : 1;
    this.slideTarget = target;
    if (!this.slideHeld) {
      this.ui.lock();
      this.slideHeld = true;
    }
    const settle = (): void => {
      if (this.slideProg === 0 && this.slideHeld) {
        this.ui.unlock();
        this.slideHeld = false;
      }
    };
    if (!this.appTicker) {
      this.slideProg = target;
      this.applySlide();
      settle();
      return;
    }
    const from = this.slideProg;
    const startMs = typeof performance !== 'undefined' ? performance.now() : 0;
    if (this.slideTickFn) this.appTicker.remove(this.slideTickFn);
    const tick = (): void => {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : startMs + 360;
      const k = Math.min(1, (nowMs - startMs) / 360);
      this.slideProg = from + (target - from) * k;
      if (k >= 1) {
        this.slideProg = target;
        this.appTicker?.remove(tick);
        this.slideTickFn = undefined;
        settle();
      }
      this.applySlide();
    };
    this.slideTickFn = tick;
    this.appTicker.add(tick);
  }

  private applySlide(): void {
    if (!this.ribbon) return;
    const dir = this.ui.chrome.dock === 'top' ? -1 : 1;
    this.ribbon.y = easeInOutCubic(this.slideProg) * this.lastScreenH * dir;
    if (this.topOverlay) this.topOverlay.y = easeInOutCubic(this.slideProg) * -this.lastScreenH * dir;
  }

  unmount(): void {
    if (this.slideTickFn && this.appTicker) this.appTicker.remove(this.slideTickFn);
    this.slideTickFn = undefined;
    this.ribbon?.dispose();
    this.ribbon = undefined;
    this.topOverlay?.dispose();
    this.topOverlay = undefined;
    this.historyModal?.dispose();
    this.historyModal = undefined;
    for (const o of this.overlays) o.dispose();
    this.overlays.length = 0;
    this._eventLog?.dispose();
    this._eventLog = undefined;
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.root.destroyed) this.root.destroy({ children: true });
    if (typeof window !== 'undefined') {
      delete (window as unknown as Record<string, unknown>).__OPENUI__;
    }
  }

  private expose(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__OPENUI__ = {
      snapshot: () => this.ui.snapshot(),
      getState: (id: string) => this.ui.control(id)?.current ?? null,
      isInteractable: (id: string) => this.ui.control(id)?.interactable ?? false,
      isAnimating: (id: string) => this.ui.control(id)?.inspect().animating ?? false,
      bounds: (id: string) => this.ui.snapshot().find((s) => s.id === id)?.bounds ?? null,
      events: (since: number) => this._eventLog?.since(since) ?? [],
      controlsReady: () => this.slideProg < 0.001,
      barHeight: () => this.barHeight,
    };
  }
}
