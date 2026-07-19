/**
 * Build / clamp a bet ladder from a Stake Engine RGS bet config so the host doesn't
 * have to hand-tune `betLadder` (and can't ship a stake outside min/max/step). Pure.
 */

export interface RgsBetConfig {
  /** Allowed stake amounts in API minor units (Stake: dollars × 1_000_000). */
  betLevels?: number[];
  minBet?: number;
  maxBet?: number;
  stepBet?: number;
  /** Default stake in minor units (custom bets must be a multiple of this). */
  defaultBetLevel?: number;
}

/** Stake's API minor-unit divisor (1_000_000 minor units = 1.00). */
export const API_AMOUNT_DIVISOR = 1_000_000;

/**
 * Turn an RGS bet config into a `{ levels, index }` ladder in MAJOR units (what
 * `UISpec.betLadder` wants). Uses `betLevels` if present, else derives from
 * min/max/step. `divisor` converts minor→major (default Stake's 1_000_000).
 */
export function buildBetLadder(cfg: RgsBetConfig, divisor = API_AMOUNT_DIVISOR): { levels: number[]; index: number } {
  let minor: number[];
  if (cfg.betLevels?.length) {
    minor = cfg.betLevels.slice();
  } else {
    const min = cfg.minBet ?? 0;
    const max = Math.max(min, cfg.maxBet ?? min);
    const step = cfg.stepBet && cfg.stepBet > 0 ? cfg.stepBet : max - min || 1;
    minor = [];
    for (let v = min; v <= max && minor.length < 500; v += step) minor.push(v);
    if (!minor.length) minor = [min];
  }
  const levels = minor.map((v) => v / divisor);
  const want = (cfg.defaultBetLevel ?? minor[0]!) / divisor;
  const found = levels.findIndex((v) => v >= want);
  return { levels, index: found < 0 ? 0 : found };
}

/**
 * Resolve the shown bet ladder from an authenticate response (MAJOR units): use EVERY
 * level the RGS offers, VERBATIM, and snap the default bet to the matching level.
 *
 * Deliberately does NOT filter out low levels. Stake requires every currency's full
 * ladder — including its true minimum (e.g. USD 0.01) — to come straight from
 * authenticate. A consequence is that the smallest win can be below one minimal
 * currency unit (USD 0.01 bet × a ×0.2 face = 0.002); the money displays render that
 * true sub-unit amount (see `formatAmountPrecise` / `ValueDisplay.autoPrecision`)
 * rather than hiding the level. Pure — share it between the UISpec builder and the
 * game's balance store so both agree on the bet.
 */
export function resolveBetLadder(
  availableBets: number[] | undefined,
  defaultBet: number,
  fallback: number[] = [0.2, 0.5, 1, 2, 5, 10],
): { levels: number[]; index: number } {
  const levels = availableBets?.length ? availableBets.slice() : fallback.slice();
  const exact = levels.indexOf(defaultBet);
  const index = exact >= 0 ? exact : Math.max(0, levels.findIndex((b) => b >= defaultBet));
  return { levels, index };
}

/** Clamp a stake (major units) to the RGS min/max and snap to `stepBet`. Pure. */
export function clampBet(amount: number, cfg: RgsBetConfig, divisor = API_AMOUNT_DIVISOR): number {
  const min = (cfg.minBet ?? 0) / divisor;
  const max = (cfg.maxBet ?? Infinity) / divisor;
  const step = (cfg.stepBet ?? 0) / divisor;
  let v = Math.min(max, Math.max(min, Number.isFinite(amount) ? amount : min));
  if (step > 0) v = min + Math.round((v - min) / step) * step;
  return Math.min(max, Math.max(min, v));
}
