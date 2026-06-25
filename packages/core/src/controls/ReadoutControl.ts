import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import { safeAmount } from '../safe';
import type { LayoutSpec } from '../layout/anchor';
import type { CurrencySpec } from './ValueDisplay';

/**
 * What a readout shows:
 * - `'percent'`  → a number + "%"            (RTP disclosure — `displayRTP`)
 * - `'currency'` → a signed currency amount  (net position — `displayNetPosition`)
 * - `'duration'` → an elapsed clock the view ticks (session timer — `displaySessionTimer`)
 * - `'plain'`    → the grouped number
 */
export type ReadoutKind = 'percent' | 'currency' | 'duration' | 'plain';

export interface ReadoutOptions {
  id: string;
  layout: LayoutSpec;
  kind?: ReadoutKind;
  label?: string;
  /** Initial value (percent: 96, currency: major units, duration: seconds). */
  value?: number;
  /** Decimals for `percent`/`plain`. Default 1 for percent, 0 otherwise. */
  decimals?: number;
  /** Currency descriptor for the `currency` kind. */
  currency?: CurrencySpec;
  /** Whether a `currency` readout shows an explicit +/- sign. Default true. */
  signed?: boolean;
}

/**
 * A small, non-interactive text readout for the compliance display elements Stake
 * Engine's jurisdiction config can mandate: RTP (`displayRTP`), net position
 * (`displayNetPosition`), and the session timer (`displaySessionTimer`). It is the
 * single source of truth for the value; the renderer formats it (and, for
 * `'duration'`, ticks it). Hidden by default — `applyJurisdiction` reveals the ones
 * a jurisdiction requires. Never-reject inbound boundary (Charter P11).
 */
export class ReadoutControl extends Control {
  readonly states: StateMap = { idle: { interactable: false } };
  readonly value = new Signal<number>(0);
  /** Whether a `'duration'` readout is currently advancing. */
  readonly running = new Signal<boolean>(false);
  readonly kind: ReadoutKind;
  readonly label?: string;
  readonly decimals: number;
  readonly signed: boolean;
  /** Present for the `'currency'` kind so the view can format + react to changes. */
  readonly currency?: Signal<CurrencySpec>;

  constructor(opts: ReadoutOptions) {
    super({ id: opts.id, role: 'status', layout: opts.layout }, 'idle');
    this.kind = opts.kind ?? 'plain';
    this.label = opts.label;
    this.decimals = opts.decimals ?? (this.kind === 'percent' ? 1 : 0);
    this.signed = opts.signed ?? true;
    if (opts.currency) this.currency = new Signal<CurrencySpec>(opts.currency);
    if (opts.value != null) this.value.set(safeAmount(opts.value, 0));
  }

  /** Never-reject: malformed input keeps the last good value (P11). */
  set(v: number): void {
    this.value.set(safeAmount(v, this.value.get()));
  }
  get(): number {
    return this.value.get();
  }
  setCurrency(spec: CurrencySpec): void {
    if (this.currency && spec && typeof spec.code === 'string') this.currency.set(spec);
  }

  // ── duration / session timer ────────────────────────────────────────────────
  /** Advance an elapsed-time readout by `deltaSec` (the renderer calls this each frame). */
  tick(deltaSec: number): void {
    if (this.kind !== 'duration' || !this.running.get()) return;
    if (!Number.isFinite(deltaSec) || deltaSec <= 0) return;
    this.value.set(this.value.get() + deltaSec);
  }
  start(): void {
    this.running.set(true);
  }
  stop(): void {
    this.running.set(false);
  }
  reset(): void {
    this.value.set(0);
  }
}
