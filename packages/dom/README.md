# @open-slot-ui/dom

The **DOM renderer binding** for [open-ui](https://github.com/schmooky/open-slot-ui). It
mounts the HUD as real markup — ids, `icon-*` classes, `data-state`, `data-channel` —
and binds it to the headless `@open-slot-ui/core` control tree.

It draws nothing. **Your stylesheet dresses it**, which is the point: the HUD can look
exactly like the design it was cut from instead of like a redrawing of it.

```bash
pnpm add @open-slot-ui/core @open-slot-ui/dom
```

```ts
import { mountDomHud } from '@open-slot-ui/dom';

const hud = mountDomHud(
  {
    currency: 'USD',
    betLadder: { levels: [0.1, 0.2, 0.5, 1, 2, 5], index: 3 },
    autoplay: { options: [10, 25, 50, 100], lossLimits: [5, 20, 50], winLimits: [10, 20, 75] },
    hud: { features: { promotion: false } },
  },
  {
    skin: { href: '/ui/ui.css', font: { family: 'icomoon', src: '/ui/fonts/icomoon.woff2' } },
    features: [{ id: 'free-spins', name: 'Free Spins', variant: 'buy', cost: 100 }],
    onBuy: (id, cost) => game.buy(id, cost),
  },
);

hud.on('spinRequested', () => game.spin());
hud.setBalance(1234.56);
hud.setWin(25);
```

## What it binds

| The markup | The core |
| --- | --- |
| `#PlaceBetBtn` · `#StopBtn` · `#StartAutoplayBtn` · `#StopAutoplayBtn` | `ui.spin`, `ui.autoplay` — one round button shows at a time, and the counter is live |
| `#BetAmountIncrease` / `#BetAmountDecrease` · `#BetAmountIndicatorProgress` | `ui.betPlus` / `ui.betMinus` / `ui.betStepper` (+ its ladder position) |
| `#BalanceValue` · `#BetAmountValue` · `#WinAmountValue` · `#FeatureTotalWinValue` · `#FeatureCounterValue` · `#FreeRoundsCounterValue` | the value displays, formatted by the core's own money logic |
| `#MainMenuToggle` · `#SoundToggle` · `#MusicToggle` · the TURBO / SUPER TURBO accordions | `ui.mainMenuPanel`, the volume sliders, `ui.turboBase` / `ui.turboBonus` / `ui.superTurbo*` (and the shared `ui.turbo`) |
| `#AutoplayNavList` · `#AutoplayCost` · `#StopOnFeatureToggle` · `#LossLimitNavList` · `#WinLimitNavList` · the CUSTOM inputs | `ui.autoplay` — the chosen limits are the ones `begin()` enforces |
| `#GameInfoWindow` · `#BetHistoryWindow` · `#FeatureBuyWindow` · `#DialogWindow` | `ui.settingsPanel`, `ui.historyPanel`, the buy panel, `ui.noticePanel` |
| `data-state` · `data-channel` · `data-orientation` | `ui.hudState`, the viewport — the stylesheet lays itself out from these |

Every part is a [chrome feature flag](https://open-ui.schmooky.dev/guides/configuration/):
a feature switched off is **removed from the DOM**, not hidden.

## Bring your own skin

`mountDomHud` takes the stylesheet, it doesn't ship one:

```ts
skin: {
  href: '/ui/ui.css',                                  // …or `css: '…'`
  font: { family: 'icomoon', src: '/ui/icons.woff2' }, // the icon face the classes expect
  rootFontSize: 16,                                    // the rem base the skin was authored at
}
```

If your stylesheet was written for this markup, the HUD wears it as-is. If you're
starting fresh, the class names above are the contract to style.

One stylesheet does come with the binding: the **rules block vocabulary**
(`BLOCK_CSS`, scoped to `.GameInfo__body`). A skin styles its own info window, but
it cannot know what a tab strip, a symbol table or a reel grid is, so those blocks
would land as naked HTML. The injected rules take their six colours from the skin's
own custom properties, so the blocks wear the game's palette, not a second one.

## License

[MIT](./LICENSE)
