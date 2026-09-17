import { Container, Graphics, Text, type TextStyleOptions, type Ticker } from 'pixi.js';
import {
  type OpenUI,
  type Control,
  type BlockSpec,
  type SliderControl,
  type ToggleControl,
  type ButtonControl,
  type SelectControl,
  type StepperControl,
  type ValueDisplay,
  modeStatsItems,
  factsVars,
} from '@open-slot-ui/core';
import {
  richParagraphNode,
  gridNode,
  symbolsNode,
  kvNode,
  meterNode,
  badgesNode,
  quoteNode,
  galleryNode,
  timelineNode,
  compareNode,
  linkNode,
  spacerNode,
  calloutNode,
  statGridNode,
  dividerNode,
  tableNode,
  cardsNode,
  mediaNode,
  imageBoxNode,
  paylinesNode,
  paytableNode,
} from './blockNodes';
import { ControlView } from './ControlView';
import { SliderView } from './SliderView';
import { ToggleView } from './ToggleView';
import { ButtonView } from './ButtonView';
import { SelectView } from './SelectView';
import { StepperView } from './StepperView';
import { ValueDisplayView } from './ValueDisplayView';

/** Per-id view override — swap a control's renderer without forking (Charter P7). */
export type ControlViewFactory = (control: Control, ui: OpenUI, ticker: Ticker) => ControlView;

export interface BlockColumnOptions {
  controlSkins?: Partial<Record<string, ControlViewFactory>>;
  /** Unclipped layer for select dropdowns (so a scroll mask doesn't clip them). */
  dropdownLayer?: Container;
}

export interface BlockColumn {
  /** Rows laid top→down (first row near y=0); the caller positions/scrolls it. */
  content: Container;
  /** Interactive child views, for disposal. */
  views: ControlView[];
  /** Total column height. */
  height: number;
  /** Inner content width (body width minus padding). */
  innerW: number;
}

const ROW_H = 72;
const PAD = 28;
const GAP = 16;

/**
 * Render a declarative `BlockSpec[]` into a column of rows — interactive controls
 * (slider/toggle/button/select/value/stepper) and static content (heading/text/
 * callout/stat-grid/steps/paytable/image). All text flows through `ui.t`. This is
 * the single renderer shared by the small panel body AND the scrollable menu, so
 * blocks look identical wherever they appear (Charter B3/B9).
 */
