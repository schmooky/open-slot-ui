import { describe, it, expect } from 'vitest';
import { parseBlocks, parseJsonBlocks } from '../src/spec/parseBlocks';
import { renderBlocksHtml } from '../src/spec/rulesHtml';
import { validateSpec } from '../src/spec/validateSpec';
import type { BlockSpec } from '../src/spec/types';

const kinds = (bs: BlockSpec[]): string[] => bs.map((b) => b.kind);
const find = <K extends BlockSpec['kind']>(bs: BlockSpec[], kind: K): Extract<BlockSpec, { kind: K }> =>
  bs.find((b) => b.kind === kind) as Extract<BlockSpec, { kind: K }>;

describe('parseBlocks — the XML dialect', () => {
  it('reads prose, aliases and entities', () => {
    const { blocks, issues } = parseBlocks(`
      <rules>
        <heading>Free spins</heading>
        <h3>How it starts</h3>
        <p>Three scatters &amp; the round begins.</p>
        <note tone="bonus" title="Retrigger">Two more scatters add 5 spins.</note>
        <small>Malfunction voids all pays.</small>
        <hr/>
      </rules>`);
    expect(issues).toEqual([]);
    expect(kinds(blocks)).toEqual(['heading', 'subheading', 'text', 'callout', 'legal', 'divider']);
    expect(find(blocks, 'text').text).toBe('Three scatters & the round begins.');
    expect(find(blocks, 'callout').tone).toBe('bonus');
    expect(find(blocks, 'callout').title).toBe('Retrigger');
  });

  it('gives every block a stable id, and keeps the ones the author wrote', () => {
    const { blocks } = parseBlocks('<rules><p id="intro">Hi</p><p>There</p></rules>');
    expect(blocks.map((b) => b.id)).toEqual(['intro', 'text-1']);
    expect(validateSpec({ rules: blocks }).ok).toBe(true);
  });

  it('reads a table both ways round', () => {
    const { blocks } = parseBlocks(`
      <table columns="Bet, Cost">
        <row><cell>1.00</cell><cell>100.00</cell></row>
        <row><cell>2.00</cell><cell>200.00</cell></row>
      </table>`);
    const t = find(blocks, 'table');
    expect(t.columns).toEqual(['Bet', 'Cost']);
    expect(t.rows).toEqual([['1.00', '100.00'], ['2.00', '200.00']]);
  });

  it('reads a reel grid from child cells and from the compact attribute', () => {
    const a = find(parseBlocks('<grid reels="5" rows="3" symbol="S"><cell reel="0" row="1"/><cell reel="4" row="2"/></grid>').blocks, 'grid');
    expect(a.cells).toEqual([[0, 1], [4, 2]]);
    expect(a.symbol).toBe('S');
    const b = find(parseBlocks('<grid reels="3" rows="3" cells="0:0 1:1 2:2"/>').blocks, 'grid');
    expect(b.cells).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it('reads paylines as rows per reel', () => {
    const p = find(parseBlocks('<paylines reels="5" rows="3"><line>1,1,1,1,1</line><line>0 0 0 0 0</line></paylines>').blocks, 'paylines');
    expect(p.lines).toEqual([[1, 1, 1, 1, 1], [0, 0, 0, 0, 0]]);
  });

  it('reads the symbol table, pays as children or as an attribute', () => {
    const s = find(parseBlocks(`
      <symbols counts="3, 4, 5">
        <symbol name="Ace" symbol="A"><pay>5</pay><pay>20</pay><pay>100</pay></symbol>
        <symbol name="King" pays="4,15,80"/>
      </symbols>`).blocks, 'symbols');
    expect(s.counts).toEqual(['3', '4', '5']);
    expect(s.rows[0]?.pays).toEqual(['5', '20', '100']);
    expect(s.rows[1]).toEqual({ name: 'King', pays: ['4', '15', '80'] });
  });

  it('nests blocks through tabs, accordions, columns and groups', () => {
    const { blocks, issues } = parseBlocks(`
      <rules>
        <tabs>
          <tab id="base" label="Base game"><p>Ways pay left to right.</p></tab>
          <tab id="bonus" label="Bonus"><badges><badge tone="bonus">Free spins</badge></badges></tab>
        </tabs>
        <accordion>
          <section id="rtp" title="RTP" open><p>96.20%</p></section>
        </accordion>
        <columns of="2">
          <column><p>Left</p></column>
          <column><p>Right</p></column>
        </columns>
      </rules>`);
    expect(issues).toEqual([]);
    const tabs = find(blocks, 'tabs');
    expect(tabs.tabs.map((t) => t.id)).toEqual(['base', 'bonus']);
    expect(kinds(tabs.tabs[1]!.children)).toEqual(['badges']);
    const acc = find(blocks, 'accordion');
    expect(acc.items[0]?.open).toBe(true);
    expect(find(blocks, 'columns').children.map((c) => c.length)).toEqual([1, 1]);
  });

  it('reads meters, badges, kv, timeline, compare, gallery, link and spacer', () => {
    const { blocks } = parseBlocks(`
      <rules>
        <meter label="Volatility" value="4" max="5">Big swings.</meter>
        <badges><badge>243 ways</badge><badge tone="accent">5,000x</badge></badges>
        <glossary><entry term="Scatter">Pays anywhere.</entry></glossary>
        <timeline><step marker="1" title="Land 3">The round starts.</step></timeline>
        <compare a="Base" b="Bonus"><row label="RTP" a="96.2%" b="96.4%"/></compare>
        <gallery columns="2"><image src="a.png" caption="A"/><image src="b.png"/></gallery>
        <a href="https://example.test">Terms</a>
        <spacer size="lg"/>
      </rules>`);
    expect(kinds(blocks)).toEqual(['meter', 'badges', 'kv', 'timeline', 'compare', 'gallery', 'link', 'spacer']);
    const m = find(blocks, 'meter');
    expect([m.value, m.max, m.caption]).toEqual([4, 5, 'Big swings.']);
    expect(find(blocks, 'badges').items[1]?.tone).toBe('accent');
    expect(find(blocks, 'kv').items[0]).toEqual({ term: 'Scatter', text: 'Pays anywhere.' });
    expect(find(blocks, 'timeline').items[0]).toEqual({ title: 'Land 3', text: 'The round starts.', marker: '1' });
    expect(find(blocks, 'compare').columns).toEqual(['Base', 'Bonus']);
    expect(find(blocks, 'gallery').columns).toBe(2);
    expect(find(blocks, 'link').href).toBe('https://example.test');
    expect(find(blocks, 'spacer').size).toBe('lg');
  });

  it('reads the interactive blocks too', () => {
    const { blocks } = parseBlocks(`
      <rules>
        <toggle id="turbo" label="Turbo" on>Shorter spins.</toggle>
        <select id="lang" label="Language"><option value="en">English</option><option value="sv">Svenska</option></select>
        <stepper id="bet" label="Bet" levels="1,2,5"/>
        <button id="close" label="Close" action="closePanel"/>
      </rules>`);
    expect(kinds(blocks)).toEqual(['toggle', 'select', 'stepper', 'button']);
    expect(find(blocks, 'toggle').on).toBe(true);
    expect(find(blocks, 'toggle').hint).toBe('Shorter spins.');
    expect(find(blocks, 'select').options).toEqual([{ label: 'English', value: 'en' }, { label: 'Svenska', value: 'sv' }]);
    expect(find(blocks, 'stepper').levels).toEqual([1, 2, 5]);
    expect(find(blocks, 'button').action).toBe('closePanel');
  });

  it('keeps comments, CDATA and <br/> out of the way', () => {
    const { blocks } = parseBlocks('<rules><!-- a note --><p>One<br/>Two</p><p><![CDATA[3 < 4]]></p></rules>');
    expect(find(blocks, 'text').text).toBe('One\nTwo');
    expect((blocks[1] as Extract<BlockSpec, { kind: 'text' }>).text).toBe('3 < 4');
  });

  it('never throws: it reports what it could not read and returns the rest', () => {
    const { blocks, issues } = parseBlocks('<rules><p>Kept</p><wat>?</wat><p>Also kept</p>');
    expect(kinds(blocks)).toEqual(['text', 'text']);
    expect(issues.map((i) => i.code)).toContain('unknown-tag');
    expect(issues.map((i) => i.code)).toContain('unclosed');
  });

  it('accepts a stray close tag without losing the blocks around it', () => {
    const { blocks, issues } = parseBlocks('<rules><p>A</p></nope><p>B</p></rules>');
    expect(kinds(blocks)).toEqual(['text', 'text']);
    expect(issues[0]?.code).toBe('stray-close');
  });

  it('parses a fragment with no wrapper', () => {
    expect(kinds(parseBlocks('<p>A</p><p>B</p>').blocks)).toEqual(['text', 'text']);
  });
});

describe('parseBlocks — the JSON spelling', () => {
  it('takes an array, or an object with blocks, and fills missing ids', () => {
    const a = parseBlocks('[{ "kind": "text", "text": "Hi" }]');
    expect(a.blocks).toEqual([{ kind: 'text', id: 'text-1', text: 'Hi' }]);
    const b = parseJsonBlocks({ blocks: [{ kind: 'heading', text: 'Rules' }] });
    expect(b.blocks[0]?.id).toBe('heading-1');
  });

  it('fills ids inside tabs, accordions, columns and groups', () => {
    const { blocks } = parseJsonBlocks({
      blocks: [
        { kind: 'tabs', tabs: [{ id: 't', label: 'T', children: [{ kind: 'text', text: 'x' }] }] },
        { kind: 'columns', of: 2, children: [[{ kind: 'text', text: 'l' }], [{ kind: 'text', text: 'r' }]] },
        { kind: 'group', children: [{ kind: 'text', text: 'g' }] },
      ],
    });
    const tabs = find(blocks, 'tabs');
    expect(tabs.tabs[0]?.children[0]?.id).toBeTruthy();
    expect(find(blocks, 'columns').children[1]?.[0]?.id).toBeTruthy();
    expect(validateSpec({ rules: blocks }).ok).toBe(true);
  });

  it('reports bad JSON instead of throwing', () => {
    expect(parseBlocks('{ nope').issues[0]?.code).toBe('bad-json');
    expect(parseJsonBlocks('{"blocks":{}}').issues[0]?.code).toBe('bad-json');
    expect(parseJsonBlocks('[3]').issues[0]?.code).toBe('bad-block');
  });
});

describe('parsed markup renders and validates', () => {
  const source = `
    <rules>
      <heading>Game rules</heading>
      <tabs>
        <tab id="base" label="Base"><grid reels="5" rows="3"><cell reel="2" row="1"/></grid></tab>
        <tab id="bonus" label="Bonus"><timeline><step title="Land 3"/></timeline></tab>
      </tabs>
      <accordion><section id="rtp" title="RTP"><kv/></section></accordion>
      <meter label="Volatility" value="5" max="5"/>
      <a href="https://example.test">Terms</a>
    </rules>`;

  it('passes the validator', () => {
    const { blocks, issues } = parseBlocks(source);
    expect(issues).toEqual([]);
    const report = validateSpec({ rules: blocks });
    expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('renders to HTML the info window can show', () => {
    const html = renderBlocksHtml(parseBlocks(source).blocks, (s) => s);
    expect(html).toContain('ohm-tabs');
    expect(html).toContain('ohm-tabpanel');
    expect(html).toContain('<details');
    expect(html).toContain('ohm-meter');
    expect(html).toContain('href="https://example.test"');
    expect(html).not.toContain('<script');
  });
});

describe('list attributes', () => {
  it('splits on commas when there are any, so labels keep their spaces', () => {
    const s = parseBlocks('<symbols counts="3 of a kind, 4 of a kind, 5 of a kind"><symbol name="Ace" pays="1x, 5x, 20x"/></symbols>').blocks[0] as Extract<BlockSpec, { kind: 'symbols' }>;
    expect(s.counts).toEqual(['3 of a kind', '4 of a kind', '5 of a kind']);
    expect(s.rows[0]?.pays).toEqual(['1x', '5x', '20x']);
  });

  it('splits on whitespace when there are no commas', () => {
    const g = parseBlocks('<grid reels="3" rows="3" cells="0:0 1:1"/>').blocks[0] as Extract<BlockSpec, { kind: 'grid' }>;
    expect(g.cells).toEqual([[0, 0], [1, 1]]);
  });
});

describe('a step with no title', () => {
  it('reads its own text as the title', () => {
    const tl = parseBlocks('<timeline><step>Land 3 scatters</step><step title="Then" marker="2">Ten spins.</step></timeline>').blocks[0] as Extract<BlockSpec, { kind: 'timeline' }>;
    expect(tl.items[0]).toEqual({ title: 'Land 3 scatters' });
    expect(tl.items[1]).toEqual({ title: 'Then', text: 'Ten spins.', marker: '2' });
  });
});
