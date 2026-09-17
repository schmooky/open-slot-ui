import { mountDomHud } from '@open-slot-ui/dom';
import { resolveBetLadder, formatAmount } from '@open-slot-ui/core';
import type { UISpec, CurrencySpec } from '@open-slot-ui/core';
// PixiJS, GSAP and the slot itself are imported DYNAMICALLY, below: they are by far
// the biggest thing this page downloads and the HUD needs none of it. Splitting them
// out means the bar is parsed, mounted and on screen while the game is still coming
// down the wire.
import type { Slot } from './reels';
import rulesXml from './rules.xml?raw';
import { buildRules, FACTS, dropBlocks } from './content';

/** The rules, parsed from the markup file at boot — see content.ts. */
const RULES_BLOCKS = buildRules(rulesXml);

/**
 * The DOM-renderer example: the same headless core, the same fake game — but the HUD
 * is REAL MARKUP dressed by a stylesheet the host supplies (`?skin=`), instead of
 * being drawn on the canvas.
 *
 *   /dom.html?skin=/skin/ui.min.css
 */
const q = new URLSearchParams(location.search);
/**
 * WHERE THE LOOK COMES FROM.
 *
 * open-ui ships no stylesheet for this markup — the skin is the game studio's. Locally
 * it is read from `public/skin/` (gitignored: it is not ours to commit). A deployed
 * build points at whatever URL the studio serves it from, via `VITE_SKIN_URL`.
 *   /?skin=https://cdn.example.com/ui.css
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const skinHref = q.get('skin') ?? env.VITE_SKIN_URL ?? '/skin/ui.min.css';
const iconFont = q.get('font') ?? env.VITE_SKIN_FONT_URL ?? '/skin/ui/fonts/icons/icomoon.woff2';

/**
 * Money shapes worth looking at: a 2-decimal major, a ZERO-decimal currency whose
 * numbers run enormous (IRR), and crypto with a long fraction (mBTC / BTC). The bar
 * has to hold all of them without the figures colliding.
 *   /?currency=IRR&balance=98765432100&bet=5000000
 */
const CURRENCIES: Record<string, { spec: CurrencySpec; balance: number; ladder: number[] }> = {
  USD: { spec: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 }, balance: 12345.67, ladder: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100] },
  EUR: { spec: { code: 'EUR', symbol: '€', display: 'symbol', position: 'prefix', decimals: 2, decimalChar: ',', separator: '.' }, balance: 12345.67, ladder: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100] },
  // Rial: no minor unit at all, and stakes in the millions.
  IRR: { spec: { code: 'IRR', decimals: 0, separator: ',' }, balance: 987_654_321_000, ladder: [50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000] },
  // Milli-bitcoin: five decimals, so the value is long rather than large.
  mBTC: { spec: { code: 'mBTC', decimals: 5 }, balance: 1234.56789, ladder: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1] },
  BTC: { spec: { code: 'BTC', symbol: '₿', display: 'symbol', position: 'prefix', decimals: 8 }, balance: 1.23456789, ladder: [0.0001, 0.0005, 0.001, 0.005, 0.01] },
};
const money0 = CURRENCIES[q.get('currency') ?? 'USD'] ?? CURRENCIES.USD!;

const LADDER = money0.ladder;

