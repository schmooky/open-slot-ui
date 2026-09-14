import { Container, FillGradient, Graphics, type Ticker } from 'pixi.js';
import {
  solveRibbon,
  barHeightFor,
  type OpenUI,
  type Rect,
  type RibbonMetrics,
  type ScreenState,
  type ValueDisplay,
} from '@open-slot-ui/core';
import { DataItemView, BetWidgetView, RoundButtonView, IconButtonView, PillButtonView, FeedbackStrip } from './parts';
import { MainMenuSheet } from './MainMenuSheet';
import { AutoplaySheet } from './AutoplaySheet';

export interface RibbonHudOptions {
  /** Called when BUY BONUS is pressed (the host opens its own buy modal). */
  onBuy?: () => void;
}

/**
 * The ribbon: one docked bar that owns every everyday control.
 *
 * It is the library's whole HUD surface — a translucent plate carrying the ☰ menu and
 * the readouts on the left, a dark action box with the bet, the ▲▼ changers, the big
 * round button and autoplay on the right, and the two sheets that fly up out of it.
 *
 * The bar is assembled from the chrome feature flags: a part that is switched off is
 * never CREATED, so "hidden" can't mean "still there, still clickable". Placement
 * comes from the core solver (`solveRibbon`) — this class only draws and wires.
 */
export class RibbonHud extends Container {
  private readonly plate = new Graphics();
  private readonly actionBox = new Graphics();
  private readonly dividers = new Graphics();
  private readonly widgets = new Container();

  private readonly items: Array<{ view: DataItemView; id: string }> = [];
  private betWidget?: BetWidgetView;
  private betUp?: IconButtonView;
  private betDown?: IconButtonView;
  private round?: RoundButtonView;
  private menuButton?: IconButtonView;
  private autoButton?: IconButtonView;
  private buyButton?: PillButtonView;
  private readonly feedback?: FeedbackStrip;
  private readonly mainMenu: MainMenuSheet;
  private readonly autoplaySheet: AutoplaySheet;

  private readonly disposers: Array<() => void> = [];
  private metrics?: RibbonMetrics;
  private screen?: ScreenState;

  constructor(
    private readonly ui: OpenUI,
    private readonly ticker: Ticker,
    private readonly opts: RibbonHudOptions = {},
  ) {
    super();
    const f = ui.chrome.features;
    this.addChild(this.plate, this.actionBox, this.dividers, this.widgets);

    // ── readouts ─────────────────────────────────────────────────────────────
    const reveal = ui.chrome.reveal;
    const addItem = (vd: ValueDisplay, countUp = false): void => {
      const view = new DataItemView(vd, ui, ticker, { behavior: reveal, countUp });
      this.items.push({ view, id: vd.id });
      this.widgets.addChild(view);
    };
    if (f.balance) addItem(ui.balance);
    if (f.betReadout) addItem(ui.bet);
    if (f.win) addItem(ui.win, true);
    if (f.featurePanel) addItem(ui.totalWin, true);

    // ── the action box ───────────────────────────────────────────────────────
    if (f.betWidget) {
      this.betWidget = new BetWidgetView(ui.bet, ui.betStepper, ui, f.betProgress);
      this.widgets.addChild(this.betWidget);
    }
    if (f.betChangers) {
      this.betUp = new IconButtonView(ui.betPlus, ui, 'up', () => ui.betPlus.activate());
      this.betDown = new IconButtonView(ui.betMinus, ui, 'down', () => ui.betMinus.activate());
      this.widgets.addChild(this.betUp, this.betDown);
    }
    this.round = new RoundButtonView(ui.spin, ui, () => this.pressRound());
    this.widgets.addChild(this.round);

    if (f.autoplay) {
      this.autoButton = new IconButtonView(ui.autoplay, ui, 'auto', () => this.pressAutoplay());
      this.widgets.addChild(this.autoButton);
    }
    if (f.menu) {
      this.menuButton = new IconButtonView(ui.settingsButton, ui, 'menu', () => ui.mainMenuPanel.toggle());
      this.widgets.addChild(this.menuButton);
    }
    if (f.buyFeature) {
      this.buyButton = new PillButtonView(ui.bonusButton, ui, 'openui.buyBonus', () => {
        ui.bonusButton.activate();
        this.opts.onBuy?.();
      });
      this.widgets.addChild(this.buyButton);
    }

    // A switched-off part is never CREATED — "hidden" must not mean "still there".
    if (f.feedback) {
      this.feedback = new FeedbackStrip(ui, ticker);
      this.addChild(this.feedback);
    }

    this.mainMenu = new MainMenuSheet(ui, ticker);
    this.autoplaySheet = new AutoplaySheet(ui, ticker);
    this.addChild(this.mainMenu, this.autoplaySheet);

    // ── reactive wiring ──────────────────────────────────────────────────────
    const sync = (): void => this.syncFaces();
    this.disposers.push(
      ui.spin.state.subscribe(sync),
      ui.autoplay.state.subscribe(sync),
      ui.autoplay.count.subscribe(sync),
      ui.hudState.subscribe(() => {
        this.syncFaces();
        this.relayout();
      }),
      ui.mainMenuPanel.state.subscribe(sync),
      ui.muted.subscribe(sync),
    );

    // The ☰ glyph becomes a ✕ while the menu is open — the reference rotates it.
    this.disposers.push(
      ui.mainMenuPanel.state.subscribe(() => this.menuButton?.setIcon(ui.mainMenuPanel.isOpen ? 'close' : 'menu')),
    );

    // Bet changes announce themselves on the feedback strip, as the reference does.
    if (f.feedback) {
      let last = ui.betStepper.index.get();
      this.disposers.push(
        ui.betStepper.index.subscribe((i) => {
          if (i === last) return;
          const up = i > last;
          last = i;
          const atEnd = up ? !ui.betStepper.canInc : !ui.betStepper.canDec;
          ui.showFeedback(atEnd ? (up ? 'openui.maxBet' : 'openui.minBet') : up ? 'openui.betIncreased' : 'openui.betDecreased', { tone: atEnd ? 'warn' : 'info' });
        }),
      );
    }

    this.syncFaces();
  }

