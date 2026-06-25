/**
 * Currency display metadata + a pure formatter (Charter P11: data, not code).
 *
 * Stake Engine supports 35+ currencies — fiat (incl. zero-decimal JPY/KRW/VND…),
 * crypto, and the social coins XGC/XSC (shown as "GC"/"SC", never locale-formatted
 * as fiat). A host shouldn't have to hand-tune decimals for each, so this maps a
 * code → its display precision; anything unknown defaults to 2 (the common case).
 * The UI computes no money — it only formats what the game sets.
 */
import type { CurrencySpec } from '../controls/ValueDisplay';
import { clampDecimals } from '../safe';

export interface CurrencyInfo {
  /** Fractional digits to show (JPY/KRW = 0, USD = 2, BTC = 8). */
  decimals: number;
  /** Display code shown to the player when it differs from the code (XGC → "GC"). */
  display?: string;
  /** A social / sweepstakes coin — never formatted as a fiat currency. */
  social?: boolean;
}

/** Zero-decimal fiat currencies (no minor unit). */
const ZERO_DECIMAL = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'XAF', 'XOF', 'PYG', 'RWF'];
/** Common crypto display precisions. */
const CRYPTO: Record<string, number> = { BTC: 8, ETH: 8, LTC: 8, BCH: 8, DOGE: 8, XRP: 6, SOL: 6, TRX: 6, USDT: 2, USDC: 2 };

/** Code → display info. Unknown codes fall back to 2 decimals (see {@link resolveCurrency}). */
export const CURRENCY_TABLE: Readonly<Record<string, CurrencyInfo>> = Object.freeze({
  ...Object.fromEntries(ZERO_DECIMAL.map((c) => [c, { decimals: 0 }])),
  ...Object.fromEntries(Object.entries(CRYPTO).map(([c, d]) => [c, { decimals: d }])),
  // Stake social currencies: Gold Coins + Stake Cash — shown as GC/SC, not fiat.
  XGC: { decimals: 2, display: 'GC', social: true },
  XSC: { decimals: 2, display: 'SC', social: true },
  GC: { decimals: 2, display: 'GC', social: true },
  SC: { decimals: 2, display: 'SC', social: true },
});

const upper = (code: string): string => (typeof code === 'string' ? code.toUpperCase() : '');

/** True if `code` is a Stake social/sweepstakes coin (display "GC"/"SC"). */
export function isSocialCurrency(code: string): boolean {
  return CURRENCY_TABLE[upper(code)]?.social === true;
}

/**
 * Resolve a currency code to a complete, display-ready {@link CurrencySpec}: fills
 * decimals from the table (default 2) and maps social coins to their display code.
 * Anything in `overrides` wins, so a game can still hand-tune. Never throws.
 */
export function resolveCurrency(code: string, overrides: Partial<CurrencySpec> = {}): CurrencySpec {
  const info = CURRENCY_TABLE[upper(code)] ?? { decimals: 2 };
  return {
    code: overrides.code ?? info.display ?? code,
    decimals: clampDecimals(overrides.decimals ?? info.decimals),
    position: overrides.position ?? 'suffix',
    separator: overrides.separator ?? ',',
    decimalChar: overrides.decimalChar ?? '.',
  };
}

/**
 * Format an amount (major units) per a {@link CurrencySpec}: grouped integer part,
 * fixed decimals, the code on the configured side. `signed` adds an explicit "+"
 * for non-negative values (negatives always show "-") — used by the net-position
 * readout. Pure + total: a malformed number renders as "0".
 */
export function formatAmount(value: number, spec: CurrencySpec, opts: { signed?: boolean } = {}): string {
  const decimals = clampDecimals(spec.decimals);
  const sep = spec.separator ?? ',';
  const dot = spec.decimalChar ?? '.';
  const n = Number.isFinite(value) ? value : 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [int = '0', frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const body = frac ? `${grouped}${dot}${frac}` : grouped;
  const sign = n < 0 ? '-' : opts.signed ? '+' : '';
  const number = `${sign}${body}`;
  return (spec.position ?? 'suffix') === 'prefix' ? `${spec.code} ${number}` : `${number} ${spec.code}`;
}
