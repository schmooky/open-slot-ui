/**
 * THE BLOCK VOCABULARY, one entry per kind.
 *
 * Each sample is the MARKUP a rules author would write; the page parses it with
 * `parseBlocks` and renders it with `renderBlocksHtml`, so what a reader sees is
 * what their own file would produce — and the docs cannot drift from the parser,
 * because they run it.
 */
export interface BlockSample {
  kind: string;
  title: string;
  blurb: string;
  xml: string;
}

export const BLOCK_GROUPS: Array<{ title: string; blurb: string; kinds: string[] }> = [
  { title: 'Prose', blurb: 'The words themselves.', kinds: ['heading', 'subheading', 'text', 'callout', 'quote', 'legal', 'link', 'divider', 'spacer'] },
  { title: 'Lists and tables', blurb: 'Facts a player can scan.', kinds: ['steps', 'table', 'kv', 'compare', 'stat-grid', 'mode-stats'] },
  { title: 'The reels', blurb: 'Pictures of the game itself.', kinds: ['grid', 'paylines', 'symbols', 'paytable'] },
  { title: 'At a glance', blurb: 'Shapes that answer a question without being read.', kinds: ['badges', 'meter', 'timeline'] },
  { title: 'Pictures', blurb: 'Art, with words around it.', kinds: ['image', 'media', 'gallery', 'cards'] },
  { title: 'Containers', blurb: 'Structure — none of which hides anything.', kinds: ['sections', 'tabs', 'columns', 'group'] },
];

