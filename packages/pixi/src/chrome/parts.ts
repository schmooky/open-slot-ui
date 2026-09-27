import { Container, Graphics, Text, type Ticker } from 'pixi.js';
import {
  formatAmount,
  type Control,
  type OpenUI,
  type Rect,
  type ScreenState,
  type ValueDisplay,
  type StepperControl,
  type RevealBehavior,
} from '@open-slot-ui/core';
import { ControlView } from '../views/ControlView';
import { drawIcon, type IconName } from './icons';

/**
 * The ribbon's building blocks.
 *
 * Every one of them is still a `ControlView` bound to a core control — press logic,
 * interactability and introspection are unchanged (Charter B3/P5). What changes is
 * PLACEMENT: the ribbon measures the bar and calls `place()`, so `applyLayout`'s
 * anchor maths (the old floating design) no longer applies to these views.
 */
/** A tight, dark shadow so bar text reads over light reels as well as dark ones. */
export const TEXT_SHADOW = { color: '#000000', alpha: 0.75, blur: 3, distance: 1, angle: Math.PI / 2 } as const;

export abstract class RibbonView extends ControlView {
  /** The ribbon owns placement; the control's own anchor layout is unused here. */
  override applyLayout(_screen: ScreenState): void {
    /* placed by the ribbon */
  }

  /** Place + size this widget. `rem` lets a widget scale its own type with the bar. */
  abstract place(box: Rect, rem: number): void;
}

/** Hit-test + press feedback shared by every pressable part of the bar. */
function wirePress(view: Container, control: Control, onActivate: () => void): () => void {
  view.eventMode = 'static';
  view.cursor = 'pointer';
  let down = false;
  const press = (): void => {
    if (!control.interactable) return;
    down = true;
    view.scale.set(0.94);
  };
  const release = (fire: boolean): void => {
    if (!down) return;
    down = false;
    view.scale.set(1);
    if (fire && control.interactable) onActivate();
  };
  const onDown = (): void => press();
  const onUp = (): void => release(true);
  const onUpOutside = (): void => release(false);
  view.on('pointerdown', onDown);
  view.on('pointerup', onUp);
  view.on('pointerupoutside', onUpOutside);
  return () => {
    view.off('pointerdown', onDown);
    view.off('pointerup', onUp);
    view.off('pointerupoutside', onUpOutside);
  };
}

/**
 * One readout in the data panel: a dim uppercase caption with the value under it.
 * A changed value plays the configured REVEAL (the reference's drop / rotate / spin /
 * twist), and a WIN counts up rather than snapping.
 */
