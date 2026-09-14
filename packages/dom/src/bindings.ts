import { formatAmount, renderBlocksHtml, composeMenu, type OpenUI, type HudState, type BlockSpec } from '@open-slot-ui/core';
import { $, on, text, toggleClass, setVisible, setDisabled, setIcon, el } from './dom';
import { label } from './i18n';

export type Dispose = () => void;

/** Everything a binding may need beyond the core itself. */
export interface BindContext {
  root: HTMLElement;
  /** The `.MainPanel` element — the reference hangs its open/closed classes here. */
  panel: HTMLElement | null;
  /** Buy-feature cards the host offers (empty = no buy sheet content). */
  features: Array<{ id: string; name: string; variant: 'buy' | 'boost'; cost: number; image?: string }>;
  onBuy?: (id: string, cost: number) => void;
  /** The composed INFO content (settings → paytable → rules), rendered into the window. */
  infoBlocks?: BlockSpec[];
  /** Open/closed state for the buy sheet (its own control, so e2e can read it). */
  buyPanel: { isOpen: boolean; openPanel(): void; closePanel(): void; state: { subscribe(fn: () => void): Dispose } };
}

const all = (...d: Dispose[]): Dispose => () => d.forEach((fn) => fn());

const money = (ui: OpenUI, v: number): string => formatAmount(v, ui.balance.currency.get());

// ─── the data panel ──────────────────────────────────────────────────────────

/** BALANCE · BET · WIN · TOTAL WIN · the feature counter · free rounds. */
export function bindReadouts(ui: OpenUI, ctx: BindContext): Dispose {
  const r = ctx.root;
  const balance = $(r, 'BalanceValue');
  const betStatic = $(r, 'BetAmountStaticValue');
  const betAction = $(r, 'BetAmountValue');
  const win = $(r, 'WinAmountValue');
  const totalWin = $(r, 'FeatureTotalWinValue');
  const counter = $(r, 'FeatureCounterValue');
  const freeRounds = $(r, 'FreeRoundsCounterValue');
  const freeRoundsWin = $(r, 'FreeRoundsWinValue');
  const progress = $(r, 'BetAmountIndicatorProgress');

  const paint = (): void => {
    text(balance, money(ui, ui.balance.get()));
    const bet = formatAmount(ui.bet.get(), ui.bet.currency.get());
    text(betStatic, bet);
    text(betAction, bet);
    text(win, money(ui, ui.win.get()));
    text(totalWin, money(ui, ui.totalWin.get()));
    text(freeRoundsWin, money(ui, ui.totalWin.get()));
    text(counter, String(ui.spin.freeSpins.get()));
    text(freeRounds, String(ui.freeRounds.get()));
    // The ladder bar under the bet: how far up the bet ladder this stake sits.
    if (progress) {
      const levels = ui.betStepper.count;
      const frac = levels <= 1 ? 1 : (ui.betStepper.index.get() + 1) / levels;
      progress.style.width = `${(frac * 100).toFixed(2)}%`;
    }
  };

  // Which readouts are ON the bar depends on what the round is: a feature round
  // shows TOTAL WIN + the spins left, base play shows WIN.
  const paintVisibility = (): void => {
    const fs = ui.spin.freeSpins.get() > 0;
    const feature = fs || ui.hudState.get().startsWith('feature');
    const fr = ui.freeRounds.get() > 0;
    setVisible($(r, 'BalanceItem'), true);
    setVisible($(r, 'BetAmountStaticItem'), !feature);
    setVisible($(r, 'WinAmountItem'), !feature);
    setVisible($(r, 'FeatureTotalWinItem'), feature);
    setVisible($(r, 'FeatureCounterItem'), fs);
    setVisible($(r, 'FreeRoundsCounterItem'), fr);
    setVisible($(r, 'FreeRoundsWinItem'), fr);
    // You cannot buy your way into a bonus you are already in. (`is-visible` goes on
    // the BUTTON — that is the selector the stylesheet gates on.)
    const buy = $(r, 'FeatureBuyToggle');
    setVisible(buy, !feature && !fr && ctx.features.length > 0 && !ui.hidden.has('bonus'));
    // The skin sizes the pill's text off its length; the reference sets the same attr.
    if (buy) buy.dataset.charcount = String((buy.textContent ?? '').trim().length);
  };

  const repaint = (): void => {
    paint();
    paintVisibility();
  };
  repaint();

  return all(
    ui.balance.value.subscribe(paint),
    ui.bet.value.subscribe(paint),
    ui.win.value.subscribe(paint),
    ui.totalWin.value.subscribe(paint),
    ui.betStepper.index.subscribe(paint),
    ui.spin.freeSpins.subscribe(repaint),
    ui.freeRounds.subscribe(repaint),
    ui.hudState.subscribe(repaint),
    ui.locale.subscribe(paint),
  );
}

