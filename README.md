# open-ui

[![CI](https://github.com/schmooky/open-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/schmooky/open-ui/actions/workflows/ci.yml)
[![@open-slot-ui/core](https://img.shields.io/npm/v/@open-slot-ui/core?label=%40open-ui%2Fcore)](https://www.npmjs.com/package/@open-slot-ui/core)
[![@open-slot-ui/pixi](https://img.shields.io/npm/v/@open-slot-ui/pixi?label=%40open-ui%2Fpixi)](https://www.npmjs.com/package/@open-slot-ui/pixi)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A **biased, themeable PixiJS UI library for slot games**. Mount the whole HUD onto
your existing Pixi scene in one call, then set how it looks and behaves with plain,
typed, string-literal options.

The HUD is **one docked ribbon**: the ☰ menu and the BALANCE / BET / WIN readouts on
the left, a dark action box (bet · ▲▼ · the round button · autoplay) on the right,
and the sheets and windows that open out of it — the menu, the autoplay panel, the
buy sheet, history, rules and the notice modal.

```bash
pnpm add @open-slot-ui/core @open-slot-ui/pixi pixi.js
```

```ts
import { mountHud } from '@open-slot-ui/pixi';

const hud = mountHud(app, {
  hud:      { dock: 'bottom', features: { buyFeature: false } }, // which parts EXIST
  autoplay: { mode: 'options' },        // 'options' panel, or 'infinite'
  spin:     { press: 'hold-to-spin' },  // 'tap', or hold-to-turbo-spin
});

hud.on('spinRequested', () => game.spin()); // events out
hud.ui.spin.busy();                          // commands in
hud.setBalance(1234);
hud.setWin(25);                              // the WIN readout counts up
game.keepReelsAbove(hud.pixi.barHeight);     // the strip the bar reserves
```

That's the whole integration. The HUD owns its layout, theming, animation,
responsive reflow and teardown — you own the game.

## Why

- **Configure, don't fork.** One JSON `UISpec` drives the theme, turbo modes,
  autoplay style, spin behavior, money formatting and per-device layout. A typo is
  a compile error; a bad value is reported, never fatal.
- **Headless core, thin renderer.** All state, logic, layout and theming live in
  zero-dependency `@open-slot-ui/core`. `@open-slot-ui/pixi` is a thin view binding.
- **Every control is a state machine.** State is the single source of truth for
  look, interactivity and tests — interactability is derived, never stored.
- **Introspection is first-class.** `window.__OPENUI__` reports every control's
  state, interactability and bounds, so e2e never reads a pixel.

See the doctrine in [CHARTER.md](./CHARTER.md).

## Packages

| Package | Role |
| --- | --- |
| [`@open-slot-ui/core`](./packages/core) | Headless M + C — signals, control state-machines, theme tokens, layout, façade, event bus, introspection. **Zero dependencies.** |
| [`@open-slot-ui/pixi`](./packages/pixi) | The PixiJS v8 view + controller binding. Mounts one `Container`, draws the bar itself. Peer-dep `pixi.js ^8`. |
| [`@open-slot-ui/dom`](./packages/dom) | The DOM binding: the HUD as real markup, dressed by **your** stylesheet. Draws nothing — use it when the design already exists as CSS. |

## Configuration at a glance

| Option | Values | What it does |
| --- | --- | --- |
| `hud.features` | ~30 booleans | Which parts of the bar EXIST — `buyFeature`, `history`, `autoplayAdvanced`, `betProgress`, `clock`, `maxWin`, … A part that is off is never built. |
| `hud.dock` | `'bottom' \| 'top'` | Which edge the ribbon docks to (the whole bar mirrors). |
| `hud.scale` · `hud.maxWidth` | `0.5..2` · rem | One knob scales the whole bar; the desktop plate's width cap. |
| `hud.reveal` | `'drop' \| 'rotate' \| 'spin' \| 'twist' \| 'none'` | How a changed readout animates in. |
| `theme` | `'default'` or safe overrides | Re-skins the bar, sheets and windows together, by tokens. |
| `turbo.modes` | `2 \| 3 \| string[]` | 2-mode toggle or 3-mode (off/turbo/super) switcher. |
| `autoplay` | `{ mode, options, lossLimits, winLimits }` | The panel's round list and its responsible-gambling stops. |
| `spin.press` | `'tap' \| 'hold-to-spin'` | One spin per tap, or turbo-spin while held. |
| `responsive` | `{ mobile, tablet, desktop, portrait, landscape }` | Reflow / hide controls per device & orientation. |
| `menu` | `{ settings, paytable, rules }` | The scrollable INFO window — Settings → Paytable → Rules. |
| `locale` | `{ messages, locale }` | i18n — safe key fall-through, with an auto Language switch. |
| `currency`, `betLadder`, `controls` | … | Money, formatting, per-control overrides. |

Configuration is the **only** way to change the UI — and it's guardrailed: a bad
value is reported and dropped, never fatal. You can localize and theme it; you
can't break it.

Full reference: **[the Configuration guide](https://open-ui.schmooky.dev/guides/configuration/)**.

## Rules as building blocks

The info window's Settings / Paytable / **Rules** are not prose you hand the
library — they are **blocks**, a vocabulary both renderers speak. The same
declaration draws on canvas (PixiJS) and in the DOM, is validated, is translated,
and is **audited**: every declared game mode must have its own section, with its
RTP, max win and price actually stated.

| Group | Kinds |
| --- | --- |
| Prose | `heading` · `subheading` · `text` · `callout` · `quote` · `legal` · `divider` · `spacer` · `link` |
| Tables & data | `table` · `kv` · `compare` · `stat-grid` · `mode-stats` (auto, from the declared facts) · `symbols` · `paytable` |
| The reels | `paylines` · `grid` (any cells lit — a scatter pattern, a cluster, a way) |
| At a glance | `badges` · `meter` · `timeline` · `steps` |
| Pictures | `image` · `media` (image + text) · `gallery` · `cards` |
| Containers | `tabs` · `accordion` · `columns` · `group` |
| Interactive | `toggle` · `slider` · `select` · `stepper` · `button` · `value` |

Write them as objects, or **as markup** — a rules page is content, so it can live
in a file a writer edits and a translator reads:

```xml
<rules>
  <badges><badge tone="accent">20 lines</badge><badge tone="bonus">Free spins</badge></badges>
  <tabs>
    <tab id="play" label="How to play">
      <list ordered><item>Set your bet.</item><item>Press spin.</item></list>
      <grid reels="5" rows="3" symbol="S" label="Scatters trigger anywhere">
        <cell reel="0" row="1"/><cell reel="2" row="0"/><cell reel="4" row="2"/>
      </grid>
    </tab>
    <tab id="pays" label="Symbols">
      <symbols counts="3 of a kind, 4 of a kind, 5 of a kind">
        <symbol name="Wild" icon="wild.png" pays="5x, 20x, 50x"/>
      </symbols>
    </tab>
  </tabs>
  <heading>Free Spins</heading>
  <text>Buy it for {{cost.free-spins}} your bet to start {{freeSpins.count}} free spins.</text>
</rules>
```

```ts
import { parseBlocks } from '@open-slot-ui/core';

const { blocks, issues } = parseBlocks(rulesXml); // JSON is accepted too; never throws
hud.mount({ menu: { rules: blocks } });
```

`{{cost.free-spins}}`, `{{rtp.base}}`, `{{maxWin.bonus}}`, `{{freeSpins.count}}`
interpolate from the **declared facts** at render time — a price or an RTP in the
rules can never drift from the configuration, and the audit checks the copy *as
rendered*. Every text is also its own i18n key, so a rules file translates against
one dictionary.

## Stake Engine compliance

open-ui renders the HUD; your game owns the [Stake Engine](https://stake-engine.com)
RGS contract (session, wallet, book/event playback). To publish, the UI just has to
honor the platform's per-player **`jurisdiction`** switchboard (returned by
`/wallet/authenticate`) and surface the responsible-gambling controls — one call:

```ts
hud.applyJurisdiction(jurisdiction); // the 12-flag config, verbatim from the RGS

hud.reportRound(win, bet);  // net-position readout + autoplay loss/win limits + auto-stop
hud.setRtp(96);             // the RTP readout
hud.setReplay(true);        // Stake replay mode → REPLAY badge + locked HUD

// Errors / notices are menu-style + themed. Every string is EITHER exact text you
// pass OR an i18n key you control — use the built-in defaults, localize them, or
// override per call. Action buttons take your own callbacks:
hud.showRgsError('ERR_IPB');                  // one-call, localized default message
hud.showError('Session expired.', {           // …or your exact text + custom buttons
  title: 'Heads up',
  actions: [{ label: 'Reload', variant: 'primary', onSelect: () => location.reload() }],
});
```

| Concern | open-ui |
| --- | --- |
| `disabled{Turbo,SuperTurbo,Autoplay,Slamstop,Spacebar,BuyFeature,Fullscreen}` | hides / locks the control (resize-proof) |
| `display{RTP,NetPosition,SessionTimer}` | reveals the matching readout |
| `socialCasino` · social coins (XGC→GC, XSC→SC) · zero-decimal currencies (JPY…) | currency table + `resolveCurrency` |
| Autoplay **loss-limit** + **single-win stop** + stop-anytime | in the panel's ADVANCED half (presets + a CUSTOM chip); enforced via `reportRound` |
| Slam-stop disabled | the spin button dims + locks during the spin |
| Insufficient funds / session expired / gambling-limit / maintenance / location | `hud.showRgsError(code)` — localizable defaults, per-call overridable, custom action buttons |
| Master mute + fullscreen | SOUND / MUSIC rows in the ☰ menu; fullscreen in the top overlay |
| Keyboard spin (Space/Enter, gated by `disabledSpacebar`) · replay mode · reality-check (RTS 13) | built in — `realityCheck`, `setReplay`, keyboard handler |
| Bet ladder + stake from RGS limits · `currency: 'JPY'` shorthand · never celebrate a win ≤ stake | `buildBetLadder` / `clampBet` / `resolveCurrency` / `winTier` helpers |

The compliance readouts (RTP · session · net) live in the **top overlay**, opposite
the bar — `hud.dock: 'top'` moves the bar up and the overlay down, so the two never
collide. `minimumRoundDuration` is surfaced as `ui.minimumRoundDuration` for the
**game** to enforce — open-ui never throttles the round. Slide the whole HUD in/out
with **`hud.showControls()` / `hud.hideControls()`** (pure translation,
non-interactive while moving), and choose how it first appears with
**`intro: 'shown' | 'hidden' | 'slide-in'`**. Try the flags live:
`localhost:5199/?juris=rtp,net,timer,noturbo,noslam&off=buyFeature,history&intro=slide-in`
(press **H** to slide the HUD).

## Repo layout

```
packages/core     @open-slot-ui/core  — headless library (Vitest)
packages/pixi     @open-slot-ui/pixi  — PixiJS renderer
examples/demo     standalone example client + Playwright device tests
apps/site         the docs site (Astro)
```

## Deploy the example

The example client is a static build — `pnpm build:demo` → `examples/demo/dist`. See
[DEPLOY.md](./DEPLOY.md) for the exact settings (including Timeweb App Platform, which
redeploys on every push).

## Develop

```bash
pnpm install
pnpm dev                      # the example client → http://localhost:5199
pnpm test                     # @open-slot-ui/core unit tests
pnpm typecheck                # all packages
pnpm build                    # build both libraries

pnpm --dir examples/demo test:visual   # Playwright device screenshots → screenshots/
pnpm --dir apps/site dev               # the docs site → http://localhost:5210
```

The example client reads its config from the URL, so you can see any permutation —
e.g. `localhost:5199/?off=buyFeature,history&dock=top&autoplay=infinite&spin=hold`.

## License

[MIT](./LICENSE)
