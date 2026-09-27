import { Container, Graphics, Text, type Ticker } from 'pixi.js';
import { formatAmount, type OpenUI } from '@open-slot-ui/core';
import { Sheet, TabButton, ToggleSwitch, SheetButton, SheetLegend, ComboTab } from './sheet';
import { drawIcon } from './icons';

/** `Infinity` prints as ∞; everything else as a plain count. */
function countLabel(n: number): string {
  return Number.isFinite(n) ? String(n) : '∞';
}

/**
 * The autoplay panel — the reference's BASIC / ADVANCED sheet.
 *
 * BASIC is the round count plus what the whole run will cost. ADVANCED adds the
 * responsible-gambling stops: loss limit, single-win limit, and "stop on a special
 * feature win". The limits are NOT decoration: the chosen values are passed to
 * `AutoplayControl.begin`, which enforces them as the game reports each round.
 *
 * `hud.features.autoplayAdvanced: false` drops the ADVANCED half entirely — the
 * panel is then just the count list and the start button.
 */
export class AutoplaySheet extends Sheet {
  private readonly advancedToggle = new Container();
  private readonly advancedCaret = new Graphics();
  private readonly advancedLabel = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 11, fill: '#ffc529', fontWeight: '700' } });
  private readonly roundsLegend: SheetLegend;
  private readonly costText = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 11, fill: '#adb5bd' } });
  private readonly rounds: TabButton[] = [];
  private readonly lossLegend: SheetLegend;
  private readonly winLegend: SheetLegend;
  private readonly stopLegend: SheetLegend;
  private readonly lossTabs: TabButton[] = [];
  private readonly winTabs: TabButton[] = [];
  private lossCustom?: ComboTab;
  private winCustom?: ComboTab;
  private readonly stopToggle: ToggleSwitch;
  private readonly startButton: SheetButton;

  private advanced = false;
  private count: number;
  private lossLimit = Infinity;
  private winLimit = Infinity;

  constructor(ui: OpenUI, ticker: Ticker) {
    super(ui, ui.autoplayPanel, ticker, 'openui.autoplay');
    const f = ui.chrome.features;

    this.count = ui.autoplay.options[0] ?? 10;
    this.roundsLegend = new SheetLegend(ui, 'openui.autoplay.rounds');
    this.lossLegend = new SheetLegend(ui, 'openui.autoplay.lossLimit');
    this.winLegend = new SheetLegend(ui, 'openui.autoplay.winLimit');
    this.stopLegend = new SheetLegend(ui, 'openui.autoplay.stopOnFeature');
    this.stopToggle = new ToggleSwitch(ui, ui.stopOnFeature);
    this.startButton = new SheetButton(ui, 'openui.autoplay.start', () => this.start());

    for (const n of ui.autoplay.options) {
      const tab = new TabButton(ui, countLabel(n), () => {
        this.count = n;
        this.refresh();
      });
      this.rounds.push(tab);
      this.body.addChild(tab);
    }

    this.body.addChild(this.roundsLegend, this.costText, this.startButton);

    if (f.autoplayAdvanced) {
      this.advancedToggle.addChild(this.advancedCaret, this.advancedLabel);
      this.advancedToggle.eventMode = 'static';
      this.advancedToggle.cursor = 'pointer';
      this.advancedToggle.on('pointertap', () => {
        this.advanced = !this.advanced;
        this.refresh();
      });
      this.body.addChild(this.advancedToggle, this.lossLegend, this.winLegend, this.stopLegend, this.stopToggle);

      for (const n of this.limitChoices(ui.autoplay.lossLimitOptions)) {
        const tab = new TabButton(ui, this.limitLabel(n), () => {
          this.lossLimit = n;
          this.refresh();
        });
        this.lossTabs.push(tab);
        this.body.addChild(tab);
      }
      for (const n of this.limitChoices(ui.autoplay.winLimitOptions)) {
        const tab = new TabButton(ui, this.limitLabel(n), () => {
          this.winLimit = n;
          this.refresh();
        });
        this.winTabs.push(tab);
        this.body.addChild(tab);
      }
      // …and the CUSTOM chip each list ends with.
      this.lossCustom = new ComboTab(ui, 25, (v) => {
        this.lossLimit = v;
        this.refresh();
      });
      this.winCustom = new ComboTab(ui, 50, (v) => {
        this.winLimit = v;
        this.refresh();
      });
      this.body.addChild(this.lossCustom, this.winCustom);
    }

    this.disposers.push(
      ui.bet.value.subscribe(() => this.refresh()),
      ui.autoplay.state.subscribe(() => this.refresh()),
      ui.stopOnFeature.state.subscribe(() => this.refresh()),
    );
  }

  /** A configured ladder always ends with "no limit" — the reference's last chip. */
  private limitChoices(options: number[]): number[] {
    const list = options.filter((n) => Number.isFinite(n) && n > 0);
    return [...list, Infinity];
  }

  private limitLabel(n: number): string {
    return Number.isFinite(n) ? `${n}×` : this.ui.t('openui.autoplay.noLimit').toUpperCase();
  }

  /** Which limit (if any) a jurisdiction still wants before this run may start. */
  private missingLimit(): 'loss' | 'win' | null {
    if (!this.ui.autoplay.requireLimits) return null;
    if (!Number.isFinite(this.lossLimit)) return 'loss';
    if (!Number.isFinite(this.winLimit)) return 'win';
    return null;
  }

  private start(): void {
    const ui = this.ui;
    const missing = this.missingLimit();
    if (missing) {
      // The reference says WHICH limit is missing rather than failing silently.
      ui.showFeedback(missing === 'loss' ? 'openui.autoplay.needLossLimit' : 'openui.autoplay.needWinLimit', { tone: 'warn' });
      return;
    }
    ui.autoplayPanel.closePanel();
    ui.autoplay.begin(this.count, { lossLimit: this.lossLimit, singleWinLimit: this.winLimit });
  }

  protected buildRows(): number {
    const ui = this.ui;
    const rem = this.rem;
    const pad = rem * 0.8;
    const w = this.width_ - pad * 2;
    const titleH = rem * 2;
    let y = titleH;

    // ADVANCED toggler, parked on the title row at the right.
    const showAdvanced = ui.chrome.features.autoplayAdvanced;
    this.advancedToggle.visible = showAdvanced;
    if (showAdvanced) {
      this.advancedLabel.style = { ...this.advancedLabel.style, fontFamily: ui.theme.type.family, fontSize: rem * 0.68, fill: ui.theme.color.accent, letterSpacing: rem * 0.04 };
      this.advancedLabel.text = ui.t(this.advanced ? 'openui.autoplay.basic' : 'openui.autoplay.advanced').toUpperCase();
      this.advancedLabel.anchor.set(1, 0.5);
      this.advancedLabel.position.set(w - rem * 1.1, rem * 1.1);
      drawIcon(this.advancedCaret, this.advanced ? 'caret-down' : 'caret-up', rem, { color: ui.theme.color.accent });
      this.advancedCaret.position.set(w - rem * 0.5, rem * 1.1);
      this.advancedToggle.position.set(pad, 0);
    }

    // ── BASIC: the round count ────────────────────────────────────────────────
    this.roundsLegend.resize(rem);
    this.roundsLegend.position.set(pad, y);
    y += rem * 1.2;
    y = this.flow(this.rounds, pad, y, w, rem, (tab, i) => tab.setSelected(ui.autoplay.options[i] === this.count));

    const bet = ui.bet.value.get();
    this.costText.style = { ...this.costText.style, fontFamily: ui.theme.type.family, fontSize: rem * 0.66, fill: ui.theme.color.label };
    this.costText.text = Number.isFinite(this.count)
      ? ui.t('openui.autoplay.total', { amount: formatAmount(bet * this.count, ui.bet.currency.get()) })
      : '';
    this.costText.position.set(pad, y);
    this.costText.visible = this.costText.text.length > 0;
    if (this.costText.visible) y += rem * 1.3;

    // ── ADVANCED: the responsible-gambling stops ──────────────────────────────
    const adv = showAdvanced && this.advanced;
    for (const node of [this.stopLegend, this.stopToggle, this.lossLegend, this.winLegend]) node.visible = adv;
    for (const tab of [...this.lossTabs, ...this.winTabs]) tab.visible = adv;
    for (const combo of [this.lossCustom, this.winCustom]) if (combo) combo.visible = adv;

    if (adv) {
      this.stopLegend.resize(rem);
      this.stopLegend.position.set(pad, y + rem * 0.25);
      this.stopToggle.size(rem * 0.95);
      this.stopToggle.position.set(pad + w - rem * 2.2, y);
      y += rem * 1.8;

      this.lossLegend.resize(rem);
      this.lossLegend.position.set(pad, y);
      y += rem * 1.2;
      const lossChoices = this.limitChoices(ui.autoplay.lossLimitOptions);
      y = this.flow(this.lossTabs, pad, y, w, rem, (tab, i) => tab.setSelected(lossChoices[i] === this.lossLimit), this.lossCustom, !lossChoices.includes(this.lossLimit));

      this.winLegend.resize(rem);
      this.winLegend.position.set(pad, y);
      y += rem * 1.2;
      const winChoices = this.limitChoices(ui.autoplay.winLimitOptions);
      y = this.flow(this.winTabs, pad, y, w, rem, (tab, i) => tab.setSelected(winChoices[i] === this.winLimit), this.winCustom, !winChoices.includes(this.winLimit));
    }

    this.startButton.resize(w, rem);
    this.startButton.position.set(pad, y);
    this.startButton.setEnabled(ui.autoplay.interactable && !ui.autoplay.isActive && !this.missingLimit());
    y += this.startButton.rowHeight + pad;
    return y;
  }

  /** Lay a tab list out as wrapping rows; returns the y below the last row. The
   *  optional CUSTOM chip is laid out last, on the same flow. */
  private flow(
    tabs: TabButton[],
    x: number,
    y: number,
    w: number,
    rem: number,
    mark: (tab: TabButton, i: number) => void,
    custom?: ComboTab,
    customSelected = false,
  ): number {
    const h = rem * 1.7;
    const gap = rem * 0.35;
    const width = Math.max(rem * 2.6, Math.min(rem * 5.4, (w - gap * 3) / 4));
    let cx = x;
    let cy = y;
    const put = (node: { resize: (w: number, h: number, f: number) => void; position: { set: (x: number, y: number) => void } }, cellW: number): void => {
      if (cx + cellW > x + w + 0.5) {
        cx = x;
        cy += h + gap;
      }
      node.resize(cellW, h, rem * 0.72);
      node.position.set(cx, cy);
      cx += cellW + gap;
    };
    tabs.forEach((tab, i) => {
      mark(tab, i);
      put(tab, width);
    });
    if (custom) {
      custom.setSelected(customSelected);
      put(custom, width * 1.35);
    }
    return tabs.length || custom ? cy + h + rem * 0.6 : y;
  }
}
