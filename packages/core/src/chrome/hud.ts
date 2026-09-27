/**
 * The HUD *chrome* — the ribbon bar that the controls live inside.
 *
 * open-ui used to scatter its controls across the screen on anchors (the old
 * "floating coins" reference design). The shipped design is now a single
 * **ribbon**: one docked strip that owns a data panel (balance / bet / win), an
 * action panel (bet ±, the round button, autoplay) and the panels those open.
 * Controls no longer carry screen anchors — the ribbon *places* them.
 *
 * Everything the ribbon shows is a FEATURE FLAG, so a game keeps the look while
 * dropping the parts it doesn't have: no buy-feature, no promotion, no history,
 * no advanced autoplay. Flags are additive data (Charter P8) — an unknown flag is
 * reported and dropped, never fatal.
 */

/** Every switchable part of the ribbon. All default ON except the ones a game
 *  can't have without extra plumbing (`promotion`, `lobby`, `deposit`, `realMoney`). */
export interface HudFeatures {
  // ── data panel ───────────────────────────────────────────────────────────
  /** The ☰ button + the fly-up main menu. */
  menu: boolean;
  /** BALANCE readout. */
  balance: boolean;
  /** BET readout in the data panel (separate from the bet widget in the action panel). */
  betReadout: boolean;
  /** WIN readout. */
  win: boolean;
  /** FREE ROUND counter + its TOTAL WIN readout (operator free rounds). */
  freeRounds: boolean;
  /** The in-feature strip: TOTAL WIN + the free-spins counter. */
  featurePanel: boolean;

  // ── main menu items ──────────────────────────────────────────────────────
  sound: boolean;
  music: boolean;
  /** TURBO row — an accordion with BASE GAME / BONUS GAME sub-toggles. */
  turbo: boolean;
  /** SUPER TURBO™ row (same shape as turbo). */
  superTurbo: boolean;
  /** HISTORY row + the bet-history modal. */
  history: boolean;
  /** INFO row + the game-info (paytable / rules) modal. */
  info: boolean;
  /** HOME row — returns to the operator lobby (needs a `lobbyUrl` from the host). */
  lobby: boolean;
  /** REAL MONEY row (leave demo play). */
  realMoney: boolean;
  /** DEPOSIT row. */
  deposit: boolean;

  // ── action panel ─────────────────────────────────────────────────────────
  /** The BET widget (label + value) at the left of the action panel. */
  betWidget: boolean;
  /** The ▲ / ▼ bet changers. */
  betChangers: boolean;
  /** The thin ladder-position bar under the bet value. */
  betProgress: boolean;
  /** The autoplay button + its menu. */
  autoplay: boolean;
  /** The ADVANCED half of the autoplay menu (limits + stop-on-feature). */
  autoplayAdvanced: boolean;
  /** BUY BONUS button + the buy modal. */
  buyFeature: boolean;
  /** Operator promotion button (host supplies the art + the page). */
  promotion: boolean;
  /** The slam-stop button that replaces the round button mid-spin. */
  stopRound: boolean;

  // ── overlays ─────────────────────────────────────────────────────────────
  /** The one-line message strip under the bar ("PRESS PLAY TO SPIN!"). */
  feedback: boolean;
  /** Wall clock in the top overlay. */
  clock: boolean;
  /** RTP readout in the top overlay. */
  rtp: boolean;
  /** MAX WIN multiplier (+ odds) in the top overlay. */
  maxWin: boolean;
  /** SESSION timer + NET position strip. */
  sessionBar: boolean;
  /** Fullscreen toggle. */
  fullscreen: boolean;
  /** The game logo in the top overlay. */
  branding: boolean;
}

export const defaultHudFeatures: Readonly<HudFeatures> = Object.freeze({
  menu: true,
  balance: true,
  betReadout: true,
  win: true,
  freeRounds: true,
  featurePanel: true,
  sound: true,
  music: true,
  turbo: true,
  superTurbo: false,
  history: true,
  info: true,
  lobby: false,
  realMoney: false,
  deposit: false,
  betWidget: true,
  betChangers: true,
  betProgress: true,
  autoplay: true,
  autoplayAdvanced: true,
  buyFeature: true,
  promotion: false,
  stopRound: true,
  feedback: true,
  clock: true,
  rtp: false,
  maxWin: true,
  sessionBar: false,
  fullscreen: true,
  branding: false,
});

export type HudFeatureId = keyof HudFeatures;

// ─── speeds ──────────────────────────────────────────────────────────────────