// ─── the action panel ────────────────────────────────────────────────────────

/** The round buttons (place bet · stop · start/stop autoplay) and the bet changers. */
export function bindActions(ui: OpenUI, ctx: BindContext): Dispose {
  const r = ctx.root;
  const play = $(r, 'PlaceBetBtn');
  const stopRound = $(r, 'StopBtn');
  const startAuto = $(r, 'StartAutoplayBtn');
  const stopAuto = $(r, 'StopAutoplayBtn');
  const counter = $(r, 'AutoplayCounter');
  const inc = $(r, 'BetAmountIncrease');
  const dec = $(r, 'BetAmountDecrease');

  /**
   * The round button is ONE button in three phases, and the stylesheet owns the swap:
   *
   *   idle            place-bet, lit.
   *   spinning        still place-bet, but the ActionPanel wears `disabled-slam-stop`,
   *                   which dims the arrow to 50% and keeps the stop button hidden —
   *                   the round is out with the server and there is nothing to slam yet.
   *   slam available  `disabled-slam-stop` comes off; `[data-state=play]` then displays
   *                   stop-round, and place-bet drops its `is-visible`.
   *
   * A jurisdiction that forbids slam-stop (`disabledSlamstop`) simply never leaves the
   * middle phase — which is exactly what that class name says.
   */
  const actionPanel = r.querySelector<HTMLElement>('.ActionPanel');

  const paint = (): void => {
    const state = ui.spin.current;
    const pending = state === 'spinning';
    const canSlam = state === 'stop' && ui.spin.allowSlamStop.get();
    const auto = ui.autoplay.isActive;
    const picking = ui.autoplayPanel.isOpen && !auto;

    toggleClass(actionPanel, 'disabled-slam-stop', !canSlam);
    setVisible(play, !auto && !picking && !canSlam);
    setVisible(stopRound, !auto && !picking && canSlam);
    setVisible(startAuto, picking);
    setVisible(stopAuto, auto);
    // Dimming is the stylesheet's job; interactability is the core's. A pending round
    // must not re-fire, so the button refuses the press as well as looking spent.
    setDisabled(play, !ui.spin.interactable || pending);
    setDisabled(inc, !ui.betPlus.interactable);
    setDisabled(dec, !ui.betMinus.interactable);
    const n = ui.autoplay.count.get();
    text(counter, Number.isFinite(n) ? String(n) : '∞');
  };
  paint();

  return all(
    on(play, 'click', () => ui.spin.activate()),
    on(stopRound, 'click', () => ui.spin.activate()),
    on(stopAuto, 'click', () => ui.autoplay.stop()),
    on(inc, 'click', () => ui.betPlus.activate()),
    on(dec, 'click', () => ui.betMinus.activate()),
    ui.spin.state.subscribe(paint),
    ui.autoplay.state.subscribe(paint),
    ui.autoplay.count.subscribe(paint),
    ui.autoplayPanel.state.subscribe(paint),
    ui.spin.allowSlamStop.subscribe(paint),
    ui.betStepper.index.subscribe(paint),
    ui.locked.subscribe(paint),
  );
}

// ─── the ☰ menu ──────────────────────────────────────────────────────────────

