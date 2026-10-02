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
    game: { name: 'Neon Reels' },
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
theme: {
  overrides: {
    color: {
      accent: '#7fe7f5',        // the buy coin, and every highlight on the bar
      featureBuy: '#a25bff',    // what a BOUGHT FEATURE lights up in (see below)
      featureBuyText: '#04202a',
    },
    motion: { base: 320 },
  },
}
```

Only the tokens you change are written, as the custom properties your stylesheet
already reads — the rest of the skin is left alone.

**The two colours a game owns.** `accent` is the game's own: the buy coin wears it
at rest, and so does every highlight on the bar. `featureBuy` is the colour a
bought feature lights up in — while one is active the banner across the bar, the
round button, the stake and the ladder bar all take it, and the coin turns into
DISABLE wearing the same colour. They are separate on purpose: a game whose coin is
cyan can still flash purple when its feature is running.

### The round button

One button, five faces, and the HUD picks between them from the core's state — you
never set them:

| The player sees | When |
| --- | --- |
| the spin arrow | idle |
| the same arrow, dimmed | the round is out with the server (`ui.spin.busy()`) |
| a white square | the answer is in and the round can be skipped (`ui.spin.stopState()`) |
| ⟳▶ | the autoplay picker is open — pressing it starts the run |
| a tile counting down | an autoplay run is going; pressing it stops the run |

Four knobs, if the skin's own numbers do not suit the game:

| Variable | Default | What it does |
| --- | --- | --- |
| `--ohm-stop-scale` | `1.34` | Size of the stop square, as a multiple of the skin's own. `1` is the reference's proportion. |
| `--ohm-counter-bg` · `--ohm-counter-text` · `--ohm-counter-radius` | `#fff` · `#000` · `8px` | The autoplay tile. |
| `--ohm-changer-gap` | `6px` | Clearance between the round button and the ± changers on a touch bar, where the skin tucks them under its edge. |
| `--ohm-buy-label` | `10px` | Floor under the buy coin's word on a touch bar; the skin shrinks it to 8px or less to fit a rotated disc. |

### Settings that survive a reload

```ts
mountDomHud(spec, { persist: 'my-game-settings' });
```

Opt-in. Restores the sound and music levels, the master mute, every speed's
base/bonus switches and SPACEBAR TO SPIN at mount, and writes them back as they
change. Storage failures cost the memory, never the game; a stored set from an
older version is ignored rather than applied. Pass `{ key, storage }` to put them
somewhere else.

### Free rounds an operator gave away

```ts
hud: { freeRounds: 'takeover' }   // default 'inline'
…
hud.setFreeRounds(8);             // the campaign starts; the bar rearranges itself
hud.setFreeRounds(0);             // ...and puts itself back
```

With `'takeover'`, a running campaign gives the round button's place to a box
reading TOTAL WIN | FREE ROUNDS, and the whole action panel — stake widget, ±
changers, round button, autoplay — steps aside, because the HUD plays those rounds
itself and they are controls with nothing to control. The stake stays readable in
the data panel, as it does during free spins. Everything is keyed on
`[data-openui-free-rounds="true"]`, so a skin can overrule any of it, and the
readouts keep their ids (`#FreeRoundsCounterItem`, `#FreeRoundsCounterValue`,
`#FreeRoundsWinItem`) wherever they sit.

Sizes: `--ohm-free-rounds-count` (34px), `--ohm-free-rounds-count-mobile` (22px),
`--ohm-free-rounds-height` (56px on touch), `--ohm-free-rounds-gap`,
`--ohm-free-rounds-color`.

The stake is forced visible for the length of a campaign, by id, so a skin that
hides `#BetAmountStaticItem` for its own layout does not leave the player without
a stake to read for the whole run. If that is what your game wants anyway, mark
your own rule `!important` — the HUD takes it back the moment the count hits 0.

### Locking the controls for a round

```ts
hud.ui.bonusButton.disable();         // the buy coin: dimmed, unclickable, no keyboard route
hud.ui.autoplayMenuButton.disable();  // opening the autoplay sheet — stopping a run stays live
hud.ui.spacebar.set(false);           // the player's spin-key preference (a market ban still wins)
hud.setDemo(true);                    // play money: data-openui-demo on the root, DEMO beside the balance
```

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
