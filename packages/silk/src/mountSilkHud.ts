import { Container, Rectangle, type Application } from 'pixi.js';
import {
  createUI,
  formatAmount,
  labelFor,
  type OpenUI,
  type UISpec,
  type HostHooks,
  type Dispose,
  type HudState,
  type CurrencySpec,
  type HistoryRow,
  type JurisdictionConfig,
  type NoticeOptions,
  type RgsErrorOptions,
} from '@open-slot-ui/core';
import capture from './skin.capture.json';
import { anchorOf, renderTree, type Capture, type Hit, type Node, type RenderedTree } from './tree';

export interface SilkHudOptions {
  hooks?: HostHooks;
  /**
   * The skin's own font files. The canvas has no stylesheet to discover them
   * through, so it loads them itself — the TEXT face and the ICON face, the same
   * two the markup binding's stylesheet pulls in.
   */
  fonts?: Array<{ family: string; src: string }>;
  /** Cap on how large the captured design may be drawn. Default 1 (never upscale). */
  maxScale?: number;
}

export interface SilkHud {
  ui: OpenUI;
  /** The layer to add to your stage. It places itself against the screen. */
  view: Container;
  on: OpenUI['on'];
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
  /** Hide the boot spinner. The capture has none, so this is a no-op here. */
  ready(): void;
  showFeedback(text: string, opts?: { tone?: 'info' | 'good' | 'warn'; ms?: number }): void;
  reportRound(win: number, bet: number): void;
  applyJurisdiction(jurisdiction: JurisdictionConfig): void;
  setRtp(percent: number): void;
  showError(message: string, opts?: NoticeOptions): void;
  showRgsError(code: string, opts?: RgsErrorOptions): void;
  showFatal(message: string, opts?: NoticeOptions): void;
  setReplay(on: boolean): void;
  /** Which captured state is on screen right now (for tests and the parity check). */
  state(): string;
  /**
   * Where a captured element is on screen, in page pixels. The canvas has no DOM for
   * a test to click, so this is how a harness finds the menu button.
   */
  pointOf(id: string): { x: number; y: number } | null;
  layout(width: number, height: number): void;
  dispose(): void;
}

const CAPTURE = capture as unknown as Capture;

/**
 * THE HUD, REPLAYED ON CANVAS.
 *
 * A fork of the markup binding for clients that have no DOM to mount into. It does
 * not re-draw the design: `scripts/capture.mjs` measures the real HUD wearing the
 * real skin, in every state a player can put it in, and this replays those boxes
 * with pixi-silk. What a reader sees here is what the browser painted there —
 * including the icon glyphs, which come from the same font file.
 *
 * The trade is honest: a capture is a design at one size, so below the captured
 * width the whole thing scales rather than reflowing the way CSS would.
 */
