import { Application } from 'pixi.js';
import { mountSilkHud } from '@open-slot-ui/silk';
import { resolveBetLadder, type UISpec, type CurrencySpec } from '@open-slot-ui/core';

/**
 * THE SILK RENDERER'S FIXTURE.
 *
 * It mounts the same spec and the same values the example client mounts, so the two
 * can be photographed side by side and compared pixel for pixel
 * (`pnpm --filter @open-slot-ui/silk parity`).
 */
const q = new URLSearchParams(location.search);

const CURRENCIES: Record<string, { spec: CurrencySpec; balance: number; ladder: number[] }> = {
  USD: { spec: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 }, balance: 12345.67, ladder: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100] },
  IRR: { spec: { code: 'IRR', decimals: 0, separator: ',' }, balance: 98765432100000, ladder: [50000, 100000, 250000, 500000, 1000000, 5000000, 10000000] },
  mBTC: { spec: { code: 'mBTC', decimals: 5 }, balance: 1234.56789, ladder: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1] },
};
const money = CURRENCIES[q.get('currency') ?? 'USD'] ?? CURRENCIES.USD!;

const SPEC: UISpec = {
  currency: money.spec,
  betLadder: resolveBetLadder(money.ladder, money.ladder[3]),
  autoplay: { options: [10, 25, 50, 75, 100, 500, 1000], lossLimits: [5, 20, 50], winLimits: [10, 20, 75] },
  rtp: 96.1,
  game: { name: 'open-slot-ui', version: '0.14.0' },
  hud: { features: { superTurbo: true, lobby: true } },
};

async function main(): Promise<void> {
  const app = new Application();
  // `?bg=` paints the backdrop the parity check paints behind the DOM bar: the
  // plate is semi-transparent, so the two only land on the same pixels if what is
  // behind them is the same colour.
  const bg = `#${(q.get('bg') ?? '0d0d0d').replace('#', '')}`;
  await app.init({ resizeTo: window, background: bg, antialias: false, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2) });
  document.body.appendChild(app.canvas);

  const hud = mountSilkHud(app, SPEC);
  app.stage.addChild(hud.view);

  hud.setBalance(Number(q.get('balance')) || money.balance);
  if (Number(q.get('win'))) hud.setWin(Number(q.get('win')));
  hud.showFeedback('press_play', { ms: 0 });

  (globalThis as { hud?: unknown }).hud = hud;
}

void main();
