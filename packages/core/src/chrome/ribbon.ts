/**
 * The ribbon layout solver — pure math, no Pixi, no DOM (Charter B1).
 *
 * One function turns a screen + the chrome config into every rect the bar needs.
 * It's deterministic and total, so the renderer never guesses a position and the
 * whole layout is unit-testable without a canvas.
 *
 * The reference measurements are in `rem` (the design was authored at 16px/rem):
 * a 6.9rem strip holding a 5.625rem translucent panel, a 7rem round button that
 * deliberately overflows that panel, and a dark action box on the right. `rem` is
 * the ONE knob that scales the whole bar — everything else is a multiple of it, so
 * the ribbon can never scale non-uniformly.
 */
import type { Rect } from '../types';
import type { ScreenState, Orientation } from '../layout/screen';
import type { HudChrome } from './hud';

/** Touch-sized layout vs pointer-sized layout. Tablets get the touch bar. */
export type HudChannel = 'desktop' | 'mobile';

export interface RibbonMetrics {
  /** px per rem — the single scale knob for every size in the bar. */
  rem: number;
  channel: HudChannel;
  orientation: Orientation;
  /** The strip the HUD reserves. The game must keep its reels clear of this. */
  bar: Rect;
  /** The translucent plate inside the strip (centred + width-capped on desktop). */
  panel: Rect;
  /** The dark, bordered action box: bet widget · ▲▼ · round button · autoplay. */
  actionPanel: Rect;
  /** The round button (place bet / stop / autoplay), centre + radius. */
  round: { x: number; y: number; r: number };
  /** Bet label + value + ladder progress. */
  betWidget: Rect;
  /** The ▲ / ▼ stack. */
  changers: Rect;
  /** The ☰ button, centre + radius. */
  menuButton: { x: number; y: number; r: number };
  /** The autoplay button, centre + radius. */
  autoplayButton: { x: number; y: number; r: number };
  /** BUY BONUS pill. */
  buyButton: Rect;
  /** The operator promotion button. */
  promoButton: Rect;
  /** One rect per visible data readout (balance / bet / win / …), in order. */
  items: Rect[];
  /** Where the one-line feedback message centres. */
  feedback: { x: number; y: number; size: number };
  /** The fly-up menu / autoplay sheet anchor: bottom edge to grow from, and its width. */
  sheet: { x: number; y: number; width: number; up: boolean };
}

