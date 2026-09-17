import { mountDomHud, type DomHud } from '@open-slot-ui/dom';
import { composeMenu, parseBlocks, type UISpec, type BlockSpec } from '@open-slot-ui/core';
import { byId, type Story } from './catalogue';
import { RULES_XML, FEATURES } from './fixtures';

/**
 * THE STORY STAGE.
 *
 * One page, one story: `/stories/?id=bar-idle` mounts exactly what the catalogue
 * entry describes and nothing else — no docs chrome, no second HUD, no explanatory
 * text. That is what makes a story embeddable (the gallery iframes this page) and
 * linkable (a bug report can point at the state it happened in).
 */
const params = new URLSearchParams(location.search);
const story: Story | undefined = byId(params.get('id') ?? '');

const BASE_LADDER = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

/** The spec every story starts from — a plain game with everything switched on. */
function baseSpec(story: Story): UISpec {
  const rules: BlockSpec[] = parseBlocks(RULES_XML).blocks;
  const spec: UISpec = {
    currency: story.values?.currency ?? { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 },
    betLadder: { levels: BASE_LADDER, index: 3 },
    autoplay: { options: [10, 25, 50, 100], lossLimits: [5, 20, 50], winLimits: [10, 20, 75] },
    rtp: 96.5,
    game: { name: 'open-slot-ui', version: 'gallery' },
    // The compliance readouts are features a game opts into; a jurisdiction then
    // reveals the ones it mandates (see the `state-jurisdiction` story).
    hud: { features: { superTurbo: true, lobby: true, rtp: true, sessionBar: true } },
    rules,
    facts: {
      modes: [
        { id: 'base', name: 'Base game', kind: 'base', rtp: 96.5, maxWinX: 5000 },
        { id: 'free-spins', name: 'Free Spins', kind: 'buy', cost: 100, rtp: 96.5, maxWinX: 5000 },
        { id: 'super-spins', name: 'Super Spins', kind: 'buy', cost: 300, rtp: 96.5, maxWinX: 5000 },
        { id: 'ante-bet', name: 'Ante Bet', kind: 'boost', cost: 0.25, rtp: 96.5, maxWinX: 5000 },
      ],
      freeSpins: { count: 10, retrigger: false },
      volatility: 'High',
      maxWinCapX: 5000,
    },
    ...story.spec,
  };
  return spec;
}

/** Bet ladders differ wildly by currency; a rial ladder in dollars is nonsense. */
function ladderFor(code: string): number[] {
  if (code === 'IRR') return [50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000];
  if (code === 'mBTC') return [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1];
  return BASE_LADDER;
}

function mount(story: Story): DomHud {
  const spec = baseSpec(story);
  const code = (typeof spec.currency === 'object' ? spec.currency.code : spec.currency) ?? 'USD';
  const levels = ladderFor(code);
  spec.betLadder = { levels, index: Math.min(3, levels.length - 1) };

  const hud = mountDomHud(spec, {
    skin: { href: '/skin/ui.min.css', font: { family: 'icomoon', src: '/skin/ui/fonts/icons/icomoon.woff2' } },
    features: FEATURES,
    info: composeMenu(spec.menu, { rulesFallback: spec.rules }),
  });

  const ui = hud.ui;
  const v = story.values ?? {};
  hud.setBalance(v.balance ?? 12_345.67);
  if (v.bet != null) ui.bet.set(v.bet);
  hud.setWin(v.win ?? 0);
  hud.setTotalWin(v.totalWin ?? 0);
  hud.setMaxWin(5000, '1 in 1,250,000');
  hud.setHistory([]);
  hud.ready();
  return hud;
}

