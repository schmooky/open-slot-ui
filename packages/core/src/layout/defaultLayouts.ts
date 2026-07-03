import type { LayoutSpec } from './anchor';

/**
 * The reference HUD arrangement, cloned 1:1 from the Figma design frames.
 *
 * Landscape ("Desk DEF", 1920×1080 = the landscape reference, so px map
 * directly): a bottom bar — balance · play · SPIN · turbo · bet (with the ±
 * steppers stacked to its right) — plus the ☰ menu on the lower-left rail and
 * the buy (bonus) button on the lower-right rail. Everything lives in the
 * bottom ~320 reference px so the reels area above stays clear.
 *
 * Portrait ("Mobile DEF", 360-wide × 3 = the 1080×2337 portrait reference):
 * a thumb-friendly stack — buy · play · SPIN · turbo · ☰ on one row, the bet ±
 * steppers below SPIN, balance/bet tilted into the corners, readouts larger.
 *
 * These are the LIBRARY defaults: `OpenUI` constructs controls with the
 * landscape values, and `createUI` installs the portrait set as a built-in
 * `responsive.portrait` bucket (layered UNDER host overrides — a host's static
 * `controls.{id}.layout` wins everywhere, and a host's own
 * `responsive.portrait` entry wins per-control).
 */
export const landscapeDefaultLayouts: Readonly<Record<string, LayoutSpec>> = Object.freeze({
  spin: { anchor: 'bottom-center', offset: [0, -140], scale: 0.9 },
  autoplay: { anchor: 'bottom-center', offset: [-204, -112] },
  turbo: { anchor: 'bottom-center', offset: [204, -112] },
  balance: { anchor: 'bottom-left', offset: [135, -104], rotation: -5 },
  bet: { anchor: 'bottom-right', offset: [-186, -104], rotation: 5 },
  'bet-plus': { anchor: 'bottom-right', offset: [-120, -188], rotation: 5 },
  'bet-minus': { anchor: 'bottom-right', offset: [-120, -104], rotation: 5 },
  bonus: { anchor: 'bottom-center', offset: [740, -320] },
  settings: { anchor: 'bottom-center', offset: [-740, -320], rotation: -5 },
  mute: { anchor: 'top-right', offset: [-122, 46] },
  fullscreen: { anchor: 'top-right', offset: [-46, 46] },
  rtp: { anchor: 'top-left', offset: [20, 18] },
  'session-timer': { anchor: 'top-left', offset: [20, 46] },
  'net-position': { anchor: 'top-left', offset: [20, 74] },
});

export const portraitDefaultLayouts: Readonly<Record<string, LayoutSpec>> = Object.freeze({
  // Mobile sizes run ~1.5× the desktop base (the Figma mobile frame draws the
  // controls larger relative to its width) so the buttons read well on a phone.
  spin: { anchor: 'bottom-center', offset: [0, -510], scale: 1.35 },
  autoplay: { anchor: 'bottom-center', offset: [-258, -510], scale: 1.5 },
  turbo: { anchor: 'bottom-center', offset: [258, -510], scale: 1.5 },
  bonus: { anchor: 'bottom-center', offset: [-438, -480], scale: 1.3 },
  settings: { anchor: 'bottom-center', offset: [438, -480], scale: 1.5, rotation: -5 },
  'bet-minus': { anchor: 'bottom-center', offset: [-105, -267], scale: 1.5 },
  'bet-plus': { anchor: 'bottom-center', offset: [105, -267], scale: 1.5 },
  mute: { anchor: 'top-right', offset: [-159, 57], scale: 1.5 },
  fullscreen: { anchor: 'top-right', offset: [-57, 57], scale: 1.5 },
  // Compliance readouts scale up ~2× on mobile with wider line spacing.
  rtp: { anchor: 'top-left', offset: [16, 16], scale: 2 },
  'session-timer': { anchor: 'top-left', offset: [16, 66], scale: 2 },
  'net-position': { anchor: 'top-left', offset: [16, 116], scale: 2 },
  balance: { anchor: 'bottom-left', offset: [36, -110], rotation: -5 },
  bet: { anchor: 'bottom-right', offset: [-36, -110], rotation: 5 },
});

/** A control's default layout for the landscape reference frame (cloned — safe to mutate). */
export function defaultLayout(id: string): LayoutSpec {
  const l = landscapeDefaultLayouts[id];
  if (!l) return { anchor: 'center' };
  return { anchor: l.anchor, offset: l.offset ? [l.offset[0], l.offset[1]] : undefined, scale: l.scale, rotation: l.rotation };
}