export class DataItemView extends RibbonView {
  private readonly caption = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 10, fill: '#adb5bd' } });
  private readonly value = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 14, fill: '#fafafa', fontWeight: '700' } });
  private readonly clip = new Container();
  private reveal = 0;
  private revealFrom = 0;
  private shown = 0;
  private target = 0;
  private countMs = 0;
  private tick?: (t: Ticker) => void;

  constructor(
    private readonly vd: ValueDisplay,
    ui: OpenUI,
    private readonly ticker: Ticker,
    private readonly opts: { behavior: RevealBehavior; countUp?: boolean; align?: 'left' | 'center' | 'right' } = { behavior: 'drop' },
  ) {
    super(vd, ui);
    this.clip.addChild(this.value);
    this.addChild(this.caption, this.clip);
    this.shown = vd.value.get();
    this.target = this.shown;

    const paint = (): void => this.paint();
    this.disposers.push(
      vd.value.subscribe((v) => {
        this.target = v;
        if (!this.opts.countUp) this.shown = v;
        else this.countMs = 0;
        this.revealFrom = performance.now();
        this.reveal = 1;
        paint();
      }),
      vd.currency.subscribe(paint),
      vd.emphasized.subscribe(paint),
      ui.locale.subscribe(paint),
    );

    this.tick = (t): void => this.step(t);
    ticker.add(this.tick);
    this.paint();
  }

  private step(t: Ticker): void {
    if (this.destroyed) return;
    let dirty = false;
    if (this.opts.countUp && this.shown !== this.target) {
      this.countMs += t.deltaMS;
      const p = Math.min(1, this.countMs / 620);
      const eased = 1 - Math.pow(1 - p, 3);
      this.shown = this.target === 0 ? 0 : this.shown + (this.target - this.shown) * eased * 0.35;
      if (Math.abs(this.target - this.shown) < 0.005 || p >= 1) this.shown = this.target;
      dirty = true;
    }
    if (this.reveal > 0) {
      const p = Math.min(1, (performance.now() - this.revealFrom) / 220);
      this.reveal = p >= 1 ? 0 : 1 - p;
      dirty = true;
    }
    if (dirty) this.paint();
    this.animating = this.reveal > 0 || this.shown !== this.target;
  }

  private paint(): void {
    if (this.destroyed) return;
    const label = this.vd.label ? this.ui.t(this.vd.label).toUpperCase() : '';
    this.caption.text = label;
    this.value.text = formatAmount(this.shown, this.vd.currency.get());
    this.value.style.fill = this.vd.emphasized.get() ? this.ui.theme.color.accent : this.ui.theme.color.text;

    // The reveal: p runs 1 → 0 as the new value settles.
    const p = this.reveal;
    this.value.alpha = 1 - p * 0.85;
    this.value.rotation = 0;
    this.value.scale.set(1);
    const h = this.value.style.fontSize as number;
    let dy = 0;
    switch (this.opts.behavior) {
      case 'drop':
        dy = -p * h * 0.7;
        break;
      case 'rotate':
        this.value.rotation = p * 0.35;
        break;
      case 'spin':
        this.value.scale.set(1, Math.max(0.05, 1 - p * 1.6));
        break;
      case 'twist':
        this.value.scale.set(Math.max(0.05, 1 - p * 1.6), 1);
        break;
      case 'none':
        this.value.alpha = 1;
        break;
    }
    this.layoutText(dy);
  }

  private layoutText(dy: number): void {
    const align = this.opts.align ?? 'center';
    const ax = align === 'left' ? 0 : align === 'right' ? 1 : 0.5;
    this.caption.anchor.set(ax, 0);
    this.value.anchor.set(ax, 0);
    const x = ax === 0 ? 0 : ax === 1 ? this.boxW : this.boxW / 2;
    this.caption.position.set(x, 0);
    this.value.position.set(x, (this.caption.style.fontSize as number) * 1.5 + dy);
  }

  private boxW = 0;

  place(box: Rect, rem: number): void {
    this.boxW = box.width;
    this.position.set(box.x, box.y + box.height * 0.16);
    this.caption.style.fontSize = Math.max(7, rem * 0.62);
    this.value.style.fontSize = Math.max(9, rem * 0.9);
    this.caption.style.fontFamily = this.ui.theme.type.family;
    this.value.style.fontFamily = this.ui.theme.type.family;
    this.caption.style.fill = this.ui.theme.color.label;
    this.caption.style.letterSpacing = rem * 0.04;
    // On a phone the plate is nearly transparent (the reference fades it into the
    // reels), so the readouts carry their own shadow to stay legible on ANY art.
    this.caption.style.dropShadow = TEXT_SHADOW;
    this.value.style.dropShadow = TEXT_SHADOW;
    this.paint();
  }

  override dispose(): void {
    if (this.tick) this.ticker.remove(this.tick);
    this.tick = undefined;
    super.dispose();
  }
}

/** The BET widget: caption + value with the ladder-position bar underneath. */
export class BetWidgetView extends RibbonView {
  private readonly bg = new Graphics();
  private readonly caption = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 10, fill: '#adb5bd' } });
  private readonly value = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 16, fill: '#fafafa', fontWeight: '700' } });
  private readonly progress = new Graphics();
  private box: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private rem = 16;

  constructor(
    private readonly vd: ValueDisplay,
    private readonly stepper: StepperControl,
    ui: OpenUI,
    private readonly showProgress: boolean,
  ) {
    super(vd, ui);
    this.addChild(this.bg, this.caption, this.value, this.progress);
    const paint = (): void => this.paint();
    this.disposers.push(vd.value.subscribe(paint), vd.currency.subscribe(paint), this.stepper.index.subscribe(paint), ui.locale.subscribe(paint));
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => this.ui.bus.emit('buttonActivated', { id: 'bet-widget' }));
    // The data-panel BET readout stays the canonical view of `bet` for introspection.
    this.disownInspect();
  }

  place(box: Rect, rem: number): void {
    this.box = box;
    this.rem = rem;
    this.position.set(box.x, box.y);
    this.paint();
  }

  private paint(): void {
    if (this.destroyed) return;
    const { width: w, height: h } = this.box;
    const rem = this.rem;
    const t = this.ui.theme;
    this.caption.style = { ...this.caption.style, fontFamily: t.type.family, fontSize: Math.max(7, rem * 0.62), fill: t.color.label, letterSpacing: rem * 0.04, dropShadow: TEXT_SHADOW };
    this.value.style = { ...this.value.style, fontFamily: t.type.family, fontSize: Math.max(10, rem * 1.0), fill: t.color.text, fontWeight: '700', dropShadow: TEXT_SHADOW };
    this.caption.text = this.ui.t(this.vd.label ?? 'openui.bet').toUpperCase();
    this.value.text = formatAmount(this.vd.value.get(), this.vd.currency.get());
    this.caption.anchor.set(0.5, 0);
    this.value.anchor.set(0.5, 0);
    this.caption.position.set(w / 2, h * 0.16);
    this.value.position.set(w / 2, h * 0.16 + (this.caption.style.fontSize as number) * 1.45);

    this.bg.clear();
    this.progress.clear();
    if (!this.showProgress) return;
    const levels = this.stepper.count;
    const idx = this.stepper.index.get();
    const frac = levels <= 1 ? 1 : (idx + 1) / levels;
    const barH = Math.max(2, rem * 0.17);
    const barY = h - barH - rem * 0.12;
    const inset = rem * 0.35;
    this.progress
      .roundRect(inset, barY, w - inset * 2, barH, barH / 2)
      .fill({ color: t.color.text, alpha: 0.18 })
      .roundRect(inset, barY, Math.max(barH, (w - inset * 2) * frac), barH, barH / 2)
      .fill({ color: t.color.accent });
  }
}

