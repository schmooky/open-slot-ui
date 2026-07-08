/**
 * Currency display metadata + a pure formatter (Charter P11: data, not code).
 *
 * This is the **Stake Engine currency table**: every code Stake supports, mapped to
 * its display SYMBOL, minor-unit decimals, and symbol side (before/after the number).
 * A game shouldn't hand-tune any of this — it either passes a full `CurrencySpec`, or
 * just the CODE (`currency: 'CNY'`) and gets the Stake formatting for free
 * ("I use the Stake currency formatter"). Unknown codes fall back to a 2-decimal,
 * code-suffix spec so nothing ever breaks. The UI computes no money — it only formats
 * what the game sets.
 */
import type { CurrencySpec } from '../controls/ValueDisplay';
import { clampDecimals } from '../safe';

export interface CurrencyInfo {
  /** The glyph shown to the player ("$", "CN¥", "GC"). */
  symbol: string;
  /** Fractional digits to show (JPY/KRW/IDR = 0, USD = 2, BTC = 8). */
  decimals: number;
  /** Symbol AFTER the number ("10,00 zł") rather than before ("$10.00"). Default before. */
  symbolAfter?: boolean;
  /** A social / sweepstakes coin (Gold Coins / Stake Cash) — never fiat wording. */
  social?: boolean;
}

/**
 * The Stake Engine supported-currency matrix (symbol · decimals · placement), 1:1 with
 * the platform's `CurrencyMeta`. Symbol placement: prefix by default, SUFFIX for the
 * few that render after the amount (DKK/PLN/VND/CLP/ARS/PEN). Crypto is included for
 * completeness (8-dp with a symbol) so high-precision balances also format right.
 */
export const CURRENCY_TABLE: Readonly<Record<string, CurrencyInfo>> = Object.freeze({
  // ── fiat — symbol BEFORE the amount ──────────────────────────────────────────
  USD: { symbol: '$', decimals: 2 },
  CAD: { symbol: 'CA$', decimals: 2 },
  JPY: { symbol: '¥', decimals: 0 },
  EUR: { symbol: '€', decimals: 2 },
  RUB: { symbol: '₽', decimals: 2 },
  CNY: { symbol: 'CN¥', decimals: 2 },
  PHP: { symbol: '₱', decimals: 2 },
  INR: { symbol: '₹', decimals: 2 },
  IDR: { symbol: 'Rp', decimals: 0 },
  KRW: { symbol: '₩', decimals: 0 },
  BRL: { symbol: 'R$', decimals: 2 },
  MXN: { symbol: 'MX$', decimals: 2 },
  TRY: { symbol: '₺', decimals: 2 },
  GBP: { symbol: '£', decimals: 2 },
  // ── fiat — symbol AFTER the amount ───────────────────────────────────────────
  DKK: { symbol: 'kr', decimals: 2, symbolAfter: true },
  PLN: { symbol: 'zł', decimals: 2, symbolAfter: true },
  VND: { symbol: '₫', decimals: 0, symbolAfter: true },
  CLP: { symbol: 'CLP', decimals: 0, symbolAfter: true },
  ARS: { symbol: 'ARS', decimals: 2, symbolAfter: true },
  PEN: { symbol: 'S/', decimals: 2, symbolAfter: true },
  // ── crypto (8-dp, so sub-cent + high precision format correctly) ─────────────
  BTC: { symbol: '₿', decimals: 8 },
  ETH: { symbol: 'Ξ', decimals: 8 },
  LTC: { symbol: 'Ł', decimals: 8 },
  BCH: { symbol: 'BCH', decimals: 8 },
  DOGE: { symbol: 'Ð', decimals: 8 },
  USDT: { symbol: '₮', decimals: 2 },
  USDC: { symbol: 'USDC', decimals: 2 },
  // ── Stake social coins — Gold Coins / Stake Cash (shown as GC / SC) ───────────
  XGC: { symbol: 'GC', decimals: 2, social: true },
  XSC: { symbol: 'SC', decimals: 2, social: true },
  GC: { symbol: 'GC', decimals: 2, social: true },
  SC: { symbol: 'SC', decimals: 2, social: true },
});

const upper = (code: string): string => (typeof code === 'string' ? code.toUpperCase() : '');

/** True if `code` is a Stake social/sweepstakes coin (displayed "GC"/"SC"). */
export function isSocialCurrency(code: string): boolean {
  return CURRENCY_TABLE[upper(code)]?.social === true;
}

/**
 * Resolve a currency code to a complete, display-ready {@link CurrencySpec} using the
 * Stake table: fills the SYMBOL (rendered tight, `display:'symbol'`), its side
 * (`position`), and the minor-unit `decimals`. Anything in `overrides` wins so a game
 * can still hand-tune (e.g. force more decimals for sub-cent payouts). An unknown code
 * degrades to a 2-decimal code-suffix spec. Never throws.
 */
export function resolveCurrency(code: string, overrides: Partial<CurrencySpec> = {}): CurrencySpec {
  const info = CURRENCY_TABLE[upper(code)];
  if (!info) {
    // Unknown code → show the raw code as a suffix (safe default).
    return {
      code: overrides.code ?? code,
      decimals: clampDecimals(overrides.decimals ?? 2),
      position: overrides.position ?? 'suffix',
      separator: overrides.separator ?? ',',
      decimalChar: overrides.decimalChar ?? '.',
      ...(overrides.symbol ? { symbol: overrides.symbol, display: overrides.display ?? 'symbol' } : {}),
    };
  }
  return {
    // Social coins carry their DISPLAY code (XGC → "GC", XSC → "SC"); fiat/crypto keep
    // their ISO code (the symbol is what's actually rendered under `display:'symbol'`).
    code: overrides.code ?? (info.social ? info.symbol : code),
    symbol: overrides.symbol ?? info.symbol,
    display: overrides.display ?? 'symbol',
    position: overrides.position ?? (info.symbolAfter ? 'suffix' : 'prefix'),
    decimals: clampDecimals(overrides.decimals ?? info.decimals),
    separator: overrides.separator ?? ',',
    decimalChar: overrides.decimalChar ?? '.',
  };
}

/**
 * Format an amount (major units) per a {@link CurrencySpec}: grouped integer part,
 * fixed decimals, and the affix on the configured side. When `display:'symbol'` (and a
 * symbol is set) the SYMBOL sits tight against the number (`CN¥1,234.56` · `1.234,56 zł`);
 * otherwise the ISO code is spaced (`1,234.56 USD`). `signed` adds an explicit "+" for
 * non-negative values (used by the net-position readout). Pure + total: a malformed
 * number renders as "0".
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
  const symbolMode = spec.display === 'symbol' && !!spec.symbol;
  const affix = symbolMode ? (spec.symbol as string) : spec.code;
  const prefix = (spec.position ?? 'suffix') === 'prefix';
  // Stake DisplayBalance: a PREFIX symbol hugs the number ("CN¥10.00"); a SUFFIX symbol
  // is spaced ("10.00 zł"); the ISO code is always spaced.
  const gap = symbolMode && prefix ? '' : ' ';
  return prefix ? `${affix}${gap}${number}` : `${number}${gap}${affix}`;
}