/** Which half of the game a speed switch applies to. */
export type SpeedScope = 'base' | 'bonus';

/**
 * A SPEED the player can switch on.
 *
 * The reference ships two — TURBO and SUPER TURBO™ — and for a long time this
 * library shipped exactly those two, hard-wired, because that is what the markup
 * had. A game with three speeds, or one, or one called something else, had nowhere
 * to say so. A speed is now data: an id, what to call it, the icon the skin draws
 * it with, and which scopes it has switches for. The HUD renders however many there
 * are, in the order given.
 */
export interface SpeedSpec {
  /** Stable id — what events carry and what a menu row points at. */
  id: string;
  /** Label key (or literal text). Default: the id. */
  name?: string;
  /**
   * The icon class STEM the skin draws it with; the HUD appends `-on` / `-off`.
   * Default `icon-<id>`, which is the convention the reference skin follows.
   */
  icon?: string;
  /** The scopes it can be switched for. Default both. An empty list means one plain switch. */
  scopes?: SpeedScope[];
  /** Start switched on (per scope). Default off. */
  initial?: boolean;
}

/** A resolved speed: every field present. */
export interface SpeedConfig {
  id: string;
  name: string;
  icon: string;
  scopes: SpeedScope[];
  initial: boolean;
}

/** The two the reference ships, as data. A game replaces them with its own. */
export const defaultSpeeds: readonly SpeedConfig[] = Object.freeze([
  Object.freeze({ id: 'turbo', name: 'turbo', icon: 'icon-turbo', scopes: ['base', 'bonus'] as SpeedScope[], initial: false }),
  Object.freeze({ id: 'super-turbo', name: 'super_turbo_uc', icon: 'icon-super-turbo', scopes: ['base', 'bonus'] as SpeedScope[], initial: false }),
]);

// ─── the main menu ───────────────────────────────────────────────────────────

/**
 * What a main-menu row IS. Everything but `action` is a row the library already
 * knows how to wire; `action` is the game's own, which reports a press and leaves
 * the doing to the host.
 */
export type MenuItemKind = 'sound' | 'music' | 'speed' | 'history' | 'info' | 'realMoney' | 'deposit' | 'lobby' | 'action';

/** A row in the main menu. */
export interface MenuItemSpec {
  /** Stable id. For a `speed` row it may be left out and taken from `speed`. */
  id?: string;
  kind: MenuItemKind;
  /** Which speed this row switches, for `kind: 'speed'`. Default: the row's id. */
  speed?: string;
  /** Label key (or literal). Default: the kind's own. */
  label?: string;
  /** Icon class. Default: the kind's own; for a speed, the speed's. */
  icon?: string;
}

/** A resolved menu row. */
export interface MenuItemConfig {
  id: string;
  kind: MenuItemKind;
  speed?: string;
  label: string;
  icon: string;
}

/** The default label and icon of each built-in row. */
const MENU_DEFAULTS: Record<Exclude<MenuItemKind, 'speed' | 'action'>, { label: string; icon: string; feature: HudFeatureId }> = {
  sound: { label: 'sound', icon: 'icon-sound-on', feature: 'sound' },
  music: { label: 'music', icon: 'icon-music-on', feature: 'music' },
  history: { label: 'history', icon: 'icon-history', feature: 'history' },
  info: { label: 'info_uc', icon: 'icon-info-a', feature: 'info' },
  realMoney: { label: 'real_money_uc', icon: 'icon-chip', feature: 'realMoney' },
  deposit: { label: 'deposit_uc', icon: 'icon-coins', feature: 'deposit' },
  lobby: { label: 'home', icon: 'icon-home', feature: 'lobby' },
};

/** The ids of the rows the library knows how to wire by itself. */
export const MENU_KINDS = Object.freeze(Object.keys(MENU_DEFAULTS) as Array<keyof typeof MENU_DEFAULTS>);

export const HUD_FEATURE_IDS = Object.freeze(Object.keys(defaultHudFeatures) as HudFeatureId[]);

/** Where the ribbon docks. `'bottom'` is the design; `'top'` mirrors it. */
export type HudDock = 'bottom' | 'top';

/** How a changed readout value animates in. Matches the reference's four reveals. */
export type RevealBehavior = 'drop' | 'rotate' | 'spin' | 'twist' | 'none';

/** How a round's win is presented: inline in the data panel, or as a big standalone. */
export type WinRepresentation = 'ticker' | 'standalone';

