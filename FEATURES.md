# open-ui — Stake Engine UI features

What open-ui provides for a game to pass **Stake Engine** review, grouped by **what
requires it**, **how it's done**, and **where in the code**. open-ui is the **HUD/UI
library only** — the game owns the RGS contract (authenticate, bet/end-round, book
playback, balance authority). A guiding rule: *open-ui never claims a compliance job
its components don't actually do* — see [Out of scope](#out-of-scope-the-games-job).

---

## Social / sweepstakes mode

- **What requires it:** US social/sweepstakes jurisdictions forbid gambling wording
  ("Bet", "Buy feature") and show **GC/SC** coins instead of currency. (Stake.us review.)
- **How it's done:** **one switch.** `setSocial(on, coin?)` flips a `social` signal;
  `OpenUI.t()` then resolves a `<key>.social` i18n variant first (so `openui.buyFeature.title`
  → "Play bonus" automatically), falling back to the base key. Pass a `coin` (`'GC'`/`'SC'`/`'XGC'`)
  and balance/bet/net switch to it. Wording re-renders live; the host overrides any `.social`
  key in its messages dict. The `socialCasino` jurisdiction flag calls the same path.
  - Spec: `social: true` or `social: { coin: 'GC' }` · runtime: `hud.setSocial(true, 'GC')`.
- **Code:** [`OpenUI.setSocial` / `t()`](packages/core/src/OpenUI.ts) · social defaults in [`translator.ts`](packages/core/src/i18n/translator.ts) · [`createUI`](packages/core/src/spec/createUI.ts) · [`jurisdiction.ts`](packages/core/src/spec/jurisdiction.ts) · GC/SC mapping in [`format/currency.ts`](packages/core/src/format/currency.ts).

## Reality-check reminder (RTS 13)

- **What requires it:** the player must be periodically reminded how long they've played.
- **How it's done:** **the logic lives in open-ui** — a **wall-clock** timer (a backgrounded
  tab can't cheat it) that, every `everyMinutes`, emits a `realityCheck` event (with session
  totals), stops autoplay, and shows an acknowledge modal. The developer supplies **only** the
  interval + (optional) text; `{{minutes}}`/`{{spent}}`/`{{won}}` interpolate. `showModal: false`
  fires the event only (host shows its own UI).
  - Spec: `realityCheck: { everyMinutes: 30, message: '…{{minutes}}…' }`.
- **Code:** [`OpenUI.startRealityCheck` / `fireRealityCheck`](packages/core/src/OpenUI.ts) · wired in [`createUI`](packages/core/src/spec/createUI.ts) · `realityCheck` event in [`types.ts`](packages/core/src/types.ts) · options in [`notice.ts`](packages/core/src/notice.ts).

## Session aggregates — total staked / total won (RTS 12, "money spent")

- **What requires it:** responsible-gambling reminders reference money spent, not just time.
- **How it's done:** `reportRound(win, bet)` accumulates `totalStaked` + `totalWon` signals
  (alongside net position); `resetSession()` zeroes them. Exposed for the host to display or
  feed into the reality-check message. (No mandated readout — the game decides how to show it.)
- **Code:** [`OpenUI.reportRound` / `totalStaked` / `totalWon` / `resetSession`](packages/core/src/OpenUI.ts).

## Fatal / blocking error modal

- **What requires it:** unrecoverable RGS states (session expiry, maintenance, active round)
  must not be casually dismissed back into play.
- **How it's done:** **opt-in.** `showFatal(msg)` (or `showError(msg, { blocking: true })`,
  `showRgsError(code, { blocking: true })`) shows a modal that **locks the HUD**, has **no
  backdrop-tap / ✕ dismiss and no default button** — removable **only in code** via `hideNotice()`
  (or a host-provided action like "Reload"). A normal notice is unchanged (dismissable, default OK).
- **Code:** [`OpenUI.showFatal` / `showNotice` blocking + `noticeBlocking`](packages/core/src/OpenUI.ts) · suppressed dismiss in [`DialogView`](packages/pixi/src/views/DialogView.ts) · `blocking` option in [`notice.ts`](packages/core/src/notice.ts).

