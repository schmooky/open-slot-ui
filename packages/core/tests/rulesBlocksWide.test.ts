import { describe, it, expect } from 'vitest';
import { renderBlocksHtml, INFO_MENU_CSS } from '../src/spec/rulesHtml';
import { validateSpec } from '../src/spec/validateSpec';
import type { BlockSpec } from '../src/spec/types';
import { BLOCK_KINDS } from '../src/spec/types';

const html = (blocks: BlockSpec[]): string => renderBlocksHtml(blocks, (s) => s);

describe('the wider block vocabulary', () => {
  it('renders a lit reel grid', () => {
    const out = html([{ kind: 'grid', id: 'g', reels: 3, rows: 3, cells: [[0, 0], [1, 1]], label: 'Cluster', symbol: 'W' }]);
    expect(out).toContain('ohm-rgrid');
    expect(out).toContain('Cluster');
    expect((out.match(/<i/g) ?? []).length).toBe(9); // every cell drawn, lit or not
  });

  it('renders the symbol table with a header per count', () => {
    const out = html([{
      kind: 'symbols',
      id: 's',
      counts: ['3', '4', '5'],
      rows: [{ name: 'Ace', symbol: 'A', pays: ['5', '20', '100'] }],
    }]);
    expect(out).toContain('ohm-symbols');
    expect(out).toContain('Ace');
    expect(out).toContain('100');
  });

  it('renders kv, meter and badges', () => {
    const out = html([
      { kind: 'kv', id: 'k', items: [{ term: 'Scatter', text: 'Pays anywhere' }] },
      { kind: 'meter', id: 'm', label: 'Volatility', value: 4, max: 5, caption: 'Big swings' },
      { kind: 'badges', id: 'b', items: [{ text: '243 ways' }, { text: 'Buy', tone: 'bonus' }] },
    ]);
    expect(out).toContain('<dt>Scatter</dt>');
    expect((out.match(/class="on"/g) ?? []).length).toBe(4);
    expect(out).toContain('ohm-badge--bonus');
  });

  it('renders tabs with no script, and accordions as native details', () => {
    const out = html([
      { kind: 'tabs', id: 't', tabs: [
        { id: 'a', label: 'A', children: [{ kind: 'text', id: 'ta', text: 'first' }] },
        { id: 'b', label: 'B', children: [{ kind: 'text', id: 'tb', text: 'second' }] },
      ] },
      { kind: 'accordion', id: 'ac', items: [{ id: 'x', title: 'X', open: true, children: [{ kind: 'text', id: 'ax', text: 'body' }] }] },
    ]);
    expect(out).toContain('type="radio"');
    expect(out).toContain('checked');
    expect(out).toContain('<details class="ohm-acc" open>');
    expect(out).not.toContain('<script');
    // the first tab is the checked one, and both panels are in the markup
    expect(out).toContain('first');
    expect(out).toContain('second');
  });

  it('renders columns, quote, gallery, timeline, compare, link and spacer', () => {
    const out = html([
      { kind: 'columns', id: 'c', of: 2, children: [[{ kind: 'text', id: 'l', text: 'L' }], [{ kind: 'text', id: 'r', text: 'R' }]] },
      { kind: 'quote', id: 'q', text: 'Play for fun', cite: 'The house' },
      { kind: 'gallery', id: 'gal', columns: 2, items: [{ src: 'a.png', caption: 'A' }] },
      { kind: 'timeline', id: 'tl', items: [{ title: 'Land 3', text: 'Round starts', marker: '1' }] },
      { kind: 'compare', id: 'cmp', columns: ['Base', 'Bonus'], rows: [{ label: 'RTP', a: '96.2%', b: '96.4%' }] },
      { kind: 'link', id: 'lnk', text: 'Terms', href: 'https://example.test' },
      { kind: 'spacer', id: 'sp', size: 'lg' },
    ]);
    expect(out).toContain('ohm-cols--2');
    expect(out).toContain('<cite>The house</cite>');
    expect(out).toContain('--cols:2');
    expect(out).toContain('ohm-tl-mark');
    expect(out).toContain('<th scope="row">RTP</th>');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('ohm-spacer--lg');
  });

  it('escapes author text everywhere, including inside a tab label', () => {
    const out = html([
      { kind: 'tabs', id: 't', tabs: [{ id: 'a', label: '<img onerror=x>', children: [{ kind: 'quote', id: 'q', text: '<b>hi</b>', cite: '"me"' }] }] },
    ]);
    expect(out).not.toContain('<img onerror');
    expect(out).toContain('&lt;img');
  });

  it('styles every class it emits', () => {
    const out = html([
      { kind: 'grid', id: 'g', reels: 2, rows: 2, cells: [[0, 0]], label: 'A cluster' },
      { kind: 'paylines', id: 'pl', reels: 3, rows: 3, lines: [[1, 1, 1]] },
      { kind: 'paytable', id: 'pt', rows: [{ symbol: 'A', payouts: '5:10' }] },
      { kind: 'table', id: 'tb', rows: [['a', 'b']] },
      { kind: 'steps', id: 'st', items: ['a'] },
      { kind: 'callout', id: 'co', tone: 'warning', text: 'x' },
      { kind: 'callout', id: 'co2', tone: 'bonus', title: 'T', text: 'x' },
      { kind: 'callout', id: 'co3', text: 'x' },
      { kind: 'media', id: 'md2', src: 'a.png', text: 'x', side: 'right' },
      { kind: 'stat-grid', id: 'sg', items: [{ label: 'a', value: 'b' }] },
      { kind: 'media', id: 'md', src: 'a.png', text: 'x', title: 't' },
      { kind: 'cards', id: 'cd', items: [{ icon: 'a.png', title: 't', text: 'x' }] },
      { kind: 'legal', id: 'lg', text: 'x' },
      { kind: 'divider', id: 'dv' },
      { kind: 'group', id: 'gr', title: 'G', children: [] },
      { kind: 'heading', id: 'hd', text: 'H' },
      { kind: 'subheading', id: 'sh', text: 'S' },
      { kind: 'kv', id: 'k', items: [{ term: 'a', text: 'b' }] },
      { kind: 'meter', id: 'm', value: 1 },
      { kind: 'badges', id: 'b', items: [{ text: 'x' }] },
      { kind: 'tabs', id: 't', tabs: [{ id: 'a', label: 'A', children: [] }] },
      { kind: 'accordion', id: 'ac', items: [{ id: 'x', title: 'X', children: [] }] },
      { kind: 'columns', id: 'c', of: 3, children: [[], [], []] },
      { kind: 'quote', id: 'q', text: 'q' },
      { kind: 'gallery', id: 'gal', items: [{ src: 'a.png' }] },
      { kind: 'timeline', id: 'tl', items: [{ title: 't' }] },
      { kind: 'compare', id: 'cmp', columns: ['a', 'b'], rows: [] },
      { kind: 'link', id: 'l', text: 'l', href: '#' },
      { kind: 'spacer', id: 's' },
      { kind: 'symbols', id: 'sy', rows: [{ name: 'n', pays: ['1'] }] },
    ]);
    const used = new Set([...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => (m[1] as string).split(/\s+/)));
    for (const cls of used) {
      if (!cls.startsWith('ohm-')) continue;
      expect(INFO_MENU_CSS, `missing CSS for .${cls}`).toContain(`.${cls}`);
    }
  });
});

