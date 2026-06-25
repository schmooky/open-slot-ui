export type EaseFn = (t: number) => number;

export interface TweenState {
  active: boolean;
  startTime: number;
  delay: number;
  duration: number;
  startValue: number;
  targetValue: number;
  currentValue: number;
  ease: EaseFn;
  rollId: number;
}

export function createInactiveTween(): TweenState {
  return {
    active: false,
    startTime: 0,
    delay: 0,
    duration: 0,
    startValue: 0,
    targetValue: 0,
    currentValue: 0,
    ease: (t) => t,
    rollId: 0,
  };
}
