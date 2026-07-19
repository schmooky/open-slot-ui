import type { BlockSpec, GameFacts } from '@open-slot-ui/core';

/**
 * The RULES section content as declarative BLOCKS — the single source of truth the
 * library's info menu renders (`menu.rules` in main.ts). Because the English text
 * here doubles as the i18n KEY, defining it once guarantees the whole section
 * translates against the same dictionary entries (see locales.ts). Every block's
 * text flows through `ui.t`; images use placehold.co so a designer can swap the link.
 *
 * This array is a tour of the full rules block palette:
 *   text · media (image+text) · subheading · cards · steps · table · image ·
 *   mode-stats (auto, from FACTS) · callout (bonus + warning) · divider · legal
 */
export const RULES_BLOCKS: BlockSpec[] = [
  // — just text, with **bold** inline runs —
  {
    kind: 'text',
    id: 'r-intro',
    text: 'Match symbols on a line to win — **bigger symbols pay more**, and **Wild** substitutes for all.',
  },

  // — image + text, side by side (the "media" layout) —
  {
    kind: 'media',
    id: 'r-fs',
    side: 'left',
    width: 320,
    height: 200,
    src: 'https://placehold.co/320x200/2a2f3a/ffd166?text=BONUS',
    alt: 'Free Spins',
    title: 'Free Spins',
    // {{freeSpins.count}} / {{freeSpins.retrigger}} interpolate from the declared
    // FACTS below — the stated count can never drift from the config.
    text: 'Land 3 or more **Scatters** to trigger {{freeSpins.count}} free spins with a rising multiplier. Free spins {{freeSpins.retrigger}} be retriggered.',
  },

  // — a sub-section title + a row of feature cards (icon + title + text) —
  { kind: 'subheading', id: 'r-feat-h', text: 'Features' },
  {
    kind: 'cards',
    id: 'r-cards',
    items: [
      { icon: 'https://placehold.co/72x72/ef4444/ffffff?text=W', title: 'Wild', text: 'Substitutes for every paying symbol.' },
      { icon: 'https://placehold.co/72x72/3b82f6/ffffff?text=S', title: 'Scatter', text: 'Pays anywhere on the reels.' },
      { icon: 'https://placehold.co/72x72/f59e0b/000000?text=x2', title: 'Multiplier', text: 'Boosts every win during the bonus.' },
    ],
  },

  // — every CONFIGURED buy/boost feature gets its OWN section (the audit enforces
  //   this: a mode with no dedicated section — not just a passing mention — is
  //   called out). Prices are {{cost.*}} TOKENS resolved from the live facts, so
  //   the rules can never quote a price the buy modal doesn't charge. —
  { kind: 'subheading', id: 'r-f-fs-h', text: 'Free Spins' },
  {
    kind: 'text',
    id: 'r-f-fs',
    text: 'Land 3 or more **Scatters** — or buy the feature outright for {{cost.free-spins}} your bet — to start {{freeSpins.count}} free spins with a rising multiplier. Free spins {{freeSpins.retrigger}} be retriggered.',
  },
  { kind: 'subheading', id: 'r-f-ss-h', text: 'Super Spins' },
  {
    kind: 'text',
    id: 'r-f-ss',
    text: 'The premium bonus: buy it for {{cost.super-spins}} your bet to start the free spins at a higher multiplier that climbs faster.',
  },
  { kind: 'subheading', id: 'r-f-ab-h', text: 'Ante Bet' },
  {
    kind: 'text',
    id: 'r-f-ab',
    text: 'An optional ante: every spin costs **+25%** more, and in return the chance of triggering the bonus naturally is doubled. Toggle it any time from the bonus button.',
  },
  { kind: 'subheading', id: 'r-f-dc-h', text: 'Double Chance' },
  {
    kind: 'text',
    id: 'r-f-dc',
    text: 'A stronger ante at **+50%** per spin for even better bonus odds. One boost can be active at a time.',
  },

  // — the controls guide (Info/Help must explain every interactive control) —
  { kind: 'subheading', id: 'r-controls-h', text: 'Controls' },
  {
    kind: 'steps',
    id: 'r-controls',
    ordered: false,
    items: [
      '**SPIN** — plays one round at the current bet.',
      '**− / +** — lower or raise your bet.',
      '**Autoplay** — play a chosen number of rounds automatically; tap again to stop.',
      '**Turbo** — shortens the spin animation; the result is identical.',
      '**Bonus** — opens the buy-feature list.',
      '**Menu (☰)** — opens settings, the paytable and these rules.',
    ],
  },

  // — an ordered list of steps —
  { kind: 'subheading', id: 'r-play-h', text: 'How to play' },
  {
    kind: 'steps',
    id: 'r-steps',
    ordered: true,
    items: [
      'Set your bet with the - and + buttons.',
      'Press spin once, or **hold** for turbo.',
      'Land 3 or more **Scatters** to start the bonus.',
    ],
  },

  // — a generic table (header row + body rows) —
  { kind: 'subheading', id: 'r-pay-h', text: 'Symbol payouts' },
  {
    kind: 'table',
    id: 'r-table',
    columns: ['Symbol', '3', '4', '5'],
    rows: [
      ['Wild', '5x', '20x', '50x'],
      ['Scatter', '3x', '10x', '40x'],
      ['Star', '2x', '8x', '30x'],
      ['Ace', '1x', '5x', '20x'],
    ],
  },

  // — a full-width feature image (designer-supplied art; placehold.co stands in) —
  {
    kind: 'image',
    id: 'r-banner',
    src: 'https://placehold.co/1000x180/2a2f3a/ffd166?text=MAX+WIN+5%2C000x',
    alt: 'Max win 5,000x',
    width: 1000,
    height: 180,
  },

  // — the AUTO per-mode RTP / Max-win grid, rendered straight from FACTS below —
  // declared once, so this table can never drift from the game's configuration.
  { kind: 'mode-stats', id: 'r-stats', extras: [{ label: 'Lines', value: '20' }] },

  // — highlighted callouts: a bonus tip and a warning notice —
  { kind: 'callout', id: 'r-tip', tone: 'bonus', title: 'Tip', text: 'Hold spin for turbo.' },
  { kind: 'callout', id: 'r-note', tone: 'warning', title: 'Please note', text: 'Malfunction voids all pays and play.' },

  // — a divider, then small legal / fine print —
  { kind: 'divider', id: 'r-div' },
  { kind: 'legal', id: 'r-legal', text: 'Play responsibly. 18+. Terms and conditions apply.' },
];