  /** The strip the game must keep its reels clear of. */
  get barHeight(): number {
    return this.screen ? barHeightFor(this.screen, this.ui.chrome) : 0;
  }

  private pressRound(): void {
    const ui = this.ui;
    if (ui.autoplay.isActive) {
      ui.autoplay.stop();
      return;
    }
    ui.spin.activate();
  }

  private pressAutoplay(): void {
    const ui = this.ui;
    if (ui.autoplay.isActive) {
      ui.autoplay.stop();
      return;
    }
    if (ui.autoplayPanel.isOpen) {
      ui.autoplayPanel.closePanel();
      ui.autoplay.cancelPicker();
      return;
    }
    ui.autoplay.openPicker();
    ui.autoplayPanel.openPanel();
  }

  /** The round button's face follows the HUD state — spin / stop / autoplay count. */
  private syncFaces(): void {
    const ui = this.ui;
    if (this.round) {
      if (ui.autoplay.isActive) {
        const n = ui.autoplay.count.get();
        this.round.setFace('stop', ui.theme.color.accent);
        this.round.setCount(Number.isFinite(n) ? String(n) : '∞');
      } else if (ui.spin.current === 'stop' && ui.chrome.features.stopRound) {
        this.round.setFace('stop');
        this.round.setCount('');
      } else {
        this.round.setFace('spin');
        this.round.setCount('');
      }
    }
    this.autoButton?.setIcon(ui.autoplay.isActive ? 'stop' : 'auto');
  }

  applyLayout(screen: ScreenState): void {
    this.screen = screen;
    this.relayout();
  }

  private relayout(): void {
    const screen = this.screen;
    if (!screen) return;
    const ui = this.ui;
    const f = ui.chrome.features;
    const feature = ui.hudState.get().startsWith('feature');

    // Which readouts are on the bar right now: the bonus TOTAL WIN takes the WIN slot
    // during a feature round, exactly as the reference's feature panel does.
    const visible = this.items.filter(({ id }) => {
      if (id === 'total-win') return feature && f.featurePanel;
      if (id === 'win') return !feature;
      return true;
    });
    for (const { view, id } of this.items) view.visible = visible.some((v) => v.id === id);

    const m = solveRibbon(screen, ui.chrome, {
      items: visible.length,
      buy: !!this.buyButton && !ui.hidden.has('bonus') && !feature,
      promo: false,
    });
    this.metrics = m;
    const rem = m.rem;

    this.drawPlate(m);

    visible.forEach(({ view }, i) => {
      const box = m.items[i];
      if (box) view.place(box, rem);
    });

    if (this.betWidget) {
      // The phone bar has no room for a second bet display — the solver zeroes it there.
      this.betWidget.visible = m.betWidget.width > 0;
      if (this.betWidget.visible) this.betWidget.place(m.betWidget, rem);
    }
    if (this.betUp && this.betDown && m.changers.width > 0) {
      const c = m.changers;
      const size = Math.min(c.width, c.height / 2);
      this.betUp.place({ x: c.x + (c.width - size) / 2, y: c.y, width: size, height: size }, rem);
      this.betDown.place({ x: c.x + (c.width - size) / 2, y: c.y + c.height - size, width: size, height: size }, rem);
    }
    this.round?.place(boxOf(m.round), rem);
    this.menuButton?.place(boxOf(m.menuButton), rem);
    this.autoButton?.place(boxOf(m.autoplayButton), rem);
    if (this.buyButton) {
      const show = m.buyButton.width > 0;
      this.buyButton.visible = show;
      if (show) this.buyButton.place(m.buyButton, rem);
    }

    this.feedback?.place(m.feedback.x, m.feedback.y, m.feedback.size);
    this.mainMenu.place(m, screen.width, screen.height);
    this.autoplaySheet.place(m, screen.width, screen.height);
    // The sheets anchor to the button that opens them, not to the bar's centre.
    this.mainMenu.x = m.menuButton.x - m.sheet.x + Math.min(0, 0);
    this.autoplaySheet.x = m.autoplayButton.x - m.sheet.x;
    this.clampSheet(this.mainMenu, m, screen.width);
    this.clampSheet(this.autoplaySheet, m, screen.width);
  }

