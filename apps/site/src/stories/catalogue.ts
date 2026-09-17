import type { UISpec, CurrencySpec } from '@open-slot-ui/core';

/**
 * THE GALLERY'S CATALOGUE.
 *
 * One entry per thing worth looking at on its own: a bar state, a control, a
 * window, a piece of money that misbehaves. Each story is data — a spec, a set of
 * values and a short script — so the page that renders it (`stage.ts`) is the only
 * code that knows how to mount, and every story is the SAME HUD the client ships.
 *
 * A story's `id` is its URL: `/stories/?id=bar-idle` shows it alone, which is what
 * the gallery embeds and what a bug report should link to.
 */
export type StoryGroup = 'bar' | 'controls' | 'windows' | 'money' | 'states';

export interface Story {
  id: string;
  title: string;
  /** One line: what this shows, and what to look at. */
  blurb: string;
  group: StoryGroup;
  /** Height of the frame the gallery gives it, in px. */
  height?: number;
  /** Render it at phone width instead of desktop. */
  phone?: boolean;
  /** Spec overlay merged over the gallery's base spec. */
  spec?: Partial<UISpec>;
  /** Money + readouts to set before the story is shown. */
  values?: { balance?: number; bet?: number; win?: number; totalWin?: number; currency?: CurrencySpec };
  /** What to do once it is mounted — open a window, enter a state, lock it. */
  script?: string;
  /**
   * Zoom the frame onto one part of the bar — the control this story is about.
   * The whole HUD is still mounted and live; the frame just looks closer.
   */
  focus?: string;
  /** The source line a reader should copy. */
  code?: string;
}

const USD: CurrencySpec = { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 };
const IRR: CurrencySpec = { code: 'IRR', decimals: 0, separator: ',' };
const MBTC: CurrencySpec = { code: 'mBTC', decimals: 5 };