/**
 * The round button — the bar's one big control. It is the SPIN button, and becomes
 * stop-round / stop-autoplay as the HUD state demands, which is why it draws its own
 * face rather than deferring to a skin.
 */
export class RoundButtonView extends RibbonView {
  private readonly bg = new Graphics();
  private readonly glyph = new Graphics();
  private readonly count = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 16, fill: '#000', fontWeight: '700' } });
  private readonly fsLabel = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 11, fill: '#adb5bd', fontWeight: '700', letterSpacing: 1 } });
  private r = 56;
  private face: IconName = 'spin';
  private faceTint?: string;

  constructor(control: Control, ui: OpenUI, onActivate: () => void) {
    super(control, ui);
    this.addChild(this.bg, this.glyph, this.count, this.fsLabel);
    this.count.anchor.set(0.5);
    this.fsLabel.anchor.set(0.5);
    this.disposers.push(wirePress(this, control, onActivate), control.state.subscribe(() => this.paint()));
  }

  /** Swap the face (spin / stop / auto) and optionally the fill. */
  setFace(face: IconName, tint?: string): void {
    this.face = face;
    this.faceTint = tint;
    this.paint();
  }

  /** Remaining autoplay rounds, drawn inside the button. `''` clears it. */
  setCount(text: string): void {
    this.count.text = text;
    this.paint();
  }

  /**
   * The FREE-SPINS face: the remaining count over a small "FS" caption, in place of
   * the spin glyph. `0` restores the normal button. Free spins are not a bet, so the
   * button must not keep saying "spin" through them.
   */
  setFreeSpins(n: number): void {
    this.freeSpins = Math.max(0, Math.floor(n));
    this.paint();
  }

  private freeSpins = 0;

  place(box: Rect, _rem: number): void {
    this.r = Math.min(box.width, box.height) / 2;
    this.position.set(box.x + box.width / 2, box.y + box.height / 2);
    this.paint();
  }

  private paint(): void {
    if (this.destroyed) return;
    const t = this.ui.theme;
    const on = this.control.interactable;
    const fill = this.faceTint ?? t.color.surface;
    const edge = Math.max(2, this.r * 0.055);
    this.bg
      .clear()
      .circle(0, 0, this.r - edge / 2)
      .fill({ color: fill, alpha: on ? 1 : 0.75 })
      .circle(0, 0, this.r - edge / 2)
      .stroke({ width: edge, color: t.color.edge });
    const fs = this.freeSpins > 0 && this.face === 'spin';
    if (fs) {
      this.glyph.clear();
      this.fsLabel.visible = true;
      this.fsLabel.text = this.ui.t('openui.freeSpins').toUpperCase();
      this.fsLabel.style.fontFamily = t.type.family;
      this.fsLabel.style.fontSize = this.r * 0.26;
      this.fsLabel.style.fill = t.color.label;
      this.fsLabel.position.set(0, this.r * 0.3);
      this.count.text = String(this.freeSpins);
    } else {
      this.fsLabel.visible = false;
      drawIcon(this.glyph, this.face, this.r * 1.5, { color: on ? t.color.text : t.color.disabled, weight: 0.085, alpha: on ? 1 : 0.6 });
    }
    const hasCount = this.count.text.length > 0;
    this.count.visible = hasCount;
    if (hasCount) {
      this.count.style.fontFamily = t.type.family;
      this.count.style.fontSize = this.r * (fs ? 0.62 : 0.42);
      this.count.style.fill = this.faceTint ? t.color.accentText : t.color.text;
      this.count.position.set(0, fs ? -this.r * 0.12 : this.r * 0.02);
    }
  }
}

