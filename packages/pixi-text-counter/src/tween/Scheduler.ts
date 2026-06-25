import type { Ticker } from 'pixi.js';
import { createInactiveTween, type TweenState } from './types';

export type OnApplyFn = (tweenIndex: number, value: number) => void;
export type OnCompleteFn = (tweenIndex: number) => void;

const NOOP_COMPLETE: OnCompleteFn = () => undefined;

export class Scheduler {
  private readonly ticker: Ticker;
  private readonly tweens: TweenState[];
  private readonly onApply: OnApplyFn;
  private readonly onTweenComplete: OnCompleteFn;
  private activeCount = 0;
  private attached = false;

  constructor(
    ticker: Ticker,
    tweenCount: number,
    onApply: OnApplyFn,
    onTweenComplete: OnCompleteFn = NOOP_COMPLETE,
  ) {
    this.ticker = ticker;
    this.onApply = onApply;
    this.onTweenComplete = onTweenComplete;
    this.tweens = new Array<TweenState>(tweenCount);
    for (let i = 0; i < tweenCount; i++) this.tweens[i] = createInactiveTween();
  }

  get(index: number): TweenState {
    return this.tweens[index];
  }

  get tweenCount(): number {
    return this.tweens.length;
  }

  get activeTweenCount(): number {
    return this.activeCount;
  }

  get hasActive(): boolean {
    return this.activeCount > 0;
  }

  start(index: number, now: number = performance.now()): void {
    const t = this.tweens[index];
    if (!t.active) {
      t.active = true;
      this.activeCount++;
    }
    t.startTime = now;
    if (!this.attached) {
      this.ticker.add(this.tick);
      this.attached = true;
    }
  }

  stop(index: number): void {
    const t = this.tweens[index];
    if (!t.active) return;
    t.active = false;
    this.activeCount--;
    if (this.activeCount === 0) this.detach();
  }

  finish(index: number): void {
    const t = this.tweens[index];
    if (!t.active) return;
    const final = t.startValue + (t.targetValue - t.startValue) * t.ease(1);
    t.currentValue = final;
    t.active = false;
    this.activeCount--;
    this.onApply(index, final);
    this.onTweenComplete(index);
    if (this.activeCount === 0) this.detach();
  }

  finishAll(): void {
    const tweens = this.tweens;
    for (let i = 0, n = tweens.length; i < n; i++) {
      if (tweens[i].active) this.finish(i);
    }
  }

  destroy(): void {
    this.detach();
    this.activeCount = 0;
  }

  step(now: number = performance.now()): void {
    this.tickImpl(now);
  }

  private detach(): void {
    if (this.attached) {
      this.ticker.remove(this.tick);
      this.attached = false;
    }
  }

  private tick = (): void => {
    if (this.activeCount === 0) {
      this.detach();
      return;
    }
    this.tickImpl(performance.now());
  };

  private tickImpl(now: number): void {
    const tweens = this.tweens;
    for (let i = 0, n = tweens.length; i < n; i++) {
      const t = tweens[i];
      if (!t.active) continue;
      const elapsed = now - t.startTime - t.delay;
      if (elapsed < 0) {
        t.currentValue = t.startValue;
        this.onApply(i, t.currentValue);
        continue;
      }
      if (elapsed >= t.duration) {
        const final = t.startValue + (t.targetValue - t.startValue) * t.ease(1);
        t.currentValue = final;
        t.active = false;
        this.activeCount--;
        this.onApply(i, final);
        this.onTweenComplete(i);
      } else {
        const p = t.ease(elapsed / t.duration);
        t.currentValue = t.startValue + (t.targetValue - t.startValue) * p;
        this.onApply(i, t.currentValue);
      }
    }
  }
}
