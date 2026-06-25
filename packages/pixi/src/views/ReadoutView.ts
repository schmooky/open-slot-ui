import { Text, type Ticker } from 'pixi.js';
import { type ReadoutControl, type OpenUI, formatAmount } from '@open-ui/core';
import { ControlView } from './ControlView';

const CAP_DY = -20;

/** Seconds → "M:SS" or "H:MM:SS". */
function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * A compact, non-interactive readout for the Stake Engine jurisdiction `display*`
 * elements — RTP, net position, session timer. A dim uppercase caption over a bold
 * value, themed from tokens (so a theme restyles it for free). The `'duration'`
 * kind advances itself off the shared ticker while the control is running. Net
 * position shows an explicit +/- sign (never a separate red/green — theme-neutral).
 */
export class ReadoutView extends ControlView {
  private readonly caption?: Text;
  private readonly valueText: Text;
  private readonly tick?: (t: Ticker) => void;

  constructor(private readonly ro: ReadoutControl, ui: OpenUI, private readonly ticker: Ticker) {
    super(ro, ui);
    const t = ui.theme;
    if (ro.label) {
      this.caption = new Text({
        text: ui.t(ro.label).toUpperCase(),
        style: { fontFamily: t.type.family, fontSize: 12, fill: t.color.text, fontWeight: '700', letterSpacing: 2 },
      });
      this.caption.alpha = 0.55;
      this.caption.anchor.set(0.5, 1);
      this.caption.y = CAP_DY;
      this.addChild(this.caption);
    }
    this.valueText = new Text({ text: '', style: { fontFamily: t.type.family, fontSize: 26, fill: t.color.text, fontWeight: '800' } });
    this.valueText.anchor.set(0.5, 0.5);
    this.addChild(this.valueText);

    this.disposers.push(
      this.ro.value.subscribe(() => this.render()),
      this.ui.locale.subscribe(() => {
        if (this.destroyed) return;
        if (this.caption && this.ro.label) this.caption.text = this.ui.t(this.ro.label).toUpperCase();
      }),
    );
    if (this.ro.currency) this.disposers.push(this.ro.currency.subscribe(() => this.render()));

    if (this.ro.kind === 'duration') {
      this.tick = (tk) => this.ro.tick(tk.deltaMS / 1000);
      this.ticker.add(this.tick);
    }
    this.render();
  }

  private render(): void {
    const v = this.ro.value.get();
    let text: string;
    switch (this.ro.kind) {
      case 'currency':
        text = this.ro.currency ? formatAmount(v, this.ro.currency.get(), { signed: this.ro.signed }) : String(v);
        break;
      case 'percent':
        text = `${v.toFixed(this.ro.decimals)}%`;
        break;
      case 'duration':
        text = fmtDuration(v);
        break;
      default:
        text = String(v);
    }
    this.valueText.text = text;
  }

  override dispose(): void {
    if (this.tick) this.ticker.remove(this.tick);
    super.dispose();
  }
}