/** A small circular icon button: ☰, autoplay, fullscreen. */
export class IconButtonView extends RibbonView {
  private readonly bg = new Graphics();
  private readonly glyph = new Graphics();
  private r = 22;
  private iconName: IconName;

  constructor(control: Control, ui: OpenUI, name: IconName, onActivate: () => void, private readonly opts: { filled?: boolean } = {}) {
    super(control, ui);
    this.iconName = name;
    this.addChild(this.bg, this.glyph);
    this.disposers.push(wirePress(this, control, onActivate), control.state.subscribe(() => this.paint()));
  }

  setIcon(name: IconName): void {
    this.iconName = name;
    this.paint();
  }

  place(box: Rect, _rem: number): void {
    this.r = Math.min(box.width, box.height) / 2;
    this.position.set(box.x + box.width / 2, box.y + box.height / 2);
    this.paint();
  }

  private paint(): void {
    if (this.destroyed) return;
    const t = this.ui.theme;
    const on = this.control.interactable;
    const active = this.control.current === 'active' || this.control.current === 'on';
    this.bg.clear();
    if (this.opts.filled || active) {
      this.bg.circle(0, 0, this.r).fill({ color: active ? t.color.accent : t.color.surface, alpha: on ? 1 : 0.5 });
    }
    const color = active ? t.color.accentText : on ? t.color.text : t.color.disabled;
    drawIcon(this.glyph, this.iconName, this.r * 2, { color, weight: 0.09, alpha: on ? 1 : 0.6 });
  }
}

/** The BUY BONUS pill — a coloured, labelled rectangle. */
export class PillButtonView extends RibbonView {
  private readonly bg = new Graphics();
  private readonly text = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 12, fill: '#fff', fontWeight: '700' } });
  private box: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private rem = 16;

  constructor(
    control: Control,
    ui: OpenUI,
    private readonly labelKey: string,
    onActivate: () => void,
    private readonly colors: { bg: keyof OpenUI['theme']['color']; text: keyof OpenUI['theme']['color'] } = { bg: 'featureBuy', text: 'featureBuyText' },
  ) {
    super(control, ui);
    this.addChild(this.bg, this.text);
    this.text.anchor.set(0.5);
    this.disposers.push(wirePress(this, control, onActivate), control.state.subscribe(() => this.paint()), ui.locale.subscribe(() => this.paint()));
  }

  place(box: Rect, rem: number): void {
    this.box = box;
    this.rem = rem;
    this.position.set(box.x, box.y);
    this.paint();
  }

  private paint(): void {
    if (this.destroyed) return;
    const t = this.ui.theme;
    const { width: w, height: h } = this.box;
    const on = this.control.interactable;
    this.bg
      .clear()
      .roundRect(0, 0, w, h, Math.min(h / 2, t.radius.card))
      .fill({ color: t.color[this.colors.bg], alpha: on ? 1 : 0.45 });
    this.text.style = { ...this.text.style, fontFamily: t.type.family, fontSize: Math.max(8, this.rem * 0.72), fill: t.color[this.colors.text], fontWeight: '700', letterSpacing: this.rem * 0.03 };
    this.text.text = this.ui.t(this.labelKey).toUpperCase();
    this.text.position.set(w / 2, h / 2);
    // A long localization shrinks to fit rather than spilling out of the pill.
    const max = w - this.rem * 0.6;
    if (this.text.width > max && this.text.width > 0) this.text.scale.set(max / this.text.width);
    else this.text.scale.set(1);
  }
}