export function mountSilkHud(app: Application, spec: UISpec = {}, opts: SilkHudOptions = {}): SilkHud {
  const ui = createUI(spec, opts.hooks);
  const disposers: Dispose[] = [];

  const view = new Container();
  view.label = 'open-slot-ui/silk';
  const stage = new Container();
  view.addChild(stage);

  // ── fonts ─────────────────────────────────────────────────────────────────
  const fonts = opts.fonts ?? [
    { family: 'icomoon', src: '/skin/ui/fonts/icons/icomoon.woff2' },
  ];
  let fontsReady = false;
  void Promise.all(fonts.map((f) => loadFont(f.family, f.src))).then(() => {
    fontsReady = true;
    draw(); // text measured in a fallback face is text at the wrong width
  });

  // ── which state is on screen ──────────────────────────────────────────────
  const current = (): string => {
    if (ui.settingsPanel.isOpen) return 'info';
    if (ui.historyPanel.isOpen) return 'history';
    if (buyOpen) return 'buy';
    if (ui.autoplayPanel.isOpen) return 'autoplay';
    if (ui.mainMenuPanel.isOpen) return 'menu';
    return 'idle';
  };
  let drawn: RenderedTree | undefined;
  let drawnState = '';
  /** The window the HUD is being drawn into. Named so it cannot shadow the global. */
  const window$ = { w: CAPTURE.viewport.w, h: CAPTURE.viewport.h };
  /** How large the captured design may be drawn. Never upscaled, by default. */
  const maxScale = opts.maxScale ?? 1;
  // The buy sheet is the host's panel in the markup binding (the game owns the
  // feature list), so the canvas one keeps the same flag and the same events.
  let buyOpen = false;

  /** Values the capture froze that are really live. */
  const live = (): Record<string, string> => ({
    BalanceValue: formatAmount(ui.balance.get(), ui.balance.currency.get()),
    WinAmountValue: formatAmount(ui.win.get(), ui.win.currency.get()),
    BetAmountValue: formatAmount(ui.bet.get(), ui.bet.currency.get()),
    BetAmountStaticValue: formatAmount(ui.bet.get(), ui.bet.currency.get()),
    FeatureTotalWinValue: formatAmount(ui.totalWin.get(), ui.totalWin.currency.get()),
    FreeRoundsWinValue: formatAmount(ui.totalWin.get(), ui.totalWin.currency.get()),
    FeatureCounterValue: String(ui.spin.freeSpins.get()),
    FreeRoundsCounterValue: String(ui.freeRounds.get()),
    FeatureBuyAmountValue: formatAmount(ui.bet.get(), ui.bet.currency.get()),
    GameInfoGameName: ui.gameInfo.name ?? '',
    FeedbackMsg: ui.feedback.get() ? labelFor(ui, ui.feedback.get()!.text) : '',
  });

  /** Whether what is on screen was measured in the real faces, or in a fallback. */
  let drawnInFinalFonts = false;

  function draw(): void {
    const state = current();
    // A redraw is needed when the state changes AND when the fonts arrive: text
    // measured in a fallback face is text at the wrong width, and an icon measured
    // in a fallback face is an icon in the wrong place.
    if (drawn && drawnState === state && drawnInFinalFonts === fontsReady) {
      paintValues();
      return;
    }
    drawn?.view.destroy({ children: true });
    const nodes = (CAPTURE.states[state] ?? CAPTURE.states.idle ?? []) as Node[];
    drawn = renderTree(nodes, CAPTURE.viewport);
    drawnState = state;
    drawnInFinalFonts = fontsReady;
    hits = hitsOf(state);
    stage.removeChildren();
    stage.addChild(drawn.view);
    bindHits(drawn);
    paintValues();
    place();
  }

  function paintValues(): void {
    if (!drawn) return;
    for (const [id, value] of Object.entries(live())) {
      const t = drawn.texts.get(id);
      if (!t) continue;
      // The skin shouts some of these in CSS. A value put straight into the text
      // would arrive in its own case and sit differently in its box.
      const node = drawn.boxes.get(id);
      const shown = node?.font?.transform === 'uppercase' ? value.toUpperCase() : value;
      if (t.text !== shown) t.text = shown;
      // Long money sizes itself down inside its own box, the way the skin's
      // per-length font rules do it, so a twelve-digit rial cannot widen the bar.
      const max = node ? node.w + 4 : Infinity;
      const base = node && drawn ? (nodeFontSize(drawn, id) ?? t.style.fontSize) : t.style.fontSize;
      if (typeof base === 'number' && Number.isFinite(max)) {
        t.style.fontSize = base;
        if (t.width > max) t.style.fontSize = Math.max(9, Math.floor(base * (max / t.width) * 10) / 10);
      }
    }
  }
  const baseSizes = new Map<string, number>();
  const nodeFontSize = (tree: RenderedTree, id: string): number | undefined => {
    if (baseSizes.has(id)) return baseSizes.get(id);
    const n = tree.boxes.get(id);
    const size = n?.font?.size;
    if (size) baseSizes.set(id, size);
    return size;
  };

  // ── what the player can press ─────────────────────────────────────────────
  /** Element id → what pressing it does. The ids are the skin's own. */
  const ACTIONS: Record<string, () => void> = {
    PlaceBetBtn: () => ui.spin.activate(),
    StopBtn: () => ui.bus.emit('skipRequested', undefined as never),
    MainMenuToggle: () => ui.mainMenuPanel.toggle(),
    AutoplayBtn: () => ui.autoplayPanel.toggle(),
    FeatureBuyToggle: () => {
      buyOpen = true;
      ui.bus.emit('buttonActivated', { id: 'bonus' });
    },
    BetAmountIncrease: () => ui.betStepper.inc(),
    BetAmountDecrease: () => ui.betStepper.dec(),
    GameInfoBtn: () => {
      ui.mainMenuPanel.closePanel();
      ui.settingsPanel.openPanel();
    },
    BetHistoryBtn: () => {
      ui.mainMenuPanel.closePanel();
      ui.historyPanel.openPanel();
    },
    GameInfoClose: () => ui.settingsPanel.closePanel(),
    BetHistoryClose: () => ui.historyPanel.closePanel(),
    FeatureBuyClose: () => {
      buyOpen = false;
    },
    SoundToggle: () => ui.sfxSlider.setNormalized(ui.sfxSlider.value.get() > 0 ? 0 : 0.5),
    MusicToggle: () => ui.musicSlider.setNormalized(ui.musicSlider.value.get() > 0 ? 0 : 0.7),
    TurboToggle: () => ui.turboBase.toggle(),
    LobbyAnchor: () => ui.bus.emit('buttonActivated', { id: 'lobby' }),
  };

  /** The pressable boxes of the state on screen, by element id. */
  const hitsOf = (state: string): Map<string, Hit> => {
    const map = new Map<string, Hit>();
    for (const h of CAPTURE.hits?.[state] ?? []) map.set(h.id, h);
    return map;
  };
  let hits = hitsOf('idle');

  function bindHits(tree: RenderedTree): void {
    // A press on the window itself stays on the window. Without this it would fall
    // through to the backstop below and close what the player is reading.
    if (tree.windowBox) {
      const swallow = new Container();
      swallow.eventMode = 'static';
      const b = tree.windowBox;
      swallow.hitArea = new Rectangle(b.x, b.y, b.w, b.h);
      tree.groups.center.addChildAt(swallow, 0);
    }

    for (const [id, run] of Object.entries(ACTIONS)) {
      const n = hits.get(id);
      if (!n) continue;
      const hit = new Container();
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.hitArea = new Rectangle(n.x, n.y, n.w, n.h);
      hit.on('pointertap', (e) => {
        e.stopPropagation();
        run();
        draw();
      });
      // The hit box lives in the same group as the box it belongs to, so it moves
      // with it when the window is scaled.
      tree.groups[anchorOf(n as Node, CAPTURE.viewport)].addChild(hit);
    }
    // Tapping the dimmed backdrop of a window closes it, as it does in the markup.
    // Pressing anywhere that is not part of an open window closes it, the way
    // clicking off the menu closes the menu in the markup. It is bound on the layer
    // behind everything, so a button under the finger always wins.
    if (drawnState !== 'idle') {
      const hit = new Container();
      hit.eventMode = 'static';
      hit.hitArea = new Rectangle(-1e5, -1e5, 2e5, 2e5);
      hit.on('pointertap', () => {
        ui.settingsPanel.closePanel();
        ui.historyPanel.closePanel();
        ui.autoplayPanel.closePanel();
        ui.mainMenuPanel.closePanel();
        buyOpen = false;
        draw();
      });
      tree.backstop.addChild(hit);
    }
  }

  // ── keeping up with the core ──────────────────────────────────────────────
  const redraw = (): void => draw();
  disposers.push(
    ui.balance.value.subscribe(paintValues),
    ui.bet.value.subscribe(paintValues),
    ui.win.value.subscribe(paintValues),
    ui.totalWin.value.subscribe(paintValues),
    ui.spin.freeSpins.subscribe(paintValues),
    ui.feedback.subscribe(paintValues),
    ui.spin.state.subscribe(redraw),
    ui.hudState.subscribe(redraw),
    ui.locked.subscribe(() => {
      stage.alpha = ui.locked.get() ? 0.55 : 1;
    }),
    ui.mainMenuPanel.state.subscribe(redraw),
    ui.autoplayPanel.state.subscribe(redraw),
    ui.settingsPanel.state.subscribe(redraw),
    ui.historyPanel.state.subscribe(redraw),
    ui.locale.subscribe(redraw),
  );

  draw();

  // ── where it sits ─────────────────────────────────────────────────────────
  function place(): void {
    if (!drawn) return;
    const { w, h } = window$;
    const cap = CAPTURE.viewport;
    // Scale by width, so the bar spans the window the way CSS makes it span; a
    // window taller than the capture gets more room above the bar, not a gap below.
    const k = Math.min(maxScale, w / cap.w);
    const x = Math.round((w - cap.w * k) / 2);
    for (const g of Object.values(drawn.groups)) g.scale.set(k);
    // Each group keeps its captured coordinates and is moved to the edge it belongs
    // to, which is what a CSS layout does when the window changes size.
    // The compliance strip hugs the top-left of the SCREEN, as its fixed, full-width
    // layer does in the markup — it does not ride the captured column, or it would
    // drift inwards on a wide window.
    drawn.groups.top.position.set(0, 0);
    drawn.groups.bottom.position.set(x, Math.round(h - cap.h * k));
    // A window is a fixed, full-screen layer in the markup; on canvas it is the
    // captured layer scaled to fit and centred, so it never runs off the screen.
    const kc = Math.min(maxScale, w / cap.w, h / cap.h);
    drawn.groups.center.scale.set(kc);
    drawn.groups.center.position.set(Math.round((w - cap.w * kc) / 2), Math.round((h - cap.h * kc) / 2));
    // A backdrop covers the window, whatever size it is.
    drawn.groups.full.scale.set(Math.max(k, w / cap.w), Math.max(k, h / cap.h));
    drawn.groups.full.position.set(0, 0);
  }
  function layout(width: number, height: number): void {
    ui.setScreen(width, height);
    window$.w = width;
    window$.h = height;
    place();
  }
  layout(app.screen.width, app.screen.height);
  const onResize = (): void => layout(app.screen.width, app.screen.height);
  app.renderer.on('resize', onResize);
  disposers.push(() => app.renderer.off('resize', onResize));

  return {
    ui,
    view,
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
      paintValues();
    },
    setFreeSpins: (n) => ui.spin.setFreeSpins(n),
    setFreeRounds: (n) => ui.setFreeRounds(n),
    setHistory: (rows) => ui.setHistory(rows),
    setMaxWin: (m, o) => ui.setMaxWin(m, o),
    setHudState: (s) => ui.setHudState(s),
    ready: () => undefined,
    showFeedback: (t, o) => ui.showFeedback(t, o),
    reportRound: (win, bet) => ui.reportRound(win, bet),
    applyJurisdiction: (j) => ui.applyJurisdiction(j),
    setRtp: (p) => ui.rtp.set(p),
    showError: (m, o) => ui.showError(m, o),
    showRgsError: (c, o) => ui.showRgsError(c, o),
    showFatal: (m, o) => ui.showFatal(m, o),
    setReplay: (on) => ui.setReplay(on),
    state: () => drawnState,
    pointOf: (id) => {
      if (!drawn) return null;
      const n = hits.get(id) ?? drawn.boxes.get(id);
      if (!n) return null;
      const p = drawn.groups[anchorOf(n as Node, CAPTURE.viewport)].toGlobal({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
      return { x: Math.round(p.x), y: Math.round(p.y) };
    },
    layout,
    dispose: () => {
      for (const d of disposers.splice(0)) d();
      view.destroy({ children: true });
      ui.dispose();
    },
  };
}

/** Load a font file so Pixi's text can use it by family name. */
async function loadFont(family: string, src: string): Promise<void> {
  if (typeof FontFace !== 'function' || !('fonts' in document)) return;
  try {
    const face = new FontFace(family, `url(${src})`);
    await face.load();
    document.fonts.add(face);
  } catch {
    /* a missing font file falls back, exactly as it does in the markup */
  }
}