/** The little scripts a story can ask for, by name. Each one is a real API call. */
const SCRIPTS: Record<string, (hud: DomHud) => void> = {
  spin: (hud) => { hud.setHudState('play'); hud.ui.spin.busy(); },
  slam: (hud) => { hud.setHudState('play'); hud.ui.spin.busy(); hud.ui.spin.stopState(); },
  win: (hud) => { hud.setHudState('idle'); hud.showFeedback('nice_win'); },
  bonus: (hud) => { hud.setHudState('featurePlay'); hud.setFreeSpins(7); },
  autoplay: (hud) => { hud.ui.autoplay.start(25); },
  lock: (hud) => { hud.ui.lock(); },
  menu: (hud) => { document.getElementById('MainMenuToggle')?.click(); void hud; },
  'autoplay-panel': () => { document.getElementById('AutoplayBtn')?.click(); },
  info: () => {
    document.getElementById('MainMenuToggle')?.click();
    document.getElementById('GameInfoBtn')?.click();
  },
  buy: () => { document.getElementById('FeatureBuyToggle')?.click(); },
  history: (hud) => {
    hud.setHistory([
      { date: '12:04', bet: '$1.00', win: '$24.50', won: true },
      { date: '12:03', bet: '$1.00', win: '$0.00', won: false },
      { date: '12:03', bet: '$2.00', win: '$0.00', won: false },
      { date: '12:02', bet: '$2.00', win: '$310.00', won: true },
    ]);
    document.getElementById('MainMenuToggle')?.click();
    document.getElementById('BetHistoryBtn')?.click();
  },
  error: (hud) => { hud.showRgsError('ERR_IPB'); },
  notice: (hud) => { hud.showFeedback('insufficient_funds', { tone: 'warn' }); },
  modifier: (hud) => {
    hud.ui.setBetModifier({ id: 'ante-bet', name: 'Ante Bet', cost: 0.25 });
    hud.ui.bet.set(1.25);
    hud.ui.bet.setEmphasis(true);
  },
  'no-funds': (hud) => { hud.showFeedback('insufficient_funds', { tone: 'warn' }); },
  jurisdiction: (hud) => {
    hud.applyJurisdiction({ displayRTP: true, displayNetPosition: true, displaySessionTimer: true, disabledTurbo: true, disabledSlamstop: true });
    hud.reportRound(0, 1);
  },
  'round-cycle': (hud) => {
    // Walk the three phases on a loop so the difference is visible standing still.
    const ui = hud.ui;
    let phase = 0;
    setInterval(() => {
      phase = (phase + 1) % 3;
      if (phase === 0) { ui.spin.idle(); hud.setHudState('idle'); }
      if (phase === 1) { hud.setHudState('play'); ui.spin.busy(); }
      if (phase === 2) ui.spin.stopState();
    }, 1600);
  },
};

/**
 * Tell the gallery WHERE the part this story is about ended up.
 *
 * The zoom happens in the parent page, on the iframe element — never in here. A
 * transform on the HUD would move the ground under the skin's fixed positioning
 * (a transformed ancestor becomes the containing block), so the bar would chase
 * its own tail. Scaling the frame from outside leaves the layout untouched.
 */
function reportFocus(selector: string): void {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target || parent === window) return;
  const b = target.getBoundingClientRect();
  if (b.width < 1 || b.height < 1) return;
  parent.postMessage({ type: 'ohm-focus', id: story?.id, rect: { x: b.left, y: b.top, w: b.width, h: b.height } }, '*');
}

if (!story) {
  document.body.innerHTML = '<p style="font:600 14px system-ui;color:#888;padding:24px">No such story. Try <a href="/gallery/">the gallery</a>.</p>';
} else {
  const hud = mount(story);
  // A story is a place to poke at the HUD: `hud` and `hud.ui` are on the window, the
  // same handle the game would hold.
  (globalThis as { hud?: DomHud }).hud = hud;
  const run = SCRIPTS[story.script ?? ''];
  // One frame, so the script acts on a HUD that has been laid out and revealed.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (run) run(hud);
      if (story.focus) reportFocus(story.focus);
    }),
  );
  document.title = `${story.title} — open-ui gallery`;
}