  /** Keep a fly-up sheet on screen when its button sits near an edge. */
  private clampSheet(sheet: Container, m: RibbonMetrics, screenW: number): void {
    const half = m.sheet.width / 2;
    const centre = m.sheet.x + sheet.x;
    const min = half + m.rem * 0.5;
    const max = screenW - half - m.rem * 0.5;
    sheet.x += Math.max(min, Math.min(max, centre)) - centre;
  }

  private drawPlate(m: RibbonMetrics): void {
    const t = this.ui.theme;
    const p = m.panel;
    this.plate.clear();
    if (m.channel === 'desktop') {
      this.plate.roundRect(p.x, p.y, p.width, p.height, 3).fill({ color: t.color.bar, alpha: t.alpha.bar });
    } else {
      // On a phone the plate FADES into the reels rather than boxing them off, exactly
      // as the reference's `linear-gradient(180deg, transparent, rgba(13,13,13,.3))`.
      const grad = new FillGradient(p.x, p.y, p.x, p.y + p.height);
      grad.addColorStop(0, withAlpha(t.color.bar, 0));
      grad.addColorStop(0.45, withAlpha(t.color.bar, t.alpha.bar * 0.55));
      grad.addColorStop(1, withAlpha(t.color.bar, t.alpha.bar));
      this.plate.rect(p.x, p.y, p.width, p.height).fill(grad);
    }

    // The dark action box is a DESKTOP detail: on a phone the controls sit straight on
    // the plate (boxing them there would eat the little width a phone has).
    const a = m.actionPanel;
    const edge = Math.max(2, m.rem * 0.18);
    this.actionBox.clear();
    if (m.channel === 'desktop') {
      this.actionBox
        .roundRect(a.x, a.y, a.width, a.height, 3)
        .fill({ color: t.color.surface })
        .roundRect(a.x, a.y, a.width, a.height, 3)
        .stroke({ width: edge, color: t.color.edge, alignment: 1 });
    }

    // The hairline between the ☰ and the readouts, and between bet and the actions.
    this.dividers.clear();
    const drawDivider = (x: number, cy: number, h: number): void => {
      this.dividers.moveTo(x, cy - h / 2).lineTo(x, cy + h / 2);
    };
    if (this.menuButton && m.channel === 'desktop') drawDivider(m.menuButton.x + m.menuButton.r + m.rem * 0.35, m.menuButton.y, m.rem * 1.8);
    if (this.betWidget && m.betWidget.width > 0 && m.channel === 'desktop') drawDivider(m.betWidget.x + m.betWidget.width + m.rem * 0.2, m.betWidget.y + m.betWidget.height / 2, m.betWidget.height * 0.7);
    this.dividers.stroke({ width: Math.max(1, m.rem * 0.06), color: t.color.text, alpha: 0.15 });
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    for (const { view } of this.items) view.dispose();
    this.betWidget?.dispose();
    this.betUp?.dispose();
    this.betDown?.dispose();
    this.round?.dispose();
    this.menuButton?.dispose();
    this.autoButton?.dispose();
    this.buyButton?.dispose();
    this.feedback?.dispose();
    this.mainMenu.dispose();
    this.autoplaySheet.dispose();
    if (!this.destroyed) this.destroy({ children: true });
  }
}

/** `#rrggbb` + an alpha → the `rgba()` string a gradient stop takes. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

function boxOf(c: { x: number; y: number; r: number }): Rect {
  return { x: c.x - c.r, y: c.y - c.r, width: c.r * 2, height: c.r * 2 };
}