/** The fly-up menu: sound, music, the turbo accordions, history, info, operator rows. */
export function bindMainMenu(ui: OpenUI, ctx: BindContext): Dispose {
  const r = ctx.root;
  const panel = ctx.panel;
  const toggle = $(r, 'MainMenuToggle');
  const sound = $(r, 'SoundToggle');
  const music = $(r, 'MusicToggle');
  const turbo = $(r, 'TurboToggle');
  const superTurbo = $(r, 'SuperTurboToggle');

  let lastSfx = 0.5;
  let lastMusic = 0.7;

  const paint = (): void => {
    // Two classes, two jobs: the panel's marks the ☰ glyph as a ✕, the menu's own
    // `is-visible` is what the stylesheet displays the list on.
    toggleClass(panel, 'main-menu-active', ui.mainMenuPanel.isOpen);
    setVisible($(r, 'MainMenu'), ui.mainMenuPanel.isOpen);
    const sfxOn = ui.sfxSlider.value.get() > 0;
    const musicOn = ui.musicSlider.value.get() > 0;
    setIcon(sound?.querySelector('[class^=icon-]') ?? null, sfxOn ? 'icon-sound-on' : 'icon-sound-off');
    setIcon(music?.querySelector('[class^=icon-]') ?? null, musicOn ? 'icon-music-on' : 'icon-music-off');
    toggleClass(sound, 'sound-on', sfxOn);
    toggleClass(sound, 'sound-off', !sfxOn);
    toggleClass(music, 'music-on', musicOn);
    toggleClass(music, 'music-off', !musicOn);

    const turboOn = ui.turboBase.isOn || ui.turboBonus.isOn;
    const superOn = ui.superTurboBase.isOn || ui.superTurboBonus.isOn;
    toggleClass(turbo, 'turbo-on', turboOn);
    toggleClass(turbo, 'turbo-off', !turboOn);
    setIcon(turbo?.querySelector('[class^=icon-]') ?? null, turboOn ? 'icon-turbo-on' : 'icon-turbo-off');
    toggleClass(superTurbo, 'super-turbo-on', superOn);
    toggleClass(superTurbo, 'super-turbo-off', !superOn);
    setIcon(superTurbo?.querySelector('[class^=icon-]') ?? null, superOn ? 'icon-super-turbo-on' : 'icon-super-turbo-off');

    for (const [id, control] of [
      ['TurboBaseGameToggler', ui.turboBase],
      ['TurboBonusGameToggler', ui.turboBonus],
      ['SuperTurboBaseGameToggler', ui.superTurboBase],
      ['SuperTurboBonusGameToggler', ui.superTurboBonus],
    ] as const) {
      const input = $<HTMLInputElement>(r, id);
      if (input) input.checked = control.isOn;
    }
  };
  paint();

  /**
   * A TURBO / SUPER TURBO row. Tapping the title toggles the feature for BOTH
   * scopes — the reference's own handler does exactly that — and the accordion
   * FOLLOWS that state: on opens the panel with the BASE / BONUS switches, off
   * collapses it. The switches inside then adjust one scope each.
   */
  const turboRow = (
    title: HTMLElement | null,
    base: OpenUI['turboBase'],
    bonus: OpenUI['turboBonus'],
  ): Dispose => {
    const item = title?.closest('.Accordion') as HTMLElement | null;
    return on(title, 'click', () => {
      const next = !(base.isOn || bonus.isOn);
      base.set(next);
      bonus.set(next);
      toggleClass(item, 'is-open', next);
      syncTurbo();
    });
  };

  /** Keep the shared turbo control in step with the two ladders (a game reads it). */
  const syncTurbo = (): void => {
    const want = ui.turboBase.isOn || ui.turboBonus.isOn || ui.superTurboBase.isOn || ui.superTurboBonus.isOn;
    if (ui.turbo.isOn !== want) ui.turbo.toggle();
  };

  /** Opening the menu re-syncs each accordion to what its feature is doing. */
  const syncAccordions = (): void => {
    for (const [title, on_] of [
      [turbo, ui.turboBase.isOn || ui.turboBonus.isOn],
      [superTurbo, ui.superTurboBase.isOn || ui.superTurboBonus.isOn],
    ] as const) {
      toggleClass(title?.closest('.Accordion') ?? null, 'is-open', on_);
    }
  };

  const togglerBind = (id: string, control: { toggle(): void }): Dispose =>
    on($(r, id), 'change', () => {
      control.toggle();
      syncTurbo();
    });

  return all(
    on(toggle, 'click', () => {
      ui.mainMenuPanel.toggle();
      if (ui.mainMenuPanel.isOpen) syncAccordions();
    }),
    // Tapping the sheet itself (not a row) closes it — the mobile menu is a
    // full-screen scrim, and a scrim you cannot dismiss is a trap.
    on($(r, 'MainMenu'), 'click', (e) => {
      if (e.target === $(r, 'MainMenu')) ui.mainMenuPanel.closePanel();
    }),
    on(sound, 'click', () => {
      const onNow = ui.sfxSlider.value.get() > 0;
      if (onNow) lastSfx = ui.sfxSlider.value.get();
      ui.sfxSlider.setNormalized(onNow ? 0 : lastSfx || 0.5);
    }),
    on(music, 'click', () => {
      // SOUND is the master: with it off, the stylesheet dims MUSIC and takes its
      // pointer events — so the handler must refuse too, or the two disagree.
      if (ui.sfxSlider.value.get() <= 0) return;
      const onNow = ui.musicSlider.value.get() > 0;
      if (onNow) lastMusic = ui.musicSlider.value.get();
      ui.musicSlider.setNormalized(onNow ? 0 : lastMusic || 0.7);
    }),
    turboRow(turbo, ui.turboBase, ui.turboBonus),
    turboRow(superTurbo, ui.superTurboBase, ui.superTurboBonus),
    togglerBind('TurboBaseGameToggler', ui.turboBase),
    togglerBind('TurboBonusGameToggler', ui.turboBonus),
    togglerBind('SuperTurboBaseGameToggler', ui.superTurboBase),
    togglerBind('SuperTurboBonusGameToggler', ui.superTurboBonus),
    on($(r, 'BetHistoryBtn'), 'click', () => {
      ui.mainMenuPanel.closePanel();
      ui.historyPanel.openPanel();
    }),
    on($(r, 'GameInfoBtn'), 'click', () => {
      ui.mainMenuPanel.closePanel();
      ui.settingsPanel.openPanel();
    }),
    on($(r, 'MoveToMoneyBtn'), 'click', () => ui.bus.emit('buttonActivated', { id: 'real-money' })),
    on($(r, 'DepositBtn'), 'click', () => ui.bus.emit('buttonActivated', { id: 'deposit' })),
    on($(r, 'LobbyAnchor'), 'click', () => ui.bus.emit('buttonActivated', { id: 'lobby' })),
    ui.mainMenuPanel.state.subscribe(paint),
    ui.sfxSlider.value.subscribe(paint),
    ui.musicSlider.value.subscribe(paint),
    ui.turboBase.state.subscribe(paint),
    ui.turboBonus.state.subscribe(paint),
    ui.superTurboBase.state.subscribe(paint),
    ui.superTurboBonus.state.subscribe(paint),
  );
}

