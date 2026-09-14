/**
 * Theming = data. Semantic tokens with safe fallbacks (Charter P8).
 * A game theme is a small override map; nothing renders un-themed because
 * the renderer always has these defaults to fall back on.
 */

export interface Theme {
  color: {
    accent: string;
    accentText: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    textDim: string;
    disabled: string;
    /** The ribbon's translucent plate. */
    bar: string;
    /** Hard edge drawn around the action box + the round button. */
    edge: string;
    /** Readout captions (BALANCE / BET / WIN). */
    label: string;
    /** BUY BONUS pill. */
    featureBuy: string;
    /** Text on the buy pill. */
    featureBuyText: string;
    /** Bonus/free-spins accent (grid cards, feature panel). */
    bonus: string;
    /** The fly-up menu + sheet background. */
    menu: string;
    /** A destructive / stop action (slam-stop, limits exceeded). */
    danger: string;
  };
  /** Plate + panel opacity — the ribbon is translucent over the reels. */
  alpha: { bar: number; sheet: number; backdrop: number };
  radius: { pill: number; card: number };
  space: { sm: number; md: number; lg: number };
  type: { family: string; size: { xs: number; sm: number; md: number; lg: number } };
  /** Motion durations in ms. */
  motion: { fast: number; base: number; slow: number };
}

/** Neutral reference theme. The real game theme is built on top of this. */
export const defaultTheme: Theme = {
  color: {
    accent: '#ffc529',
    accentText: '#000000',
    surface: '#262626',
    surfaceAlt: '#0d0d0d',
    text: '#fafafa',
    textDim: '#adb5bd',
    disabled: '#4a4a4a',
    bar: '#000000',
    edge: '#000000',
    label: '#adb5bd',
    featureBuy: '#ff5e00',
    featureBuyText: '#ffffff',
    bonus: '#47b04b',
    menu: '#0d0d0d',
    danger: '#e03131',
  },
  alpha: { bar: 0.6, sheet: 0.96, backdrop: 0.65 },
  radius: { pill: 999, card: 5 },
  space: { sm: 8, md: 16, lg: 24 },
  type: { family: 'system-ui, sans-serif', size: { xs: 11, sm: 14, md: 18, lg: 28 } },
  motion: { fast: 125, base: 200, slow: 360 },
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function merge<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    const pv = (patch as Record<string, unknown>)[key];
    const bv = (base as Record<string, unknown>)[key];
    out[key] = isObject(pv) && isObject(bv) ? merge(bv, pv as DeepPartial<typeof bv>) : pv;
  }
  return out as T;
}

/** Produce a new theme from the default (or any base) plus an override patch. */
export function extendTheme(base: Theme, patch: DeepPartial<Theme>): Theme {
  return merge(base, patch);
}
