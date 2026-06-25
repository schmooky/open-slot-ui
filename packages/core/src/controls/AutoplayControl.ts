import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import { Squish, Pulse, Fade } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

/**
 * How tapping autoplay behaves:
 * - `'options'` — tap opens a picker (a bottom drawer) to choose a spin count, then Start.
 * - `'infinite'` — tap starts infinite autoplay immediately; tap again stops. No picker.
 */
export type AutoplayMode = 'options' | 'infinite';

/** Responsible-gambling stop limits for an autoplay session (multiples of bet). */
export interface AutoplayLimits {
  /** Stop when cumulative net loss reaches `lossLimit × bet`. Infinity = no limit. */
  lossLimit?: number;
  /** Stop on a single win ≥ `singleWinLimit × bet`. Infinity = no limit. */
  singleWinLimit?: number;
}

export interface AutoplayOptions {
  id: string;
  layout: LayoutSpec;
  /** Count choices shown in the picker. Use Infinity for "∞". */
  options?: number[];
  /** Tap behavior. Default `'options'`. */
  mode?: AutoplayMode;
  /**
   * Optional responsible-gambling limit choices offered in the picker (multiples
   * of the bet; Infinity = "no limit"). When present, the picker shows a
   * "stop if total loss reaches N×" / "stop on a single win ≥ N×" row, and the
   * host must feed each round's outcome via {@link AutoplayControl.reportResult}.
   */
  lossLimitOptions?: number[];
  winLimitOptions?: number[];
}

/**
 * Autoplay button. In `'options'` mode, tapping (idle) opens a count picker;
 * choosing a count starts autoplay. In `'infinite'` mode, tapping starts infinite
 * autoplay straight away. While active it shows the live remaining count (fed by
 * the host via `setCount`); tapping stops. open-ui owns the picker UI + the
 * displayed count; the host runs the actual spin loop.
 */
export class AutoplayControl extends Control {
  readonly states: StateMap = {
    idle: { interactable: true, transition: new Squish(0.94, 110) },
    picking: { interactable: true },
    active: { interactable: true, transition: new Pulse(1.06, 150) },
    disabled: { interactable: false, transition: new Fade(0.4, 150) },
  };
  /** Remaining spins while active (Infinity = ∞). 0 when not active. */
  readonly count: Signal<number>;
  private _options: number[];
  private _lossLimitOptions: number[];
  private _winLimitOptions: number[];
  /** Active stop-on-total-loss (multiples of bet; Infinity = no limit). */
  lossLimit = Infinity;
  /** Active stop-on-single-win (multiples of bet; Infinity = no limit). */
  singleWinLimit = Infinity;
  /** Running net loss this autoplay session (bet − win, summed). */
  private netLoss = 0;
  /** Tap behavior (`'options'` opens the picker, `'infinite'` starts immediately). */
  mode: AutoplayMode;

  constructor(opts: AutoplayOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    super({ id: opts.id, role: 'button', layout: opts.layout }, 'idle');
    this._options = opts.options ?? [10, 25, 50, 100, Infinity];
    this._lossLimitOptions = opts.lossLimitOptions ?? [];
    this._winLimitOptions = opts.winLimitOptions ?? [];
    this.mode = opts.mode ?? 'options';
    this.count = new Signal<number>(0);
  }

  /** Count choices shown in the picker (Infinity allowed = ∞). */
  get options(): number[] {
    return this._options;
  }
  /** Loss-limit choices for the picker (multiples of bet; Infinity = no limit). */
  get lossLimitOptions(): number[] {
    return this._lossLimitOptions;
  }
  /** Single-win-stop choices for the picker (multiples of bet; Infinity = no limit). */
  get winLimitOptions(): number[] {
    return this._winLimitOptions;
  }

  /** Replace the picker's count choices (e.g. when limits change). */
  setOptions(options: number[]): void {
    if (options.length) this._options = options.slice();
  }
  /** Replace the picker's loss-limit / single-win-stop choices. */
  setLossLimitOptions(options: number[]): void {
    this._lossLimitOptions = Array.isArray(options) ? options.slice() : [];
  }
  setWinLimitOptions(options: number[]): void {
    this._winLimitOptions = Array.isArray(options) ? options.slice() : [];
  }

  get isActive(): boolean {
    return this.current === 'active';
  }

  openPicker(): void {
    if (this.current === 'idle') this.setState('picking');
  }
  cancelPicker(): void {
    if (this.current === 'picking') this.setState('idle');
  }

  /** Choose a count (+ optional RG limits) from the picker → start autoplay. */
  pick(count: number, limits: AutoplayLimits = {}): void {
    if (this.current !== 'picking') return;
    this.begin(count, limits);
  }

  /** Start autoplay with a count (Infinity = ∞) + optional RG limits, from idle or
   *  the picker. The limits are enforced as the host reports each round's outcome
   *  via {@link reportResult}. */
  begin(count: number, limits: AutoplayLimits = {}): void {
    if (this.current !== 'idle' && this.current !== 'picking') return;
    this.lossLimit = limits.lossLimit ?? Infinity;
    this.singleWinLimit = limits.singleWinLimit ?? Infinity;
    this.netLoss = 0;
    this.count.set(count);
    this.setState('active');
    this.bus?.emit('autoplayStarted', { count, lossLimit: this.lossLimit, singleWinLimit: this.singleWinLimit });
  }

  /**
   * The host reports one completed autoplay round's outcome (major units) — this is
   * the responsible-gambling guardrail. It advances the remaining count and stops
   * autoplay if: the count is exhausted, the cumulative net loss reaches the
   * loss-limit, or this single win reaches the single-win-stop. No-op when autoplay
   * isn't active or the inputs are malformed (Charter P11).
   */
  reportResult(win: number, bet: number): void {
    if (this.current !== 'active') return;
    if (!Number.isFinite(win) || !Number.isFinite(bet)) return;
    this.netLoss += bet - win;
    const c = this.count.get();
    if (Number.isFinite(c)) this.count.set(Math.max(0, c - 1));
    const winHit = Number.isFinite(this.singleWinLimit) && win >= this.singleWinLimit * bet;
    const lossHit = Number.isFinite(this.lossLimit) && this.netLoss >= this.lossLimit * bet;
    if (this.count.get() <= 0 || winHit || lossHit) this.stop();
  }

  stop(): void {
    if (this.current !== 'active') return;
    this.count.set(0);
    this.setState('idle');
    this.bus?.emit('autoplayStopped', undefined);
  }

  /** Host updates the remaining count during play. Infinity is valid (∞); only
   *  NaN/non-number is rejected, so bad host data never corrupts the badge (P11). */
  setCount(n: number): void {
    if (typeof n !== 'number' || Number.isNaN(n)) return;
    this.count.set(n);
  }

  /** The view's tap handler. In `'infinite'` mode, idle starts straight away;
   *  in `'options'` mode, idle opens the picker. Active always stops. */
  press(): void {
    if (this.current === 'idle') {
      if (this.mode === 'infinite') this.begin(Infinity);
      else this.openPicker();
    } else if (this.current === 'active') this.stop();
    else if (this.current === 'picking') this.cancelPicker();
  }

  disable(): void {
    this.setState('disabled');
  }
  enable(): void {
    if (this.current === 'disabled') this.setState('idle');
  }
}
