# @open-slot-ui/silk

The HUD from [`@open-slot-ui/dom`](../dom), drawn on a PixiJS stage with
[pixi-silk](https://pixi-silk.schmooky.dev) instead of markup and CSS.

```bash
npm install @open-slot-ui/silk pixi-silk pixi.js
```

```ts
import { Application } from 'pixi.js';
import { mountSilkHud } from '@open-slot-ui/silk';

const app = new Application();
await app.init({ resizeTo: window, background: '#0d0d0d' });
document.body.appendChild(app.canvas);

const hud = mountSilkHud(app, {
  currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 },
  betLadder: { levels: [0.1, 0.2, 0.5, 1, 2, 5, 10], index: 3 },
});
app.stage.addChild(hud.view);

hud.on('spinRequested', () => game.spin());
hud.ui.spin.busy();      // the arrow dims — the round is out
hud.ui.spin.stopState(); // the answer is in — now it is a stop button
hud.setBalance(1234.56);
```

## Why it exists

The DOM binding is the one to reach for when there is a page to mount into: it
renders the ids and classes a casino skin already expects, and the studio's own
stylesheet dresses it. Some clients have no DOM to give it — a canvas-only build, a
native wrapper, an engine that owns the whole surface — and redrawing the bar by
hand for those is how two versions of one product start to drift.

So this is a fork of that binding, not a second design: same core, same controls,
same states, same strings; every plate, coin and glyph drawn as a pixi-silk
primitive.

## How it stays 1:1

The design is **measured, not redrawn**. `scripts/capture.mjs` opens the markup HUD
wearing the real skin in a real browser, walks it into every state a player can put
it in — menu open, autoplay drawer out, a round in flight, each window up — and
writes down every box it can see: position, size, fill, ramp, border, radius,
shadow, the text, and where each *line* of that text landed. `src/tree.ts` replays
those boxes with pixi-silk. What you see on the canvas is what the browser painted,
made of shapes a GPU can draw.

And it does it **at every size the stylesheet lays out differently** — two desktop
widths, a tablet, and a phone in both orientations, the small ones as touch devices
so the skin switches to its mobile channel. The binding picks the design nearest the
window it is given and anchors it, which is adaptivity rather than zoom: at 1920 the
bar is the 1920 design, on a phone it is the phone's, and the modals, menu and
controls are that breakpoint's own.

Things a naive walk would get wrong, and this does not:

- **Layers.** The capture reads each layer's `z-index` off the markup. In this skin
  the bar sits *above* the windows (1311 over 1300), which is why the buy coin stays
  lit while the rules are open.
- **Anchors.** Each box records the zone it belongs to — the bar, the compliance
  strip, a window — and the canvas anchors each zone to the edge CSS anchors it to.
- **Clipping.** A clip belongs to a containing block, not to every ancestor: the
  mobile ☰ lives inside a zero-width overflow-hidden box and is perfectly visible,
  because it is positioned against something further up.
- **Paint order.** `::before` paints under the element, `::after` over its whole
  subtree — that last one is what makes the fade at the bottom of a scrolling window
  a fade — and a clipped run keeps its place in the order rather than being merged
  with the next thing that shares its clip.
- **Turned boxes.** The buy coin is a 45° disc whose label wraps inside its own
  frame, and a close ✕ is two bars at ±45°. The capture takes the box before the
  turn and the angle beside it, measuring the text with the turn switched off.
- **Pictures.** An `<img>` is painted inside its box by `object-fit`, not stretched
  across it.
- **Type and icons.** Lines are measured character by character and drawn where they
  were measured, so the canvas never re-breaks a paragraph. Icons are placed by
  their **ink box**, not by centring a line box, because a character sits inside its
  line box wherever the font says — and the tree is rebuilt once the real fonts
  arrive, since text measured in a fallback face is text in the wrong place.

Two harnesses keep it honest:

```bash
pnpm --dir examples/demo dev                  # the client, both renderers
pnpm --filter @open-slot-ui/silk capture      # re-measure after a skin change
pnpm --filter @open-slot-ui/silk doors        # every window opens on the canvas route
pnpm --filter @open-slot-ui/silk parity       # → parity/*.png, and a number per state
```

`doors` presses the canvas HUD where each button is, asks the binding which state it
drew, and checks that the ± changers move the stake and the round button charges it.
`parity` runs the same client twice — `/` and `/?renderer=silk`, both with
`?bare=1&bg=…` so they share a backdrop and no game — walks both into each state at
each size, and compares them pixel by pixel:

| window    | idle  | menu  | autoplay | info  | buy   | history |
| --------- | ----- | ----- | -------- | ----- | ----- | ------- |
| 1920×1080 | 0.40% | 0.60% | 0.64%    | 1.77% | 1.45% | 0.65%   |
| 1440×900  | 0.62% | 0.93% | 0.99%    | 2.45% | 2.30% | 1.02%   |
| 1180×820  | 0.84% | 1.26% | 1.35%    | 2.99% | 3.60% | 1.38%   |
| 834×1112  | 0.43% | 1.16% | 0.85%    | 3.80% | 3.13% | 1.17%   |
| 932×430   | 1.02% | 2.64% | 2.11%    | 4.19% | 4.75% | 2.59%   |
| 430×932   | 1.00% | 2.65% | 1.91%    | 5.80% | 5.20% | 2.41%   |

Geometry lands on the pixel. What is left is **text rasterisation** — a canvas draws
glyphs through its own atlas and antialiasing, a browser through its font stack — so
a window full of prose shows a few per cent of edge pixels rather than zero. Counting
only pixels that differ by more than a stop of brightness, every cell above is under
0.6%, and the difference map shows exactly where each one is.

## What is in it today

Everything the markup binding shows: the **bar** (plate, buy coin, ☰, balance, win,
the stake with its ladder bar and ± changers, the round button in its three phases,
autoplay, the feedback line), the **☰ menu**, the **autoplay drawer**, and the three
**windows** — game info with the full rules, the buy sheet with its cards, and bet
history. Values, currency, locale, panel state and the spin/lock states are bound to
the core, and long money sizes itself down inside its own box the way the skin's
per-length font rules do.

The honest limit: between two captured breakpoints the nearer design is scaled to the
window rather than reflowed, so a width far from any captured one is a scaled design.
Capture the sizes you ship at, and the HUD is the markup's own at each of them.

## API

`mountSilkHud(app, spec?, opts?)` returns the same handle the other bindings do —
`ui`, `on`, `setBalance`/`setBet`/`setWin`, `setHudState`, `showFeedback`,
`applyJurisdiction`, `showRgsError`, `setReplay`, `dispose` — plus `view`, the
`Container` to add to your stage, and `layout(width, height)`.

`opts.fonts` points at the skin's font files (the canvas has no stylesheet to read
them from); `opts.maxScale` caps how large the design is allowed to be drawn.

Two more, for tests: `state()` says which captured state is on screen, and
`pointOf(id)` says where a captured element ended up in page pixels — a canvas has
no markup for a harness to click.

MIT © schmooky and the open-ui contributors
