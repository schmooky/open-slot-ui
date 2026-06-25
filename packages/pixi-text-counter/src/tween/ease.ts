import type { EaseFn } from './types';

export const linear: EaseFn = (t) => t;

export const quadOut: EaseFn = (t) => 1 - (1 - t) * (1 - t);

export const cubicOut: EaseFn = (t) => 1 - Math.pow(1 - t, 3);

export const quartOut: EaseFn = (t) => 1 - Math.pow(1 - t, 4);

export const quintOut: EaseFn = (t) => 1 - Math.pow(1 - t, 5);

export const expoOut: EaseFn = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const sineInOut: EaseFn = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const slotRoll: EaseFn = (t) => 1 - Math.pow(1 - t, 4.5);

export const defaultEase: EaseFn = slotRoll;