/** The one-line message strip under the bar. */
export class FeedbackStrip extends Container {
  private readonly text = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 13, fill: '#fafafa', fontWeight: '700' } });
  private readonly disposers: Array<() => void> = [];
  private age = 0;
  private readonly tick: (t: Ticker) => void;

  constructor(private readonly ui: OpenUI, private readonly ticker: Ticker) {
    super();
    this.addChild(this.text);
    this.text.anchor.set(0.5);
    this.visible = false;
    this.disposers.push(
      ui.feedback.subscribe((m) => {
        this.visible = !!m;
        this.age = 0;
        if (!m) return;
        this.text.text = ui.t(m.text).toUpperCase();
        this.text.style.fill = m.tone === 'warn' ? ui.theme.color.danger : m.tone === 'good' ? ui.theme.color.accent : ui.theme.color.text;
      }),
    );
    this.tick = (t): void => {
      if (!this.visible) return;
      this.age += t.deltaMS;
      const p = Math.min(1, this.age / 180);
      this.alpha = p;
      this.text.y = (1 - p) * 8;
    };
    ticker.add(this.tick);
  }

  place(x: number, y: number, size: number): void {
    this.position.set(x, y);
    this.text.style.fontFamily = this.ui.theme.type.family;
    this.text.style.fontSize = size;
    this.text.style.letterSpacing = size * 0.08;
    this.text.style.dropShadow = TEXT_SHADOW;
  }

  dispose(): void {
    this.ticker.remove(this.tick);
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}

/**
 * A plain COUNT readout — free spins remaining, free rounds left. Same shape as a
 * money readout, but it prints an integer, so the feature strip can sit beside the
 * balance without pretending a spin count is currency.
 */
export class CounterItemView extends Container {
  private readonly caption = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 10, fill: '#adb5bd' } });
  private readonly value = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 14, fill: '#fafafa', fontWeight: '700' } });
  private readonly disposers: Array<() => void> = [];
  private boxW = 0;

  constructor(
    private readonly ui: OpenUI,
    private readonly source: { get(): number; subscribe(fn: (v: number) => void): () => void },
    private readonly labelKey: string,
  ) {
    super();
    this.addChild(this.caption, this.value);
    this.disposers.push(source.subscribe(() => this.paint()), ui.locale.subscribe(() => this.paint()));
  }

  place(box: Rect, rem: number): void {
    this.boxW = box.width;
    this.position.set(box.x, box.y + box.height * 0.16);
    const t = this.ui.theme;
    this.caption.style = { ...this.caption.style, fontFamily: t.type.family, fontSize: Math.max(7, rem * 0.62), fill: t.color.label, letterSpacing: rem * 0.04, dropShadow: TEXT_SHADOW };
    this.value.style = { ...this.value.style, fontFamily: t.type.family, fontSize: Math.max(9, rem * 0.9), fill: t.color.text, fontWeight: '700', dropShadow: TEXT_SHADOW };
    this.paint();
  }

  private paint(): void {
    if (this.destroyed) return;
    const n = this.source.get();
    this.caption.text = this.ui.t(this.labelKey).toUpperCase();
    this.value.text = Number.isFinite(n) ? String(Math.max(0, Math.floor(n))) : '∞';
    this.caption.anchor.set(0.5, 0);
    this.value.anchor.set(0.5, 0);
    this.caption.position.set(this.boxW / 2, 0);
    this.value.position.set(this.boxW / 2, (this.caption.style.fontSize as number) * 1.5);
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}

/**
 * The STANDALONE win presentation: one big amount over the bar, instead of the
 * inline WIN readout (`hud.winRepresentation: 'standalone'`). It pops in when a
 * round pays and clears itself when the next round starts.
 */
export class WinBanner extends Container {
  private readonly text = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 34, fill: '#ffc529', fontWeight: '800' } });
  private readonly disposers: Array<() => void> = [];
  private readonly tick: (t: Ticker) => void;
  private age = 0;

  constructor(private readonly ui: OpenUI, private readonly ticker: Ticker) {
    super();
    this.addChild(this.text);
    this.text.anchor.set(0.5);
    this.visible = false;
    this.disposers.push(
      ui.win.value.subscribe((v) => {
        this.visible = v > 0;
        this.age = 0;
        if (v > 0) this.text.text = formatAmount(v, ui.win.currency.get());
      }),
    );
    this.tick = (t): void => {
      if (!this.visible) return;
      this.age += t.deltaMS;
      const p = Math.min(1, this.age / 260);
      const eased = 1 - Math.pow(1 - p, 3);
      this.alpha = eased;
      this.scale.set(0.86 + eased * 0.14);
    };
    ticker.add(this.tick);
  }

  place(x: number, y: number, size: number): void {
    this.position.set(x, y);
    const t = this.ui.theme;
    this.text.style = { ...this.text.style, fontFamily: t.type.family, fontSize: size, fill: t.color.accent, dropShadow: TEXT_SHADOW };
  }

  dispose(): void {
    this.ticker.remove(this.tick);
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}