/** What the bar is currently showing — the counts the solver can't know on its own. */
export interface RibbonParts {
  /** Number of data readouts to lay out (balance / bet / win / free rounds / …). */
  items: number;
  /** Is the BUY BONUS pill showing? */
  buy: boolean;
  /** Is the promotion button showing? */
  promo: boolean;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/** Reference sizes, in rem. Named so the renderer never re-derives them. */
export const RIBBON = Object.freeze({
  /** Reserved strip height (desktop). */
  barH: 6.9,
  /** Translucent plate height (desktop). */
  panelH: 5.625,
  /** Plate padding. */
  padX: 0.6,
  padY: 0.625,
  /** Round button diameter — larger than the plate on purpose; it overflows. */
  round: 7,
  /** ☰ and autoplay button diameters. */
  iconButton: 2.75,
  /** Bet widget width. */
  betW: 8.5,
  /** ▲▼ column width. */
  changersW: 2.25,
  /** BUY BONUS pill. */
  buyW: 8.5,
  buyH: 2.5,
  /** One data readout. */
  itemW: 7.5,
  itemH: 2.6,
  gap: 0.5,
  /** Fly-up sheet width (autoplay menu / main menu). */
  sheetW: 22,
});

/** Channel from the screen's device bucket: only a real desktop gets the pointer bar. */
export function channelFor(screen: ScreenState): HudChannel {
  return screen.breakpoint === 'desktop' ? 'desktop' : 'mobile';
}

/**
 * The px-per-rem for a screen. Desktop tracks the viewport gently (so a 4K screen
 * doesn't get a postage-stamp HUD); mobile is driven by the round button, which the
 * reference sizes off the short edge — that's what keeps the thumb target honest.
 */
export function remFor(screen: ScreenState, chrome: HudChrome, channel = channelFor(screen)): number {
  const { width: w, height: h } = screen;
  let rem: number;
  if (channel === 'desktop') {
    rem = 16 * clamp(Math.min(w / 1280, h / 800), 0.78, 1.7);
  } else if (screen.orientation === 'portrait') {
    // Reference: the round button is clamp(88, 21.5vw + 23, 120) px across.
    rem = clamp(0.2154 * w + 23.4, 88, 120) / RIBBON.round;
  } else {
    // Landscape phones size off HEIGHT — the bar has to stay out of the reels' way.
    rem = clamp(0.18 * h + 42.8, 86, 104) / RIBBON.round;
  }
  return rem * chrome.scale;
}

/** The strip height in px — what the game must keep clear. */
export function barHeightFor(screen: ScreenState, chrome: HudChrome): number {
  const channel = channelFor(screen);
  const rem = remFor(screen, chrome, channel);
  if (channel === 'desktop') return RIBBON.barH * rem;
  return screen.orientation === 'portrait' ? 9 * rem : 2.25 * rem;
}

/**
 * Solve the whole bar. Desktop and tablet/phone-landscape put everything on one
 * row; phone-portrait stacks the readouts over the action box (the reference's
 * `flex-direction: column` on the small channel).
 */
export function solveRibbon(screen: ScreenState, chrome: HudChrome, parts: RibbonParts): RibbonMetrics {
  const channel = channelFor(screen);
  const orientation = screen.orientation;
  const rem = remFor(screen, chrome, channel);
  const u = (n: number): number => n * rem;
  const { width: w, height: h } = screen;
  const top = chrome.dock === 'top';

  const barH = barHeightFor(screen, chrome);
  const barY = top ? 0 : h - barH;
  const bar = rect(0, barY, w, barH);

  // The plate: width-capped + centred on desktop, edge-to-edge on touch.
  const panelW = channel === 'desktop' ? Math.min(u(chrome.maxWidth), w - u(2.4)) : w;
  const panelH = channel === 'desktop' ? u(RIBBON.panelH) : barH;
  const panelX = (w - panelW) / 2;
  const panelY = top ? barY : barY + (barH - panelH);
  const panel = rect(panelX, panelY, panelW, panelH);

  const padX = u(RIBBON.padX);
  const padY = channel === 'desktop' ? u(RIBBON.padY) : u(0.25);
  const contentX = panelX + padX;
  const contentW = panelW - padX * 2;
  const contentY = panelY + padY;
  const contentH = panelH - padY * 2;

  const roundR = u(RIBBON.round) / 2;
  const iconR = u(RIBBON.iconButton) / 2;

  const portraitStack = channel === 'mobile' && orientation === 'portrait';

  if (portraitStack) return solvePortrait(screen, chrome, parts, { rem, channel, orientation, bar, panel, contentX, contentW, contentY, contentH, roundR, iconR, top });

  // ── one row: [buy] [☰ | readouts] ......... [ bet | ▲▼ ◉ A ] ───────────────
  const rowMidY = contentY + contentH / 2;

  // Right cluster — the action box. Sized to its contents so it never squeezes.
  const hasBet = chrome.features.betWidget;
  const hasChangers = chrome.features.betChangers;
  const hasAuto = chrome.features.autoplay;
  const actionW =
    (hasBet ? u(RIBBON.betW) : 0) +
    (hasBet ? u(RIBBON.gap) : 0) +
    (hasChangers ? u(RIBBON.changersW) + u(RIBBON.gap) : 0) +
    roundR * 2 +
    (hasAuto ? u(RIBBON.gap) + iconR * 2 : 0) +
    u(RIBBON.gap);
  const actionH = contentH;
  const actionX = contentX + contentW - actionW;
  const actionPanel = rect(actionX, contentY, actionW, actionH);

  let cx = actionX + u(RIBBON.gap) / 2;
  const betWidget = rect(cx, contentY + u(0.2), hasBet ? u(RIBBON.betW) : 0, actionH - u(0.4));
  if (hasBet) cx += u(RIBBON.betW) + u(RIBBON.gap);
  const changers = rect(cx, contentY + u(0.15), hasChangers ? u(RIBBON.changersW) : 0, actionH - u(0.3));
  if (hasChangers) cx += u(RIBBON.changersW) + u(RIBBON.gap);
  const round = { x: cx + roundR, y: rowMidY, r: roundR };
  cx += roundR * 2 + u(RIBBON.gap);
  const autoplayButton = { x: cx + iconR, y: rowMidY, r: iconR };

  // Left cluster — buy pill, ☰, then the readouts.
  let lx = contentX;
  const buyButton = rect(lx, rowMidY - u(RIBBON.buyH) / 2, parts.buy ? u(RIBBON.buyW) : 0, u(RIBBON.buyH));
  if (parts.buy) lx += u(RIBBON.buyW) + u(RIBBON.gap);
  const menuButton = { x: lx + iconR, y: rowMidY, r: iconR };
  lx += iconR * 2 + u(RIBBON.gap);

  const itemsRoom = Math.max(0, actionX - lx - u(RIBBON.gap));
  const itemW = parts.items > 0 ? Math.min(u(RIBBON.itemW), itemsRoom / parts.items) : 0;
  const items: Rect[] = [];
  for (let i = 0; i < parts.items; i++) items.push(rect(lx + i * itemW, rowMidY - u(RIBBON.itemH) / 2, itemW, u(RIBBON.itemH)));

  const promoButton = rect(actionX - u(RIBBON.gap) - (parts.promo ? u(2.4) : 0), rowMidY - u(1.2), parts.promo ? u(2.4) : 0, u(2.4));

  return {
    rem,
    channel,
    orientation,
    bar,
    panel,
    actionPanel,
    round,
    betWidget,
    changers,
    menuButton,
    autoplayButton,
    buyButton,
    promoButton,
    items,
    feedback: { x: w / 2, y: top ? bar.y + barH + u(0.9) : bar.y - u(0.9), size: u(0.85) },
    sheet: { x: w / 2, y: top ? bar.y + barH : bar.y, width: Math.min(u(RIBBON.sheetW), w - u(1.5)), up: !top },
  };
}

/** Phone portrait: readouts on top, the action box beneath — the reference's column. */
function solvePortrait(
  screen: ScreenState,
  chrome: HudChrome,
  parts: RibbonParts,
  ctx: {
    rem: number;
    channel: HudChannel;
    orientation: Orientation;
    bar: Rect;
    panel: Rect;
    contentX: number;
    contentW: number;
    contentY: number;
    contentH: number;
    roundR: number;
    iconR: number;
    top: boolean;
  },
): RibbonMetrics {
  const { rem, bar, panel, contentX, contentW, contentY, contentH, roundR, iconR, top } = ctx;
  const u = (n: number): number => n * rem;
  const { width: w } = screen;

  // Row 1 — readouts (and the buy pill parked at the right end of the same row).
  const row1H = u(RIBBON.itemH);
  const row1Y = contentY;
  const row1Mid = row1Y + row1H / 2;
  const menuButton = { x: contentX + iconR, y: row1Mid, r: iconR };

  let lx = contentX + iconR * 2 + u(RIBBON.gap);
  const buyW = parts.buy ? u(RIBBON.buyW) : 0;
  const itemsRoom = Math.max(0, contentX + contentW - lx - buyW - (parts.buy ? u(RIBBON.gap) : 0));
  const itemW = parts.items > 0 ? itemsRoom / parts.items : 0;
  const items: Rect[] = [];
  for (let i = 0; i < parts.items; i++) items.push(rect(lx + i * itemW, row1Y, itemW, row1H));
  lx += itemsRoom + (parts.buy ? u(RIBBON.gap) : 0);
  const buyButton = rect(lx, row1Mid - u(RIBBON.buyH) / 2, buyW, u(RIBBON.buyH));

  // Row 2 — the action box, full width, round button centred.
  const row2Y = row1Y + row1H + u(0.25);
  const row2H = Math.max(u(3), contentY + contentH - row2Y);
  const row2Mid = row2Y + row2H / 2;
  const actionPanel = rect(contentX, row2Y, contentW, row2H);

  const round = { x: contentX + contentW / 2, y: row2Mid, r: roundR };
  const changers = rect(round.x - roundR - u(RIBBON.gap) - u(RIBBON.changersW), row2Y + u(0.1), chrome.features.betChangers ? u(RIBBON.changersW) : 0, row2H - u(0.2));
  const betWidget = rect(contentX, row2Y + u(0.2), chrome.features.betWidget ? Math.max(u(5), changers.x - contentX - u(RIBBON.gap)) : 0, row2H - u(0.4));
  const autoplayButton = { x: contentX + contentW - iconR, y: row2Mid, r: iconR };
  const promoButton = rect(autoplayButton.x - iconR - u(RIBBON.gap) - (parts.promo ? u(2.2) : 0), row2Mid - u(1.1), parts.promo ? u(2.2) : 0, u(2.2));

  return {
    rem,
    channel: ctx.channel,
    orientation: ctx.orientation,
    bar,
    panel,
    actionPanel,
    round,
    betWidget,
    changers,
    menuButton,
    autoplayButton,
    buyButton,
    promoButton,
    items,
    feedback: { x: w / 2, y: top ? bar.y + bar.height + u(0.9) : bar.y - u(0.8), size: u(0.85) },
    sheet: { x: w / 2, y: top ? bar.y + bar.height : bar.y, width: Math.min(u(RIBBON.sheetW), w - u(1)), up: !top },
  };
}
