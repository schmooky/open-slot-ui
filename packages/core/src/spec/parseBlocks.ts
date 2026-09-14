/**
 * Rules markup -> `BlockSpec[]`.
 *
 * The block vocabulary is what game rules are *written in*, so it needs an
 * authoring format that is not TypeScript: a rules page should be editable by
 * whoever writes the rules, shippable as a file, translatable, and diffable.
 * This module parses that file — a tiny XML dialect, or the same tree as JSON —
 * into the very same `BlockSpec[]` a host could have written by hand.
 *
 * Zero dependencies and no DOM: it runs in the browser, in Node, and in a build
 * step. Like `validateSpec`, it NEVER throws — malformed markup yields the
 * blocks it could read plus an issue list, so a typo in the rules file can
 * never take the game down with it.
 *
 *     <rules>
 *       <heading>Free spins</heading>
 *       <p>Three scatters start the round.</p>
 *       <grid reels="5" rows="3" symbol="S">
 *         <cell reel="0" row="1"/><cell reel="2" row="1"/><cell reel="4" row="1"/>
 *       </grid>
 *     </rules>
 */
import type { BlockSpec, SpecIssue } from './types';
import type { SelectOption } from '../controls/SelectControl';

export interface ParseResult {
  blocks: BlockSpec[];
  issues: SpecIssue[];
}

/* ── the XML reader ───────────────────────────────────────────────────────── */

interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** Text nodes carry their text here and are named `#text`. */
  text: string;
}

const TEXT = '#text';

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : all;
    }
    const hit = ENTITIES[body.toLowerCase()];
    return hit ?? all;
  });
}

/** Reads the document into an element tree. Unclosed tags close themselves. */
function readXml(src: string, issues: SpecIssue[]): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  const top = (): XNode => stack[stack.length - 1] as XNode;
  const pushText = (raw: string): void => {
    if (!raw) return;
    top().children.push({ name: TEXT, attrs: {}, children: [], text: raw });
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      pushText(decodeEntities(src.slice(i)));
      break;
    }
    if (lt > i) pushText(decodeEntities(src.slice(i, lt)));

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      pushText(src.slice(lt + 9, end < 0 ? n : end));
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) {
      const end = src.indexOf('>', lt + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }

    if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      const name = src.slice(lt + 2, end < 0 ? n : end).trim().toLowerCase();
      let depth = stack.length - 1;
      while (depth > 0 && stack[depth]?.name !== name) depth--;
      if (depth === 0) {
        issues.push({ level: 'warn', path: name, code: 'stray-close', message: `</${name}> closes nothing; ignored` });
      } else {
        if (depth !== stack.length - 1) {
          issues.push({ level: 'warn', path: name, code: 'unclosed', message: `<${String(top().name)}> was left open by </${name}>` });
        }
        stack.length = depth;
      }
      i = end < 0 ? n : end + 1;
      continue;
    }

    // An opening tag: read the name, then attributes until `>` or `/>`.
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(src[j] as string)) j++;
    const name = src.slice(lt + 1, j).toLowerCase();
    const attrs: Record<string, string> = {};
    let selfClose = false;
    while (j < n) {
      while (j < n && /\s/.test(src[j] as string)) j++;
      if (src[j] === '/' ) { selfClose = true; j++; continue; }
      if (src[j] === '>') { j++; break; }
      if (j >= n) break;
      const nameStart = j;
      while (j < n && !/[\s=/>]/.test(src[j] as string)) j++;
      const attr = src.slice(nameStart, j).toLowerCase();
      if (!attr) { j++; continue; }
      while (j < n && /\s/.test(src[j] as string)) j++;
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j] as string)) j++;
        const quote = src[j];
        if (quote === '"' || quote === "'") {
          const end = src.indexOf(quote, j + 1);
          attrs[attr] = decodeEntities(src.slice(j + 1, end < 0 ? n : end));
          j = end < 0 ? n : end + 1;
        } else {
          const start = j;
          while (j < n && !/[\s/>]/.test(src[j] as string)) j++;
          attrs[attr] = decodeEntities(src.slice(start, j));
        }
      } else {
        attrs[attr] = ''; // a bare attribute, e.g. `<list ordered>`
      }
    }
    const node: XNode = { name, attrs, children: [], text: '' };
    top().children.push(node);
    if (!selfClose) stack.push(node);
    i = j;
  }

  if (stack.length > 1) {
    issues.push({ level: 'warn', path: String(top().name), code: 'unclosed', message: `<${String(top().name)}> is never closed` });
  }
  return root;
}