/** Card art for the buy sheet. Inline SVG so the demo needs no files or network. */
const featureArt = (label: string, color: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#1b1e24"/></linearGradient></defs><rect width="160" height="120" rx="10" fill="url(#g)"/><text x="80" y="74" text-anchor="middle" font-family="system-ui,sans-serif" font-size="44" font-weight="800" fill="#fff">${label}</text></svg>`,
  )}`;

const FEATURES = [
  {
    id: 'free-spins',
    name: 'Free Spins',
    variant: 'buy' as const,
    cost: 100,
    image: featureArt('10', '#ff8b02'),
    description: '10 free spins with every win doubled.',
    volatility: 'Volatility: High',
    confirm: 'Buying Free Spins costs {{price}} and starts the round immediately.',
  },
  {
    id: 'super-spins',
    name: 'Super Spins',
    variant: 'buy' as const,
    cost: 300,
    image: featureArt('15', '#ec752f'),
    description: '15 free spins, and wilds stay put.',
    volatility: 'Volatility: Very high',
    confirm: 'Buying Super Spins costs {{price}} and starts the round immediately.',
  },
  {
    id: 'ante',
    name: 'Ante Bet',
    variant: 'boost' as const,
    cost: 0.25,
    image: featureArt('+25%', '#19c858'),
    description: 'Doubles the chance of triggering the bonus.',
    volatility: 'Volatility: Medium',
  },
  {
    id: 'double-chance',
    name: 'Double Chance',
    variant: 'boost' as const,
    cost: 0.5,
    image: featureArt('×2', '#0bbb46'),
    description: 'Two shots at the bonus on every spin.',
    volatility: 'Volatility: High',
  },
];


/**
 * `?forget=1` "forgets" declarations ON PURPOSE — the auto stats grid, two whole
 * feature sections and the free-spins facts. The info window then opens with the
 * rules audit listing exactly what a certifier would send back.
 */
const FORGOTTEN = new Set(['r-stats', 'r-f-ss-h', 'r-f-ss', 'r-f-ab-h', 'r-f-ab']);
const forget = q.get('forget') === '1';

const SPEC: UISpec = {
  currency: money0.spec,
  betLadder: resolveBetLadder(LADDER, LADDER[Math.min(3, LADDER.length - 1)]!),
  autoplay: { options: [10, 25, 50, 75, 100, 500, 1000], lossLimits: [5, 20, 50], winLimits: [10, 20, 75] },
  rtp: 96.1,
  game: { name: 'open-slot-ui', version: '0.14.0' },
  hud: { features: { superTurbo: true, lobby: true } },
  rules: forget ? dropBlocks(RULES_BLOCKS, FORGOTTEN) : RULES_BLOCKS,
  facts: forget ? { ...FACTS, freeSpins: undefined } : FACTS,
};

/** Resolves after the browser has actually put a frame on the screen. */
const painted = (): Promise<void> =>
  new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

async function main(): Promise<void> {
  // ORDER MATTERS. Building the slot is the single most expensive thing this client
  // does — a WebGL context, then a first frame that rasterizes 35 symbols — and it
  // used to run BEFORE the HUD existed, so the player watched an empty page for the
  // whole of it. The HUD is cheap and is what the player is waiting for: it mounts
  // first, paints (with its own boot spinner running), and the game is built after.
  let reels: Slot | undefined;
  const hud = mountDomHud(SPEC, {
    skin: { href: skinHref, font: { family: 'icomoon', src: iconFont } },
    features: FEATURES,
    onBuy: (id, cost) => {
      const feature = FEATURES.find((f) => f.id === id);
      // A BOOST is not a purchase: it switches on a per-spin surcharge. The bar then
      // says so — a banner names it, the coin becomes DISABLE, and the stake, round
      // button and bet bar take the feature colour — and every spin costs the boosted
      // amount until it is switched off.
      if (feature?.variant === 'boost') {
        ui.clearFeedback(); // the banner owns that line now
        ui.setBetModifier({ id, name: feature.name, cost: feature.cost });
        ui.bet.set(snap(baseBet() * (1 + feature.cost)));
        ui.bet.setEmphasis(true);
        return;
      }
      ui.balance.set(snap(ui.balance.get() - cost));
      void runBonus(id === 'super-spins' ? 15 : 10);
    },
  });
  const ui = hud.ui;
  ui.lock(); // the bar is on screen, but there is nothing behind it to play yet

  hud.setBalance(Number(q.get('balance')) || money0.balance);
  // `?bet=` moves the LADDER, not just the readout: the stake a round costs is the
  // ladder's level, so painting a number the game does not charge is a lie. The
  // nearest declared level wins — a bet the ladder does not offer cannot be played.
  const wantBet = Number(q.get('bet'));
  if (wantBet > 0) {
    let nearest = 0;
    LADDER.forEach((level, i) => {
      if (Math.abs(level - wantBet) < Math.abs((LADDER[nearest] ?? 0) - wantBet)) nearest = i;
    });
    ui.betStepper.setIndex(nearest);
    ui.bet.set(ui.betStepper.value);
  }
  if (Number(q.get('win'))) hud.setWin(Number(q.get('win')));
  hud.setMaxWin(5000, '1 in 1,250,000');
  hud.setHistory([]);

  // ── the game, once the HUD is on screen ──────────────────────────────────
  await painted();
  const [{ Application }, { buildReels, evaluate }] = await Promise.all([import('pixi.js'), import('./reels')]);
  const app = new Application();
  await app.init({ resizeTo: window, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2) });
  document.getElementById('GameWrapper')!.appendChild(app.canvas);
  // One more frame before the reels: `init` alone is a long task on a cheap phone,
  // and cramming the build into the same one drops the frame either way.
  await painted();
  reels = buildReels(app);
  app.stage.addChild(reels.container);

  /** The bar reserves a strip at the bottom of the screen; ask the DOM how tall it is. */
  const barHeight = (): number => document.querySelector('.UiUserPanelWrapper')?.getBoundingClientRect().height ?? 0;
  // The bar reserves a strip at the bottom; the reels get everything above it.
  const layout = (): void => reels?.layout(app.screen.width, app.screen.height, barHeight());
  app.renderer.on('resize', layout);
  layout();
  ui.unlock();
  ui.showFeedback('press_play', { ms: 0 }); // only now is there anything to press play ON
  hud.ready(); // the boot spinner stops when there is a game behind the bar

  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const snap = (n: number): number => Math.round(n * 100) / 100;
  const history: Array<{ date: string; bet: string; win: string; won: boolean }> = [];
  const money = (n: number): string => formatAmount(n, ui.bet.currency.get());

  async function playSpin(): Promise<void> {
    const stake = effectiveBet(); // the surcharge is part of what a spin costs
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
    // The round button goes dim on press and only becomes STOP once the result is
    // in — the same three-phase behaviour the reference has.
    const grid = await reels!.spin(ui.turboBase.isOn, () => ui.spin.stopState());
    const line = evaluate(grid);
    const win = snap(stake * line.win);
    if (win > 0) {
      ui.balance.set(snap(ui.balance.get() + win));
      reels!.celebrate(line.cells);
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
      const grid = await reels!.spin(true); // a bonus always runs at turbo pace, and is not slammable
      const line = evaluate(grid);
      const win = snap(stake * line.win * 2); // free spins pay double in this demo
      total = snap(total + win);
      if (win > 0) {
        ui.balance.set(snap(ui.balance.get() + win));
        reels!.celebrate(line.cells);
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

  /** The base ladder stake, before any modifier surcharge. */
  function baseBet(): number {
    return ui.betStepper.value;
  }
  /** …and what a spin actually costs with the modifier on. */
  function effectiveBet(): number {
    const mod = ui.betModifier.get();
    return snap(baseBet() * (1 + (mod?.cost ?? 0)));
  }
  // Moving the ladder re-prices the boosted stake too.
  ui.betStepper.index.subscribe(() => {
    if (ui.betModifier.get()) queueMicrotask(() => ui.bet.set(effectiveBet()));
  });
  // The coin reads DISABLE while a modifier is on; this is what it does.
  ui.on('buttonActivated', ({ id }: { id: string }) => {
    if (id !== 'disable-modifier') return;
    ui.setBetModifier(null);
    ui.bet.set(baseBet());
    ui.bet.setEmphasis(false);
  });

  ui.on('spinRequested', () => void playSpin());
  ui.on('skipRequested', () => reels?.skip()); // the slam-stop button
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