export const STORIES: Story[] = [
  // ── the bar ───────────────────────────────────────────────────────────────
  {
    id: 'bar-idle',
    title: 'The bar, at rest',
    blurb: 'Everything the player sees between rounds: balance, stake with its ladder, win, the round button, and the two coins that hang off the plate.',
    group: 'bar',
    code: `const hud = mountDomHud(spec, { skin: { href: '/skin/ui.min.css' } });`,
  },
  {
    id: 'bar-spinning',
    title: 'Spinning — before the answer',
    blurb: 'The round button has dimmed but is NOT a stop button yet: nothing can be slammed until the server has answered.',
    group: 'bar',
    script: 'spin',
    code: `ui.spin.busy();            // the arrow dims — the round is on its way`,
  },
  {
    id: 'bar-slam',
    title: 'Spinning — slam to stop',
    blurb: 'The answer is in, so the same button becomes STOP. One button, three phases, never two buttons at once.',
    group: 'bar',
    script: 'slam',
    code: `ui.spin.stopState();       // the result arrived — now it can be slammed`,
  },
  {
    id: 'bar-win',
    title: 'A win on the bar',
    blurb: 'The win readout carries the round; the stake and balance stay where they were.',
    group: 'bar',
    values: { win: 245.5 },
    script: 'win',
    code: `hud.setWin(245.5);`,
  },
  {
    id: 'bar-bonus',
    title: 'Free spins',
    blurb: 'A feature round swaps the readouts: TOTAL WIN and the spins left replace WIN, and the buy coin goes away — you cannot buy into a bonus you are in.',
    group: 'bar',
    values: { totalWin: 1280 },
    script: 'bonus',
    code: `hud.setFreeSpins(7);
hud.setTotalWin(1280);`,
  },
  {
    id: 'bar-autoplay',
    title: 'Autoplay running',
    blurb: 'An autoplay run is a state of its own: the bet changers and menu rows dim, and the round button counts the rounds down.',
    group: 'bar',
    script: 'autoplay',
    code: `ui.autoplay.start(25);`,
  },
  {
    id: 'bar-locked',
    title: 'Locked',
    blurb: 'What the bar looks like while something else owns the screen — a window, a replay, a round the host has not finished settling.',
    group: 'bar',
    script: 'lock',
    code: `ui.lock();   // ref-counted: every lock needs its unlock`,
  },
  {
    id: 'bar-phone',
    title: 'The bar on a phone',
    blurb: 'The same markup and the same code: the skin reflows it into the touch layout, readouts under the controls.',
    group: 'bar',
    phone: true,
    height: 420,
    code: `// nothing — the channel is decided from the viewport and pointer`,
  },

  // ── controls ──────────────────────────────────────────────────────────────
  {
    id: 'control-round',
    title: 'The round button',
    blurb: 'Idle, in-flight, and slam-to-stop. Click it to walk the three phases the way a round does.',
    group: 'controls',
    height: 260,
    focus: '.ActionPanel__container--game-actions',
    script: 'round-cycle',
    code: `ui.spin.busy();  ui.spin.stopState();  ui.spin.idle();`,
  },
  {
    id: 'control-bet',
    title: 'The stake, and its ladder',
    blurb: 'The bet widget only ever offers levels the game declared; the bar under it shows how far up the ladder this stake sits.',
    group: 'controls',
    height: 260,
    focus: '.BetAmountWidget',
    code: `betLadder: { levels: [0.1, 0.2, 0.5, 1, 2, 5, 10], index: 3 }`,
  },
  {
    id: 'control-buy',
    title: 'The buy coin',
    blurb: 'The coin that hangs off the left of the plate. It opens the buy sheet — and reads DISABLE while a bet modifier is on.',
    group: 'controls',
    height: 260,
    focus: '.ToggleButton__container--feature-buy',
    code: `mountDomHud(spec, { features: [{ id: 'free-spins', name: 'Free Spins', cost: 100, variant: 'buy' }] });`,
  },
  {
    id: 'control-menu-toggle',
    title: 'The ☰ menu',
    blurb: 'Sound, music, turbo, history, info, home. Click the burger — the rows are the ones the spec left switched on.',
    group: 'controls',
    height: 420,
    script: 'menu',
    code: `hud: { features: { sound: true, music: true, turbo: true, history: true, info: true } }`,
  },
  {
    id: 'control-autoplay-panel',
    title: 'The autoplay panel',
    blurb: 'Rounds, the total they cost, and — under ADVANCED — the loss and single-win limits a jurisdiction asks for.',
    group: 'controls',
    height: 460,
    script: 'autoplay-panel',
    code: `autoplay: { options: [10, 25, 50, 100], lossLimits: [5, 20, 50], winLimits: [10, 20, 75] }`,
  },

  // ── windows ───────────────────────────────────────────────────────────────
  {
    id: 'window-info',
    title: 'The info window',
    blurb: 'The rules, rendered from blocks. Everything is on the page — nothing collapses, nothing hides behind a tab.',
    group: 'windows',
    height: 560,
    script: 'info',
    code: `mountDomHud(spec, { info: composeMenu(spec.menu, { rulesFallback: spec.rules }) });`,
  },
  {
    id: 'window-buy',
    title: 'The buy sheet',
    blurb: 'Every configured feature as a card, priced at the live stake, with its own BET selector and a confirm step for the expensive ones.',
    group: 'windows',
    height: 560,
    script: 'buy',
    code: `features: [{ id: 'free-spins', name: 'Free Spins', cost: 100, variant: 'buy', image: '…' }]`,
  },
  {
    id: 'window-history',
    title: 'Bet history',
    blurb: 'What the player staked and what came back, as the host reported it.',
    group: 'windows',
    height: 520,
    script: 'history',
    code: `hud.setHistory([{ date: '12:04', bet: '$1.00', win: '$24.50', won: true }]);`,
  },
  {
    id: 'window-error',
    title: 'A blocking error',
    blurb: 'The RGS said no. One modal, the host’s own text or a localized default, with the actions the host passes.',
    group: 'windows',
    height: 480,
    script: 'error',
    code: `hud.showRgsError('ERR_IPB');   // …or hud.showError('Session expired.', { actions })`,
  },
  {
    id: 'window-notice',
    title: 'A notice',
    blurb: 'The non-blocking kind: it says its piece on the bar and gets out of the way.',
    group: 'windows',
    height: 320,
    script: 'notice',
    code: `hud.showFeedback('insufficient_funds', { tone: 'warn' });`,
  },

  // ── money ─────────────────────────────────────────────────────────────────
  {
    id: 'money-usd',
    title: 'Dollars',
    blurb: 'The easy case, for comparison: two decimals, a symbol in front.',
    group: 'money',
    height: 260,
    focus: '.DataPanel',
    values: { currency: USD, balance: 12345.67, bet: 1, win: 24.5 },
    code: `currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 }`,
  },
  {
    id: 'money-irr',
    title: 'Rial — no decimals, twelve digits',
    blurb: 'The readouts size themselves off their own length, so the plate keeps its geometry and the round button stays on the screen.',
    group: 'money',
    height: 260,
    values: { currency: IRR, balance: 98765432100000, bet: 5000000, win: 25000000000000 },
    code: `currency: { code: 'IRR', decimals: 0 }   // the value decides its own font size`,
  },
  {
    id: 'money-mbtc',
    title: 'mBTC — five decimals',
    blurb: 'Long rather than large. The precision is the currency’s, never the formatter’s guess.',
    group: 'money',
    height: 260,
    focus: '.DataPanel',
    values: { currency: MBTC, balance: 1234.56789, bet: 0.05, win: 98765.4321 },
    code: `currency: { code: 'mBTC', decimals: 5 }`,
  },

  // ── states worth testing ──────────────────────────────────────────────────
  {
    id: 'state-modifier',
    title: 'A bet modifier is on',
    blurb: 'An ante or a boost is not a purchase: the bar says so, the stake carries the surcharge, and the coin becomes DISABLE.',
    group: 'states',
    script: 'modifier',
    code: `ui.setBetModifier({ id: 'ante-bet', name: 'Ante Bet', cost: 0.25 });`,
  },
  {
    id: 'state-no-funds',
    title: 'Not enough to play',
    blurb: 'The balance is under the stake: the round button refuses and the bar says why.',
    group: 'states',
    values: { balance: 0.2, bet: 1 },
    script: 'no-funds',
    code: `hud.showFeedback('insufficient_funds', { tone: 'warn' });`,
  },
  {
    id: 'state-jurisdiction',
    title: 'A jurisdiction switchboard',
    blurb: 'RTP, net position and the session timer revealed; turbo and slam-stop taken away. One call, straight from the RGS.',
    group: 'states',
    script: 'jurisdiction',
    code: `hud.applyJurisdiction({ displayRTP: true, displayNetPosition: true, displaySessionTimer: true, disabledTurbo: true, disabledSlamstop: true });`,
  },
];

export const GROUPS: Array<{ id: StoryGroup; title: string; blurb: string }> = [
  { id: 'bar', title: 'The bar', blurb: 'The ribbon itself, in each state a round puts it through.' },
  { id: 'controls', title: 'Controls', blurb: 'The pieces on it, one at a time.' },
  { id: 'windows', title: 'Windows', blurb: 'Everything that opens over the game.' },
  { id: 'money', title: 'Money', blurb: 'The shapes that break naive HUDs.' },
  { id: 'states', title: 'States worth testing', blurb: 'The ones a suite should cover, and this one does.' },
];

export const byId = (id: string): Story | undefined => STORIES.find((s) => s.id === id);