describe('the validator knows the wider vocabulary', () => {
  it('accepts a document using every kind it can render statically', () => {
    const r = validateSpec({
      rules: [
        { kind: 'grid', id: 'g', reels: 5, rows: 3, cells: [[0, 1]] },
        { kind: 'symbols', id: 's', counts: ['3'], rows: [{ name: 'A', pays: ['5'] }] },
        { kind: 'kv', id: 'k', items: [{ term: 'a', text: 'b' }] },
        { kind: 'meter', id: 'm', value: 3, max: 5 },
        { kind: 'badges', id: 'b', items: [{ text: 'x', tone: 'bonus' }] },
        { kind: 'tabs', id: 't', tabs: [{ id: 'a', label: 'A', children: [{ kind: 'text', id: 'tx', text: 'x' }] }] },
        { kind: 'accordion', id: 'ac', items: [{ id: 'x', title: 'X', children: [{ kind: 'text', id: 'ax', text: 'x' }] }] },
        { kind: 'columns', id: 'c', of: 2, children: [[{ kind: 'text', id: 'l', text: 'L' }], [{ kind: 'text', id: 'r', text: 'R' }]] },
        { kind: 'quote', id: 'q', text: 'q' },
        { kind: 'gallery', id: 'gal', items: [{ src: 'a.png' }] },
        { kind: 'timeline', id: 'tl', items: [{ title: 't' }] },
        { kind: 'compare', id: 'cmp', columns: ['a', 'b'], rows: [{ label: 'l', a: '1', b: '2' }] },
        { kind: 'link', id: 'lnk', text: 'l', href: 'https://example.test' },
        { kind: 'spacer', id: 'sp' },
      ],
    });
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('catches the mistakes an author actually makes', () => {
    const codes = (spec: Parameters<typeof validateSpec>[0]): string[] => validateSpec(spec).issues.map((i) => i.code);
    expect(codes({ rules: [{ kind: 'grid', id: 'g', reels: 0, rows: 3, cells: [] }] })).toContain('grid-shape');
    expect(codes({ rules: [{ kind: 'grid', id: 'g', reels: 3, rows: 3, cells: [[9, 0]] }] })).toContain('grid-cell-oor');
    expect(codes({ rules: [{ kind: 'meter', id: 'm', value: 9, max: 5 }] })).toContain('meter-range');
    expect(codes({ rules: [{ kind: 'tabs', id: 't', tabs: [] }] })).toContain('empty-tabs');
    expect(codes({ rules: [{ kind: 'tabs', id: 't', tabs: [
      { id: 'a', label: 'A', children: [] }, { id: 'a', label: 'B', children: [] },
    ] }] })).toContain('dup-id');
    expect(codes({ rules: [{ kind: 'link', id: 'l', text: 'x', href: '  ' }] })).toContain('link-href');
    expect(codes({ rules: [{ kind: 'gallery', id: 'g', items: [{ src: '' }] }] })).toContain('image-src');
    expect(codes({ rules: [{ kind: 'symbols', id: 's', counts: ['3', '4'], rows: [{ name: 'A', pays: ['5'] }] }] })).toContain('symbols-arity');
  });

  it('walks into nested children, so a bad block inside a tab is still caught', () => {
    const r = validateSpec({
      rules: [{ kind: 'tabs', id: 't', tabs: [{ id: 'a', label: 'A', children: [{ kind: 'link', id: 'l', text: 'x', href: '' }] }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.path).toBe('rules[0].tabs[0].children[0].href');
  });

  it('every declared kind renders to something', () => {
    // A kind in BLOCK_KINDS that the HTML renderer forgot would silently vanish
    // from the info window; this is the guard against that.
    const sample: Record<string, BlockSpec> = {
      slider: { kind: 'slider', id: 'x' },
      toggle: { kind: 'toggle', id: 'x' },
      button: { kind: 'button', id: 'x', label: 'x' },
      select: { kind: 'select', id: 'x', options: [{ label: 'a', value: 'a' }] },
      stepper: { kind: 'stepper', id: 'x', levels: [1] },
      value: { kind: 'value', id: 'x' },
      text: { kind: 'text', id: 'x', text: 'x' },
      heading: { kind: 'heading', id: 'x', text: 'x' },
      subheading: { kind: 'subheading', id: 'x', text: 'x' },
      callout: { kind: 'callout', id: 'x', text: 'x' },
      'stat-grid': { kind: 'stat-grid', id: 'x', items: [{ label: 'a', value: 'b' }] },
      'mode-stats': { kind: 'mode-stats', id: 'x', extras: [{ label: 'a', value: 'b' }] },
      steps: { kind: 'steps', id: 'x', items: ['a'] },
      table: { kind: 'table', id: 'x', rows: [['a']] },
      paytable: { kind: 'paytable', id: 'x', rows: [{ symbol: 'A', payouts: '5:10' }] },
      paylines: { kind: 'paylines', id: 'x', reels: 3, rows: 3, lines: [[1, 1, 1]] },
      grid: { kind: 'grid', id: 'x', reels: 3, rows: 3, cells: [[0, 0]] },
      symbols: { kind: 'symbols', id: 'x', rows: [{ name: 'A', pays: ['5'] }] },
      kv: { kind: 'kv', id: 'x', items: [{ term: 'a', text: 'b' }] },
      meter: { kind: 'meter', id: 'x', value: 1 },
      badges: { kind: 'badges', id: 'x', items: [{ text: 'a' }] },
      tabs: { kind: 'tabs', id: 'x', tabs: [{ id: 'a', label: 'A', children: [] }] },
      accordion: { kind: 'accordion', id: 'x', items: [{ id: 'a', title: 'A', children: [] }] },
      columns: { kind: 'columns', id: 'x', of: 2, children: [[], []] },
      quote: { kind: 'quote', id: 'x', text: 'x' },
      gallery: { kind: 'gallery', id: 'x', items: [{ src: 'a.png' }] },
      timeline: { kind: 'timeline', id: 'x', items: [{ title: 'a' }] },
      compare: { kind: 'compare', id: 'x', columns: ['a', 'b'], rows: [{ label: 'l', a: '1', b: '2' }] },
      link: { kind: 'link', id: 'x', text: 'x', href: '#' },
      spacer: { kind: 'spacer', id: 'x' },
      image: { kind: 'image', id: 'x', src: 'a.png' },
      media: { kind: 'media', id: 'x', src: 'a.png', text: 'x' },
      cards: { kind: 'cards', id: 'x', items: [{ title: 'a' }] },
      legal: { kind: 'legal', id: 'x', text: 'x' },
      divider: { kind: 'divider', id: 'x' },
      group: { kind: 'group', id: 'x', children: [{ kind: 'text', id: 'y', text: 'y' }] },
    };
    for (const kind of BLOCK_KINDS) {
      const block = sample[kind];
      expect(block, `no sample for "${kind}"`).toBeTruthy();
      // Interactive kinds are rendered by the control layer, not by the HTML pass.
      if (['slider', 'toggle', 'button', 'select', 'stepper', 'value'].includes(kind)) continue;
      // A heading is a section header: on its own, with nothing under it, it is
      // deliberately dropped — so it is checked WITH the block it introduces.
      const doc = kind === 'heading' ? [block as BlockSpec, { kind: 'text', id: 'under', text: 'x' } as BlockSpec] : [block as BlockSpec];
      expect(html(doc).trim(), `"${kind}" renders nothing`).not.toBe('');
    }
  });
});

describe('the rules audit reads the wider vocabulary', () => {
  const facts = {
    modes: [
      { id: 'base', name: 'Base game', kind: 'base' as const, rtp: 96.5, maxWinX: 5000 },
      { id: 'free-spins', name: 'Free Spins', kind: 'buy' as const, cost: 100, rtp: 96.5, maxWinX: 5000 },
    ],
    freeSpins: { count: 10, retrigger: false },
  };

  it('counts a mode explained inside a tab', async () => {
    const { auditRules } = await import('../src/spec/facts');
    const inTabs: BlockSpec[] = [
      { kind: 'mode-stats', id: 'ms' },
      { kind: 'tabs', id: 't', tabs: [
        { id: 'base', label: 'Base game', children: [{ kind: 'text', id: 'b1', text: 'Ways pay left to right from reel one, at 96.5% RTP up to 5,000x.' }] },
        { id: 'fs', label: 'Free Spins', children: [{ kind: 'timeline', id: 'tl', items: [
          { title: 'Land 3 Scatters', text: 'Ten free spins start, with a rising multiplier, for 100x the bet if bought.' },
        ] }] },
      ] },
      { kind: 'legal', id: 'l', text: 'Malfunction voids all pays.' },
    ];
    const issues = auditRules(facts, inTabs);
    expect(issues.filter((i) => i.topic.startsWith('section:'))).toEqual([]);
  });

  it('still reports a mode that nothing explains', () => {
    // the same document, minus the Free Spins tab
    return import('../src/spec/facts').then(({ auditRules }) => {
      const issues = auditRules(facts, [
        { kind: 'tabs', id: 't', tabs: [{ id: 'base', label: 'Base game', children: [{ kind: 'text', id: 'b1', text: 'Ways pay left to right.' }] }] },
      ]);
      expect(issues.some((i) => i.code === 'rules-missing-mode-section' && i.topic === 'section:free-spins')).toBe(true);
    });
  });
});

describe('host data can never break out of an attribute', () => {
  it('escapes quotes in srcs, alts, hrefs and ids', () => {
    const out = html([
      { kind: 'gallery', id: 'g', items: [{ src: 'a.png" onerror="alert(1)', alt: 'an "alt"' }] },
      { kind: 'link', id: 'l', text: 'x', href: 'https://x.test" onclick="alert(1)' },
      { kind: 'tabs', id: 'a" onmouseover="x', tabs: [{ id: 'b"', label: 'B', children: [] }] },
      { kind: 'image', id: 'i', src: 'b.png" onload="x', alt: "it's" },
      { kind: 'gallery', id: 'g2', columns: 999 as unknown as number, items: [{ src: 'c.png' }] },
    ]);
    // The payloads survive as TEXT inside the value; what must never appear is a
    // real attribute — ` onerror="` with an unescaped quote — parsed out of them.
    expect(out).not.toMatch(/ on[a-z]+="/);
    expect(out).toContain('&quot;');
    expect(out).toContain('&#39;');
    // a nonsense column count is clamped, never pasted into the style attribute
    expect(out).toContain('--cols:6');
  });
});

describe('a section with nothing in it', () => {
  it('is dropped, so a heading never introduces a blank space', () => {
    // The Settings section of a composed menu is all interactive controls, which the
    // control layer draws — this HTML pass would otherwise emit its heading alone.
    const out = html([
      { kind: 'heading', id: 'settings', text: 'Settings' },
      { kind: 'slider', id: 'music', label: 'Music' },
      { kind: 'heading', id: 'rules', text: 'Rules' },
      { kind: 'text', id: 'r', text: 'Three scatters start the round.' },
    ]);
    expect(out).not.toContain('Settings');
    expect(out).toContain('Rules');
    expect(out).toContain('Three scatters');
  });

  it('keeps a section whose content is only an image', () => {
    const out = html([
      { kind: 'heading', id: 'h', text: 'Symbols' },
      { kind: 'image', id: 'i', src: 'a.png' },
    ]);
    expect(out).toContain('Symbols');
  });
});
