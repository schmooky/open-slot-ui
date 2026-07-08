import { type Texture } from 'pixi.js';
import { svgToTexture } from './raster';

/**
 * Bet stepper art — the + and − coins (62×69, white coin, black ring, black glyph,
 * soft drop shadow). Edit these strings, never redraw by hand.
 */
export const betPlusSvg = `<svg width="62" height="69" viewBox="0 0 62 69" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#betplus_shadow)">
<circle cx="30" cy="30" r="28.8" fill="white"/>
<circle cx="30" cy="30" r="27.5" stroke="black" stroke-width="5"/>
</g>
<path d="M30 19L30 41" stroke="black" stroke-width="6" stroke-linecap="round"/>
<path d="M19 30L41 30" stroke="black" stroke-width="6" stroke-linecap="round"/>
<defs>
<filter id="betplus_shadow" x="0" y="0" width="62" height="69" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dx="1" dy="8"/><feGaussianBlur stdDeviation="0.5"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="e"/><feBlend mode="normal" in="SourceGraphic" in2="e" result="shape"/></filter>
</defs>
</svg>`;

export const betMinusSvg = `<svg width="62" height="69" viewBox="0 0 62 69" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#betminus_shadow)">
<circle cx="30" cy="30" r="28.8" fill="white"/>
<circle cx="30" cy="30" r="27.5" stroke="black" stroke-width="5"/>
</g>
<path d="M19 30L41 30" stroke="black" stroke-width="6" stroke-linecap="round"/>
<defs>
<filter id="betminus_shadow" x="0" y="0" width="62" height="69" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dx="1" dy="8"/><feGaussianBlur stdDeviation="0.5"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="e"/><feBlend mode="normal" in="SourceGraphic" in2="e" result="shape"/></filter>
</defs>
</svg>`;

/** Rasterize the bet + coin. Undefined with no DOM (SSR/tests). */
export function loadBetPlusTexture(): Promise<Texture | undefined> {
  return svgToTexture(betPlusSvg);
}

/** Rasterize the bet − coin. Undefined with no DOM (SSR/tests). */
export function loadBetMinusTexture(): Promise<Texture | undefined> {
  return svgToTexture(betMinusSvg);
}
