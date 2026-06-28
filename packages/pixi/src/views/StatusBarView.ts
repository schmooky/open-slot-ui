import { Container, Graphics, type Ticker } from 'pixi.js';
import { type ReadoutControl, type OpenUI, type ScreenState } from '@open-slot-ui/core';
import { ReadoutView } from './ReadoutView';

export type StatusBarSide = 'top' | 'bottom';

/** Reference height of the strip (scaled per screen). Shared with the HUD margin. */
const BAR_H = 26;

/**
 * A thin, full-width black-and-white status strip pinned to the top or bottom edge,
 * holding the compliance readouts (net · RTP · session) as inline items — white
 * text on a dark bar, no theme accent. Only the jurisdiction-revealed readouts take
 * a slot, so it adapts from 0→3 items (and hides itself when empty). A full-screen
 * overlay (OpenUIPixi manages it + insets the HUD by {@link StatusBarView.heightFor}
 * so controls never sit under it).
 */
export class StatusBarView extends Container {
  private readonly bg = new Graphics();
  private readonly items: Array<{ id: string; view: ReadoutView }> = [];
  private screen: ScreenState | undefined;
  private readonly disposers: Array<() => void> = [];

  /** The strip's pixel height for the current screen (used for the HUD margin too). */
  static heightFor(screen: ScreenState): number {
    const scale = Math.max(0.7, Math.min(1.4, screen.scale));
    return Math.round(BAR_H * scale);
  }

  constructor(
    controls: ReadoutControl[],
    private readonly ui: OpenUI,
    ticker: Ticker,
    private readonly side: StatusBarSide,
  ) {
    super();
    // Above every overlay (menu 120 / dialog 130 / drawer 200) so the compliance
    // readouts stay visible at all times — even with a modal open (Charter P10).
    this.zIndex = 300;
    this.addChild(this.bg);
    for (const c of controls) {
      const view = new ReadoutView(c, ui, ticker, { inline: true, mono: true });
      this.addChild(view);
      this.items.push({ id: c.id, view });
    }
    this.disposers.push(
      this.ui.on('visibilityChanged', ({ id }) => {
        if (this.items.some((it) => it.id === id)) this.relayout();
      }),
    );
  }

  applyLayout(screen: ScreenState): void {
    this.screen = screen;
    this.relayout();
  }

  private relayout(): void {
    const s = this.screen;
    if (!s) return;
    const W = s.width;
    const H = s.height;
    const scale = Math.max(0.7, Math.min(1.4, s.scale));
    const barH = StatusBarView.heightFor(s);
    const y = this.side === 'top' ? 0 : H - barH;
    this.position.set(0, 0);

    const visible = this.items.filter((it) => !this.ui.hidden.has(it.id));
    for (const it of this.items) it.view.visible = !this.ui.hidden.has(it.id);

    this.bg.clear();
    this.visible = visible.length > 0;
    if (!visible.length) return;

    // dark strip + a white hairline on the inner edge — black & white, no accent.
    const edgeY = this.side === 'top' ? barH - 1 : y;
    this.bg
      .rect(0, y, W, barH)
      .fill({ color: 0x0c0d10, alpha: 0.92 })
      .rect(0, edgeY, W, 1)
      .fill({ color: 0xffffff, alpha: 0.18 });

    const n = visible.length;
    const cy = y + barH / 2;
    const pad = 18 * scale;
    const usableW = Math.max(160, W - pad * 2);
    visible.forEach((it, i) => {
      it.view.position.set(pad + usableW * ((i + 0.5) / n), cy);
      it.view.scale.set(scale);
    });
  }

  dispose(): void {
    for (const it of this.items) it.view.dispose();
    this.items.length = 0;
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}