/* ── reading values off a node ────────────────────────────────────────────── */

const elements = (n: XNode): XNode[] => n.children.filter((c) => c.name !== TEXT);
const kids = (n: XNode, ...names: string[]): XNode[] => n.children.filter((c) => names.includes(c.name));

/** Flattens a node's text, collapsing indentation; `<br/>` survives as a newline. */
function textOf(n: XNode): string {
  let out = '';
  const walk = (x: XNode): void => {
    for (const c of x.children) {
      if (c.name === TEXT) out += c.text;
      else if (c.name === 'br') out += '\n';
      else walk(c);
    }
  };
  walk(n);
  return out.replace(/[ \t\r\f]*\n[ \t\r\f]*/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

/** `attr` first, then the element's own text — so both spellings author the same. */
const attrOr = (n: XNode, key: string, fallback = ''): string => n.attrs[key] ?? fallback;
const attrText = (n: XNode, key: string): string => (n.attrs[key] != null ? (n.attrs[key] as string).trim() : textOf(n));
const bool = (n: XNode, key: string): boolean | undefined => {
  const v = n.attrs[key];
  if (v == null) return undefined;
  return v !== 'false' && v !== '0' && v !== 'no';
};
function num(n: XNode, key: string): number | undefined {
  const v = n.attrs[key];
  if (v == null || v.trim() === '') return undefined;
  const p = Number(v);
  return Number.isFinite(p) ? p : undefined;
}
/**
 * `"3,4,5"` or `"3 4 5"` -> `['3','4','5']`.
 *
 * A comma, when there is one, is the separator — so `counts="3 of a kind, 4 of a
 * kind"` stays two labels and not six words. Whitespace only splits a list that
 * has no commas at all.
 */
const listAttr = (v: string | undefined): string[] =>
  v == null ? [] : v.split(v.includes(',') ? ',' : /\s+/).map((s) => s.trim()).filter(Boolean);
const numList = (v: string | undefined): number[] => listAttr(v).map(Number).filter((x) => Number.isFinite(x));

const ONE_OF = <T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined =>
  v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/* ── element name -> block kind ───────────────────────────────────────────── */

const ALIASES: Record<string, string> = {
  p: 'text', para: 'text', paragraph: 'text',
  h1: 'heading', h2: 'heading', title: 'heading',
  h3: 'subheading', h4: 'subheading',
  note: 'callout', warning: 'callout', info: 'callout',
  blockquote: 'quote',
  list: 'steps', ol: 'steps', ul: 'steps',
  img: 'image', figure: 'media',
  a: 'link',
  hr: 'divider', rule: 'divider',
  section: 'group', box: 'group',
  stats: 'stat-grid', 'mode-table': 'mode-stats',
  glossary: 'kv', definitions: 'kv',
  small: 'legal', legalese: 'legal',
  chips: 'badges',
  gauge: 'meter',
  reelgrid: 'grid', 'reel-grid': 'grid',
  symboltable: 'symbols', 'symbol-table': 'symbols',
};

const ROOTS = new Set(['#root', 'rules', 'blocks', 'menu', 'doc', 'document', 'fragment', 'paytable-page', 'info']);
const TONES = ['info', 'bonus', 'warning'] as const;
const BADGE_TONES = ['neutral', 'accent', 'bonus', 'warning'] as const;
const SIZES = ['sm', 'md', 'lg'] as const;
const SIDES = ['left', 'right'] as const;

/* ── the mapper ───────────────────────────────────────────────────────────── */

export function parseBlocks(source: string): ParseResult {
  const issues: SpecIssue[] = [];
  const blocks: BlockSpec[] = [];
  try {
    const trimmed = source.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJsonBlocks(trimmed);

    const doc = readXml(source, issues);
    let seq = 0;
    const idFor = (n: XNode, kind: string): string => {
      const given = n.attrs['id'];
      return given && given.trim() ? given.trim() : `${kind}-${++seq}`;
    };

    /** Shared tail: `covers` / `explains` ride on any block. */
    const tag = <B extends BlockSpec>(n: XNode, b: B): B => {
      const covers = listAttr(n.attrs['covers']);
      if (covers.length) (b as BlockSpec).covers = covers;
      const explains = n.attrs['explains'];
      if (explains && explains.trim()) (b as BlockSpec).explains = explains.trim();
      return b;
    };

    const convertAll = (parent: XNode, path: string): BlockSpec[] => {
      const out: BlockSpec[] = [];
      elements(parent).forEach((child, i) => {
        const b = convert(child, `${path}[${i}]`);
        if (b) out.push(b);
      });
      return out;
    };

    const convert = (n: XNode, path: string): BlockSpec | null => {
      const kind = ALIASES[n.name] ?? n.name;
      switch (kind) {
        /* ── prose ─────────────────────────────────────────────────────── */
        case 'heading':
          return tag(n, { kind: 'heading', id: idFor(n, kind), text: attrText(n, 'text') });
        case 'subheading':
          return tag(n, { kind: 'subheading', id: idFor(n, kind), text: attrText(n, 'text') });
        case 'text':
          return tag(n, { kind: 'text', id: idFor(n, kind), text: attrText(n, 'text') });
        case 'legal':
          return tag(n, { kind: 'legal', id: idFor(n, kind), text: attrText(n, 'text') });
        case 'callout': {
          const tone = ONE_OF(n.attrs['tone'], TONES) ?? (n.name === 'warning' ? 'warning' : n.name === 'info' ? 'info' : undefined);
          const b: BlockSpec = { kind: 'callout', id: idFor(n, kind), text: attrText(n, 'text') };
          if (tone) b.tone = tone;
          if (n.attrs['title']) b.title = n.attrs['title'];
          return tag(n, b);
        }
        case 'quote': {
          const b: BlockSpec = { kind: 'quote', id: idFor(n, kind), text: attrText(n, 'text') };
          if (n.attrs['cite']) b.cite = n.attrs['cite'];
          return tag(n, b);
        }
        case 'divider':
          return tag(n, { kind: 'divider', id: idFor(n, kind) });
        case 'spacer':
          return tag(n, { kind: 'spacer', id: idFor(n, kind), size: ONE_OF(n.attrs['size'], SIZES) ?? 'md' });
        case 'link':
          return tag(n, {
            kind: 'link',
            id: idFor(n, kind),
            text: attrText(n, 'text') || attrOr(n, 'href'),
            href: attrOr(n, 'href'),
            external: bool(n, 'external') ?? true,
          });

        /* ── lists, tables, key/value ──────────────────────────────────── */
        case 'steps': {
          const items = kids(n, 'item', 'step', 'li').map((c) => attrText(c, 'text')).filter(Boolean);
          const ordered = bool(n, 'ordered') ?? (n.name === 'ol' ? true : n.name === 'ul' ? false : undefined);
          const b: BlockSpec = { kind: 'steps', id: idFor(n, kind), items };
          if (ordered != null) b.ordered = ordered;
          return tag(n, b);
        }
        case 'table': {
          const columns = listAttr(n.attrs['columns']).length
            ? (n.attrs['columns'] as string).split(',').map((s) => s.trim())
            : kids(n, 'columns', 'head', 'thead').flatMap((h) => kids(h, 'column', 'col', 'th', 'cell').map((c) => attrText(c, 'text')));
          const rows = kids(n, 'row', 'tr').map((r) => kids(r, 'cell', 'c', 'td').map((c) => attrText(c, 'text')));
          const b: BlockSpec = { kind: 'table', id: idFor(n, kind), rows };
          if (columns.length) b.columns = columns;
          return tag(n, b);
        }
        case 'kv': {
          const items = kids(n, 'entry', 'pair', 'def').map((c) => ({
            term: attrOr(c, 'term') || attrOr(c, 'key') || attrOr(c, 'label'),
            text: attrText(c, 'text'),
          }));
          return tag(n, { kind: 'kv', id: idFor(n, kind), items });
        }
        case 'compare': {
          const heads = listAttr(n.attrs['columns']).length === 2
            ? ((n.attrs['columns'] as string).split(',').map((s) => s.trim()) as [string, string])
            : [attrOr(n, 'a', 'A'), attrOr(n, 'b', 'B')] as [string, string];
          const rows = kids(n, 'row', 'tr').map((r) => ({
            label: attrOr(r, 'label') || attrOr(r, 'term'),
            a: attrOr(r, 'a'),
            b: attrOr(r, 'b'),
          }));
          return tag(n, { kind: 'compare', id: idFor(n, kind), columns: heads, rows });
        }
        case 'stat-grid': {
          const items = kids(n, 'stat', 'item').map((c) => ({ label: attrOr(c, 'label'), value: attrText(c, 'value') }));
          return tag(n, { kind: 'stat-grid', id: idFor(n, kind), items });
        }
        case 'mode-stats': {
          const extras = kids(n, 'extra', 'stat').map((c) => ({ label: attrOr(c, 'label'), value: attrText(c, 'value') }));
          const b: BlockSpec = { kind: 'mode-stats', id: idFor(n, kind) };
          if (extras.length) b.extras = extras;
          return tag(n, b);
        }
        case 'timeline': {
          const items = kids(n, 'step', 'item', 'point').map((c) => {
            // With a `title`, the element's own text is the step's copy; without
            // one, the text IS the step — `<step>Land 3 scatters</step>` reads fine.
            const title = attrOr(c, 'title') || attrOr(c, 'label');
            const body = c.attrs['text'] ?? textOf(c);
            const it: { title: string; text?: string; marker?: string } = { title: title || body };
            if (title && body) it.text = body;
            if (c.attrs['marker']) it.marker = c.attrs['marker'];
            return it;
          });
          return tag(n, { kind: 'timeline', id: idFor(n, kind), items });
        }

        /* ── the reels ─────────────────────────────────────────────────── */
        case 'paylines': {
          const lines = kids(n, 'line', 'payline').map((c) => numList(c.attrs['rows'] ?? textOf(c)));
          return tag(n, {
            kind: 'paylines',
            id: idFor(n, kind),
            reels: num(n, 'reels') ?? (lines[0]?.length ?? 5),
            rows: num(n, 'rows') ?? 3,
            lines,
          });
        }
        case 'grid': {
          const cells: Array<[number, number]> = [];
          for (const c of kids(n, 'cell')) {
            const reel = num(c, 'reel'), row = num(c, 'row');
            if (reel != null && row != null) cells.push([reel, row]);
          }
          // Or the compact spelling: cells="0:1 2:1 4:2" (reel:row, space-separated)
          for (const pair of listAttr(n.attrs['cells'])) {
            const [a, bb] = pair.split(/[:x]/).map(Number);
            if (Number.isFinite(a) && Number.isFinite(bb)) cells.push([a as number, bb as number]);
          }
          const b: BlockSpec = {
            kind: 'grid',
            id: idFor(n, kind),
            reels: num(n, 'reels') ?? 5,
            rows: num(n, 'rows') ?? 3,
            cells,
          };
          if (n.attrs['label']) b.label = n.attrs['label'];
          if (n.attrs['symbol']) b.symbol = n.attrs['symbol'];
          return tag(n, b);
        }
        case 'paytable': {
          const rows = kids(n, 'pay', 'row', 'symbol').map((c) => {
            const r: { symbol?: string; payouts: string; icon?: string } = { payouts: attrText(c, 'payouts') };
            if (c.attrs['symbol']) r.symbol = c.attrs['symbol'];
            if (c.attrs['icon']) r.icon = c.attrs['icon'];
            return r;
          });
          const b: BlockSpec = { kind: 'paytable', id: idFor(n, kind), rows };
          const cols = num(n, 'columns');
          if (cols != null) b.columns = cols;
          return tag(n, b);
        }
        case 'symbols': {
          const counts = listAttr(n.attrs['counts']);
          const rows = kids(n, 'symbol', 'row').map((c) => {
            const pays = kids(c, 'pay').length
              ? kids(c, 'pay').map((pp) => attrText(pp, 'value'))
              : listAttr(c.attrs['pays']);
            const r: { symbol?: string; icon?: string; name?: string; pays: string[] } = { pays };
            if (c.attrs['symbol']) r.symbol = c.attrs['symbol'];
            if (c.attrs['icon']) r.icon = c.attrs['icon'];
            if (c.attrs['name']) r.name = c.attrs['name'];
            return r;
          });
          const b: BlockSpec = { kind: 'symbols', id: idFor(n, kind), rows };
          if (counts.length) b.counts = counts;
          return tag(n, b);
        }

        /* ── pictures ──────────────────────────────────────────────────── */
        case 'image': {
          const b: BlockSpec = { kind: 'image', id: idFor(n, kind), src: attrOr(n, 'src') };
          if (n.attrs['alt']) b.alt = n.attrs['alt'];
          const w = num(n, 'width'), h = num(n, 'height');
          if (w != null) b.width = w;
          if (h != null) b.height = h;
          return tag(n, b);
        }
        case 'media': {
          const b: BlockSpec = { kind: 'media', id: idFor(n, kind), src: attrOr(n, 'src'), text: attrText(n, 'text') };
          if (n.attrs['alt']) b.alt = n.attrs['alt'];
          if (n.attrs['title']) b.title = n.attrs['title'];
          const side = ONE_OF(n.attrs['side'], SIDES);
          if (side) b.side = side;
          const w = num(n, 'width'), h = num(n, 'height');
          if (w != null) b.width = w;
          if (h != null) b.height = h;
          return tag(n, b);
        }
        case 'gallery': {
          const items = kids(n, 'image', 'img', 'item').map((c) => {
            const it: { src: string; alt?: string; caption?: string } = { src: attrOr(c, 'src') };
            if (c.attrs['alt']) it.alt = c.attrs['alt'];
            const caption = c.attrs['caption'] ?? (textOf(c) || undefined);
            if (caption) it.caption = caption;
            return it;
          });
          const b: BlockSpec = { kind: 'gallery', id: idFor(n, kind), items };
          const cols = num(n, 'columns');
          if (cols != null) b.columns = cols;
          return tag(n, b);
        }
        case 'cards': {
          const items = kids(n, 'card', 'item').map((c) => {
            const it: { icon?: string; title: string; text?: string } = { title: attrOr(c, 'title') };
            if (c.attrs['icon']) it.icon = c.attrs['icon'];
            const body = c.attrs['text'] ?? textOf(c);
            if (!it.title) { it.title = body; } else if (body) it.text = body;
            return it;
          });
          return tag(n, { kind: 'cards', id: idFor(n, kind), items });
        }

        /* ── at-a-glance ───────────────────────────────────────────────── */
        case 'meter': {
          const b: BlockSpec = { kind: 'meter', id: idFor(n, kind), value: num(n, 'value') ?? 0 };
          if (n.attrs['label']) b.label = n.attrs['label'];
          const max = num(n, 'max');
          if (max != null) b.max = max;
          const caption = n.attrs['caption'] ?? (textOf(n) || undefined);
          if (caption) b.caption = caption;
          return tag(n, b);
        }
        case 'badges': {
          const items = kids(n, 'badge', 'chip', 'item').map((c) => {
            const it: { text: string; tone?: 'neutral' | 'accent' | 'bonus' | 'warning' } = { text: attrText(c, 'text') };
            const tone = ONE_OF(c.attrs['tone'], BADGE_TONES);
            if (tone) it.tone = tone;
            return it;
          });
          return tag(n, { kind: 'badges', id: idFor(n, kind), items });
        }

        /* ── containers ────────────────────────────────────────────────── */
        case 'group': {
          const b: BlockSpec = { kind: 'group', id: idFor(n, kind), children: convertAll(n, `${path}.children`) };
          if (n.attrs['title']) b.title = n.attrs['title'];
          return tag(n, b);
        }
        case 'tabs': {
          const tabs = kids(n, 'tab', 'panel').map((c, i) => ({
            id: (c.attrs['id'] ?? '').trim() || `tab-${i + 1}`,
            label: attrOr(c, 'label') || attrOr(c, 'title') || `Tab ${i + 1}`,
            children: convertAll(c, `${path}.tabs[${i}]`),
          }));
          return tag(n, { kind: 'tabs', id: idFor(n, kind), tabs });
        }
        case 'accordion': {
          const items = kids(n, 'section', 'item', 'panel', 'details').map((c, i) => {
            const it: { id: string; title: string; open?: boolean; children: BlockSpec[] } = {
              id: (c.attrs['id'] ?? '').trim() || `acc-${i + 1}`,
              title: attrOr(c, 'title') || attrOr(c, 'label') || `Section ${i + 1}`,
              children: convertAll(c, `${path}.items[${i}]`),
            };
            const open = bool(c, 'open');
            if (open != null) it.open = open;
            return it;
          });
          return tag(n, { kind: 'accordion', id: idFor(n, kind), items });
        }
        case 'columns': {
          const cols = kids(n, 'column', 'col');
          const children = cols.map((c, i) => convertAll(c, `${path}.children[${i}]`));
          const of = num(n, 'of');
          const b: BlockSpec = { kind: 'columns', id: idFor(n, kind), children };
          if (of === 2 || of === 3 || of === 4) b.of = of;
          else if (children.length >= 2 && children.length <= 4) b.of = children.length as 2 | 3 | 4;
          return tag(n, b);
        }

        /* ── the interactive few ───────────────────────────────────────── */
        case 'toggle': {
          const b: BlockSpec = { kind: 'toggle', id: idFor(n, kind) };
          if (n.attrs['label']) b.label = n.attrs['label'];
          const on = bool(n, 'on');
          if (on != null) b.on = on;
          const hint = n.attrs['hint'] ?? (textOf(n) || undefined);
          if (hint) b.hint = hint;
          return tag(n, b);
        }
        case 'slider': {
          const b: BlockSpec = { kind: 'slider', id: idFor(n, kind) };
          if (n.attrs['label']) b.label = n.attrs['label'];
          const initial = num(n, 'initial') ?? num(n, 'value');
          if (initial != null) b.initial = initial;
          const hint = n.attrs['hint'] ?? (textOf(n) || undefined);
          if (hint) b.hint = hint;
          return tag(n, b);
        }
        case 'select': {
          const options: SelectOption[] = kids(n, 'option', 'item').map((c) => {
            const label = attrOr(c, 'label') || textOf(c);
            return { label, value: c.attrs['value'] ?? label };
          });
          const b: BlockSpec = { kind: 'select', id: idFor(n, kind), options };
          if (n.attrs['label']) b.label = n.attrs['label'];
          const index = num(n, 'index');
          if (index != null) b.index = index;
          const hint = n.attrs['hint'];
          if (hint) b.hint = hint;
          return tag(n, b);
        }
        case 'stepper': {
          const levels = numList(n.attrs['levels']).length
            ? numList(n.attrs['levels'])
            : kids(n, 'level', 'item').map((c) => Number(textOf(c))).filter((x) => Number.isFinite(x));
          const b: BlockSpec = { kind: 'stepper', id: idFor(n, kind), levels };
          if (n.attrs['label']) b.label = n.attrs['label'];
          const index = num(n, 'index');
          if (index != null) b.index = index;
          const hint = n.attrs['hint'];
          if (hint) b.hint = hint;
          return tag(n, b);
        }
        case 'button': {
          const b: BlockSpec = { kind: 'button', id: idFor(n, kind), label: attrOr(n, 'label') || textOf(n) };
          const action = ONE_OF(n.attrs['action'], ['closePanel', 'openPanel', 'emit'] as const);
          if (action) b.action = action;
          if (n.attrs['target']) b.target = n.attrs['target'];
          if (n.attrs['role']) b.role = n.attrs['role'];
          if (n.attrs['hint']) b.hint = n.attrs['hint'];
          return tag(n, b);
        }
        case 'value': {
          const b: BlockSpec = { kind: 'value', id: idFor(n, kind) };
          if (n.attrs['label']) b.label = n.attrs['label'];
          const initial = num(n, 'initial');
          if (initial != null) b.initial = initial;
          return tag(n, b);
        }

        default:
          issues.push({ level: 'warn', path, code: 'unknown-tag', message: `<${n.name}> is not a block; ignored` });
          return null;
      }
    };

    // A wrapper element is the page; anything else is a fragment of blocks.
    const top = elements(doc);
    const host = top.length === 1 && ROOTS.has(top[0]?.name ?? '') ? (top[0] as XNode) : doc;
    blocks.push(...convertAll(host, 'rules'));
  } catch (e) {
    issues.push({ level: 'error', path: '', code: 'parse-crash', message: e instanceof Error ? e.message : String(e) });
  }
  return { blocks, issues };
}

/* ── the JSON spelling of the same tree ───────────────────────────────────── */

/** Accepts `[block, …]` or `{ "blocks": [ … ] }`; fills in any missing ids. */
export function parseJsonBlocks(source: string | unknown): ParseResult {
  const issues: SpecIssue[] = [];
  let data: unknown = source;
  try {
    if (typeof source === 'string') data = JSON.parse(source);
  } catch (e) {
    return { blocks: [], issues: [{ level: 'error', path: '', code: 'bad-json', message: e instanceof Error ? e.message : String(e) }] };
  }
  const raw = Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && Array.isArray((data as { blocks?: unknown }).blocks))
      ? ((data as { blocks: unknown[] }).blocks)
      : null;
  if (!raw) {
    return { blocks: [], issues: [{ level: 'error', path: '', code: 'bad-json', message: 'expected an array of blocks, or { "blocks": [...] }' }] };
  }

  let seq = 0;
  const fill = (list: unknown[], path: string): BlockSpec[] => {
    const out: BlockSpec[] = [];
    list.forEach((item, i) => {
      const p = `${path}[${i}]`;
      if (!item || typeof item !== 'object' || typeof (item as { kind?: unknown }).kind !== 'string') {
        issues.push({ level: 'error', path: p, code: 'bad-block', message: 'a block must be an object with a string `kind`' });
        return;
      }
      const b: Record<string, unknown> = { ...(item as Record<string, unknown>) };
      const kind = b['kind'] as string;
      if (typeof b['id'] !== 'string' || !(b['id'] as string).trim()) b['id'] = `${kind}-${++seq}`;
      if (kind === 'group' && Array.isArray(b['children'])) b['children'] = fill(b['children'] as unknown[], `${p}.children`);
      if (kind === 'columns' && Array.isArray(b['children'])) {
        b['children'] = (b['children'] as unknown[]).map((col, ci) => (Array.isArray(col) ? fill(col, `${p}.children[${ci}]`) : []));
      }
      if (kind === 'tabs' && Array.isArray(b['tabs'])) {
        b['tabs'] = (b['tabs'] as Array<Record<string, unknown>>).map((t, ti) => ({
          ...t,
          children: Array.isArray(t['children']) ? fill(t['children'] as unknown[], `${p}.tabs[${ti}].children`) : [],
        }));
      }
      if (kind === 'accordion' && Array.isArray(b['items'])) {
        b['items'] = (b['items'] as Array<Record<string, unknown>>).map((t, ti) => ({
          ...t,
          children: Array.isArray(t['children']) ? fill(t['children'] as unknown[], `${p}.items[${ti}].children`) : [],
        }));
      }
      out.push(b as unknown as BlockSpec);
    });
    return out;
  };

  return { blocks: fill(raw, 'rules'), issues };
}
