import { Container, Graphics, Text, Rectangle, type Ticker } from 'pixi.js';
import { type PanelControl, type OpenUI, type BlockSpec, type Signal, type ScreenState } from '@open-ui/core';
import { ControlView } from './ControlView';
import { buildBlockColumn, type ControlViewFactory } from './blockColumn';

export interface DialogViewOptions {
  controlSkins?: Partial<Record<string, ControlViewFactory>>;
  /** Localizable label for the built-in dismiss button. Default 'OK'. */
  okLabel?: string;
  /** Max card width in px. Default 520. */
  maxWidth?: number;
}

const INSET = 24;
const BTN_H = 52;
const BTN_GAP = 14;

/**
 * A centered, auto-sized modal rendered in the SAME style as the unified menu — the
 * same accent-stroked card on a dimmed backdrop, the same {@link buildBlockColumn}
 * block renderer — so notices/errors are fully themed for free (a theme restyles
 * them with zero extra work). Bound to a PanelControl; its content comes from a
 * `Signal<BlockSpec[]>` (e.g. `ui.noticeBlocks`) and rebuilds when that or the
 * locale changes. This is the Stake Engine error/notice surface (insufficient
 * funds, session expired, gambling-limit, maintenance, disconnect…). It's an
 * overlay (owns its open/closed visibility), so OpenUIPixi adds it to `overlays`.
 */
export class DialogView extends ControlView {
  private readonly backdrop = new Graphics();
  private readonly card = new Graphics();
  private readonly closeBtn = new Container();
  private readonly okBtn = new Container();
  private readonly okBg = new Graphics();
  private readonly okText: Text;
  private readonly content = new Container();
  private readonly maskG = new Graphics();
  private childViews: ControlView[] = [];
  private screen: ScreenState | undefined;
  private readonly maxWidth: number;
  private readonly okKey: string;

  constructor(
    private readonly panel: PanelControl,
    private readonly blocks: Signal<BlockSpec[]>,
    ui: OpenUI,
    private readonly ticker: Ticker,
    private readonly opts: DialogViewOptions = {},
  ) {
    super(panel, ui);
    this.zIndex = 130; // above the menu (120)
    this.maxWidth = opts.maxWidth ?? 520;
    this.okKey = opts.okLabel ?? 'OK';

    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => this.panel.closePanel());

    this.buildClose();

    this.okText = new Text({ text: ui.t(this.okKey), style: { fontFamily: ui.theme.type.family, fontSize: 20, fill: ui.theme.color.accentText, fontWeight: '800', letterSpacing: 1 } });
    this.okText.anchor.set(0.5);
    this.okBtn.eventMode = 'static';
    this.okBtn.cursor = 'pointer';
    this.okBtn.on('pointertap', () => this.panel.closePanel());
    this.okBtn.addChild(this.okBg, this.okText);

    this.content.mask = this.maskG;
    this.addChild(this.backdrop, this.card, this.content, this.maskG, this.okBtn, this.closeBtn);

    this.applyOpen(this.panel.isOpen);
    this.disposers.push(
      this.panel.state.subscribe(() => this.applyOpen(this.panel.isOpen)),
      this.blocks.subscribe(() => {
        if (!this.destroyed) this.relayout();
      }),
      this.ui.locale.subscribe(() => {
        if (this.destroyed) return;
        this.okText.text = this.ui.t(this.okKey);
        this.relayout();
      }),
    );
  }

  private buildClose(): void {
    const t = this.ui.theme;
    const r = 18;
    const bg = new Graphics().circle(0, 0, r).fill({ color: t.color.surfaceAlt }).stroke({ width: 2, color: t.color.textDim });
    const x = new Graphics().moveTo(-6, -6).lineTo(6, 6).moveTo(6, -6).lineTo(-6, 6).stroke({ width: 3, color: t.color.text });
    this.closeBtn.addChild(bg, x);
    this.closeBtn.eventMode = 'static';
    this.closeBtn.cursor = 'pointer';
    this.closeBtn.hitArea = new Rectangle(-r, -r, r * 2, r * 2);
    this.closeBtn.on('pointertap', () => this.panel.closePanel());
  }

  override applyLayout(screen: ScreenState): void {
    this.screen = screen;
    this.position.set(0, 0);
    this.scale.set(1);
    this.relayout();
  }

  private relayout(): void {
    const s = this.screen;
    if (!s) return;
    if (!this.panel.isOpen) return; // nothing to build/measure while closed
    const W = s.width;
    const H = s.height;
    const t = this.ui.theme;

    // (re)build the block column for the current content + width
    for (const v of this.childViews) v.dispose();
    this.childViews.length = 0;
    for (const ch of this.content.removeChildren()) ch.destroy();

    const cardW = Math.min(W - 48, this.maxWidth);
    const innerW = cardW - INSET * 2;
    const col = buildBlockColumn(this.blocks.get(), [], this.ui, this.ticker, innerW, { controlSkins: this.opts.controlSkins });
    this.childViews = col.views;
    const kids = col.content.removeChildren();
    if (kids.length) this.content.addChild(...kids);

    const contentH = col.height; // includes the column's own top/bottom padding
    const wantH = contentH + BTN_GAP + BTN_H + INSET;
    const cardH = Math.min(H - 48, wantH);
    const cx = (W - cardW) / 2;
    const cy = (H - cardH) / 2;

    this.backdrop.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.62 });
    this.backdrop.hitArea = new Rectangle(0, 0, W, H);
    this.card.clear().roundRect(cx, cy, cardW, cardH, t.radius.card).fill({ color: t.color.surface }).stroke({ width: 2, color: t.color.accent });

    // content column: rows are centered at local x=0, first row's padding at top
    const bodyH = cardH - BTN_GAP - BTN_H - INSET;
    this.content.x = cx + cardW / 2;
    this.content.y = cy;
    this.maskG.clear().rect(cx, cy, cardW, bodyH).fill({ color: 0xffffff });

    // OK button
    const okW = Math.min(innerW, 280);
    this.okBg.clear().roundRect(-okW / 2, -BTN_H / 2, okW, BTN_H, BTN_H / 2).fill({ color: t.color.accent });
    this.okBtn.position.set(cx + cardW / 2, cy + cardH - INSET / 2 - BTN_H / 2);
    this.okBtn.hitArea = new Rectangle(-okW / 2, -BTN_H / 2, okW, BTN_H);

    this.closeBtn.position.set(cx + cardW - 20, cy + 20);
  }

  private applyOpen(open: boolean): void {
    this.visible = open;
    this.eventMode = open ? 'static' : 'none';
    if (open) this.relayout();
  }

  override dispose(): void {
    for (const v of this.childViews) v.dispose();
    this.childViews.length = 0;
    super.dispose();
  }
}
