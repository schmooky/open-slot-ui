import { Container, Graphics, Text, type Ticker } from 'pixi.js';
import { type OpenUI, type PanelControl, type ToggleControl } from '@open-slot-ui/core';
import { drawIcon, type IconName } from './icons';
import type { RibbonMetrics } from '@open-slot-ui/core';

/**
 * The sheets that fly up out of the bar — the ☰ menu and the autoplay panel.
 *
 * They're driven by a `PanelControl`, so "is the menu open" is state the core owns
 * and e2e can read, not a boolean hiding in a view. The Sheet handles the chrome
 * (backdrop, plate, title, slide) and leaves the rows to its subclass.
 */
export abstract class Sheet extends Container {
  protected readonly backdrop = new Graphics();
  protected readonly plate = new Graphics();
  protected readonly title = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 13, fill: '#ffc529', fontWeight: '700' } });
  protected readonly body = new Container();
  protected readonly disposers: Array<() => void> = [];
  protected rem = 16;
  protected width_ = 320;
  protected height_ = 200;
  private prog = 0;
  private target = 0;
  private readonly tick: (t: Ticker) => void;
  private anchor = { x: 0, y: 0, up: true };

  constructor(
    protected readonly ui: OpenUI,
    protected readonly panel: PanelControl,
    private readonly ticker: Ticker,
    private readonly titleKey?: string,
  ) {
    super();
    this.addChild(this.backdrop, this.plate, this.title, this.body);
    this.visible = false;
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => this.panel.closePanel());
    this.plate.eventMode = 'static'; // swallow taps so they don't reach the backdrop

    this.disposers.push(
      panel.state.subscribe(() => {
        this.target = panel.isOpen ? 1 : 0;
        if (this.target === 1) this.visible = true;
      }),
      ui.locale.subscribe(() => this.refresh()),
    );

    this.tick = (t): void => {
      if (this.prog === this.target) return;
      const step = t.deltaMS / 160;
      this.prog = this.target > this.prog ? Math.min(this.target, this.prog + step) : Math.max(this.target, this.prog - step);
      this.applyProgress();
      if (this.prog === 0) this.visible = false;
    };
    ticker.add(this.tick);
  }

  /** Rebuild + re-measure the rows. Subclasses draw into `body`. */
  protected abstract buildRows(): number;

  /** Re-run when locale / config / state changes. */
  refresh(): void {
    if (this.destroyed) return;
    this.height_ = this.buildRows();
    this.paint();
  }

  place(m: RibbonMetrics, screenW: number, screenH: number): void {
    this.rem = m.rem;
    this.width_ = m.sheet.width;
    this.anchor = { x: m.sheet.x, y: m.sheet.y, up: m.sheet.up };
    this.backdrop.clear().rect(0, 0, screenW, screenH).fill({ color: 0x000000, alpha: 0.001 });
    this.refresh();
    this.applyProgress();
  }

  private applyProgress(): void {
    const p = this.prog;
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    this.alpha = eased;
    const x = Math.round(this.anchor.x - this.width_ / 2);
    const y = this.anchor.up ? this.anchor.y - this.height_ - this.rem * 0.4 : this.anchor.y + this.rem * 0.4;
    const slide = (1 - eased) * this.rem * (this.anchor.up ? 1.2 : -1.2);
    this.plate.position.set(x, y + slide);
    this.title.position.set(x + this.rem * 0.9, y + slide + this.rem * 0.7);
    this.body.position.set(x, y + slide);
    this.backdrop.position.set(-x, -(y + slide));
    this.eventMode = p > 0.6 ? 'static' : 'none';
    this.backdrop.visible = p > 0.6;
  }

  protected paint(): void {
    const t = this.ui.theme;
    this.plate
      .clear()
      .roundRect(0, 0, this.width_, this.height_, t.radius.card)
      .fill({ color: t.color.menu, alpha: t.alpha.sheet })
      .roundRect(0, 0, this.width_, this.height_, t.radius.card)
      .stroke({ width: Math.max(1, this.rem * 0.11), color: t.color.accent, alpha: 0.9 });
    this.title.visible = !!this.titleKey;
    if (this.titleKey) {
      this.title.style = { ...this.title.style, fontFamily: t.type.family, fontSize: this.rem * 0.8, fill: t.color.accent, letterSpacing: this.rem * 0.05 };
      this.title.text = this.ui.t(this.titleKey).toUpperCase();
    }
  }

  dispose(): void {
    this.ticker.remove(this.tick);
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}

/** An on/off switch: pill track + knob, accent when on. Bound to a ToggleControl. */
export class ToggleSwitch extends Container {
  private readonly g = new Graphics();
  private readonly disposers: Array<() => void> = [];
  private w = 34;
  private h = 18;

