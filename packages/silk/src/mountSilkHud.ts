import { Container, Rectangle, type Application } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
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
  type JurisdictionConfig,
  type NoticeOptions,
  type RgsErrorOptions,
} from '@open-slot-ui/core';
import { SKIN } from './skin.generated';
import { box, disc, glyph, label, cssColor } from './paint';

export interface SilkHudOptions {
  hooks?: HostHooks;
  /**
   * Where the fonts the skin uses live. They are the SAME files the DOM binding
   * loads: the text face and the icon face, both from the game's skin folder. The
   * canvas has no stylesheet to read them from, so it loads them itself.
   */
  fonts?: { text?: { family: string; src: string }; icons?: { family: string; src: string } };
  /** Scale cap for the bar. The plate never grows past 1; it shrinks to fit. */
  maxScale?: number;
}

export interface SilkHud {
  ui: OpenUI;
  /** The layer to add to your stage. It positions itself against the screen. */
  view: Container;
  on: OpenUI['on'];
  setBalance(major: number): void;
  setBet(major: number): void;
  setWin(major: number): void;
  setTotalWin(major: number): void;
  setCurrency(spec: CurrencySpec): void;
  setFreeSpins(n: number): void;
  setHudState(state: HudState): void;
  showFeedback(text: string, opts?: { tone?: 'info' | 'good' | 'warn'; ms?: number }): void;
  reportRound(win: number, bet: number): void;
  applyJurisdiction(jurisdiction: JurisdictionConfig): void;
  setRtp(percent: number): void;
  showError(message: string, opts?: NoticeOptions): void;
  showRgsError(code: string, opts?: RgsErrorOptions): void;
  showFatal(message: string, opts?: NoticeOptions): void;
  setReplay(on: boolean): void;
  /** Re-lay the bar for a screen size (called on the renderer's resize too). */
  layout(width: number, height: number): void;
  dispose(): void;
}

const S = SKIN;

/** Load a font file so Pixi's text can use it by family name. */
async function loadFont(family: string, src: string): Promise<void> {
  if (typeof FontFace !== 'function' || !('fonts' in document)) return;
  const face = new FontFace(family, `url(${src})`);
  await face.load();
  document.fonts.add(face);
}

/**
 * THE BAR, DRAWN.
 *
 * A fork of the DOM binding: same core, same controls, same states — but every
 * plate, coin and button is a pixi-silk primitive on your PixiJS stage instead of
 * an element dressed by a stylesheet. The geometry is not a redrawing: it is the
 * measured skin (`skin.generated.ts`), so the two renderers line up pixel for
 * pixel at the same size.
 *
 * Use it when the game may not have a DOM to mount into — a canvas-only client, a
 * native wrapper — and the look still has to be the one the studio designed.
 */