// ─── the autoplay panel ──────────────────────────────────────────────────────

/**
 * BASIC (rounds + what the run costs) and ADVANCED (stop-on-feature, loss limit,
 * single-win limit). The limit lists are built from the spec, and the CUSTOM chips
 * are real number inputs — the value a player types is the value autoplay enforces.
 */
export function bindAutoplay(ui: OpenUI, ctx: BindContext): Dispose {
  const r = ctx.root;
  const panel = ctx.panel;
  const roundsList = $(r, 'AutoplayNavList');
  const cost = $(r, 'AutoplayCost');
  const lossList = $(r, 'LossLimitNavList');
  const winList = $(r, 'WinLimitNavList');
  const lossCustom = $<HTMLInputElement>(r, 'LossLimitCustomInput');
  const winCustom = $<HTMLInputElement>(r, 'WinLimitCustomInput');
  const advanced = $(r, 'AutoplayAdvancedToggle');
  const sections = $(r, 'AdvancedAutoplaySections');
  const stopOnFeature = $<HTMLInputElement>(r, 'StopOnFeatureToggle');

  let count = ui.autoplay.options[0] ?? 10;
  let lossLimit = Infinity;
  let winLimit = Infinity;
  let expanded = false;

  /** One chip in a tab list. */
  const chip = (text: string, selected: boolean): HTMLElement =>
    el(`<li class="Button TabRoundedButton${selected ? ' is-selected' : ''}"><span>${text}</span></li>`);

  const buildRounds = (): void => {
    if (!roundsList) return;
    roundsList.textContent = '';
    for (const n of ui.autoplay.options) {
      const item = chip(Number.isFinite(n) ? String(n) : '∞', n === count);
      item.addEventListener('click', () => {
        count = n;
        paint();
      });
      roundsList.appendChild(item);
    }
  };

  const buildLimits = (): void => {
    for (const [list, options, current, set] of [
      [lossList, ui.autoplay.lossLimitOptions, () => lossLimit, (v: number) => (lossLimit = v)],
      [winList, ui.autoplay.winLimitOptions, () => winLimit, (v: number) => (winLimit = v)],
    ] as const) {
      if (!list) continue;
      // Keep the markup's own NO LIMIT / CUSTOM entries; insert the configured chips
      // before them, so a game's ladder appears exactly where the reference puts it.
      for (const stale of Array.from(list.querySelectorAll('.TabRoundedButton[data-openui-generated]'))) stale.remove();
      const first = list.firstElementChild;
      for (const n of options.filter((v) => Number.isFinite(v) && v > 0)) {
        const item = chip(`${n}×`, current() === n);
        item.dataset.openuiGenerated = '1';
        item.addEventListener('click', () => {
          set(n);
          paint();
        });
        list.insertBefore(item, first);
      }
    }
  };

  const paint = (): void => {
    toggleClass(panel, 'autoplay-menu-active', ui.autoplayPanel.isOpen);
    toggleClass(panel, 'autoplay-menu-is-expanded', expanded);
    // The stylesheet hides `.AutoplayMenu` and the ADVANCED block until each carries
    // `is-visible` — that is the switch, not an inline display.
    setVisible($(r, 'AutoplayNav'), ui.autoplayPanel.isOpen);
    setVisible(sections, expanded);
    const advLabel = advanced?.querySelector('.toggle-text');
    text(advLabel as HTMLElement | null, label(ui, expanded ? 'autoplay_menu_basic' : 'autoplay_menu_advanced'));
    setIcon(advanced?.querySelector('[class^=icon-]') ?? null, expanded ? 'icon-arrow-down' : 'icon-arrow-up');

    // selection state
    if (roundsList) {
      Array.from(roundsList.children).forEach((item, i) => toggleClass(item, 'is-selected', ui.autoplay.options[i] === count));
    }
    const markList = (list: HTMLElement | null, value: number): void => {
      if (!list) return;
      for (const item of Array.from(list.querySelectorAll('li'))) {
        const raw = item.getAttribute('data-value');
        const generated = (item as HTMLElement).dataset.openuiGenerated === '1';
        const chipValue = generated ? Number((item.textContent ?? '').replace('×', '')) : raw === '0' ? Infinity : NaN;
        toggleClass(item, 'is-selected', Number.isNaN(chipValue) ? false : chipValue === value);
      }
    };
    markList(lossList, lossLimit);
    markList(winList, winLimit);

    text(cost, label(ui, 'autoplay_cost', { amount: Number.isFinite(count) ? money(ui, ui.bet.get() * count) : '∞', autoplaycost: Number.isFinite(count) ? money(ui, ui.bet.get() * count) : '∞' }));
    if (stopOnFeature) stopOnFeature.checked = ui.stopOnFeature.isOn;
  };

  buildRounds();
  buildLimits();
  paint();

  /** A CUSTOM input carries its own value — typing one selects that chip. */
  const customInput = (input: HTMLInputElement | null, set: (v: number) => void): Dispose =>
    on(input, 'input', () => {
      const v = Number((input?.value ?? '').replace(/[^\d.]/g, ''));
      if (Number.isFinite(v) && v > 0) {
        set(v);
        paint();
      }
    });

  const noLimit = (id: string, set: (v: number) => void): Dispose =>
    on($(r, id), 'click', () => {
      set(Infinity);
      paint();
    });

  /** Tapping a CUSTOM chip should put the caret in its input — the value IS the chip. */
  const focusCustom = (input: HTMLInputElement | null): Dispose =>
    on(input?.closest('.TabComboInput') ?? null, 'click', () => input?.focus());

  return all(
    on($(r, 'AutoplayBtn'), 'click', () => {
      if (ui.autoplay.isActive) {
        ui.autoplay.stop();
        return;
      }
      ui.autoplayPanel.toggle();
      if (ui.autoplayPanel.isOpen) ui.autoplay.openPicker();
      else ui.autoplay.cancelPicker();
    }),
    on(advanced, 'click', () => {
      expanded = !expanded;
      paint();
    }),
    on(stopOnFeature, 'change', () => ui.stopOnFeature.toggle()),
    customInput(lossCustom, (v) => (lossLimit = v)),
    customInput(winCustom, (v) => (winLimit = v)),
    noLimit('LossLimitNoLimit', (v) => (lossLimit = v)),
    noLimit('WinLimitNoLimit', (v) => (winLimit = v)),
    focusCustom(lossCustom),
    focusCustom(winCustom),
    // MAX WIN as a single-win stop: the run ends the moment the game's cap is hit.
    on($(r, 'WinLimitJackpot'), 'click', () => {
      const cap = ui.facts.get().maxWinCapX;
      winLimit = typeof cap === 'number' && cap > 0 ? cap : Infinity;
      paint();
    }),
    on($(r, 'StartAutoplayBtn'), 'click', () => {
      ui.autoplayPanel.closePanel();
      ui.autoplay.begin(count, { lossLimit, singleWinLimit: winLimit });
    }),
    ui.autoplayPanel.state.subscribe(paint),
    ui.bet.value.subscribe(paint),
    ui.stopOnFeature.state.subscribe(paint),
    ui.locale.subscribe(() => {
      buildRounds();
      paint();
    }),
  );
}