export function buildBlockColumn(
  blocks: BlockSpec[],
  controls: Control[],
  ui: OpenUI,
  ticker: Ticker,
  bodyW: number,
  opts: BlockColumnOptions = {},
): BlockColumn {
  const t = ui.theme;
  // Copy translates WITH the facts interpolation vars, exactly as the DOM renderer
  // does it: `{{rtp.base}}` / `{{cost.free-spins}}` / `{{freeSpins.count}}` resolve
  // from the LIVE declared facts, so a price or an RTP stated in the rules can never
  // drift from the configuration.
  const factVars = factsVars(ui.facts.get(), { 'game.name': ui.gameInfo.name ?? '', 'game.version': ui.gameInfo.version ?? '' });
  const tr = (s: string): string => ui.t(s, factVars);
  // The node builders below translate their own labels through `ui.t`. This is the
  // same `ui` with that one method replaced by `tr`, so every block resolves the
  // fact tokens without each builder having to be handed a translator.
  const uiT = Object.create(ui as object, { t: { value: tr } }) as OpenUI;
  const innerW = bodyW - PAD * 2;
  const byId = new Map(controls.map((c) => [c.id, c] as const));
  const content = new Container();
  const views: ControlView[] = [];
  let y = PAD;

  const placeFixed = (node: Container, h: number): void => {
    node.position.set(0, y + h / 2);
    content.addChild(node);
    y += h;
  };
  const placeAuto = (node: Container, gap = GAP): void => {
    const h = node.height || 1;
    node.position.set(0, y + h / 2);
    content.addChild(node);
    y += h + gap;
  };
  const leftText = (s: string, style: TextStyleOptions): Container => {
    const wrap = new Container();
    const txt = new Text({ text: s, style });
    txt.anchor.set(0, 0.5);
    txt.position.set(-innerW / 2, 0);
    wrap.addChild(txt);
    return wrap;
  };
  // Section header: a CENTERED uppercase-ish title with a divider line on each
  // side (── TITLE ──), matching the reference design. Theme-colored, so it reads
  // on any surface (light lines on a dark theme, dark lines on a light one).
  const heading = (s: string, size = 18): Container => {
    const wrap = new Container();
    const txt = new Text({
      text: tr(s),
      style: { fontFamily: t.type.family, fontSize: size, fill: t.color.accent, fontWeight: '800', letterSpacing: 1 },
    });
    txt.anchor.set(0.5);
    txt.position.set(0, 0);
    const half = Math.min(txt.width / 2, innerW / 2 - 24);
    const gap = 16;
    wrap.addChild(
      new Graphics().moveTo(-innerW / 2, 0).lineTo(-half - gap, 0).stroke({ width: 2, color: t.color.text, alpha: 0.85 }),
      new Graphics().moveTo(half + gap, 0).lineTo(innerW / 2, 0).stroke({ width: 2, color: t.color.text, alpha: 0.85 }),
      txt,
    );
    return wrap;
  };
  const body = (s: string): Container =>
    richParagraphNode(s, ui, innerW, { fontFamily: t.type.family, fontSize: 15, fill: t.color.textDim, lineHeight: 22 });
  // A left-aligned sub-section title (no divider lines — lighter than `heading`).
  const subheading = (s: string): Container => {
    const wrap = new Container();
    const txt = new Text({ text: tr(s), style: { fontFamily: t.type.family, fontSize: 15, fill: t.color.text, fontWeight: '800', letterSpacing: 0.5 } });
    txt.anchor.set(0, 0.5);
    txt.position.set(-innerW / 2, 0);
    wrap.addChild(txt);
    return wrap;
  };
  // Fine-print / legal copy: small and dim.
  const legal = (s: string): Container =>
    richParagraphNode(s, ui, innerW, { fontFamily: t.type.family, fontSize: 12, fill: t.color.textDim, lineHeight: 17 });
  // Centered caption above an interactive control (slider/toggle) — reads cleanly
  // above the centered control even on a wide card.
  const caption = (s: string): Container => {
    const wrap = new Container();
    const txt = new Text({ text: s, style: { fontFamily: t.type.family, fontSize: 15, fill: t.color.text, fontWeight: '700' } });
    txt.anchor.set(0.5);
    wrap.addChild(txt);
    return wrap;
  };
  // A control's HINT: a small dim, centered, wrapped description shown UNDER the
  // control so its function is self-explanatory (e.g. "Shorter spin animation").
  const hintNode = (s: string): Container => {
    const wrap = new Container();
    const txt = new Text({
      text: s,
      style: { fontFamily: t.type.family, fontSize: 12.5, fill: t.color.textDim, align: 'center', wordWrap: true, wordWrapWidth: innerW * 0.86, lineHeight: 17 },
    });
    txt.anchor.set(0.5);
    wrap.addChild(txt);
    return wrap;
  };

  const makeView = (b: BlockSpec, control: Control): ControlView | null => {
    const skin = opts.controlSkins?.[b.id];
    if (skin) return skin(control, ui, ticker);
    switch (b.kind) {
      case 'slider':
        return new SliderView(control as SliderControl, ui);
      case 'toggle':
        return new ToggleView(control as ToggleControl, ui, ticker, { radius: 22 });
      case 'button':
        return new ButtonView(control as ButtonControl, ui, ticker, { shape: 'pill', height: 48 });
      case 'select':
        return new SelectView(control as SelectControl, ui, ticker, { width: 320, dropdownLayer: opts.dropdownLayer });
      case 'stepper':
        return new StepperView(control as StepperControl, ui, ticker);
      case 'value':
        return new ValueDisplayView(control as ValueDisplay, ui, ticker);
      default:
        console.warn(`[open-ui] block column: no view for kind "${b.kind}" (id="${b.id}") — skipped`);
        return null;
    }
  };

  // A settings row: NAME (bold) + description (dim, wrapped) stacked on the LEFT, the control on
  // the RIGHT, vertically centred (the reference settings design). Sliders are left-origin;
  // toggles/others are centre-origin.
  const settingRow = (b: BlockSpec, control: Control): Container | null => {
    const view = makeView(b, control);
    if (!view) return null;
    views.push(view);
    const isSlider = b.kind === 'slider';
    // SliderView is a FIXED-geometry box (its measured width is unreliable at build time and would
    // let it overflow the card); a toggle we can measure. Both right-align to the row's right edge.
    const cw = isSlider ? 260 : Math.max(52, Math.ceil(view.width) || 52);
    const chh = isSlider ? 54 : Math.max(40, Math.ceil(view.height) || 40);
    const gap = 22;
    const leftW = Math.max(140, innerW - cw - gap);
    const label = (b as { label?: string }).label ? tr((b as { label?: string }).label!) : '';
    const hintTxt = (b as { hint?: string }).hint ? tr((b as { hint?: string }).hint!) : '';

    const row = new Container();
    const lbl = label ? new Text({ text: label, style: { fontFamily: t.type.family, fontSize: 15, fontWeight: '800', fill: t.color.text } }) : null;
    lbl?.anchor.set(0, 0);
    const hnt = hintTxt ? richParagraphNode(hintTxt, ui, leftW, { fontFamily: t.type.family, fontSize: 13, fill: t.color.textDim, lineHeight: 18 }) : null;
    const lblH = lbl ? lbl.height : 0;
    const spc = lbl && hnt ? 5 : 0;
    const hntH = hnt ? hnt.height : 0;
    const leftH = lblH + spc + hntH;
    const rowH = Math.max(leftH, chh) + 18;

    if (lbl) { lbl.position.set(-innerW / 2, -leftH / 2); row.addChild(lbl); }
    if (hnt) { hnt.position.set(-innerW / 2 + leftW / 2, -leftH / 2 + lblH + spc + hntH / 2); row.addChild(hnt); }
    if (isSlider) view.position.set(innerW / 2 - cw, -chh / 2);
    else view.position.set(innerW / 2 - cw / 2, 0);
    row.addChild(view);
    // Pad the measured row so short rows still get breathing room (placeAuto reads bounds).
    if (rowH > row.height) row.addChild(new Graphics().rect(-innerW / 2, -rowH / 2, 1, rowH).fill({ color: 0xffffff, alpha: 0 }));
    return row;
  };

  /** Renders a nested `BlockSpec[]` at `width` via this same builder, so a block
   *  inside a tab or a column looks exactly like one at the top level. */
  const nested = (bs: BlockSpec[], width: number): { node: Container; height: number } => {
    const sub = buildBlockColumn(bs, controls, ui, ticker, width, opts);
    views.push(...sub.views); // the caller disposes them with the rest of the column
    const node = new Container();
    node.addChild(sub.content);
    sub.content.position.set(0, -sub.height / 2);
    return { node, height: sub.height };
  };

  /** Side-by-side columns of blocks; narrow bodies stack them instead. */
  const columnsNode = (b: Extract<BlockSpec, { kind: 'columns' }>): Container => {
    const wrap = new Container();
    const cols = b.children.length || 1;
    const gap = 18;
    const stack = innerW / cols < 180; // too narrow to read side by side
    const width = stack ? bodyW : (innerW - gap * (cols - 1)) / cols + PAD * 2;
    const built = b.children.map((child) => nested(child, width));
    if (stack) {
      const totalH = built.reduce((a, p) => a + p.height, 0);
      let cy = -totalH / 2;
      for (const p of built) {
        p.node.position.set(0, cy + p.height / 2);
        wrap.addChild(p.node);
        cy += p.height;
      }
      return wrap;
    }
    const totalH = built.reduce((a, p) => Math.max(a, p.height), 0);
    const colW = width - PAD * 2;
    built.forEach((p, i) => {
      p.node.position.set(-innerW / 2 + i * (colW + gap) + colW / 2, -totalH / 2 + p.height / 2);
      wrap.addChild(p.node);
    });
    wrap.addChild(new Graphics().rect(-innerW / 2, -totalH / 2, innerW, totalH).fill({ color: 0xffffff, alpha: 0 }));
    return wrap;
  };

  const walk = (bs: BlockSpec[]): void => {
    for (const b of bs) {
      switch (b.kind) {
        case 'group':
          if (b.title) placeAuto(heading(b.title, 14), 10);
          walk(b.children);
          break;
        case 'heading':
          placeAuto(heading(b.text), 12);
          break;
        case 'subheading':
          placeAuto(subheading(b.text), 8);
          break;
        case 'text':
          placeAuto(body(tr(b.text)));
          break;
        case 'legal':
          placeAuto(legal(tr(b.text)));
          break;
        case 'divider':
          placeAuto(dividerNode(innerW, uiT), 10);
          break;
        case 'callout':
          placeAuto(calloutNode(b, uiT, innerW));
          break;
        case 'stat-grid':
          placeAuto(statGridNode(b, uiT, innerW));
          break;
        // The per-mode RTP / max-win grid, read straight off the declared facts so
        // the canvas menu can never disagree with the DOM one.
        case 'mode-stats': {
          const items = [...modeStatsItems(ui.facts.get(), tr), ...(b.extras ?? []).map((e) => ({ label: tr(e.label), value: tr(e.value) }))];
          if (items.length) placeAuto(statGridNode({ kind: 'stat-grid', id: `${b.id}-grid`, items }, uiT, innerW));
          break;
        }
        case 'steps':
          placeAuto(body(b.items.map((s, i) => `${b.ordered ? `${i + 1}.` : '•'}  ${tr(s)}`).join('\n')));
          break;
        case 'table':
          placeAuto(tableNode(b, uiT, innerW));
          break;
        case 'cards':
          placeAuto(cardsNode(b, uiT, innerW));
          break;
        case 'paytable':
          placeAuto(paytableNode(b, uiT, innerW));
          break;
        case 'paylines':
          placeAuto(paylinesNode(b, uiT, innerW));
          break;
        case 'media':
          placeAuto(mediaNode(b, uiT, innerW));
          break;
        case 'grid':
          placeAuto(gridNode(b, uiT, innerW));
          break;
        case 'symbols':
          placeAuto(symbolsNode(b, uiT, innerW));
          break;
        case 'kv':
          placeAuto(kvNode(b, uiT, innerW));
          break;
        case 'meter':
          placeAuto(meterNode(b, uiT, innerW));
          break;
        case 'badges':
          placeAuto(badgesNode(b, uiT, innerW));
          break;
        case 'quote':
          placeAuto(quoteNode(b, uiT, innerW));
          break;
        case 'gallery':
          placeAuto(galleryNode(b, uiT, innerW));
          break;
        case 'timeline':
          placeAuto(timelineNode(b, uiT, innerW));
          break;
        case 'compare':
          placeAuto(compareNode(b, uiT, innerW));
          break;
        case 'link':
          placeAuto(linkNode(b, uiT, innerW), 8);
          break;
        case 'spacer':
          placeAuto(spacerNode(b, innerW), 0);
          break;
        // `tabs` and `sections` both read as titled parts, one after another: a
        // rules document never hides a word of itself behind a click.
        case 'tabs':
          for (const tab of b.tabs) {
            placeAuto(subheading(tab.label), 8);
            walk(tab.children);
          }
          break;
        case 'sections':
          for (const it of b.items) {
            placeAuto(subheading(it.title), 8);
            walk(it.children);
          }
          break;
        case 'columns':
          placeAuto(columnsNode(b), 12);
          break;
        case 'image': {
          let iw = b.width || 64;
          let ih = b.height || 64;
          if (iw > innerW) { ih = Math.round((ih * innerW) / iw); iw = innerW; } // fit the menu width
          placeAuto(imageBoxNode(b.src, iw, ih, uiT));
          break;
        }
        default: {
          const control = byId.get(b.id);
          if (!control) break;
          // Settings rows (slider / toggle): the reference layout is a two-column row — the
          // control's NAME with its description under it on the left, the control itself on the
          // right — instead of a stacked caption/control/hint.
          if (b.kind === 'slider' || b.kind === 'toggle') {
            const row = settingRow(b, control);
            if (row) placeAuto(row, 10);
            break;
          }
          // Other interactive kinds render their own label; keep the simple stacked form + hint.
          const view = makeView(b, control);
          if (!view) break;
          views.push(view);
          const wrap = new Container();
          wrap.addChild(view);
          placeFixed(wrap, ROW_H);
          const hint = (b as { hint?: string }).hint;
          if (hint) placeAuto(hintNode(tr(hint)), 12);
        }
      }
    }
  };
  walk(blocks);

  return { content, views, height: y + PAD, innerW };
}