/**
 * BUY-FEATURE options for the buy-feature modal (up to 4). Two variants:
 *  - `'buy'`  → a one-tap purchase ("Buy"): pay `cost × bet` to trigger the feature.
 *  - `'boost'`→ an activatable bet boost ("Activate"): a per-spin surcharge of
 *               `cost × bet` that toggles on/off.
 * Names are localized (the English text is the i18n key); images use placehold.co
 * so a designer swaps in the real feature art.
 */
export interface FeatureSpec {
  id: string;
  name: string;
  variant: 'buy' | 'boost';
  /** buy → purchase multiple of the bet; boost → per-spin surcharge fraction. */
  cost: number;
  image: string;
}

export const FEATURES: FeatureSpec[] = [
  { id: 'free-spins', name: 'Free Spins', variant: 'buy', cost: 100, image: 'https://placehold.co/480x300/7c3aed/ffffff?text=FREE+SPINS' },
  { id: 'super-spins', name: 'Super Spins', variant: 'buy', cost: 300, image: 'https://placehold.co/480x300/db2777/ffffff?text=SUPER+SPINS' },
  { id: 'ante-bet', name: 'Ante Bet', variant: 'boost', cost: 0.25, image: 'https://placehold.co/480x300/2563eb/ffffff?text=ANTE+BET' },
  { id: 'double-chance', name: 'Double Chance', variant: 'boost', cost: 0.5, image: 'https://placehold.co/480x300/059669/ffffff?text=DOUBLE+CHANCE' },
];

/**
 * GAME FACTS — what this demo game HAS, declared as data (`spec.facts`). Drives the
 * auto `mode-stats` rules block above AND the rules-completeness audit: forget a
 * mode's RTP / max win, or a configured feature's description, or the free-spins
 * details, and the info menu says so explicitly when the rules open (`?forget=1`
 * demos exactly that). The buy-feature modal also declares its FEATURES into this
 * at mount, so the two can never drift apart.
 */
export const FACTS: GameFacts = {
  modes: [
    { id: 'base', name: 'Base game', kind: 'base', rtp: 96.5, maxWinX: 5000 },
    { id: 'free-spins', name: 'Free Spins', kind: 'buy', cost: 100, rtp: 96.5, maxWinX: 5000 },
    { id: 'super-spins', name: 'Super Spins', kind: 'buy', cost: 300, rtp: 96.5, maxWinX: 5000 },
    { id: 'ante-bet', name: 'Ante Bet', kind: 'boost', cost: 0.25, rtp: 96.5, maxWinX: 5000 },
    { id: 'double-chance', name: 'Double Chance', kind: 'boost', cost: 0.5, rtp: 96.5, maxWinX: 5000 },
  ],
  freeSpins: { count: 10, retrigger: false },
  volatility: 'High',
  maxWinCapX: 5000,
};
