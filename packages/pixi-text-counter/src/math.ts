import type { RollDirection } from './types';
import type { EaseFn } from './tween/types';

export interface MotionResolved {
  msPerStep: number;
  staggerMs: number;
  placeDurationBump: number;
  minMs: number;
  maxMs: number;
  ease: EaseFn;
}

export function computeSteps(
  oldDigit: number,
  newDigit: number,
  direction: RollDirection,
): number {
  return direction === 'down'
    ? ((oldDigit - newDigit + 10) % 10) || 10
    : ((newDigit - oldDigit + 10) % 10) || 10;
}

export function computeDuration(
  distance: number,
  placeFromRight: number,
  motion: Pick<MotionResolved, 'msPerStep' | 'placeDurationBump' | 'minMs' | 'maxMs'>,
): number {
  const raw = motion.msPerStep * distance + motion.placeDurationBump * placeFromRight;
  if (raw < motion.minMs) return motion.minMs;
  if (raw > motion.maxMs) return motion.maxMs;
  return raw;
}

export interface TargetResolution {
  normalizedFromIdx: number;
  toIdx: number;
}

export function resolveTargetIndex(
  fromIdx: number,
  newDigit: number,
  direction: RollDirection,
): TargetResolution {
  if (direction === 'up') {
    let norm = fromIdx;
    while (norm >= 10) norm -= 10;
    while (norm < 0) norm += 10;
    const toIdx = newDigit > norm ? newDigit : newDigit + 10;
    return { normalizedFromIdx: norm, toIdx };
  }
  let norm = fromIdx;
  while (norm < 10) norm += 10;
  while (norm >= 20) norm -= 10;
  const toIdx = newDigit + 10 < norm ? newDigit + 10 : newDigit;
  return { normalizedFromIdx: norm, toIdx };
}

export function resolveDirection(
  hint: 'up' | 'down' | 'auto' | undefined,
  oldValue: number,
  newValue: number,
): RollDirection {
  if (hint === 'up') return 'up';
  if (hint === 'down') return 'down';
  return newValue >= oldValue ? 'up' : 'down';
}
