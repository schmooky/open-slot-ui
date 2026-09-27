# Using open-ui in a game

A slot HUD is the same twenty controls every time — balance, stake, a round button,
a menu, an autoplay panel, a rules window a regulator will read. This library owns
those; your game owns the reels. The whole integration is *mount it, listen for a
spin, tell it what happened*.

```bash
npm install @open-slot-ui/dom @open-slot-ui/core
```

The markup binding (`@open-slot-ui/dom`) renders real DOM and your stylesheet
dresses it. If your client has no DOM to mount into, use `@open-slot-ui/pixi`
instead — same core, same events, drawn on a PixiJS stage.

## The smallest real integration

```ts
import { mountDomHud } from '@open-slot-ui/dom';

const hud = mountDomHud(
  {
    currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 },
    betLadder: { levels: [0.2, 0.5, 1, 2, 5, 10], index: 2 },
    game: { name: 'Max Win Machine' },
  },
  { skin: { href: '/skin/ui.css', font: { family: 'icomoon', src: '/skin/icomoon.woff2' } } },
);

hud.setBalance(1000);

hud.on('spinRequested', async () => {
  hud.ui.spin.busy();                 // the arrow dims; the bar locks itself
  const round = await game.spin(hud.ui.bet.get());
  hud.setBalance(round.balance);
  hud.setWin(round.win);              // the WIN readout counts up
  hud.reportRound(round.win, round.bet); // feeds autoplay's stops and the history
  hud.ui.spin.idle();
});
```

That is the contract: **events out, commands in.** The HUD never touches your
game's money or maths — it shows what you tell it and reports what the player did.

### Events you will use

| Event | When |
| --- | --- |
| `spinRequested` | The round button, the spacebar, or an autoplay round. |
| `skipRequested` | The slam-stop mid-round. |
| `betChanged` | The stake moved (± buttons, keyboard, or the ladder). |
| `buttonActivated` | A menu row the game owns (`{ id: 'support' }`), the lobby, a buy card. |
| `autoplayStarted` / `autoplayStopped` | With the count and the limits the player chose. |
| `valueChanged` | A slider — sound and music volume. |

### Commands you will use

`setBalance` · `setBet` · `setWin` · `setTotalWin` · `setFreeSpins` · `setHistory` ·
`setMaxWin` · `setCurrency` · `setHudState` · `showFeedback` · `reportRound` ·
`ready` (hides the boot spinner, if you asked for one) · `dispose`.

Control handles live on `hud.ui`: `ui.spin`, `ui.bet`, `ui.balance`, `ui.autoplay`,
`ui.speeds`, `ui.mainMenuPanel`, and the rest.

## Configuring it

Everything below is data. A bad value is reported through `hooks.onDataIssue` and
dropped — it never throws, and never leaves the HUD in a state a player can see.

### What exists

```ts
hud: {
  features: { buyFeature: false, history: true, clock: false },  // ~30 switches
  readouts: ['bet', 'balance', 'win'],                           // the data panel, in order
  dock: 'bottom',
}
```

### Speeds

As many as the game has, named by the game:

```ts
hud: {
  speeds: [
    { id: 'turbo' },                                       // TURBO, base + bonus switches
    { id: 'nitro', name: 'NITRO', icon: 'icon-bolt' },
    { id: 'warp', name: 'WARP SPEED', scopes: ['base'] },  // one switch, not two
  ],
}
```

Each gets a menu row and a handle: `ui.speeds[i].isOn`, `.base`, `.bonus`, `.set(on)`.
Read them when you decide how fast to spin the reels.

### The menu

```ts
hud: {
  menu: [
    { kind: 'sound' },
    { kind: 'music' },
    { kind: 'speed', speed: 'turbo' },
    { kind: 'history' },
    { kind: 'info' },
    { kind: 'support', href: 'https://help.example.com' },   // opens in a tab
    { kind: 'action', id: 'tournament', label: 'TOURNAMENT', icon: 'icon-cup' },
  ],
}
```

Leave `menu` out and you get the rows your feature flags left on, in the reference's
order. A row with `href` opens the page itself; a row without one only reports its
press as `buttonActivated`, which is also emitted for the linked rows so you can
intercept them.

### Autoplay

```ts
autoplay: {
  options: [10, 25, 50, 100, Infinity],
  lossLimits: [5, 20, 50],        // × stake
  winLimits: [10, 20, 75],        // single-win stop, × stake
  requireLimits: false,           // some markets need both before START
  stopOnAnyWin: true,             // offers a stop that needs no multiplier
}
```

Autoplay only enforces stops if you call `hud.reportRound(win, bet)` after each round.

### The rules window

The INFO window is built from declarative blocks, so the rules a regulator reads
are the same data your paytable is generated from — not a second copy in HTML.

```ts
import { parseBlocks } from '@open-slot-ui/core';

mountDomHud({ rules: parseBlocks(rulesXml) }, { skin });
```

`parseBlocks` takes XML or JSON and never throws; `auditRules` tells you what a
certifier would send back for being missing.

### The look

```ts
mountDomHud(spec, {
  skin: { href: '/skin/ui.css' },
  spinner: false,                                     // default: no boot spinner
  icons: { spin: 'icon-play', betUp: 'icon-plus' },   // any of the bar's glyphs
  motion: 'auto',                                     // follows prefers-reduced-motion
  keyboard: { spin: [' '], close: ['Escape'] },       // or { enabled: false }
});
```

and, in the spec, a theme:

```ts
theme: { overrides: { color: { accent: '#00d1b2' }, motion: { base: 320 } } }
```

Only the tokens you change are written, as the custom properties your stylesheet
already reads — the rest of the skin is left alone.

## Compliance

```ts
hud.applyJurisdiction({ disabledAutoplay: true, mandatoryRtp: true, disabledSpacebar: true });
hud.setRtp(96.1);
hud.showRgsError('INSUFFICIENT_FUNDS');
hud.setReplay(true);
```

The switchboard hides, disables or reveals what the market requires — including
the keyboard, which is why `disabledSpacebar` is honoured even when you configured
a spin key.

## Teardown

```ts
hud.dispose(); // every listener, timer and node the HUD made
```

## Where to look next

- **Configuration reference** — <https://open-ui.schmooky.dev/guides/configuration/>
- **The gallery** — every control and window on its own URL, live:
  <https://open-ui.schmooky.dev/gallery/>
- **Events** — <https://open-ui.schmooky.dev/docs/events/>