/** What a host may pass for `UISpec.hud`. Every field optional. */
export interface HudChromeSpec {
  dock?: HudDock;
  features?: Partial<Record<HudFeatureId, boolean>>;
  /**
   * The speeds this game has. Default: TURBO and SUPER TURBO™, gated by the
   * `turbo` / `superTurbo` feature flags, which is what the reference ships.
   */
  speeds?: SpeedSpec[];
  /**
   * The main menu, row by row, in order. Default: the built-in rows their feature
   * flags leave on, with one row per speed between the audio rows and HISTORY —
   * the order the reference uses.
   */
  menu?: MenuItemSpec[];
  winRepresentation?: WinRepresentation;
  reveal?: RevealBehavior;
  /** Multiplier on the ribbon's base unit — 1 is the reference size. Clamped 0.5..2. */
  scale?: number;
  /** Max width of the desktop bar, in rem. Reference: 52.5. Clamped 24..96. */
  maxWidth?: number;
}

/** The resolved, always-complete chrome config the layout + views read. */
export interface HudChrome {
  dock: HudDock;
  features: Readonly<HudFeatures>;
  /** Every speed the HUD offers, resolved. */
  speeds: readonly SpeedConfig[];
  /** The main menu's rows, in order, resolved. */
  menu: readonly MenuItemConfig[];
  winRepresentation: WinRepresentation;
  reveal: RevealBehavior;
  scale: number;
  maxWidth: number;
}

/** Fill a speed's blanks: a name, an icon stem, and the scopes it switches. */
export function resolveSpeed(spec: SpeedSpec): SpeedConfig {
  const id = spec.id;
  return {
    id,
    name: spec.name ?? id,
    icon: spec.icon ?? `icon-${id}`,
    scopes: spec.scopes ?? ['base', 'bonus'],
    initial: spec.initial ?? false,
  };
}

/**
 * The menu a set of feature flags asks for: the audio rows, then one row per speed,
 * then the rest — the order the reference's own markup is in.
 */
export function defaultMenu(features: Readonly<HudFeatures>, speeds: readonly SpeedConfig[]): MenuItemConfig[] {
  const row = (kind: keyof typeof MENU_DEFAULTS): MenuItemConfig | null => {
    const d = MENU_DEFAULTS[kind];
    return features[d.feature] ? { id: kind, kind, label: d.label, icon: d.icon } : null;
  };
  const speedRows: MenuItemConfig[] = speeds.map((s) => ({ id: s.id, kind: 'speed' as const, speed: s.id, label: s.name, icon: `${s.icon}-off` }));
  return [row('sound'), row('music'), ...speedRows, row('history'), row('info'), row('realMoney'), row('deposit'), row('lobby')].filter(
    (r): r is MenuItemConfig => r !== null,
  );
}

export const defaultHudChrome: Readonly<HudChrome> = Object.freeze({
  dock: 'bottom' as HudDock,
  features: defaultHudFeatures,
  speeds: Object.freeze(defaultSpeeds.filter((s) => s.id !== 'super-turbo')),
  menu: Object.freeze(defaultMenu(defaultHudFeatures, defaultSpeeds.filter((s) => s.id !== 'super-turbo'))),
  winRepresentation: 'ticker' as WinRepresentation,
  reveal: 'drop' as RevealBehavior,
  scale: 1,
  maxWidth: 52.5,
});

/** A reportable chrome problem (structurally a `SpecIssue`, kept dependency-free). */
export interface ChromeIssue {
  level: 'warn' | 'error';
  path: string;
  code: string;
  message: string;
}

const DOCKS: HudDock[] = ['bottom', 'top'];
const REVEALS: RevealBehavior[] = ['drop', 'rotate', 'spin', 'twist', 'none'];
const WIN_REPS: WinRepresentation[] = ['ticker', 'standalone'];

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/**
 * Resolve a host's `hud` block into a complete config. Bad values are reported and
 * dropped — the default shows through, so a typo restyles nothing and breaks nothing.
 */
