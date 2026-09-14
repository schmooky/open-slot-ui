import { Application } from 'pixi.js';
import { mountDomHud } from '@open-slot-ui/dom';
import { resolveBetLadder } from '@open-slot-ui/core';
import type { UISpec } from '@open-slot-ui/core';
import { buildReels, evaluate } from './reels';
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

  const reels = buildReels(app);
  app.stage.addChild(reels.container);

  /** The bar reserves a strip at the bottom of the screen; ask the DOM how tall it is. */
  const barHeight = (): number => document.querySelector('.UiUserPanelWrapper')?.getBoundingClientRect().height ?? 0;
  // The bar reserves a strip at the bottom; the reels get everything above it.
  const layout = (): void => reels.layout(app.screen.width, app.screen.height, barHeight());
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
      void runBonus(id === 'super-spins' ? 15 : 10);
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
    ui.clearFeedback(); // the "press play" hint has done its job
    hud.setHudState('play');
    ui.spin.busy();
    ui.balance.set(snap(ui.balance.get() - stake));
    // TURBO comes from the ☰ menu's own switch — the reels take the faster profile.
    const grid = await reels.spin(ui.turboBase.isOn);
    const line = evaluate(grid);
    const win = snap(stake * line.win);
    if (win > 0) {
      ui.balance.set(snap(ui.balance.get() + win));
      reels.celebrate(line.cells);
    }
    hud.setWin(win);
    hud.setHudState(win > 0 ? 'winPresentation' : 'result');
    history.unshift({ date: new Date().toLocaleTimeString(), bet: money(stake), win: money(win), won: win > 0 });
    hud.setHistory(history.slice(0, 40));
    hud.reportRound(win, stake);
    ui.spin.idle();
    hud.setHudState('idle');
  }

  /**
   * A bonus PLAYS ITSELF — that is why the reference hides the action panel while
   * `data-state` is `featurePlay-freespins`. So the host has to drive it: spin, tally,
   * count down, and hand the bar back when the last free spin lands.
   */
  async function runBonus(spins: number): Promise<void> {
    hud.setTotalWin(0);
    hud.setFreeSpins(spins);
    hud.setHudState('featureEnter');
    await wait(500);
    hud.setHudState('featurePlay');
    let total = 0;
    while (ui.spin.freeSpins.get() > 0) {
      const stake = ui.betStepper.value;
      ui.spin.busy();
      const grid = await reels.spin(true); // a bonus always runs at turbo pace
      const line = evaluate(grid);
      const win = snap(stake * line.win * 2); // free spins pay double in this demo
      total = snap(total + win);
      if (win > 0) {
        ui.balance.set(snap(ui.balance.get() + win));
        reels.celebrate(line.cells);
      }
      hud.setTotalWin(total);
      hud.setFreeSpins(ui.spin.freeSpins.get() - 1); // the counter on the bar
      ui.spin.idle();
      await wait(260);
    }
    hud.setHudState('featureExit');
    hud.showFeedback(`Bonus paid ${money(total)}`, { tone: 'good', ms: 3200 });
    await wait(1200);
    hud.setHudState('idle'); // the bar comes back: action panel, buy coin and all
  }

  ui.on('spinRequested', () => void playSpin());
  ui.on('skipRequested', () => reels.skip()); // the slam-stop button
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