// ─── the windows ─────────────────────────────────────────────────────────────

/** Game info, bet history, the buy sheet, the notice dialog and the message strip. */
export function bindWindows(ui: OpenUI, ctx: BindContext): Dispose {
  const r = ctx.root;

  const window_ = (id: string, panel: { isOpen: boolean; openPanel(): void; closePanel(): void; state: { subscribe(fn: () => void): Dispose } }, closeId: string): Dispose => {
    const win = $(r, id);
    const paint = (): void => setVisible(win, panel.isOpen);
    paint();
    return all(
      on($(r, closeId), 'click', () => panel.closePanel()),
      on(win, 'click', (e) => {
        if (e.target === win) panel.closePanel(); // the backdrop
      }),
      panel.state.subscribe(paint),
    );
  };

  // The INFO window: the same declarative blocks the canvas renderer uses, rendered
  // to HTML — so a game writes its rules ONCE and both renderers show them.
  const infoBody = $(r, 'GameInfoBody');
  if (infoBody) {
    const blocks = ctx.infoBlocks ?? composeMenu(undefined, {});
    infoBody.innerHTML = renderBlocksHtml(blocks, (key) => ui.t(key), ui.facts.get());
  }
  text($(r, 'GameInfoGameName'), ui.gameInfo.name ?? '');

  // The buy sheet's grid: one card per feature the host offers.
  const buyBody = $(r, 'FeatureBuyBody');
  const paintBuy = (): void => {
    if (!buyBody || !ctx.features.length) return;
    const bet = ui.betStepper.value;
    buyBody.innerHTML = `<div class="FeatureBuy__items-container"><ul class="FeatureBuyItemList">${ctx.features
      .map((feat) => {
        const price = money(ui, feat.variant === 'buy' ? feat.cost * bet : (1 + feat.cost) * bet);
        return `<li class="FeatureBuyItem"><div class="FeatureBuyGridCard" data-grid-card-type="${feat.variant === 'buy' ? 'grid-card-feature-spins' : 'grid-card-bonus'}" data-feature="${escapeHtml(feat.id)}">
          <div class="FeatureBuyGridCard__inner">
            <div class="FeatureBuyGridCard__img-container"><div class="FeatureBuyGridCard__img-wrapper">${feat.image ? `<img class="FeatureBuyGridCard__image" src="${escapeHtml(feat.image)}" alt="">` : ''}</div></div>
            <div class="FeatureBuyGridCard__content">
              <div class="FeatureBuyGridCard__title">${escapeHtml(label(ui, feat.name))}</div>
              <div class="FeatureBuyGridCard__description FeatureBuyGridCard__description--value">${escapeHtml(price)}</div>
            </div>
            <div class="FeatureBuyGridCard__cta-container"><button class="Button FeatureBuyGridCard__button" data-feature="${escapeHtml(feat.id)}">${escapeHtml(label(ui, 'feature_buy_action_uc'))}</button></div>
          </div></div></li>`;
      })
      .join('')}</ul></div>`;
    for (const btn of Array.from(buyBody.querySelectorAll<HTMLElement>('.FeatureBuyGridCard__button'))) {
      btn.addEventListener('click', () => {
        const feat = ctx.features.find((x) => x.id === btn.dataset.feature);
        if (!feat) return;
        ctx.buyPanel.closePanel();
        ctx.onBuy?.(feat.id, feat.variant === 'buy' ? feat.cost * ui.betStepper.value : (1 + feat.cost) * ui.betStepper.value);
      });
    }
  };
  paintBuy();

  // The history table is host data (`hud.setHistory`), rendered into the reference's
  // own table body.
  const historyBody = $(r, 'BetHistoryTableBody');
  const paintHistory = (): void => {
    if (!historyBody) return;
    historyBody.textContent = '';
    for (const row of ui.history.get()) {
      historyBody.appendChild(
        el(`<tr><td class="BetHistory__cell--date">${escapeHtml(row.date)}</td><td>${escapeHtml(row.bet)}</td><td${row.won ? ' class="is-eligible"' : ''}>${escapeHtml(row.win)}</td></tr>`),
      );
    }
  };
  paintHistory();

  // The notice / error modal: the core owns the content (blocks + actions), this
  // renders it into the reference's own dialog shell.
  const dialogHost = $(r, 'DialogWindow');
  const paintDialog = (): void => {
    if (!dialogHost) return;
    const open = ui.noticePanel.isOpen;
    setVisible(dialogHost, open);
    dialogHost.querySelector('.Dialog')?.remove();
    if (!open) return;
    const blocks = ui.noticeBlocks.get();
    const title = blocks.find((b) => b.kind === 'heading');
    const body = blocks.filter((b) => b.kind === 'text' || b.kind === 'callout');
    const actions = ui.noticeActions.get();
    const dialog = el(`<div class="Dialog Dialog--info-msg"><div class="Dialog__wrapper">
      ${title ? `<div class="Dialog__title">${escapeHtml(ui.t((title as { text: string }).text))}</div>` : ''}
      <div class="Dialog__body"><div class="Dialog__body-inner">${body.map((b) => `<p>${escapeHtml(ui.t((b as { text: string }).text))}</p>`).join('')}</div></div>
      <div class="Dialog__footer"><div class="Dialog__button-group">${actions
        .map((a, i) => `<button class="Button Button--${a.variant === 'primary' ? 'primary' : 'secondary'} Dialog__action" data-action="${i}">${escapeHtml(ui.t(a.label))}</button>`)
        .join('')}</div></div></div></div>`);
    for (const btn of Array.from(dialog.querySelectorAll<HTMLElement>('.Dialog__action'))) {
      btn.addEventListener('click', () => {
        const action = actions[Number(btn.dataset.action)];
        ui.hideNotice();
        action?.onSelect?.();
      });
    }
    dialogHost.appendChild(dialog);
  };
  paintDialog();

  // The feedback strip + the notification holder.
  const feedback = $(r, 'FeedbackMsg');
  const notifications = $(r, 'NotificationHolder');
  const paintFeedback = (): void => {
    const m = ui.feedback.get();
    text(feedback, m ? label(ui, m.text) : '');
    setVisible(feedback, !!m);
    if (m && m.tone === 'warn' && notifications) {
      const note = el(`<div class="Notification"><div class="Notification__body">${escapeHtml(label(ui, m.text))}</div></div>`);
      notifications.appendChild(note);
      setTimeout(() => note.remove(), 2600);
    }
  };
  paintFeedback();

  return all(
    window_('GameInfoWindow', ui.settingsPanel, 'GameInfoClose'),
    window_('BetHistoryWindow', ui.historyPanel, 'BetHistoryClose'),
    window_('FeatureBuyWindow', ctx.buyPanel, 'FeatureBuyClose'),
    on($(r, 'FeatureBuyToggle'), 'click', () => {
      // The button announces itself (a game may want to know), then opens the sheet.
      ui.bus.emit('buttonActivated', { id: 'bonus' });
      ctx.buyPanel.openPanel();
    }),
    ui.noticePanel.state.subscribe(paintDialog),
    ui.noticeBlocks.subscribe(paintDialog),
    ui.history.subscribe(paintHistory),
    ui.feedback.subscribe(paintFeedback),
    ui.betStepper.index.subscribe(paintBuy),
    ui.locale.subscribe(() => {
      paintFeedback();
      paintBuy();
    }),
  );
}