  constructor(private readonly ui: OpenUI, private readonly control: ToggleControl) {
    super();
    this.addChild(this.g);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => {
      if (this.control.interactable) this.control.toggle();
    });
    this.disposers.push(control.state.subscribe(() => this.paint()));
  }

  size(rem: number): void {
    this.w = rem * 2.2;
    this.h = rem * 1.15;
    this.paint();
  }

  private paint(): void {
    if (this.destroyed) return;
    const t = this.ui.theme;
    const on = this.control.isOn;
    const r = this.h / 2;
    const knobR = r - Math.max(1.5, this.h * 0.13);
    this.g
      .clear()
      .roundRect(0, 0, this.w, this.h, r)
      .fill({ color: on ? t.color.accent : t.color.surface })
      .roundRect(0, 0, this.w, this.h, r)
      .stroke({ width: Math.max(1, this.h * 0.09), color: on ? t.color.accent : t.color.textDim, alpha: on ? 1 : 0.6 })
      .circle(on ? this.w - r : r, r, knobR)
      .fill({ color: on ? t.color.accentText : t.color.textDim });
  }

  dispose(): void {
    for (const d of this.disposers) d();
    if (!this.destroyed) this.destroy({ children: true });
  }
}

/** A pill in a tab list (autoplay rounds, loss / win limits). */
export class TabButton extends Container {
  private readonly g = new Graphics();
  private readonly text = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 12, fill: '#fafafa', fontWeight: '700' } });
  private w = 56;
  private h = 26;
  selected = false;
  enabled = true;

  constructor(private readonly ui: OpenUI, label: string, private readonly onSelect: () => void) {
    super();
    this.addChild(this.g, this.text);
    this.text.anchor.set(0.5);
    this.text.text = label;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => {
      if (this.enabled) this.onSelect();
    });
  }

  setLabel(label: string): void {
    this.text.text = label;
    this.paint();
  }

  setSelected(on: boolean): void {
    this.selected = on;
    this.paint();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.alpha = on ? 1 : 0.4;
    this.cursor = on ? 'pointer' : 'default';
  }

  resize(w: number, h: number, fontSize: number): void {
    this.w = w;
    this.h = h;
    this.text.style.fontSize = fontSize;
    this.text.style.fontFamily = this.ui.theme.type.family;
    this.paint();
  }

  get boxWidth(): number {
    return this.w;
  }

  private paint(): void {
    if (this.destroyed) return;
    const t = this.ui.theme;
    this.g
      .clear()
      .roundRect(0, 0, this.w, this.h, this.h / 2)
      .fill({ color: this.selected ? t.color.accent : t.color.surface, alpha: this.selected ? 1 : 0.85 })
      .roundRect(0, 0, this.w, this.h, this.h / 2)
      .stroke({ width: Math.max(1, this.h * 0.07), color: this.selected ? t.color.accent : t.color.textDim, alpha: this.selected ? 1 : 0.45 });
    this.text.style.fill = this.selected ? t.color.accentText : t.color.text;
    this.text.position.set(this.w / 2, this.h / 2);
  }
}

/** A row in the ☰ menu: icon + label, with an optional trailing widget. */
export class MenuRow extends Container {
  private readonly hit = new Graphics();
  private readonly glyph = new Graphics();
  private readonly text = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 13, fill: '#fafafa', fontWeight: '700' } });
  private w = 300;
  private h = 34;
  private icon: IconName;
  private accent = false;

  constructor(private readonly ui: OpenUI, icon: IconName, private labelKey: string, private readonly onTap: () => void) {
    super();
    this.icon = icon;
    this.addChild(this.hit, this.glyph, this.text);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => this.onTap());
  }

  set(icon: IconName, labelKey?: string): void {
    this.icon = icon;
    if (labelKey) this.labelKey = labelKey;
    this.paint();
  }

  setAccent(on: boolean): void {
    this.accent = on;
    this.paint();
  }

  resize(w: number, rem: number): void {
    this.w = w;
    this.h = rem * 2.1;
    this.text.style.fontSize = rem * 0.78;
    this.text.style.fontFamily = this.ui.theme.type.family;
    this.paint();
  }

  get rowHeight(): number {
    return this.h;
  }

  private paint(): void {
    if (this.destroyed) return;
    const t = this.ui.theme;
    const color = this.accent ? t.color.accent : t.color.text;
    this.hit.clear().rect(0, 0, this.w, this.h).fill({ color: 0xffffff, alpha: 0.0001 });
    drawIcon(this.glyph, this.icon, this.h * 0.62, { color, weight: 0.1 });
    this.glyph.position.set(this.h * 0.62, this.h / 2);
    this.text.style.fill = color;
    this.text.anchor.set(0, 0.5);
    this.text.text = this.ui.t(this.labelKey).toUpperCase();
    this.text.position.set(this.h * 1.15, this.h / 2);
  }
}

