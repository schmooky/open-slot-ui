import { Container, Graphics, Text, type Ticker } from 'pixi.js';
import { type OpenUI, type ScreenState } from '@open-slot-ui/core';
import { drawIcon } from './icons';

/**
 * The bet-history window: DATE · BET · WIN, newest first.
 *
 * open-ui does not fetch anything — the host feeds rows with `hud.setHistory(rows)`
 * (its RGS owns that data). What the library owns is the window: the dark modal, the
 * table, the empty state, and the fact that `hud.features.history: false` removes
 * both the row that opens it and the window itself.
 */
export class HistoryModal extends Container {
  private readonly backdrop = new Graphics();
  private readonly card = new Graphics();
  private readonly title = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 16, fill: '#ffc529', fontWeight: '700' } });
  private readonly close = new Container();
  private readonly closeGlyph = new Graphics();
  private readonly rows = new Container();
  private readonly disposers: Array<() => void> = [];
  private readonly tick: (t: Ticker) => void;
  private prog = 0;
  private target = 0;
  private screen?: ScreenState;
  private rem = 16;

  constructor(private readonly ui: OpenUI, private readonly ticker: Ticker) {
    super();
    this.addChild(this.backdrop, this.card, this.title, this.rows, this.close);
    this.close.addChild(this.closeGlyph);
    this.visible = false;
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => ui.historyPanel.closePanel());
    this.card.eventMode = 'static';
    this.close.eventMode = 'static';
    this.close.cursor = 'pointer';
    this.close.on('pointertap', () => ui.historyPanel.closePanel());

    this.disposers.push(
      ui.historyPanel.state.subscribe(() => {
        this.target = ui.historyPanel.isOpen ? 1 : 0;
        if (this.target === 1) this.visible = true;
      }),
      ui.history.subscribe(() => this.paint()),
      ui.locale.subscribe(() => this.paint()),
    );

    this.tick = (t): void => {
      if (this.prog === this.target) return;
      const step = t.deltaMS / 150;
      this.prog = this.target > this.prog ? Math.min(1, this.prog + step) : Math.max(0, this.prog - step);
      this.alpha = this.prog;
      this.eventMode = this.prog > 0.6 ? 'static' : 'none';
      if (this.prog === 0) this.visible = false;
    };
    ticker.add(this.tick);
  }

  applyLayout(screen: ScreenState, rem: number): void {
    this.screen = screen;
    this.rem = rem;
    this.paint();
  }

  private paint(): void {
    if (this.destroyed || !this.screen) return;
    const ui = this.ui;
    const t = ui.theme;
    const rem = this.rem;
    const { width: sw, height: sh } = this.screen;
    const w = Math.min(rem * 26, sw - rem * 2);
    const h = Math.min(rem * 22, sh - rem * 3);
    const x = (sw - w) / 2;
    const y = (sh - h) / 2;

    this.backdrop.clear().rect(0, 0, sw, sh).fill({ color: 0x000000, alpha: t.alpha.backdrop });
    this.card
      .clear()
      .roundRect(x, y, w, h, t.radius.card)
      .fill({ color: t.color.menu, alpha: 0.98 })
      .roundRect(x, y, w, h, t.radius.card)
      .stroke({ width: Math.max(2, rem * 0.16), color: t.color.accent });

    this.title.style = { ...this.title.style, fontFamily: t.type.family, fontSize: rem * 0.95, fill: t.color.accent, letterSpacing: rem * 0.05 };
    this.title.text = ui.t('openui.history').toUpperCase();
    this.title.anchor.set(0.5, 0);
    this.title.position.set(sw / 2, y + rem * 0.9);

    drawIcon(this.closeGlyph, 'close', rem * 1.3, { color: t.color.text });
    this.close.position.set(x + w - rem * 1.2, y + rem * 1.2);

    this.rows.removeChildren().forEach((c) => c.destroy({ children: true }));
    const pad = rem * 1.1;
    const colX = [x + pad, x + w * 0.52, x + w - pad];
    const header = ['openui.date', 'openui.bet', 'openui.win'];
    let ry = y + rem * 2.8;

    header.forEach((key, i) => {
      const cell = new Text({
        text: ui.t(key).toUpperCase(),
        style: { fontFamily: t.type.family, fontSize: rem * 0.62, fill: t.color.label, fontWeight: '700', letterSpacing: rem * 0.03 },
      });
      cell.anchor.set(i === 2 ? 1 : 0, 0);
      cell.position.set(colX[i], ry);
      this.rows.addChild(cell);
    });
    ry += rem * 1.4;

    const rowH = rem * 1.5;
    const room = Math.max(0, y + h - pad - ry);
    const list = ui.history.get().slice(0, Math.floor(room / rowH));

    if (!list.length) {
      const empty = new Text({ text: ui.t('openui.noHistory'), style: { fontFamily: t.type.family, fontSize: rem * 0.75, fill: t.color.textDim } });
      empty.anchor.set(0.5);
      empty.position.set(sw / 2, ry + room / 2 - rem);
      this.rows.addChild(empty);
      return;
    }

    list.forEach((row, idx) => {
      const stripe = new Graphics();
      stripe.roundRect(x + pad * 0.6, ry - rem * 0.15, w - pad * 1.2, rowH - rem * 0.1, 3).fill({ color: t.color.text, alpha: idx % 2 ? 0.05 : 0.02 });
      this.rows.addChild(stripe);
      [row.date, row.bet, row.win].forEach((text, i) => {
        const cell = new Text({
          text,
          style: {
            fontFamily: t.type.family,
            fontSize: rem * 0.7,
            fill: i === 2 && row.won ? t.color.accent : t.color.text,
            fontWeight: i === 2 && row.won ? '700' : '400',
          },
        });
        cell.anchor.set(i === 2 ? 1 : 0, 0);
        cell.position.set(colX[i], ry);
        this.rows.addChild(cell);
      });
      ry += rowH;
    });
  }

  dispose(): void {
    this.ticker.remove(this.tick);
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}