// ─── the top overlay ─────────────────────────────────────────────────────────

/** Clock · game name · RTP · max win + odds · session timer · net position. */
export function bindOverlay(ui: OpenUI, ctx: BindContext): Dispose {
  const r = ctx.root;
  const clock = $(r, 'Clock');
  const paintClock = (): void => {
    const d = new Date();
    text(clock, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  };
  const timer = window.setInterval(paintClock, 10_000);
  paintClock();

  const paint = (): void => {
    text($(r, 'GameNameOverlay'), ui.gameInfo.name ?? '');
    text($(r, 'RtpOverlayValue'), ui.rtp.formatted);
    setVisible($(r, 'RtpOverlay'), !ui.hidden.has('rtp'));
    const mw = ui.maxWin.get();
    text($(r, 'MaxWinMultiplierOverlayValue'), mw?.multiplier != null ? `${mw.multiplier}×` : '');
    text($(r, 'MaxWinOddsOverlayValue'), mw?.odds ?? '');
    setVisible($(r, 'MaxWinOverlayContainer'), !!mw);
    setVisible($(r, 'MaxWinOddsOverlay'), !!mw?.odds);
    text($(r, 'SessionTimerValue'), ui.sessionTimer.formatted);
    setVisible($(r, 'SessionTimer'), !ui.hidden.has('session-timer'));
    text($(r, 'NetPositionValue'), ui.netPosition.formatted);
    setVisible($(r, 'NetPosition'), !ui.hidden.has('net-position'));
  };
  paint();

  return all(
    () => window.clearInterval(timer),
    ui.maxWin.subscribe(paint),
    ui.rtp.value.subscribe(paint),
    ui.netPosition.value.subscribe(paint),
    ui.sessionTimer.value.subscribe(paint),
    ui.locale.subscribe(paint),
  );
}

/** The HUD's state machine, mirrored onto the root the way the stylesheet reads it. */
export function stateAttr(state: HudState, freeSpins: number): string {
  if (state === 'featurePlay') return freeSpins > 0 ? 'featurePlay-freespins' : 'featurePlay';
  return state;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