/** A wide call-to-action inside a sheet (START AUTOPLAY). */
export class SheetButton extends Container {
  private readonly g = new Graphics();
  private readonly text = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 13, fill: '#000', fontWeight: '700' } });
  private w = 200;
  private h = 32;
  enabled = true;

  constructor(private readonly ui: OpenUI, private labelKey: string, private readonly onTap: () => void) {
    super();
    this.addChild(this.g, this.text);
    this.text.anchor.set(0.5);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => {
      if (this.enabled) this.onTap();
    });
  }

  setLabel(key: string): void {
    this.labelKey = key;
    this.paint();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.paint();
  }

  resize(w: number, rem: number): void {
    this.w = w;
    this.h = rem * 2.1;
    this.text.style.fontSize = rem * 0.8;
    this.text.style.fontFamily = this.ui.theme.type.family;
    this.paint();
  }

  get rowHeight(): number {
    return this.h;
  }

  private paint(): void {
    if (this.destroyed) return;
    const t = this.ui.theme;
    this.g
      .clear()
      .roundRect(0, 0, this.w, this.h, t.radius.card)
      .fill({ color: t.color.accent, alpha: this.enabled ? 1 : 0.35 });
    this.text.style.fill = t.color.accentText;
    this.text.text = this.ui.t(this.labelKey).toUpperCase();
    this.text.position.set(this.w / 2, this.h / 2);
    this.cursor = this.enabled ? 'pointer' : 'default';
  }
}

/** A dim section caption inside a sheet ("NUMBER OF ROUNDS"). */
export class SheetLegend extends Text {
  constructor(private readonly ui: OpenUI, private readonly key: string) {
    super({ text: '', style: { fontFamily: 'sans-serif', fontSize: 11, fill: '#adb5bd', fontWeight: '700' } });
  }

  resize(rem: number): void {
    this.style = { ...this.style, fontFamily: this.ui.theme.type.family, fontSize: rem * 0.66, fill: this.ui.theme.color.label, letterSpacing: rem * 0.04 };
    this.text = this.ui.t(this.key).toUpperCase();
  }
}

/**
 * The reference's "CUSTOM" limit chip. A canvas HUD has no text field to offer (the
 * library draws no DOM — Charter B2), so the custom value is entered the way the rest
 * of the bar works: pick the chip, then step the multiplier with ▲ / ▼. The value is
 * a multiple of the bet, exactly like the preset chips beside it.
 */
export class ComboTab extends Container {
  private readonly g = new Graphics();
  private readonly caption = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 12, fill: '#fafafa', fontWeight: '700' } });
  private readonly up = new Graphics();
  private readonly down = new Graphics();
  private w = 86;
  private h = 26;
  selected = false;
  value: number;

  /** The ladder the ▲▼ walk. Wide enough to cover a real session, short enough to tap. */
  static readonly LADDER = [1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 500, 1000];

  constructor(private readonly ui: OpenUI, initial: number, private readonly onChange: (v: number) => void) {
    super();
    this.value = initial;
    this.addChild(this.g, this.caption, this.up, this.down);
    this.caption.anchor.set(0, 0.5);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => this.onChange(this.value));
    for (const [node, dir] of [
      [this.up, 1],
      [this.down, -1],
    ] as const) {
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.on('pointertap', (e) => {
        e.stopPropagation();
        const list = ComboTab.LADDER;
        const i = list.indexOf(this.value);
        const next = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + dir))] ?? this.value;
        this.value = next;
        this.onChange(next);
      });
    }
  }

  setSelected(on: boolean): void {
    this.selected = on;
    this.paint();
  }

  resize(w: number, h: number, fontSize: number): void {
    this.w = w;
    this.h = h;
    this.caption.style.fontSize = fontSize;
    this.caption.style.fontFamily = this.ui.theme.type.family;
    this.paint();
  }

  get boxWidth(): number {
    return this.w;
  }

  private paint(): void {
    if (this.destroyed) return;
    const t = this.ui.theme;
    const on = this.selected;
    this.g
      .clear()
      .roundRect(0, 0, this.w, this.h, this.h / 2)
      .fill({ color: on ? t.color.accent : t.color.surface, alpha: on ? 1 : 0.85 })
      .roundRect(0, 0, this.w, this.h, this.h / 2)
      .stroke({ width: Math.max(1, this.h * 0.07), color: on ? t.color.accent : t.color.textDim, alpha: on ? 1 : 0.45 });
    const fg = on ? t.color.accentText : t.color.text;
    this.caption.style.fill = fg;
    this.caption.text = on ? `${this.value}×` : this.ui.t('openui.autoplay.custom').toUpperCase();
    this.caption.position.set(this.h * 0.45, this.h / 2);
    const arrowSize = this.h * 0.5;
    const ax = this.w - this.h * 0.5;
    drawIcon(this.up, 'caret-up', arrowSize, { color: fg });
    drawIcon(this.down, 'caret-down', arrowSize, { color: fg });
    this.up.position.set(ax, this.h * 0.3);
    this.down.position.set(ax, this.h * 0.72);
    this.up.visible = on;
    this.down.visible = on;
  }
}
