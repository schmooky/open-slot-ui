import { Application } from 'pixi.js';
import { mountDomHud } from '@open-slot-ui/dom';
import { resolveBetLadder } from '@open-slot-ui/core';
import type { UISpec } from '@open-slot-ui/core';
import { buildReels } from './reels';
import { RULES_BLOCKS, FACTS } from './content';

/**
 * The DOM-renderer example: the same headless core, the same fake game — but the HUD
 * is REAL MARKUP dressed by a stylesheet the host supplies (`?skin=`), instead of
 * being drawn on the canvas.
 *
 *   /dom.html?skin=/skin/ui.min.css
 */
const q = new URLSearchParams(location.search);
const skinHref = q.get('skin') ?? '/skin/ui.min.css';

const LADDER = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

const SPEC: UISpec = {
  currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 },
  betLadder: resolveBetLadder(LADDER, 1),
  autoplay: { options: [10, 25, 50, 75, 100, 500, 1000], lossLimits: [5, 20, 50], winLimits: [10, 20, 75] },
  rtp: 96.1,
  game: { name: 'Scrolls of Fate', version: '1.0.0' },
  hud: { features: { superTurbo: true, lobby: true } },
  rules: RULES_BLOCKS,
  facts: FACTS,
};

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2) });
  document.getElementById('GameWrapper')!.appendChild(app.canvas);

  const reels = buildReels();
  app.stage.addChild(reels.container);
  const layout = (): void => reels.layout(app.screen.width, app.screen.height);
  app.renderer.on('resize', layout);
  layout();

  const hud = mountDomHud(SPEC, {
    skin: { href: skinHref, font: { family: 'icomoon', src: '/skin/ui/fonts/icons/icomoon.woff2' } },
    features: [
      { id: 'free-spins', name: 'Free Spins', variant: 'buy', cost: 100 },
      { id: 'super-spins', name: 'Super Spins', variant: 'buy', cost: 300 },
    ],
    onBuy: (id, cost) => {
      ui.balance.set(Math.round((ui.balance.get() - cost) * 100) / 100);
      hud.setFreeSpins(id === 'super-spins' ? 15 : 10);
      hud.setHudState('featurePlay');
      hud.setTotalWin(0);
    },
  });
  const ui = hud.ui;

  hud.setBalance(12345.67);
  hud.setMaxWin(5000, '1 in 1,250,000');
  hud.setHistory([]);
  ui.showFeedback('press_play', { ms: 0 });
  hud.ready();

  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const snap = (n: number): number => Math.round(n * 100) / 100;
  const history: Array<{ date: string; bet: string; win: string; won: boolean }> = [];
  const money = (n: number): string => `$${n.toFixed(2)}`;

  async function playSpin(): Promise<void> {
    const stake = ui.betStepper.value;
    if (ui.balance.get() < stake) {
      hud.showFeedback('insufficient_funds', { tone: 'warn' });
      return;
    }
    hud.setWin(0);
    hud.setHudState('play');
    ui.spin.busy();
    ui.balance.set(snap(ui.balance.get() - stake));
    await reels.spin(app, ui.turboBase.isOn);
    const MULTS = [0, 0, 0, 0.5, 1, 2, 5, 12, 25];
    const win = snap(stake * (MULTS[Math.floor(Math.random() * MULTS.length)] ?? 0));
    if (win > 0) ui.balance.set(snap(ui.balance.get() + win));
    hud.setWin(win);
    hud.setHudState(win > 0 ? 'winPresentation' : 'result');
    history.unshift({ date: new Date().toLocaleTimeString(), bet: money(stake), win: money(win), won: win > 0 });
    hud.setHistory(history.slice(0, 40));
    hud.reportRound(win, stake);
    ui.spin.idle();
    hud.setHudState('idle');
  }

  ui.on('spinRequested', () => void playSpin());
  ui.on('autoplayStarted', async () => {
    while (ui.autoplay.isActive) {
      await playSpin();
      await wait(220);
    }
  });

  (window as unknown as Record<string, unknown>).ui = ui;
  (window as unknown as Record<string, unknown>).hud = hud;
}

void main();
