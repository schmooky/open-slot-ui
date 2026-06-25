# pixi-text-counter

Animated numeric counter as a PixiJS 8 `Container`. Mechanical-reel digit roll with low-variance filler frames for smooth motion. Built for slot game balance and win displays.

**[Live demo →](https://pixi-text-counter.schmooky.dev)** · **[GitHub →](https://github.com/schmooky/pixi-text-counter)**

```bash
npm install pixi-text-counter pixi.js
```

`pixi.js@^8` is a peer dependency.

## Features

- **Mechanical-reel digit roll** with per-column duration scaling, stagger, and easing
- **Low-variance filler trick** — smooth motion at 60fps without strobing
- **Two cell renderers shipped** — `BitmapFontCellRenderer` (bitmap text, best perf) and `SpriteSheetCellRenderer` (atlas sprites, ideal for mobile)
- **Pluggable `CellRenderer` interface** — drop in your own (Pixi `Text`, animated digits, layered FX, anything)
- **Motion blur** via single `BlurFilter` on the DigitRow *or* pre-rendered blurred filler textures (zero filter cost)
- **Configurable thousands separator** + **decimal point** with per-currency `decimals` (USD `.00`, JPY integer, BTC 8-decimal, etc.) — values stay integer (minor units), no float drift
- **Leading-zero `show` / `dim` / `hide`** with smooth alpha cross-fade; separators sync to their adjacent column
- **Static prefix / suffix** — string char or any PixiJS `Container`
- **`Promise<void>` `setValue`** with mid-roll interruption, `cancel()` to skip to end, `instant: true` to snap
- **Events** — `rollstart`, `rollend`, `digitsettle` (per-column, wire your click sounds here)
- **Bounded work, allocation-aware** — pre-allocated cells & tweens, no per-frame closures, dirty-range filler tracking. Idle counters cost effectively zero per frame.
- **ESM + CJS + d.ts**, MIT, side-effect-free, `pixi.js@^8` as peer dep

## Table of contents

- [Quickstart](#quickstart) · [Mobile setup](#production-setup-mobile)
- [`Counter` options](#new-counteroptions) · [Defaults](#defaults) · [Methods](#methods)
- [Currency & decimals](#currency-and-decimals) · [Skip an in-flight roll](#skip-an-in-flight-roll)
- [Events](#events) · [`CellRenderer` interface](#cellrenderer-interface)
- [Performance contracts](#performance-contracts) · [Why the filler trick works](#the-filler-trick)
- [Mobile guide](#mobile-guide) · [What's not in v0.1](#whats-not-in-v01)

## Quickstart

```ts
import { Application, Assets } from 'pixi.js';
import { Counter, BitmapFontCellRenderer } from 'pixi-text-counter';

const app = new Application();
await app.init({ background: '#0a0a0a', resizeTo: window });
document.body.appendChild(app.canvas);

await Assets.load('fonts/slot-display.xml'); // BitmapFont

const balance = new Counter({
  digits: 6,
  cellRenderer: new BitmapFontCellRenderer({
    fontName: 'SlotDisplay',
    fontSize: 48,
    digitWidth: 36,
    digitHeight: 56,
    fillerChar: '', // a custom PUA glyph in your font, or '' for blank fillers
  }),
  digitWidth: 36,
  digitHeight: 56,
  initialValue: 1000,
  prefix: '$',
  separator: { char: ',', every: 3 },
  leadingZeros: { mode: 'dim' },
  blur: { enabled: true, peak: 6 },
});

balance.position.set(40, 40);
app.stage.addChild(balance);

await balance.setValue(2500);
```

## Production setup (mobile)

Skip the `BlurFilter` entirely and bake the motion blur into texture assets:

```ts
import { Counter, SpriteSheetCellRenderer } from 'pixi-text-counter';

const balance = new Counter({
  digits: 6,
  cellRenderer: new SpriteSheetCellRenderer({
    digitTextures:  Array.from({ length: 10 }, (_, d) => Texture.from(`digit_${d}`)),
    fillerTextures: Array.from({ length: 10 }, (_, d) => Texture.from(`digit_${d}_blur`)),
    digitWidth: 36,
    digitHeight: 56,
  }),
  digitWidth: 36,
  digitHeight: 56,
  blur: { enabled: false }, // blur baked into filler textures
  // …
});
```

**Pack digits and fillers in one atlas page.** Mixing atlas pages doubles draw calls during a roll.

## API

### `new Counter(options)`

| Option | Type | Default | Notes |
|---|---|---|---|
| `digits` | `number` | — | Number of digit columns. |
| `cellRenderer` | `CellRenderer` | — | Pluggable cell renderer. |
| `digitWidth` | `number` | — | Width of one cell, in pixels. |
| `digitHeight` | `number` | — | Height of one cell. |
| `initialValue` | `number` | `0` | Clamped to `[0, 10^digits - 1]`. |
| `prefix` | `string \| Container` | — | Static glyph or container before the digits. |
| `suffix` | `string \| Container` | — | Static glyph or container after the digits. |
| `separator` | `{ char, every? }` | — | Thousands separator. `every` defaults to `3`. |
| `decimals` | `number` | `0` | Number of fractional digit columns. Values are in **minor units** (see below). |
| `decimalChar` | `string` | `'.'` | Decimal-point character (e.g. `','` for European convention). |
| `leadingZeros` | `{ mode, alpha?, tweenMs? }` | `{ mode: 'show' }` | `'show' \| 'dim' \| 'hide'`. Applies to integer cols only — decimal cols stay full alpha. |
| `blur` | `{ enabled, peak? }` | `{ enabled: false, peak: 8 }` | Single `BlurFilter` on the DigitRow. |
| `motion` | `MotionOptions` | (see Defaults) | Per-step duration, stagger, place-bump, clamps, ease. |
| `ticker` | `Ticker` | `Ticker.shared` | Override for tests or custom loops. |

### Defaults

```ts
{
  motion: {
    msPerStep: 35,
    staggerMs: 28,
    placeDurationBump: 25,
    minMs: 280,
    maxMs: 620,
    ease: ease.slotRoll,
  },
  leadingZeros: { mode: 'show', alpha: 0.35, tweenMs: 150 },
  blur: { enabled: false, peak: 8 },
}
```

### Methods

- `setValue(value: number, opts?): Promise<void>` — Animate to `value`. Resolves at `rollend` (or immediately for `instant: true`).
  - `direction`: `'up' | 'down' | 'auto'`. Default `'auto'`.
  - `instant`: skip animation; no events emitted.
  - `duration`: override per-column duration (ms).
  - `onComplete`: fires alongside the Promise resolution.
- `getValue(): number` — Target value (post-setValue), not the visible mid-tween position.
- `isAnimating(): boolean`
- `cancel(): void` — **Skip the in-flight animation to its end.** Position tweens jump to target Y, leading-zero alpha tweens jump to target alpha, the blur tween snaps to 0. `digitsettle` fires for each settling column, then `rollend`. The pending `setValue` Promise resolves. No-op if nothing is rolling.
- `destroy(options?)` — Destroys the Counter and all owned display objects.

### Currency and decimals

`decimals` adds fractional digit columns with a decimal-point separator. The point is always visible; leading-zero dim/hide affects integer columns only. Pass values as **minor units** (the smallest denomination of the currency) so the lib stays in integer math:

```ts
// USD: 2 decimals, period
new Counter({
  digits: 15,
  decimals: 2,
  decimalChar: '.',
  separator: { char: ',', every: 3 },
  suffix: ' USD',
  // ...
});
counter.setValue(190000); // displays "1,900.00 USD"

// EUR with European convention: comma as decimal, period as thousands
new Counter({
  digits: 15,
  decimals: 2,
  decimalChar: ',',
  separator: { char: '.', every: 3 },
  suffix: ' €',
  // ...
});

// JPY: integer-only (no fractional yen)
new Counter({
  digits: 15,
  decimals: 0,
  separator: { char: ',', every: 3 },
  suffix: ' JPY',
  // ...
});

// BTC: 8 decimals (satoshis)
new Counter({
  digits: 16,
  decimals: 8,
  separator: { char: ',', every: 3 },
  suffix: ' BTC',
  // ...
});
counter.setValue(150_000_000); // displays "1.50000000 BTC"
```

Thousands separators are only placed between integer columns, so `1234567` with `decimals: 2` reads `12,345.67` — not `1,234,567`.

### Skip an in-flight roll

Wire `cancel()` into your input handler to give the player instant feedback on rapid clicks:

```ts
function onBetClick() {
  counter.cancel();              // snap the current roll to its target
  counter.setValue(newBalance);  // start a fresh roll from there
}
```

`cancel()` is cheap when nothing's rolling, so it's safe to call on every input. Sequence vs. interrupt:

| Pattern | Behavior |
|---|---|
| `setValue(B)` mid-roll to A | The columns reinterpret as a continuous trajectory from current Y to B. Digits in transit. |
| `cancel()` then `setValue(B)` | The roll to A finishes instantly (digits land on A, `rollend` fires), then a clean roll to B begins. |
| `setValue(B, { instant: true })` | Snap to B with no animation. No events. |

### Events

| Event | Payload | When |
|---|---|---|
| `rollstart` | `{ from, to, direction }` | Once per `setValue` that triggers animation. |
| `rollend` | `{ value }` | When the last column tween completes. |
| `digitsettle` | `{ column, digit }` | Per column as each tween completes — wire your click sounds here. |

`instant: true` calls emit no events.

> ⚠️ **Event payload objects are reused across emits.** Don't retain the reference past the handler — copy the fields you need synchronously.

### `CellRenderer` interface

```ts
interface CellRenderer<C extends Container = Container> {
  createCell(digit: number): C;
  setDigit(cell: C, digit: number): void;
  setFiller(cell: C, digit: number): void;
  createSeparator?(char: string): Container;
  destroyCell?(cell: C): void;
}
```

Write your own for custom rendering (e.g. animated digits, multi-layer composition).

## Performance contracts

These are binding budgets enforced by tests and CI on every PR:

| Metric | Budget |
|---|---|
| Idle cost per Counter per frame | < 0.05ms |
| `setValue` invocation (animating) | < 0.3ms desktop, < 1ms mid-tier mobile |
| Allocations per `setValue` (steady state) | < 100 bytes |
| Active tweens per Counter | `2 × digits + 1` max |
| Draw calls added during roll | ≤ 1 (the BlurFilter render-target) |
| Frame time, 16 Counters rolling on Pixel 6 | < 12ms p99 |

## The filler trick

A `Counter` is a vertical strip of 20 cells inside a `digitWidth × digitHeight` mask. The strip slides; the mask reveals one cell at a time. During a roll, intermediate cells are swapped to a low-variance filler glyph — when sampled at 60fps, the column reads as a continuous blur instead of a strobed strip of numerals.

Pair the filler with either:
- A `BlurFilter` on the `DigitRow` (one render-target switch per Counter — fine for desktop), or
- Pre-rendered blurred filler textures via `SpriteSheetCellRenderer` (`blur.enabled: false`) — zero filter cost, the production path for mobile.

## Mobile guide

1. Use `SpriteSheetCellRenderer` with digits and pre-blurred fillers packed in **one** atlas page.
2. Set `blur: { enabled: false }`.
3. Keep `digits ≤ 8`, `motion.maxMs ≤ 700`, `motion.staggerMs ≤ 35`.
4. Use `Ticker.shared` (the default) — don't allocate a per-Counter ticker.

## What's not in v0.1

Documented as planned, intentionally out of scope for the first release:

- Floats / fixed decimal places
- Currency formatting via `Intl.NumberFormat`
- Per-digit color theming based on value tier
- Built-in sound integration beyond the `digitsettle` event
- React / Vue / Svelte wrappers (will live in downstream packages)

## License

MIT
