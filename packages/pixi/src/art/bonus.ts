import { type Texture } from 'pixi.js';
import { svgToTexture } from './raster';

/**
 * Buy-feature (bonus) coin — the Figma "Bonus" icon (node 147:4928): a gold coin
 * (#FFC935, black ring, soft drop shadow) stamped with a black admit-one TICKET — a
 * rounded bar with a concave notch bitten out of the LEFT edge and a top/bottom-centre
 * perforation — carrying a gold STAR in its upper right. The notches + star are drawn
 * in the coin's gold so they read as cut-outs of the black ticket. Edit this string,
 * never redraw by hand.
 */
export const bonusSvg = `<svg width="122" height="131" viewBox="0 0 122 131" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#bonus_shadow)">
<circle cx="61" cy="60" r="58" fill="#FFC935"/>
<circle cx="61" cy="60" r="56" stroke="black" stroke-width="8"/>
</g>
<g>
<rect x="33" y="44" width="54" height="34" rx="8" fill="black"/>
<circle cx="33" cy="61" r="8" fill="#FFC935"/>
<circle cx="60" cy="44" r="5.5" fill="#FFC935"/>
<circle cx="60" cy="78" r="5.5" fill="#FFC935"/>
<path d="M72 46.5L74.12 52.09L80.08 52.37L75.42 56.11L77 61.88L72 58.6L67 61.88L68.58 56.11L63.92 52.37L69.88 52.09Z" fill="#FFC935"/>
</g>
<defs>
<filter id="bonus_shadow" x="0" y="0" width="122" height="131" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="10"/><feGaussianBlur stdDeviation="0.5"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="e"/><feBlend mode="normal" in="SourceGraphic" in2="e" result="shape"/></filter>
</defs>
</svg>`;

/** Rasterize the buy-feature coin. Undefined with no DOM (SSR/tests). */
export function loadBonusTexture(): Promise<Texture | undefined> {
  return svgToTexture(bonusSvg);
}
