import { Application, Assets, Container, Graphics, Rectangle, Texture } from 'pixi.js';
import { mountHud, mountBuyFeatureModal } from '@open-slot-ui/pixi';
import { resolveBetLadder } from '@open-slot-ui/core';
import type { UISpec, CurrencySpec, ThemePreset, JurisdictionConfig } from '@open-slot-ui/core';
import { MESSAGES } from './locales';
import { RULES_BLOCKS, FEATURES, FACTS } from './content';
import { mountHarness } from './harness';
import { buildReels, evaluate } from './reels';

/**
 * The open-ui EXAMPLE CLIENT — a throwaway host "game" (a shuffling pip grid) with
 * the real @open-ui HUD mounted on top in ONE call. Everything the HUD looks and
 * behaves like is set by a plain JSON UISpec, here read from the URL so the
 * Playwright suites can screenshot every permutation:
 *
 *   ?autoplay=infinite&spin=hold&currency=BTC&locale=ja&bare=1
 *   ?accent=%23ff0000   (recolour the one b&w+yellow theme — a broken value can't break it)
 */

const q = new URLSearchParams(location.search);
if (q.get('bare') === '1') document.body.classList.add('bare');

// Each entry exercises a different facet: symbol-vs-code display, the minimal-unit
// precision (decimals after the .), and big numbers that make the counter auto-scale.
// The `ladder` is what a real game gets from authenticate — used VERBATIM (Stake:
// never filter the true minimum; USD floors at $0.01, so a ×0.2 win = $0.002).
//   ?currency=USD|EUR|mBTC|SATS|BTC
const CURRENCIES: Record<string, { spec: CurrencySpec; balance: number; bet: number; ladder: number[] }> = {
  // symbol display ($ sits tight before the number) · 2-decimal minor unit
  USD: { spec: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 }, balance: 12345.67, bet: 1, ladder: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20] },
  EUR: { spec: { code: 'EUR', symbol: '€', display: 'symbol', position: 'prefix', decimals: 2, decimalChar: ',', separator: '.' }, balance: 12345.67, bet: 1, ladder: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20] },
  // crypto CODES (no symbol) with different minimal units → different decimals,
  // and wide values that trigger the counter's auto-downscale.
  mBTC: { spec: { code: 'mBTC', decimals: 5 }, balance: 1234.56789, bet: 0.01, ladder: [0.001, 0.01, 0.1, 1, 10] },
  SATS: { spec: { code: 'SATS', decimals: 0 }, balance: 123456789, bet: 100, ladder: [100, 500, 1000, 5000, 10000] },
  BTC: { spec: { code: 'BTC', symbol: '₿', display: 'symbol', position: 'prefix', decimals: 8 }, balance: 1.23456789, bet: 0.0001, ladder: [0.0001, 0.0005, 0.001, 0.005, 0.01] },
};

