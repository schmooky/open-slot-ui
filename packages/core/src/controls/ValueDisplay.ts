import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import { safeAmount, clampDecimals, clampMinDigits } from '../safe';
import { neededDecimals } from '../format/currency';
import type { LayoutSpec } from '../layout/anchor';

/** Currency / crypto descriptor — the code/symbol + how to format it. */
export interface CurrencySpec {
  /** ISO code or crypto name: "USD", "EUR", "BTC", "mBTC", "SATS". */
  code: string;
  /**
   * The minimal-unit precision — how many fractional digits show after the `.`:
   * 2 (USD/EUR cents), 0 (JPY/SATS), 5 (mBTC), 8 (BTC). Values are held + rolled as
   * integer minor units (no float drift). Clamped to 0..8.
   */
  decimals: number;
  /** Symbol for `display: 'symbol'` (e.g. "$", "€", "₿"). */
  symbol?: string;
  /** Show the ISO/crypto `code` (default) or the `symbol` (when one is set). */
  display?: 'code' | 'symbol';
  /** Affix on the left or right of the number. Default 'suffix'. */
  position?: 'prefix' | 'suffix';
  /** Thousands separator char. Default ','. */
  separator?: string;
  /** Decimal point char. Default '.'. */
  decimalChar?: string;
}

export interface ValueDisplayOptions {
  id: string;
  layout: LayoutSpec;
  currency: CurrencySpec;
  /** Optional caption ("Balance" / "Bet"). */
  label?: string;
  /** Initial value, in major units (e.g. 1234.56). */
  initial?: number;
  /** Optional MINIMUM total column width for the rolling counter (integer + fraction).
   *  `0`/unset = auto: the odometer is sized tightly to the value and grows as it does,
   *  so the currency symbol hugs the number and large balances never clamp. Set it only
   *  to reserve a stable, wider odometer. Clamped 0..18. Default 0 (auto). */
  digits?: number;
}

/**
 * A value display: a number plus a currency/crypto code. Not interactive — the
 * host sets the value (`ui.balance.set(...)`) and the renderer animates it.
 * Value is held in major units; `minorUnits` is the integer the counter rolls.
 */
export class ValueDisplay extends Control {
  readonly states: StateMap = { idle: { interactable: false } };
  readonly value = new Signal<number>(0);
  readonly currency: Signal<CurrencySpec>;
  readonly label?: string;
  /**
   * Show a value at the precision it ACTUALLY carries (default on): when the value has
   * more fraction digits than the currency's native precision — a sub-unit win like a
   * USD 0.01 bet × a ×0.2 face = 0.002, or the 999.982 balance it leaves behind — the
   * display decimals bump just enough to reveal them ($0.002), and drop back to the
   * native look (5.00) once the value is clean again. Set `false` for hard-fixed decimals.
   */
  autoPrecision = true;
  /** The currency's NATIVE precision — what `autoPrecision` returns to on clean values. */
  private baseDecimals: number;
  /** Minimum odometer column width (0 = auto: sized tightly to the value, grows as it
   *  does). Read by the renderer at build time, so set it before mount (or declaratively
   *  via `controls.{id}.digits`). */
  digits: number;

  constructor(opts: ValueDisplayOptions) {
    super({ id: opts.id, role: 'status', layout: opts.layout }, 'idle');
    // Clamp at construction too (not just setCurrency) so the stored spec is the
    // single source of truth — `minorUnits` and the counter never see decimals > 8.
    const c = opts.currency;
    this.currency = new Signal<CurrencySpec>(
      c && typeof c.code === 'string' ? { ...c, decimals: clampDecimals(c.decimals) } : { code: 'USD', decimals: 2 },
    );
    this.baseDecimals = this.currency.get().decimals;
    this.label = opts.label;
    this.digits = clampMinDigits(opts.digits ?? 0);
    if (opts.initial != null) this.value.set(opts.initial);
    this.applyPrecision();
  }

  /** Set the minimum odometer column width (clamped 0..18; 0 = auto). Read by the
   *  renderer at build time, so set it before mount (or via `controls.{id}.digits`). */
  setDigits(n: number): void {
    this.digits = clampMinDigits(n);
  }

  /** Never-reject: NaN/Infinity/non-number degrade to a no-op, keeping the last
   *  good value — malformed host data never throws into the render loop (P11). */
  set(amount: number): void {
    this.value.set(safeAmount(amount, this.value.get()));
    this.applyPrecision();
  }

  get(): number {
    return this.value.get();
  }

  /** Keep the prior spec on malformed input; clamp decimals to 0..8 (P11). The given
   *  decimals become the NATIVE precision (`autoPrecision` bumps above it as needed). */
  setCurrency(spec: CurrencySpec): void {
    if (!spec || typeof spec.code !== 'string') return;
    this.baseDecimals = clampDecimals(spec.decimals);
    this.currency.set({ ...spec, decimals: this.baseDecimals });
    this.applyPrecision();
  }

  /** Bump the display decimals to what the current value needs — never below the
   *  currency's native precision — and drop back once the value is clean again.
   *  No-op (and no signal churn) when the shown precision is already right. */
  private applyPrecision(): void {
    if (!this.autoPrecision) return;
    const want = neededDecimals(this.value.get(), this.baseDecimals);
    const cur = this.currency.get();
    if (cur.decimals !== want) this.currency.set({ ...cur, decimals: want });
  }

  /** Accent emphasis: the renderer tints the value in the theme accent while on.
   *  For "this number is modified" moments — e.g. a bet display showing the
   *  EFFECTIVE stake while an ante/boost multiplies it. */
  readonly emphasized = new Signal<boolean>(false);

  setEmphasis(on: boolean): void {
    this.emphasized.set(on === true);
  }

  /** Integer minor units for the counter (no float drift). */
  get minorUnits(): number {
    return Math.round(this.value.get() * Math.pow(10, this.currency.get().decimals));
  }
}