const ART = (label: string, bg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="150" viewBox="0 0 240 150"><rect width="240" height="150" rx="10" fill="${bg}"/><text x="120" y="75" dominant-baseline="central" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="26" fill="#fff">${label}</text></svg>`)}`;

export const BLOCKS: BlockSample[] = [
  { kind: 'heading', title: 'heading', blurb: 'A section header, with rules either side. Starts a new section for the rules audit.', xml: `<heading>Free Spins</heading>\n<text>Three scatters start the round.</text>` },
  { kind: 'subheading', title: 'subheading', blurb: 'A lighter title inside a section.', xml: `<subheading>Retriggers</subheading>\n<text>Two more scatters add five spins.</text>` },
  { kind: 'text', title: 'text', blurb: 'A paragraph. `**bold**` marks the words that matter; `{{tokens}}` resolve from the declared facts.', xml: `<text>Land 3 or more **Scatters** to win {{freeSpins.count}} free spins.</text>` },
  { kind: 'callout', title: 'callout', blurb: 'A note in a box, toned info / bonus / warning.', xml: `<note tone="bonus" title="Tip">Hold spin for turbo.</note>\n<note tone="warning" title="Please note">Malfunction voids all pays and play.</note>` },
  { kind: 'quote', title: 'quote', blurb: 'A pulled-out line in the operator’s voice.', xml: `<quote cite="The house">A slot is entertainment with a price, not a way to make money.</quote>` },
  { kind: 'legal', title: 'legal', blurb: 'Fine print. The audit checks a rules page has some.', xml: `<small>Play responsibly. 18+. Terms and conditions apply.</small>` },
  { kind: 'link', title: 'link', blurb: 'A way out of the game — opened in its own tab, with no window access back.', xml: `<a href="https://example.test/terms">Operator terms and conditions</a>` },
  { kind: 'divider', title: 'divider', blurb: 'A rule between two things.', xml: `<text>Above.</text><hr/><text>Below.</text>` },
  { kind: 'spacer', title: 'spacer', blurb: 'Deliberate air, in steps rather than pixels.', xml: `<text>Before.</text><spacer size="lg"/><text>After.</text>` },

  { kind: 'steps', title: 'steps', blurb: 'An ordered or unordered list.', xml: `<list ordered>\n  <item>Set your bet with the − and + buttons.</item>\n  <item>Press spin once, or **hold** for turbo.</item>\n  <item>Land 3 or more **Scatters**.</item>\n</list>` },
  { kind: 'table', title: 'table', blurb: 'A plain table: a header row, then rows of cells.', xml: `<table columns="Bet, Cost of the feature">\n  <row><cell>1.00</cell><cell>100.00</cell></row>\n  <row><cell>2.00</cell><cell>200.00</cell></row>\n</table>` },
  { kind: 'kv', title: 'kv', blurb: 'Term and description — a glossary, a spec sheet.', xml: `<glossary>\n  <entry term="RTP">The return over millions of rounds — not a promise about any session.</entry>\n  <entry term="Volatility">How lumpy the wins are.</entry>\n</glossary>` },
  { kind: 'compare', title: 'compare', blurb: 'Two columns, side by side: base game against the bonus.', xml: `<compare a="Base game" b="Free Spins">\n  <row label="RTP" a="96.50%" b="96.50%"/>\n  <row label="Max win" a="5,000x" b="5,000x"/>\n  <row label="Multiplier" a="None" b="Rises every spin"/>\n</compare>` },
  { kind: 'stat-grid', title: 'stat-grid', blurb: 'Label / value pairs in two columns.', xml: `<stats>\n  <stat label="Lines">20</stat>\n  <stat label="Reels">5 × 3</stat>\n  <stat label="Min bet">0.10</stat>\n  <stat label="Max bet">100.00</stat>\n</stats>` },
  { kind: 'mode-stats', title: 'mode-stats', blurb: 'Generated from the declared facts: one RTP and max win per mode. Cannot drift from the configuration, because it IS the configuration.', xml: `<mode-stats><extra label="Lines" value="20"/></mode-stats>` },

  { kind: 'grid', title: 'grid', blurb: 'A reel grid with any cells lit — a scatter pattern, a cluster, a way.', xml: `<grid reels="5" rows="3" symbol="S" label="Scatters trigger anywhere">\n  <cell reel="0" row="1"/><cell reel="2" row="0"/><cell reel="4" row="2"/>\n</grid>` },
  { kind: 'paylines', title: 'paylines', blurb: 'The line masks, in a wrapped flow, numbered.', xml: `<paylines reels="5" rows="3">\n  <line>1,1,1,1,1</line><line>0,0,0,0,0</line><line>2,2,2,2,2</line>\n  <line>0,1,2,1,0</line><line>2,1,0,1,2</line>\n</paylines>` },
  { kind: 'symbols', title: 'symbols', blurb: 'The symbol table: a row per symbol, a column per count.', xml: `<symbols counts="3 of a kind, 4 of a kind, 5 of a kind">\n  <symbol name="Wild" pays="5x, 20x, 50x"/>\n  <symbol name="Scatter" pays="3x, 10x, 40x"/>\n  <symbol name="Ace" pays="1x, 5x, 20x"/>\n</symbols>` },
  { kind: 'paytable', title: 'paytable', blurb: 'The icon-led paytable: art, then what each count pays.', xml: `<paytable columns="2">\n  <pay symbol="W">3: 5x\n4: 20x\n5: 50x</pay>\n  <pay symbol="S">3: 3x\n4: 10x\n5: 40x</pay>\n</paytable>` },

  { kind: 'badges', title: 'badges', blurb: 'Short chips: mechanics, a max win, a volatility.', xml: `<badges>\n  <badge tone="accent">20 lines</badge>\n  <badge>5 × 3 reels</badge>\n  <badge tone="bonus">Free spins</badge>\n  <badge tone="warning">High volatility</badge>\n</badges>` },
  { kind: 'meter', title: 'meter', blurb: 'A 0..max gauge — volatility, risk, hit rate.', xml: `<meter label="Volatility" value="4" max="5">Wins come rarely, and land big when they do.</meter>` },
  { kind: 'timeline', title: 'timeline', blurb: 'What happens, in the order it happens.', xml: `<timeline>\n  <step title="Land 3 Scatters">Anywhere on the reels.</step>\n  <step title="10 free spins begin">The multiplier climbs with every win.</step>\n  <step title="The round pays out">Up to the 5,000x cap.</step>\n</timeline>` },

  { kind: 'image', title: 'image', blurb: 'A picture on its own.', xml: `<image src="${ART('MAX WIN 5,000x', '#2a2f3a')}" alt="Max win 5,000x" width="240" height="150"/>` },
  { kind: 'media', title: 'media', blurb: 'A picture with words beside it; `side` puts it left or right.', xml: `<media side="left" width="240" height="150" src="${ART('BONUS', '#7c3aed')}" title="Free Spins">\n  Land 3 or more **Scatters** to start ten free spins with a rising multiplier.\n</media>` },
  { kind: 'gallery', title: 'gallery', blurb: 'A strip of pictures with captions.', xml: `<gallery columns="3">\n  <image src="${ART('FREE SPINS', '#7c3aed')}" caption="Free Spins"/>\n  <image src="${ART('SUPER SPINS', '#db2777')}" caption="Super Spins"/>\n  <image src="${ART('ANTE BET', '#2563eb')}" caption="Ante Bet"/>\n</gallery>` },
  { kind: 'cards', title: 'cards', blurb: 'Feature cards: an icon, a title, a line of copy.', xml: `<cards>\n  <card title="Wild">Substitutes for every paying symbol.</card>\n  <card title="Scatter">Pays anywhere on the reels.</card>\n  <card title="Multiplier">Boosts every win during the bonus.</card>\n</cards>` },

  { kind: 'sections', title: 'sections', blurb: 'Titled panels — all of them open. There is no flag to collapse one: a rule a player had to click to reveal is a rule they can say they never saw.', xml: `<sections>\n  <section id="rg" title="Responsible play">\n    <text>Set a limit before you start.</text>\n  </section>\n  <section id="terms" title="Terms">\n    <text>Malfunction voids all pays and play.</text>\n  </section>\n</sections>` },
  { kind: 'tabs', title: 'tabs', blurb: 'Written as tabs because that is how authors think — rendered as the same open stack, for the same reason.', xml: `<tabs>\n  <tab id="base" label="Base game"><text>Ways pay left to right.</text></tab>\n  <tab id="bonus" label="Bonus"><text>Ten free spins with a rising multiplier.</text></tab>\n</tabs>` },
  { kind: 'columns', title: 'columns', blurb: 'Side by side on a wide card, stacked on a narrow one — measured against the CONTAINER, not the window.', xml: `<columns of="2">\n  <column><grid reels="5" rows="3" symbol="S" label="Scatter"><cell reel="0" row="1"/><cell reel="2" row="1"/></grid></column>\n  <column><grid reels="5" rows="3" symbol="W" label="Wild"><cell reel="1" row="0"/><cell reel="1" row="1"/><cell reel="1" row="2"/></grid></column>\n</columns>` },
  { kind: 'group', title: 'group', blurb: 'A titled bundle of blocks, for when a section header would be too loud.', xml: `<group title="Good to know">\n  <text>Only the highest win per line pays.</text>\n  <text>Line wins are multiplied by the line bet.</text>\n</group>` },
];