const cfg = {
  // open-ui ships ONE theme — black & white with a yellow accent. `?accent=` recolours it.
  theme: 'default' as ThemePreset,
  accent: q.get('accent') ?? undefined,
  // ?turbo=3 → 3-mode switcher (off/turbo/super); default 2-mode (off/on).
  turbo: (q.get('turbo') === '3' ? 3 : 2) as 2 | 3,
  autoplay: q.get('autoplay') === 'infinite' ? ('infinite' as const) : ('options' as const),
  spin: q.get('spin') === 'hold' ? ('hold-to-spin' as const) : ('tap' as const),
  currency: (q.get('currency') && CURRENCIES[q.get('currency')!] ? q.get('currency')! : 'USD'),
  locale: q.get('locale') && MESSAGES[q.get('locale')!] ? q.get('locale')! : 'en',
  // buy-feature: ?activation=single|multi (default multi) · ?blockbuy=1
  activation: (q.get('activation') === 'single' ? 'single' : 'multi') as 'single' | 'multi',
  blockBuy: q.get('blockbuy') === '1',
  // reality-check interval in minutes (?reality=0.2 ≈ 12s, for demoing); replay mode
  reality: Number(q.get('reality')) || 0,
  replay: q.get('replay') === '1',
  // ?balance=98765432.1 · ?bet=12500 → override the starting balance/bet (test big
  // values stay bounded inside their box and never overflow onto a neighbour).
  balance: Number(q.get('balance')) || 0,
  bet: Number(q.get('bet')) || 0,
  // ?fs=12 → switch the spin button to its free-spins face; ?fatal=1 → blocking modal
  fs: Number(q.get('fs')) || 0,
  fatal: q.get('fatal') === '1',
  // initial HUD visibility: ?intro=shown|hidden|slide-in (default shown)
  intro: (['hidden', 'slide-in'].includes(q.get('intro') ?? '') ? q.get('intro') : 'shown') as 'shown' | 'hidden' | 'slide-in',
  // ?builtin=1 → drop the demo's host art and mount the LIBRARY's built-in default
  // icon set from `@open-slot-ui/pixi/art` (tree-shakeable) instead.
  builtin: q.get('builtin') === '1',
  // ?totalwin=25.5 → seed a bonus total-win value (shown while in free-spins mode).
  totalWin: Number(q.get('totalwin')) || 0,
  // ?forget=1 → "forget" declarations on purpose: the mode-stats grid + the feature
  // prose are dropped and the free-spins facts go undeclared, so the rules audit's
  // explicit warning card shows when the rules open.
  forget: q.get('forget') === '1',
};

/** Parse `?juris=rtp,net,timer,noturbo,noslam,…` into a Stake Engine JurisdictionConfig
 *  (a demo knob — a real game gets this from the RGS authenticate response). Defaults
 *  to showing the three compliance readouts so they're visible out of the box. */
function parseJurisdiction(raw: string | null): JurisdictionConfig {
  const f = new Set((raw ?? 'rtp,net,timer').split(',').map((s) => s.trim()).filter(Boolean));
  return {
    displayRTP: f.has('rtp'),
    displayNetPosition: f.has('net'),
    displaySessionTimer: f.has('timer'),
    disabledTurbo: f.has('noturbo'),
    disabledAutoplay: f.has('noauto'),
    disabledSlamstop: f.has('noslam'),
    disabledSpacebar: f.has('nohold'),
    disabledBuyFeature: f.has('nobuy'),
    disabledFullscreen: f.has('nofs'),
    socialCasino: f.has('social'),
  };
}
const JURISDICTION = parseJurisdiction(q.get('juris'));