export function resolveHudChrome(spec?: HudChromeSpec, onIssue?: (i: ChromeIssue) => void): HudChrome {
  if (!spec) return defaultHudChrome;

  const features: HudFeatures = { ...defaultHudFeatures };
  if (spec.features) {
    for (const [k, v] of Object.entries(spec.features)) {
      if (!(k in defaultHudFeatures)) {
        onIssue?.({ level: 'warn', path: `hud.features.${k}`, code: 'unknown-feature', message: `"${k}" is not a HUD feature — ignored` });
        continue;
      }
      if (typeof v !== 'boolean') {
        onIssue?.({ level: 'warn', path: `hud.features.${k}`, code: 'bad-feature', message: `"${String(v)}" is not a boolean — kept the default` });
        continue;
      }
      features[k as HudFeatureId] = v;
    }
  }

  const pick = <T extends string>(value: T | undefined, allowed: T[], fallback: T, path: string): T => {
    if (value == null) return fallback;
    if (allowed.includes(value)) return value;
    onIssue?.({ level: 'warn', path, code: 'bad-value', message: `"${String(value)}" is not one of ${allowed.join(' | ')} — kept "${fallback}"` });
    return fallback;
  };

  const num = (value: number | undefined, lo: number, hi: number, fallback: number, path: string): number => {
    if (value == null) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      onIssue?.({ level: 'warn', path, code: 'bad-number', message: `"${String(value)}" must be a finite number — kept ${fallback}` });
      return fallback;
    }
    return clamp(value, lo, hi);
  };

  // ── speeds ────────────────────────────────────────────────────────────────
  // Given none, the game gets the two the reference ships, minus whichever of the
  // `turbo` / `superTurbo` flags it switched off. Given some, they ARE the speeds:
  // a list is a statement, and a flag cannot argue with it.
  let speeds: SpeedConfig[];
  if (spec.speeds) {
    speeds = [];
    const seen = new Set<string>();
    for (const [i, entry] of spec.speeds.entries()) {
      if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
        onIssue?.({ level: 'warn', path: `hud.speeds[${i}]`, code: 'bad-speed', message: 'a speed needs an id — dropped' });
        continue;
      }
      if (seen.has(entry.id)) {
        onIssue?.({ level: 'warn', path: `hud.speeds[${i}]`, code: 'duplicate-speed', message: `"${entry.id}" is already a speed — dropped` });
        continue;
      }
      seen.add(entry.id);
      speeds.push(resolveSpeed(entry));
    }
  } else {
    speeds = defaultSpeeds.filter((s) => (s.id === 'super-turbo' ? features.superTurbo : features.turbo)).map((s) => ({ ...s }));
  }

  // ── the menu ──────────────────────────────────────────────────────────────
  const byId = new Map(speeds.map((s) => [s.id, s]));
  let menu: MenuItemConfig[];
  if (spec.menu) {
    menu = [];
    for (const [i, entry] of spec.menu.entries()) {
      const kind = entry?.kind;
      if (!kind || (kind !== 'speed' && kind !== 'action' && !(kind in MENU_DEFAULTS))) {
        onIssue?.({ level: 'warn', path: `hud.menu[${i}]`, code: 'unknown-menu-item', message: `"${String(kind)}" is not a menu row — dropped` });
        continue;
      }
      if (kind === 'speed') {
        const speedId = entry.speed ?? entry.id;
        const speed = speedId ? byId.get(speedId) : undefined;
        if (!speed) {
          onIssue?.({ level: 'warn', path: `hud.menu[${i}]`, code: 'unknown-speed', message: `"${String(speedId)}" is not one of the speeds — dropped` });
          continue;
        }
        menu.push({ id: entry.id ?? speed.id, kind, speed: speed.id, label: entry.label ?? speed.name, icon: entry.icon ?? `${speed.icon}-off` });
        continue;
      }
      if (kind === 'action') {
        if (!entry.id) {
          onIssue?.({ level: 'warn', path: `hud.menu[${i}]`, code: 'bad-menu-item', message: 'an action row needs an id — dropped' });
          continue;
        }
        menu.push({ id: entry.id, kind, label: entry.label ?? entry.id, icon: entry.icon ?? 'icon-dots' });
        continue;
      }
      const d = MENU_DEFAULTS[kind];
      menu.push({ id: entry.id ?? kind, kind, label: entry.label ?? d.label, icon: entry.icon ?? d.icon });
    }
  } else {
    menu = defaultMenu(features, speeds);
  }

  return Object.freeze({
    dock: pick(spec.dock, DOCKS, defaultHudChrome.dock, 'hud.dock'),
    features: Object.freeze(features),
    speeds: Object.freeze(speeds),
    menu: Object.freeze(menu),
    winRepresentation: pick(spec.winRepresentation, WIN_REPS, defaultHudChrome.winRepresentation, 'hud.winRepresentation'),
    reveal: pick(spec.reveal, REVEALS, defaultHudChrome.reveal, 'hud.reveal'),
    scale: num(spec.scale, 0.5, 2, defaultHudChrome.scale, 'hud.scale'),
    maxWidth: num(spec.maxWidth, 24, 96, defaultHudChrome.maxWidth, 'hud.maxWidth'),
  });
}
