/**
 * What the gallery's HUD is a HUD *for*: a small, honest game configuration, so the
 * stories show real content instead of lorem ipsum. The rules are written in the
 * same markup a game would ship (`parseBlocks` reads it), and the features are the
 * four shapes a buy sheet has to handle: two purchases and two bet modifiers.
 */
export const FEATURES = [
  { id: 'free-spins', name: 'Free Spins', variant: 'buy' as const, cost: 100, description: '10 free spins with every win doubled.', image: art(480, 300, 'FREE SPINS', '#7c3aed', '#ffffff'), volatility: 'High' },
  { id: 'super-spins', name: 'Super Spins', variant: 'buy' as const, cost: 300, description: '15 free spins, and wilds stay put.', image: art(480, 300, 'SUPER SPINS', '#db2777', '#ffffff'), volatility: 'Very high' },
  { id: 'ante-bet', name: 'Ante Bet', variant: 'boost' as const, cost: 0.25, description: 'Doubles the chance of triggering the bonus.', image: art(480, 300, 'ANTE BET', '#2563eb', '#ffffff'), volatility: 'Medium' },
  { id: 'double-chance', name: 'Double Chance', variant: 'boost' as const, cost: 0.5, description: 'Two shots at the bonus on every spin.', image: art(480, 300, 'DOUBLE CHANCE', '#059669', '#ffffff'), volatility: 'High' },
];

/** Stand-in art as an inline SVG, so the gallery makes no third-party requests. */
function art(w: number, h: number, label: string, bg: string, fg: string): string {
  const size = Math.min(h * 0.34, (w * 0.86) / Math.max(1, label.length * 0.62));
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="${Math.min(w, h) * 0.08}" fill="${bg}"/><text x="${w / 2}" y="${h / 2}" dominant-baseline="central" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${size.toFixed(1)}" fill="${fg}">${label}</text></svg>`,
  )}`;
}

export const RULES_XML = `
<rules>
  <badges>
    <badge tone="accent">20 lines</badge>
    <badge>5 × 3 reels</badge>
    <badge tone="bonus">Free spins</badge>
    <badge tone="warning">High volatility</badge>
  </badges>
  <text>Match symbols on a line to win — **bigger symbols pay more**, and **Wild** substitutes for all.</text>
  <meter label="Volatility" value="4" max="5">Wins come rarely, and land big when they do.</meter>

  <sections>
    <section id="how" title="How to play">
      <list ordered>
        <item>Set your bet with the − and + buttons.</item>
        <item>Press spin once, or **hold** for turbo.</item>
        <item>Land 3 or more **Scatters** to start the bonus.</item>
      </list>
      <grid reels="5" rows="3" symbol="S" label="Scatters trigger anywhere">
        <cell reel="0" row="1"/><cell reel="2" row="0"/><cell reel="4" row="2"/>
      </grid>
    </section>
    <section id="pays" title="Symbols">
      <symbols counts="3 of a kind, 4 of a kind, 5 of a kind">
        <symbol name="Wild" pays="5x, 20x, 50x"/>
        <symbol name="Scatter" pays="3x, 10x, 40x"/>
        <symbol name="Star" pays="2x, 8x, 30x"/>
        <symbol name="Ace" pays="1x, 5x, 20x"/>
      </symbols>
      <paylines reels="5" rows="3">
        <line>1,1,1,1,1</line><line>0,0,0,0,0</line><line>2,2,2,2,2</line>
        <line>0,1,2,1,0</line><line>2,1,0,1,2</line>
      </paylines>
    </section>
    <section id="numbers" title="Numbers">
      <mode-stats><extra label="Lines" value="20"/></mode-stats>
      <compare a="Base game" b="Free Spins">
        <row label="RTP" a="96.50%" b="96.50%"/>
        <row label="Max win" a="5,000x" b="5,000x"/>
        <row label="Multiplier" a="None" b="Rises every spin"/>
      </compare>
      <glossary>
        <entry term="RTP">The return to player over millions of rounds — not a promise about any session.</entry>
        <entry term="Volatility">How lumpy the wins are. High means rarer wins that pay more.</entry>
      </glossary>
    </section>
  </sections>

  <heading>Free Spins</heading>
  <text>Land 3 or more **Scatters** — or buy the feature for {{cost.free-spins}} your bet — to start {{freeSpins.count}} free spins with a rising multiplier. Free spins {{freeSpins.retrigger}} be retriggered.</text>
  <timeline>
    <step title="Land 3 Scatters">Anywhere on the reels, on any spin.</step>
    <step title="{{freeSpins.count}} free spins begin">The multiplier starts at 1x and climbs with every winning spin.</step>
    <step title="The round pays out">Every win is added at the multiplier it landed on, up to the 5,000x cap.</step>
  </timeline>

  <heading>Super Spins</heading>
  <text>The premium bonus: buy it for {{cost.super-spins}} your bet to start the free spins at a higher multiplier. RTP 96.50%, max win 5,000x.</text>
  <heading>Ante Bet</heading>
  <text>Every spin costs **+25%** more, and the chance of triggering the bonus naturally is doubled. RTP 96.50%, max win 5,000x.</text>

  <heading>Controls</heading>
  <list>
    <item>**SPIN** — plays one round at the current bet.</item>
    <item>**− / +** — lower or raise your bet.</item>
    <item>**Autoplay** — play a chosen number of rounds automatically.</item>
    <item>**Turbo** — shortens the spin animation; the result is identical.</item>
    <item>**Menu (☰)** — settings, the paytable and these rules.</item>
  </list>

  <note tone="warning" title="Please note">Malfunction voids all pays and play.</note>
  <small>Play responsibly. 18+. Terms and conditions apply.</small>
</rules>`;
