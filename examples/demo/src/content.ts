import { parseBlocks, type BlockSpec, type GameFacts } from '@open-slot-ui/core';
import rulesXml from './rules.xml?raw';

/**
 * The RULES section content, PARSED FROM MARKUP (`rules.xml`) — the single source
 * of truth the library's info menu renders (`menu.rules` in dom-main.ts).
 *
 * Blocks are a vocabulary, not a data structure you have to write by hand: the
 * rules live in a file a writer can edit, `parseBlocks()` turns them into the
 * `BlockSpec[]` the renderers already speak, and `validateSpec` + `auditRules`
 * check them the same as any other spec. The English text doubles as the i18n
 * KEY, so the whole section translates against one dictionary (see locales.ts).
 *
 * The document is a tour of the palette: badges · meter · tabs (with columns,
 * reel grids, a symbol table, paylines, a comparison and a glossary inside) ·
 * media · timeline · cards · gallery · image · callouts · accordion · quote ·
 * link · mode-stats (auto, from FACTS) · divider · legal.
 */

/**
 * Stand-in art, drawn as an inline SVG data URI.
 *
 * The `width`/`height` attributes are not decoration: an SVG with only a viewBox has
 * no intrinsic size, and a canvas renderer decoding it into a texture gets nothing.
 *
 * This used to point at placehold.co — which meant the example could not render its
 * own paytable without a network, and a HOSTED copy made third-party requests on
 * every load. A designer swaps these for real files; the point is that the demo owns
 * everything it shows. Exported, because the canvas example's menu (main.ts) draws
 * its banner and paytable icons from the same stand-ins.
 */
export const art = (w: number, h: number, label: string, bg = '#2a2f3a', fg = '#ffd166'): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="${Math.min(w, h) * 0.08}" fill="${bg}"/><text x="${w / 2}" y="${h / 2}" dominant-baseline="central" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${Math.min(w, h) * 0.34}" fill="${fg}">${label}</text></svg>`,
  )}`;

/**
 * Resolve this demo's `art:LABEL|bg|fg|WxH` image scheme to inline SVG.
 *
 * Markup can't call a function, so the rules name their art and the host resolves
 * it — the same hook a real game would use to turn a CDN key into a URL. The size
 * comes from the reference itself, or from the block's own width/height when it
 * has them; anything that isn't an `art:` reference is left exactly as written.
 */
function resolveArt(value: string, w?: number, h?: number): string {
  if (!value.startsWith('art:')) return value;
  const [label = '', bg, fg, size] = value.slice(4).split('|');
  const [sw, sh] = (size ?? '').split('x').map(Number);
  const width = sw || w || 72;
  const height = sh || h || 72;
  return art(width, height, label, bg || undefined, fg || undefined);
}

/** Walk the parsed blocks and resolve every image reference in them. */
function resolveBlockArt(blocks: BlockSpec[]): BlockSpec[] {
  const walkValue = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walkValue);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = { ...(node as Record<string, unknown>) };
    const w = typeof out['width'] === 'number' ? (out['width'] as number) : undefined;
    const h = typeof out['height'] === 'number' ? (out['height'] as number) : undefined;
    for (const key of ['src', 'icon', 'image']) {
      const v = out[key];
      if (typeof v === 'string') out[key] = resolveArt(v, w, h);
    }
    for (const [key, v] of Object.entries(out)) {
      if (Array.isArray(v) || (v && typeof v === 'object')) out[key] = walkValue(v);
    }
    return out;
  };
  return walkValue(blocks) as BlockSpec[];
}

const parsed = parseBlocks(rulesXml);
// The parser never throws; a typo in the rules file surfaces here instead of
// silently dropping a section.
if (parsed.issues.length) console.warn('[demo] rules.xml:', parsed.issues);

export const RULES_BLOCKS: BlockSpec[] = resolveBlockArt(parsed.blocks);

/**
 * Drop blocks by id, ANYWHERE in the document — a block can sit inside a tab, an
 * accordion section or a column, so a flat filter would miss it. The demo uses
 * this for `?forget=1`; a real game would use it to strip a section a market
 * forbids.
 */
export function dropBlocks(blocks: BlockSpec[], ids: ReadonlySet<string>): BlockSpec[] {
  const keep = (list: BlockSpec[]): BlockSpec[] =>
    list
      .filter((b) => !ids.has(b.id))
      .map((b) => {
        if (b.kind === 'group') return { ...b, children: keep(b.children) };
        if (b.kind === 'columns') return { ...b, children: b.children.map(keep) };
        if (b.kind === 'tabs') return { ...b, tabs: b.tabs.map((t) => ({ ...t, children: keep(t.children) })) };
        if (b.kind === 'accordion') return { ...b, items: b.items.map((i) => ({ ...i, children: keep(i.children) })) };
        return b;
      });
  return keep(blocks);
}

/**
 * BUY-FEATURE options for the buy-feature modal (up to 4). Two variants:
 *  - `'buy'`  → a one-tap purchase ("Buy"): pay `cost × bet` to trigger the feature.
 *  - `'boost'`→ an activatable bet boost ("Activate"): a per-spin surcharge of
 *               `cost × bet` that toggles on/off.
 * Names are localized (the English text is the i18n key); images are inline SVG
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
  { id: 'free-spins', name: 'Free Spins', variant: 'buy', cost: 100, image: art(480, 300, 'FREE SPINS', '#7c3aed', '#ffffff') },
  { id: 'super-spins', name: 'Super Spins', variant: 'buy', cost: 300, image: art(480, 300, 'SUPER SPINS', '#db2777', '#ffffff') },
  { id: 'ante-bet', name: 'Ante Bet', variant: 'boost', cost: 0.25, image: art(480, 300, 'ANTE BET', '#2563eb', '#ffffff') },
  { id: 'double-chance', name: 'Double Chance', variant: 'boost', cost: 0.5, image: art(480, 300, 'DOUBLE CHANCE', '#059669', '#ffffff') },
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