/** The whole HUD as one config object — the public surface a real slot would ship. */
function buildSpec(): UISpec {
  const cur = CURRENCIES[cfg.currency]!;
  // ?forget=1 drops the auto stats grid + two whole feature sections, and undeclares
  // the free-spins facts — the rules audit then lists exactly what was "forgotten"
  // (missing per-mode sections included).
  const FORGOTTEN = new Set(['r-stats', 'r-f-ss-h', 'r-f-ss', 'r-f-ab-h', 'r-f-ab']);
  const rules = cfg.forget ? RULES_BLOCKS.filter((b) => !FORGOTTEN.has(b.id)) : RULES_BLOCKS;
  const facts = cfg.forget ? { ...FACTS, freeSpins: undefined } : FACTS;
  // ?off=buyFeature,history,… switches ribbon features OFF; ?on=… switches them on.
  // (A misspelled flag is reported to onDataIssue and ignored — try ?off=nope.)
  const features: Record<string, boolean> = {};
  for (const id of (q.get('off') ?? '').split(',').filter(Boolean)) features[id] = false;
  for (const id of (q.get('on') ?? '').split(',').filter(Boolean)) features[id] = true;

  return {
    // The bar itself: where it docks, how big it is, and WHICH PARTS EXIST.
    hud: {
      dock: q.get('dock') === 'top' ? 'top' : 'bottom',
      scale: Number(q.get('hudscale')) || undefined,
      reveal: (q.get('reveal') as 'drop' | 'rotate' | 'spin' | 'twist' | 'none') || undefined,
      ...(Object.keys(features).length ? { features } : {}),
    },
    // The Figma "default" look is set in Montserrat (Black for the HUD figures). A bad
    // ?accent is sanitized away (the preset accent shows through) — never broken.
    theme: {
      preset: cfg.theme,
      overrides: { type: { family: '"Montserrat", system-ui, sans-serif' }, ...(cfg.accent ? { color: { accent: cfg.accent } } : {}) },
    },
    currency: cur.spec,
    // The authenticate ladder VERBATIM (no sub-unit filtering; USD floors at $0.01),
    // snapped to the currency's default bet — exactly what a real game does.
    betLadder: resolveBetLadder(cur.ladder, cur.bet),
    // Turbo is a 2-mode (off/on) toggle — the only supported mode for now.
    turbo: { modes: cfg.turbo },
    // Autoplay is host-configurable: the spin-count options always show; the two RG
    // fields (stop-on-loss / stop-on-single-win) only appear when you pass them.
    autoplay: { mode: cfg.autoplay, options: [5, 10, 25, 50, 100, Infinity], lossLimits: [5, 10, 25, 50, Infinity], winLimits: [10, 25, 50, 100, Infinity] },
    spin: { press: cfg.spin },
    // Stake Engine compliance: an RTP figure + the jurisdiction switchboard (the demo
    // reads ?juris=…; a real game gets this from the RGS authenticate response).
    rtp: 96,
    jurisdiction: JURISDICTION,
    game: { name: 'Scrolls of Fate', version: '1.0.0' },
    // What the game HAS, as data: modes + RTP/max win, free spins, volatility, cap.
    // Drives the rules' auto mode-stats grid + the completeness audit.
    facts,
    realityCheck: cfg.reality > 0 ? { everyMinutes: cfg.reality } : undefined,
    // Layout is the LIBRARY default (the Figma "Desk DEF" desktop bar + the
    // "Mobile DEF" portrait reflow ship as built-ins since v0.3.0) — the demo
    // sets no layouts at all, proving the zero-config HUD lands right on every
    // viewport. Only reveal the buy button: this demo HAS a buy feature.
    controls: {
      bonus: { hidden: false },
    },
    // The unified ☰ menu — every part is a modular, configurable BLOCK: a banner
    // image, a divider+settings, a multiplier paytable with symbol icons, and rules
    // with bold inline text + a stat grid + a callout. All localizable; images use
    // placehold.co so the desired dimensions/resolutions show even offline.
    menu: {
      banner: { src: 'https://placehold.co/1000x120/1f2430/ffd166?text=Scrolls+of+Fate', width: 1000, height: 120 },
      // The lib's info menu already ships Sound + volume sliders + Language + Quick
      // spin (turbo) — only truly custom settings go here.
      settings: [
        { kind: 'select', id: 'gfx', label: 'Graphics', index: 2, options: [
          { value: 'low', label: 'Low' }, { value: 'med', label: 'Medium' }, { value: 'high', label: 'High' },
        ], hint: 'Rendering quality. Lower it on older devices.' },
      ],
      // A 3-column multiplier grid with symbol icons (placehold.co → real dimensions).
      paytable: [
        { kind: 'paytable', id: 'pt', columns: 3, rows: [
          { symbol: 'Wild', icon: 'https://placehold.co/72x72/ef4444/ffffff?text=W', payouts: '8-9: 10.00x\n10-11: 25.00x\n12+: 50.00x' },
          { symbol: 'Scatter', icon: 'https://placehold.co/72x72/3b82f6/ffffff?text=S', payouts: '8-9: 8.00x\n10-11: 20.00x\n12+: 40.00x' },
          { symbol: 'Star', icon: 'https://placehold.co/72x72/f59e0b/000000?text=ST', payouts: '8-9: 6.00x\n10-11: 15.00x\n12+: 30.00x' },
          { symbol: 'Ace', icon: 'https://placehold.co/72x72/22c55e/ffffff?text=A', payouts: '8-9: 5.00x\n10-11: 12.00x\n12+: 25.00x' },
          { symbol: 'King', icon: 'https://placehold.co/72x72/a855f7/ffffff?text=K', payouts: '8-9: 2.00x\n10-11: 6.00x\n12+: 12.00x' },
          { symbol: 'Queen', icon: 'https://placehold.co/72x72/ec4899/ffffff?text=Q', payouts: '8-9: 1.50x\n10-11: 4.00x\n12+: 8.00x' },
        ] },
      ],
      // A rich rules section showing off the whole block palette — defined once in
      // content.ts, fully localized (the English text doubles as the i18n key).
      rules,
    },
    // 10-locale dictionary + starting locale; a Language switch appears in Settings.
    locale: { messages: MESSAGES, locale: cfg.locale },
    // No `responsive` either: the built-in portrait bucket (Figma "Mobile DEF")
    // reflows the HUD on phones out of the box.
  };
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0, // transparent canvas → the page's themed background shows through
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);
  app.canvas.style.outline = 'none';

  // Make sure the Montserrat faces are loaded before any Pixi Text is measured, so the
  // balance/bet odometer + labels + readouts get correct glyph metrics from the start.
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('400 12px "Montserrat"'),
      document.fonts.load('900 48px "Montserrat"'),
    ]).catch(() => undefined);
  }

  const reels = buildReels(app);
  app.stage.addChild(reels.container);

  // Money math snaps float noise at 8 dp — NEVER to the display decimals: a $0.01 bet
  // × a ×0.2 face is a real $0.002 win, and the HUD's auto-precision shows it in full.
  const snap = (x: number): number => Math.round(x * 1e8) / 1e8;

  // The ribbon draws its own icons as vectors, so the demo loads only the art its
  // MENU content uses (the slider tracks + the rules glyph).
  const load = async (src: string): Promise<Texture> => {
    const t = await Assets.load<Texture>({ src, data: { resolution: 3 } });
    t.source.autoGenerateMipmaps = true;
    t.source.style.scaleMode = 'linear';
    t.source.style.mipmapFilter = 'linear';
    t.source.update();
    return t;
  };
  await load('/icons/rules.svg');

  // ---- mount the whole HUD in ONE call (Charter B9) ----
  // The library's white HTML info menu (Settings · Paytable · Rules + the rules
  // audit) mounts by default — no host menu code at all.
  const hud = mountHud(app, buildSpec(), {
    expose: true,
    intro: cfg.intro, // ?intro=shown|hidden|slide-in
    onBuy: () => ui.bus.emit('buttonActivated', { id: 'bonus' }),
  });
  const ui = hud.ui;
  // Buy-feature modal (opened by the bonus coin). Buying CLOSES it and the host
  // deducts the cost + would start the feature; activating a bet boost keeps it
  // open. Activation is configurable (single/multi, blocks-buy) via the URL.
  mountBuyFeatureModal(app, hud, FEATURES, {
    activation: cfg.activation,
    activationBlocksBuy: cfg.blockBuy,
    onBuy: (id, cost) => {
      ui.balance.set(Math.max(0, snap(ui.balance.get() - cost))); // deduct
      // a real game runs the bought feature — here the "buy" variants start free spins.
      if (id === 'free-spins') enterBonus(10);
      else if (id === 'super-spins') enterBonus(15);
    },
    // Activating a bet boost applies its surcharge → boosted stake + accent net/bet.
    onActivate: (activeIds) => setBoosts(activeIds),
  });

  const start = CURRENCIES[cfg.currency]!;
  ui.balance.set(cfg.balance || start.balance);
  if (cfg.bet > 0) ui.bet.set(cfg.bet);
  if (cfg.replay) hud.setReplay(true); // ?replay=1 → REPLAY badge + locked HUD
  // Prefer the postMessage harness (below) to drive states; ?fs is kept as a shortcut.
  if (cfg.fs > 0) {
    enterBonus(cfg.fs);
    hud.setTotalWin(cfg.totalWin || start.bet * 12.5);
  }
  if (cfg.fatal) hud.showFatal('Your session has expired. Reload the game to continue.', { title: 'openui.err.session.title' });

  // ---- talk to it from the outside: events out, façade in ----
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const turboEngaged = (): boolean => ui.turbo.isOn;

  // ---- bet BOOSTS (buy-feature "Activate" toggles) ----
  // A boost is a per-spin surcharge (`cost × bet`): while any is active the EFFECTIVE
  // stake is boosted, the bet display shows that boosted number in accent, and the NET
  // position readout turns accent too (it's now accruing on a modified stake).
  const activeBoosts = new Map<string, number>(); // id → surcharge fraction
  const boostSurcharge = (): number => [...activeBoosts.values()].reduce((a, b) => a + b, 0);
  const baseBet = (): number => ui.betStepper.value;
  const effectiveBet = (): number => snap(baseBet() * (1 + boostSurcharge()));
  function refreshBoost(): void {
    const on = boostSurcharge() > 0;
    ui.bet.set(on ? effectiveBet() : baseBet()); // show the modified stake
    ui.bet.setEmphasis(on); // …in accent
    ui.netPosition.setEmphasis(on); // net is now on a modified stake → accent it too
  }
  function setBoosts(ids: string[]): void {
    activeBoosts.clear();
    for (const fid of ids) {
      const f = FEATURES.find((x) => x.id === fid);
      if (f?.variant === 'boost') activeBoosts.set(fid, f.cost);
    }
    refreshBoost();
  }
  // The stepper re-sets ui.bet to the BASE ladder value on change; re-apply the boost
  // AFTER (microtask = after open-ui's own synchronous stepperChanged handler).
  ui.on('valueChanged', ({ id }) => {
    if (id === 'bet-stepper') queueMicrotask(refreshBoost);
  });

  // ---- FREE-SPINS (bonus) cycle ----
  // Enter → the spin button shows "N FS" + the buy button becomes the total-win
  // counter; each free spin decrements N and tallies its win; at 0 it EXITS back to
  // base play (buy button returns) — so it's never "stuck in FS".
  function enterBonus(count: number): void {
    hud.setTotalWin(0);
    hud.setFreeSpins(Math.max(0, Math.floor(count)));
  }
  function exitBonus(): void {
    hud.setFreeSpins(0);
  }

  /** One round, driven by the host. `turbo` shortens the reel spin. In a bonus the
   *  spin is FREE (stake 0), tallies into the total-win, and steps the FS count down. */
  async function playSpin(turbo = turboEngaged()): Promise<void> {
    const inBonus = ui.spin.freeSpins.get() > 0;
    const stake = inBonus ? 0 : effectiveBet(); // free spins cost nothing; base spins stake the boosted bet
    hud.setWin(0); // the WIN readout clears as the round starts
    hud.setHudState(inBonus ? 'featurePlay' : 'play');
    ui.spin.busy();
    if (stake > 0) ui.balance.set(snap(ui.balance.get() - stake));
    // TURBO is the HUD's switch; the reels take the faster speed profile from it.
    // Dim on press, STOP once the result lands — the reference's three phases.
    const grid = await reels.spin(turbo, () => ui.spin.stopState());
    // The demo's paytable: 3+ matching on the centre row, wilds standing in.
    const line = evaluate(grid);
    const win = snap(effectiveBet() * line.win);
    if (win > 0) {
      ui.balance.set(snap(ui.balance.get() + win));
      reels.celebrate(line.cells);
    }
    hud.setWin(win); // counts up on the bar
    hud.setHudState(inBonus ? 'featurePlay' : win > 0 ? 'winPresentation' : 'result');
    history.unshift({ date: new Date().toLocaleTimeString(), bet: money(stake), win: money(win), won: win > 0 });
    hud.setHistory(history.slice(0, 40));
    if (inBonus) {
      hud.setTotalWin(snap(ui.totalWin.get() + win)); // running bonus tally
      hud.setFreeSpins(ui.spin.freeSpins.get() - 1); // decrement → auto-exits at 0
    }
    // feed the settled round to the HUD → net-position readout + autoplay RG limits
    ui.reportRound(win, stake);
  }

  // The bar's history window + max-win widget are host data — the demo fakes both.
  const history: Array<{ date: string; bet: string; win: string; won: boolean }> = [];
  const money = (n: number): string => `${CURRENCIES[cfg.currency]!.spec.symbol ?? ''}${n.toFixed(2)}`;
  hud.setMaxWin(5000, '1 in 1,250,000');
  ui.showFeedback('openui.pressPlay', { ms: 0 });

  ui.on('spinRequested', async () => {
    // Stake Engine error UX: block + surface insufficient funds in a menu-style modal.
    if (ui.balance.get() < ui.bet.get()) {
      hud.showRgsError('ERR_IPB'); // default localized message (override per-call if you like)
      return;
    }
    await playSpin();
    ui.spin.stopState();
    await wait(turboEngaged() ? 120 : 420);
    ui.spin.idle();
    hud.setHudState('idle');
  });
  ui.on('skipRequested', () => reels.skip());

  // autoplay: the host runs the loop; open-ui owns the picker, the live count, AND the
  // RG limits — each round is fed back via playSpin → ui.reportRound, which decrements
  // the count and stops autoplay on the loss / single-win limits picked in the drawer.
  ui.on('autoplayStarted', async () => {
    while (ui.autoplay.isActive) {
      if (ui.balance.get() < ui.bet.get()) {
        ui.autoplay.stop();
        break;
      }
      await playSpin();
      ui.spin.idle();
      await wait(turboEngaged() ? 120 : 240);
    }
  });

  // hold-to-spin: turbo-spin on a loop while the button is held
  let holding = false;
  ui.on('holdSpinStarted', async () => {
    holding = true;
    while (holding) {
      await playSpin(true);
      ui.spin.idle();
      await wait(90);
    }
  });
  ui.on('holdSpinStopped', () => {
    holding = false;
  });

  // Spin via Spacebar/Enter is handled inside the library (the only keyboard input);
  // the demo registers no extra key shortcuts.

  (window as unknown as Record<string, unknown>).ui = ui;
  (window as unknown as Record<string, unknown>).app = app;

  // ---- declarative postMessage harness (drive any state without URL params) ----
  const startBal = CURRENCIES[cfg.currency]!.balance;
  mountHarness({
    setBalance: (n) => ui.balance.set(Number(n)),
    setBet: (n) => ui.bet.set(Number(n)),
    setTotalWin: (n) => hud.setTotalWin(Number(n)),
    setLocale: (loc) => ui.setLocale(String(loc)),
    setCurrency: (code) => CURRENCIES[String(code)] && hud.setCurrency(CURRENCIES[String(code)]!.spec),
    enterBonus: (n = 10) => enterBonus(Number(n)),
    exitBonus: () => exitBonus(),
    setBoosts: (ids) => setBoosts((ids as string[]) ?? []),
    clearBoosts: () => setBoosts([]),
    spin: () => playSpin(),
    openMenu: () => ui.settingsPanel.openPanel(),
    closeMenu: () => ui.settingsPanel.closePanel(),
    openBuyFeature: () => ui.bus.emit('buttonActivated', { id: 'bonus' }),
    setReplay: (on) => hud.setReplay(on === true),
    reset: () => {
      exitBonus();
      setBoosts([]);
      ui.balance.set(startBal);
      hud.setTotalWin(0);
      ui.settingsPanel.closePanel();
      ui.netPosition.setEmphasis(false);
    },
    // introspection for declarative assertions (no pixel-diff needed)
    snapshot: () => ({
      freeSpins: ui.spin.freeSpins.get(),
      balance: ui.balance.get(),
      bet: ui.bet.get(),
      totalWin: ui.totalWin.get(),
      netEmphasized: ui.netPosition.emphasized.get(),
      betEmphasized: ui.bet.emphasized.get(),
      locale: ui.locale.get(),
      boosts: [...activeBoosts.keys()],
    }),
  });

  // center the reels on resize
  // The ribbon reserves a strip at the bottom; the reels fill what is left above it.
  const layoutReels = (): void => reels.layout(app.screen.width, app.screen.height, hud.pixi.barHeight);
  app.renderer.on('resize', () => {
    layoutReels();
  });
  layoutReels();

}

/** A throwaway placeholder "game": a 5×3 grid that shuffles while spinning. */
void main();