export function mountSilkHud(app: Application, spec: UISpec = {}, opts: SilkHudOptions = {}): SilkHud {
  const ui = createUI(spec, opts.hooks);
  const disposers: Dispose[] = [];

  const view = new Container();
  view.label = 'open-slot-ui/silk';
  const bar = new Container();
  bar.label = 'ribbon';
  view.addChild(bar);

  // Fonts first: text measured before the face lands would be measured in a
  // fallback, and every readout would be the wrong width until something redrew it.
  const fonts = {
    text: opts.fonts?.text ?? { family: 'HacksawUI', src: '/skin/ui/fonts/HacksawUI.woff2' },
    icons: opts.fonts?.icons ?? { family: 'icomoon', src: '/skin/ui/fonts/icons/icomoon.woff2' },
  };
  void Promise.all([
    loadFont(fonts.text.family, fonts.text.src).catch(() => undefined),
    loadFont(fonts.icons.family, fonts.icons.src).catch(() => undefined),
    // …and a full repaint once they land: text measured in a fallback face is text
    // measured at the wrong width, and the value-fitting below would keep that
    // mistake forever.
  ]).then(() => repaint());

  // ── the pieces ────────────────────────────────────────────────────────────
  const plate = new SilkGraphics({ label: 'plate' });
  bar.addChild(plate);

  const money = (v: number): string => formatAmount(v, ui.balance.currency.get());

  const balanceLabel = label(bar, labelFor(ui, 'balance'), S.BalanceLabel.x, S.BalanceLabel.y, {
    size: S.BalanceLabel.font.size, weight: S.BalanceLabel.font.weight, family: S.BalanceLabel.font.family, color: S.BalanceLabel.color,
  });
  const balanceValue = label(bar, money(ui.balance.get()), S.BalanceValue.x, S.BalanceValue.y, {
    size: S.BalanceValue.font.size, weight: S.BalanceValue.font.weight, family: S.BalanceValue.font.family, color: S.BalanceValue.color,
  });
  const winLabel = label(bar, labelFor(ui, 'win_uc'), S.WinAmountLabel.x, S.WinAmountLabel.y, {
    size: S.WinAmountLabel.font.size, weight: S.WinAmountLabel.font.weight, family: S.WinAmountLabel.font.family, color: S.WinAmountLabel.color,
  });
  const winValue = label(bar, money(ui.win.get()), S.WinAmountValue.x, S.WinAmountValue.y, {
    size: S.WinAmountValue.font.size, weight: S.WinAmountValue.font.weight, family: S.WinAmountValue.font.family, color: S.WinAmountValue.color,
  });
  const betLabel = label(bar, labelFor(ui, 'bet_past'), S.BetAmountLabel.x, S.BetAmountLabel.y, {
    size: S.BetAmountLabel.font.size, weight: S.BetAmountLabel.font.weight, family: S.BetAmountLabel.font.family, color: S.BetAmountLabel.color,
  });
  const betValue = label(bar, formatAmount(ui.bet.get(), ui.bet.currency.get()), S.BetAmountValue.x, S.BetAmountValue.y, {
    size: S.BetAmountValue.font.size, weight: S.BetAmountValue.font.weight, family: S.BetAmountValue.font.family, color: S.BetAmountValue.color,
  });
  const feedback = label(bar, '', S.FeedbackMsg.w / 2, S.FeedbackMsg.y, {
    size: S.FeedbackMsg.font.size, weight: S.FeedbackMsg.font.weight, family: S.FeedbackMsg.font.family, color: S.FeedbackMsg.color, anchor: [0.5, 0],
  });

  const coinText = new Container();
  bar.addChild(coinText);
  const coinLabel = label(coinText, labelFor(ui, 'feature_buy_action_uc'), 0, 0, {
    size: S.FeatureBuyToggle.font.size, weight: S.FeatureBuyToggle.font.weight, family: S.FeatureBuyToggle.font.family,
    color: S.FeatureBuyToggle.color, anchor: [0.5, 0.5], align: 'center',
  });
  coinLabel.style.wordWrap = true;
  coinLabel.style.wordWrapWidth = S.coin.size - S.coin.padding * 2;
  coinLabel.style.lineHeight = S.coin.lineHeight;
  // The coin is a square rotated 45°, so its wording lies on the diagonal. The
  // measured angle rather than an eyeballed one — they differed by 25 degrees.
  coinText.rotation = S.coin.rotation;

  const icons = new Container();
  bar.addChild(icons);
  const menuIcon = glyph(icons, S.glyphs.menu.content, S.MainMenuToggle.x + S.MainMenuToggle.w / 2, S.MainMenuToggle.y + S.MainMenuToggle.h / 2, S.glyphs.menu.size, S.glyphs.menu.color, S.glyphs.menu.font);
  // An icon font's glyphs carry their own bearings, so a glyph centred on its text
  // box is not centred in its button. These offsets are what the parity check
  // measured between the two renderings; they are corrections, not taste.
  const spinIcon = glyph(icons, S.glyphs.spin.content, S.PlaceBetBtn.x + S.PlaceBetBtn.w / 2 + 4, S.PlaceBetBtn.y + S.PlaceBetBtn.h / 2 + 7, S.glyphs.spin.size, S.glyphs.spin.color, S.glyphs.spin.font);
  const stopIcon = glyph(icons, S.glyphs.stop.content, S.PlaceBetBtn.x + S.PlaceBetBtn.w / 2, S.PlaceBetBtn.y + S.PlaceBetBtn.h / 2, S.glyphs.stop.size, S.glyphs.stop.color, S.glyphs.stop.font);
  stopIcon.visible = false;
  const autoIcon = glyph(icons, S.glyphs.autoplay.content, S.AutoplayBtn.x + S.AutoplayBtn.w / 2, S.AutoplayBtn.y + S.AutoplayBtn.h / 2, S.glyphs.autoplay.size, S.glyphs.autoplay.color, S.glyphs.autoplay.font);
  const upIcon = glyph(icons, S.glyphs.up.content, S.BetAmountIncrease.x + S.BetAmountIncrease.w / 2, S.BetAmountIncrease.y + S.BetAmountIncrease.h / 2, S.glyphs.up.size, S.glyphs.up.color, S.glyphs.up.font);
  const downIcon = glyph(icons, S.glyphs.down.content, S.BetAmountDecrease.x + S.BetAmountDecrease.w / 2, S.BetAmountDecrease.y + S.BetAmountDecrease.h / 2, S.glyphs.down.size, S.glyphs.down.color, S.glyphs.down.font);

  /** Draw everything that is a shape rather than a glyph. */
  function paint(): void {
    plate.clear();
    // the slab, and the action box inside it
    box(plate, 0, 0, S.plate.w, S.plate.h, { radius: S.plate.radius, fill: S.plate.bg });
    box(plate, S.ActionPanel.x, S.ActionPanel.y, S.ActionPanel.w, S.ActionPanel.h, { radius: S.ActionPanel.radius, fill: S.ActionPanel.bg });
    // the divider between the ☰ and the readouts
    const d = cssColor(S.divider.bg);
    plate.rect(S.divider.x, S.divider.y, Math.max(0.5, S.divider.w), S.divider.h).fill({ color: d.color, alpha: d.alpha });
    // the bet ladder's progress bar
    box(plate, S.BetAmountProgressbar.x, S.BetAmountProgressbar.y, S.BetAmountProgressbar.w, S.BetAmountProgressbar.h, { fill: S.BetAmountProgressbar.bg });
    const levels = ui.betStepper.count;
    const frac = levels <= 1 ? 1 : (ui.betStepper.index.get() + 1) / levels;
    box(plate, S.BetAmountIndicatorProgress.x, S.BetAmountIndicatorProgress.y, S.BetAmountProgressbar.w * frac, S.BetAmountIndicatorProgress.h, { fill: S.BetAmountIndicatorProgress.bg });
    // the round button, and the coin that hangs off the left of the plate
    disc(plate, S.PlaceBetBtn.x + S.PlaceBetBtn.w / 2, S.PlaceBetBtn.y + S.PlaceBetBtn.h / 2, S.PlaceBetBtn.w / 2, S.PlaceBetBtn.bg, S.PlaceBetBtn.border);
    // The coin: a circle of the button's own size — rotating a square does not make
    // its circle bigger — and the black ring the skin draws as an ::after.
    const coinCx = S.coinContainer.x + S.coinContainer.w / 2;
    const coinCy = S.coinContainer.y + S.coinContainer.h / 2;
    disc(plate, coinCx, coinCy, S.coin.size / 2, S.FeatureBuyToggle.bg);
    if (S.coin.ring) {
      const ring = cssColor(S.coin.ring.color);
      plate
        .circle(coinCx, coinCy, S.coin.ring.size / 2 + S.coin.ring.width / 2)
        .stroke({ width: S.coin.ring.width, color: ring.color, alpha: ring.alpha });
    }
    coinText.position.set(coinCx, coinCy);
  }
  paint();

  // ── what the state says ───────────────────────────────────────────────────
  /**
   * The round button is ONE button in three phases, exactly as the markup binding
   * plays it: the arrow at rest, the arrow dimmed while the round is in flight and
   * nothing can be slammed yet, and a stop square once the answer is in.
   */
  const paintSpin = (): void => {
    const state = ui.spin.state.get();
    const slammable = state === 'stop';
    stopIcon.visible = slammable;
    spinIcon.visible = !slammable;
    spinIcon.alpha = state === 'busy' ? 0.45 : 1;
    const locked = ui.locked.get();
    bar.alpha = locked ? 0.55 : 1;
  };

  const repaint = (): void => {
    balanceValue.text = money(ui.balance.get());
    winValue.text = money(ui.win.get());
    betValue.text = formatAmount(ui.bet.get(), ui.bet.currency.get());
    // Long money sizes itself down, exactly as the stylesheet's charcount table
    // does it, so a rial keeps the plate's geometry instead of stretching it.
    fitValue(balanceValue, S.BalanceValue.font.size, S.BalanceItem.w);
    fitValue(winValue, S.WinAmountValue.font.size, S.WinAmountItem.w + 40);
    fitValue(betValue, S.BetAmountValue.font.size, S.BetAmountItem.w - 10);
    paint();
  };
  const fitValue = (t: ReturnType<typeof label>, base: number, max: number): void => {
    t.style.fontSize = base;
    if (t.width <= max) return;
    t.style.fontSize = Math.max(10, Math.floor(base * (max / t.width) * 10) / 10);
  };

  disposers.push(
    ui.balance.value.subscribe(repaint),
    ui.bet.value.subscribe(repaint),
    ui.win.value.subscribe(repaint),
    ui.betStepper.index.subscribe(repaint),
    ui.spin.state.subscribe(paintSpin),
    ui.locked.subscribe(paintSpin),
    ui.hudState.subscribe(paintSpin),
    ui.locale.subscribe(() => {
      balanceLabel.text = labelFor(ui, 'balance');
      winLabel.text = labelFor(ui, 'win_uc');
      betLabel.text = labelFor(ui, 'bet_past');
      coinLabel.text = labelFor(ui, 'feature_buy_action_uc');
      repaint();
    }),
    ui.feedback.subscribe(() => {
      const msg = ui.feedback.get();
      feedback.text = msg ? labelFor(ui, msg.text) : '';
    }),
  );
  repaint();
  paintSpin();

  // ── input ─────────────────────────────────────────────────────────────────
  const hit = (target: Container, x: number, y: number, w: number, h: number, onTap: () => void): void => {
    target.eventMode = 'static';
    target.cursor = 'pointer';
    target.hitArea = new Rectangle(x, y, w, h);
    target.on('pointertap', onTap);
  };
  const button = (x: number, y: number, w: number, h: number, onTap: () => void): Container => {
    const c = new Container();
    bar.addChild(c);
    hit(c, x, y, w, h, onTap);
    return c;
  };
  button(S.PlaceBetBtn.x, S.PlaceBetBtn.y, S.PlaceBetBtn.w, S.PlaceBetBtn.h, () => ui.spin.activate());
  button(S.FeatureBuyToggle.x, S.FeatureBuyToggle.y, S.FeatureBuyToggle.w, S.FeatureBuyToggle.h, () => ui.bus.emit('buttonActivated', { id: 'bonus' }));
  button(S.MainMenuToggle.x, S.MainMenuToggle.y, S.MainMenuToggle.w, S.MainMenuToggle.h, () => ui.mainMenuPanel.toggle());
  button(S.BetAmountIncrease.x, S.BetAmountIncrease.y, S.BetAmountIncrease.w, S.BetAmountIncrease.h, () => ui.betStepper.inc());
  button(S.BetAmountDecrease.x, S.BetAmountDecrease.y, S.BetAmountDecrease.w, S.BetAmountDecrease.h, () => ui.betStepper.dec());
  button(S.AutoplayBtn.x, S.AutoplayBtn.y, S.AutoplayBtn.w, S.AutoplayBtn.h, () => ui.autoplayPanel.toggle());

  // ── where the bar sits ────────────────────────────────────────────────────
  const maxScale = opts.maxScale ?? 1;
  function layout(width: number, height: number): void {
    ui.setScreen(width, height);
    // The bar is wider than its plate — the coin hangs off the left, the round
    // button off the right — so the box to fit is the plate plus its overhangs.
    // The coin's box is its CONTAINER, not the button: the button is drawn larger
    // than its slot and bleeds under the plate, and the DOM fit measures the slot.
    // Measuring the button instead moved the whole bar nine pixels to the right.
    const left = Math.min(0, S.coinContainer.x);
    const right = Math.max(S.plate.w, S.PlaceBetBtn.x + S.PlaceBetBtn.w, S.AutoplayBtn.x + S.AutoplayBtn.w);
    const needed = right - left;
    const margin = 16;
    const k = Math.max(0.55, Math.min(maxScale, (width - margin * 2) / needed));
    bar.scale.set(k);
    // The plate sits a measured gap above the bottom edge — the same gap the skin
    // gives it — and the whole bar is centred on the box it really occupies.
    bar.position.set(
      Math.round((width - needed * k) / 2 - left * k),
      Math.round(height - (S.plate.h + S.anchor.bottomGap) * k),
    );
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
      repaint();
    },
    setFreeSpins: (n) => ui.spin.setFreeSpins(n),
    setHudState: (s) => ui.setHudState(s),
    showFeedback: (t, o) => ui.showFeedback(t, o),
    reportRound: (win, bet) => ui.reportRound(win, bet),
    applyJurisdiction: (j) => ui.applyJurisdiction(j),
    setRtp: (p) => ui.rtp.set(p),
    showError: (m, o) => ui.showError(m, o),
    showRgsError: (c, o) => ui.showRgsError(c, o),
    showFatal: (m, o) => ui.showFatal(m, o),
    setReplay: (on) => ui.setReplay(on),
    layout,
    dispose: () => {
      for (const d of disposers.splice(0)) d();
      view.destroy({ children: true });
      ui.dispose();
    },
  };
}
