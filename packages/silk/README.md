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

The geometry is **measured, not guessed**. `scripts/extract-skin.mjs` opens the DOM
HUD wearing the skin in a real browser, reads every box, colour, font size, corner
radius and icon codepoint off the live stylesheet, and writes them to
`src/skin.generated.ts`. This package draws from those numbers, down to the icon
glyphs — the same characters from the same `icomoon` file the CSS uses.

`scripts/parity.mjs` then photographs both renderers at the same size over the same
backdrop and compares them pixel by pixel:

```bash
pnpm --dir examples/demo dev                    # the DOM client + the silk fixture
pnpm --filter @open-slot-ui/silk extract-skin   # re-measure after a skin change
pnpm --filter @open-slot-ui/silk parity         # → parity/*.png, and a number
```

Geometry lands on the pixel: the coin, the plate, the ladder bar and the round
button all sit in the same place at the same size. What still differs is **text
rasterisation** — a canvas draws glyphs through its own atlas and antialiasing, a
browser through its font stack — so the diff over a bar that is mostly numbers sits
at a few per cent rather than at zero, and the difference map shows exactly where.

## What is in it today

The **bar**: plate, buy coin, ☰ button, balance, win, the stake with its ladder bar
and ± changers, the round button in its three phases, autoplay, the feedback line.
Values, currency, locale and the spin/lock states are bound to the core, and the
fit that keeps the bar inside its window is the same rule the DOM binding uses.

Not yet ported: the windows (info, buy sheet, history), the ☰ menu's panel and the
autoplay drawer. They open over the game rather than sitting in the bar, and are the
next thing to draw.

## API

`mountSilkHud(app, spec?, opts?)` returns the same handle the other bindings do —
`ui`, `on`, `setBalance`/`setBet`/`setWin`, `setHudState`, `showFeedback`,
`applyJurisdiction`, `showRgsError`, `setReplay`, `dispose` — plus `view`, the
`Container` to add to your stage, and `layout(width, height)`.

`opts.fonts` points at the skin's font files (the canvas has no stylesheet to read
them from); `opts.maxScale` caps how large the bar is allowed to be.

MIT © schmooky and the open-ui contributors
