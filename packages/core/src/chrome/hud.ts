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
  winRepresentation: WinRepresentation;
  reveal: RevealBehavior;
  scale: number;
  maxWidth: number;
}

export const defaultHudChrome: Readonly<HudChrome> = Object.freeze({
  dock: 'bottom' as HudDock,
  features: defaultHudFeatures,
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

  return Object.freeze({
    dock: pick(spec.dock, DOCKS, defaultHudChrome.dock, 'hud.dock'),
    features: Object.freeze(features),
    winRepresentation: pick(spec.winRepresentation, WIN_REPS, defaultHudChrome.winRepresentation, 'hud.winRepresentation'),
    reveal: pick(spec.reveal, REVEALS, defaultHudChrome.reveal, 'hud.reveal'),
    scale: num(spec.scale, 0.5, 2, defaultHudChrome.scale, 'hud.scale'),
    maxWidth: num(spec.maxWidth, 24, 96, defaultHudChrome.maxWidth, 'hud.maxWidth'),
  });
}
