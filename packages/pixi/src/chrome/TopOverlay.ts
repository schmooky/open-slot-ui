import { Container, Graphics, Text, type Ticker } from 'pixi.js';
import { type OpenUI, type ScreenState } from '@open-slot-ui/core';
import { drawIcon } from './icons';

/**
 * The thin informational overlay the reference parks above the reels: the clock,
 * the game name, RTP, the max-win figure, and (where a jurisdiction asks for them)
 * the session timer and net position. Everything here is a chrome feature flag, and
 * every one of them defaults to the reference's own choice.
 *
 * It is display-only — nothing here is interactive except the fullscreen button, so
 * it sits above the game but never eats a tap meant for the reels.
 */
export class TopOverlay extends Container {
  private readonly left = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 11, fill: '#fafafa' } });
  private readonly session = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 11, fill: '#fafafa' } });
  private readonly right = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 11, fill: '#fafafa' } });
  private readonly fs = new Container();
  private readonly fsGlyph = new Graphics();
  private readonly disposers: Array<() => void> = [];
  private readonly tick: () => void;
  private rem = 16;
  private screen?: ScreenState;
  private lastMinute = -1;

  constructor(
    private readonly ui: OpenUI,
    private readonly ticker: Ticker,
    private readonly onFullscreen: () => void,
  ) {
    super();
    this.addChild(this.left, this.session, this.right, this.fs);
    this.fs.addChild(this.fsGlyph);
    this.fs.eventMode = 'static';
    this.fs.cursor = 'pointer';
    this.fs.on('pointertap', () => this.onFullscreen());

    const paint = (): void => this.paint();
    this.disposers.push(
      ui.maxWin.subscribe(paint),
      ui.rtp.value.subscribe(paint),
      ui.netPosition.value.subscribe(paint),
      ui.sessionTimer.value.subscribe(paint),
      ui.locale.subscribe(paint),
    );
    // The clock only needs repainting when the displayed minute actually changes.
    this.tick = (): void => {
      if (!this.ui.chrome.features.clock) return;
      const m = new Date().getMinutes();
      if (m === this.lastMinute) return;
      this.lastMinute = m;
      this.paint();
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
    const f = ui.chrome.features;
    const rem = this.rem;
    const pad = rem * 0.6;
    const size = Math.max(9, rem * 0.62);
    const style = { fontFamily: t.type.family, fontSize: size, fill: t.color.text, dropShadow: { color: '#000000', alpha: 0.8, blur: 2, distance: 1, angle: Math.PI / 2 } } as const;
    this.left.style = { ...this.left.style, ...style };
    this.session.style = { ...this.session.style, ...style };
    this.right.style = { ...this.right.style, ...style };

    const bits: string[] = [];
    if (f.clock) {
      const d = new Date();
      bits.push(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }
    if (ui.gameInfo.name) bits.push(ui.gameInfo.name);
    if (f.rtp && !ui.hidden.has('rtp')) bits.push(`${ui.t('openui.rtp')} ${ui.rtp.formatted}`);
    this.left.text = bits.join('   ·   ');
    this.left.position.set(pad, pad);

    const sess: string[] = [];
    if (f.sessionBar && !ui.hidden.has('session-timer')) sess.push(`${ui.t('openui.session')} ${ui.sessionTimer.formatted}`);
    if (f.sessionBar && !ui.hidden.has('net-position')) sess.push(`${ui.t('openui.net')} ${ui.netPosition.formatted}`);
    this.session.text = sess.join('   ·   ');
    this.session.position.set(pad, pad + size * 1.6);

    const mw = ui.maxWin.get();
    const rightBits: string[] = [];
    if (f.maxWin && mw) {
      if (mw.multiplier != null) rightBits.push(`${ui.t('openui.maxWin')} ${mw.multiplier}×`);
      if (mw.odds) rightBits.push(`${ui.t('openui.odds')} ${mw.odds}`);
    }
    this.right.text = rightBits.join('   ·   ');
    this.right.anchor.set(1, 0);
    const fsSize = rem * 1.4;
    const fsRoom = f.fullscreen ? fsSize + pad : 0;
    this.right.position.set(this.screen.width - pad - fsRoom, pad);

    this.fs.visible = f.fullscreen && !ui.hidden.has('fullscreen');
    if (this.fs.visible) {
      const isFs = typeof document !== 'undefined' && !!document.fullscreenElement;
      drawIcon(this.fsGlyph, isFs ? 'fullscreen-exit' : 'fullscreen', fsSize, { color: t.color.text, weight: 0.1 });
      this.fs.position.set(this.screen.width - pad - fsSize / 2, pad + fsSize / 2);
    }
  }

  dispose(): void {
    this.ticker.remove(this.tick);
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}