## Audio start state

- **What requires it:** browser autoplay policy + review flag sound that plays before a gesture.
- **How it's done:** **flag** — `audio: { startMuted: true }` (spec) or `new OpenUI({ startMuted })`
  boots muted (the mute icon reflects it); unmuting restores the configured volumes. (Actually
  unlocking the AudioContext + playing sound is the game's audio engine — open-ui owns the mute
  *state*, not playback.)
- **Code:** [`OpenUIOptions.startMuted` / constructor](packages/core/src/OpenUI.ts) · [`createUI`](packages/core/src/spec/createUI.ts) · spec type in [`spec/types.ts`](packages/core/src/spec/types.ts).

## Jurisdiction switchboard — real guards, not just hides

- **What requires it:** each `disabled*` jurisdiction flag must actually disable the feature.
- **How it's done:** `applyJurisdiction(jur)` hides the control **and** truly disables it —
  `disabledAutoplay` puts the autoplay control in `disabled` (so `begin()`/`press()` no-op),
  `disabledBuyFeature` disables the bonus button **and** makes `confirmBuy()` a no-op. The
  applied config is stored for `isDisabled(feature)` read-back (so it's a guard, not a visual lie).
  `socialCasino` → social mode; `display*` → reveal readouts; `minimumRoundDuration` is stored
  for the **game** to enforce.
- **Code:** [`applyJurisdiction`](packages/core/src/spec/jurisdiction.ts) · [`OpenUI.applyJurisdiction` / `isDisabled`](packages/core/src/OpenUI.ts) · `confirmBuy` guard in [`mountHud`](packages/pixi/src/mountHud.ts).

## Free-spins spin button

- **What requires it:** during free spins the spin button shows the remaining count, not "play".
- **How it's done:** **one call** — `hud.setFreeSpins(12)` switches the spin button to its
  free-spins face (a themed ring + big remaining count over a localized "**FS**" label);
  `setFreeSpins(0)` restores the normal button. Works with any skin; the count is reactive.
- **Code:** [`SpinControl.freeSpins` / `setFreeSpins`](packages/core/src/controls/SpinControl.ts) · free-spins face in [`SpinView`](packages/pixi/src/views/SpinView.ts) · `'openui.freeSpins'` label in [`translator.ts`](packages/core/src/i18n/translator.ts) · `hud.setFreeSpins` in [`mountHud`](packages/pixi/src/mountHud.ts).

## Notice telemetry events

- **What requires it:** the host needs to observe error/notice display for analytics.
- **How it's done:** `showNotice`/`showError`/`showFatal` emit `noticeShown { blocking }`; the
  modal closing emits `noticeDismissed`.
- **Code:** [`OpenUI` notice methods + close subscription](packages/core/src/OpenUI.ts) · events in [`types.ts`](packages/core/src/types.ts).

---

## Out of scope — the game's job

open-ui deliberately does **not** ship these, because the actual work is the game's (shipping a
stub would be a false compliance claim):

- **Win celebrations / count-up visuals** — presentation is the game's. (`winTier()` is provided
  as a pure helper a game *can* use to honor *"never celebrate a return ≤ stake"* (RTS 14F), but
  open-ui renders no celebration so it makes no such claim.) [`win.ts`](packages/core/src/win.ts)
- **`minimumRoundDuration` enforcement** — stored from jurisdiction for the **game** to enforce
  (the game owns round timing). [`jurisdiction.ts`](packages/core/src/spec/jurisdiction.ts)
- **Resume / active-round recovery** — RGS networking + book replay is the game's; open-ui only
  provides the generic lock + the `ERR_BE`/activebet notice text.
- **Accessibility (WCAG / screen reader):** **not a Stake Engine compliance gate** — Stake review
  is responsible-gambling + jurisdiction + fairness, not WCAG. Keyboard-spin + per-control roles
  exist; a full ARIA/focus subsystem is intentionally not built.
