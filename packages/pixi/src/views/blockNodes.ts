import { Container, Graphics, Text, Sprite, Texture, type TextStyleOptions } from 'pixi.js';
import { type OpenUI, type BlockSpec } from '@open-slot-ui/core';

/**
 * Every STATIC block in the vocabulary, as a self-contained Pixi node.
 *
 * Each builder returns a `Container` centred on local (0, 0) and no wider than
 * `innerW`; `buildBlockColumn` stacks them and never needs to know what is in
 * one. Keeping them here means the column file stays about layout, and a new
 * block kind is one function plus one `case`.
 */

/**
 * A left-aligned paragraph supporting **bold** inline runs (and `\n` breaks),
 * word-wrapped to `width`, centred vertically around local 0. Pure Pixi Text, so
 * it's deterministic (no HTMLText). Bold runs use the strong text colour.
 */
export function richParagraphNode(s: string, ui: OpenUI, width: number, style: TextStyleOptions): Container {
  const t = ui.theme;
  const c = new Container();
  const lineH = typeof style.lineHeight === 'number' ? style.lineHeight : 22;
  const dim = style.fill;
  const runs: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index), bold: false });
    runs.push({ text: m[1]!, bold: true });
    last = re.lastIndex;
  }
  if (last < s.length) runs.push({ text: s.slice(last), bold: false });

  let x = 0;
  let line = 0;
  const x0 = -width / 2;
  for (const run of runs) {
    for (const w of run.text.split(/(\n|\s+)/).filter((p) => p.length)) {
      if (w === '\n') { x = 0; line += 1; continue; }
      const isSpace = /^\s+$/.test(w);
      if (isSpace && x === 0) continue;
      const txt = new Text({ text: w, style: { ...style, fontWeight: run.bold ? '800' : style.fontWeight ?? '400', fill: run.bold ? t.color.text : dim } });
      txt.anchor.set(0, 0);
      if (!isSpace && x > 0 && x + txt.width > width) { x = 0; line += 1; }
      txt.position.set(x0 + x, line * lineH);
      c.addChild(txt);
      x += txt.width;
    }
  }
  const totalH = (line + 1) * lineH;
  for (const ch of c.children) ch.y -= totalH / 2;
  return c;
}

export function calloutNode(b: Extract<BlockSpec, { kind: 'callout' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const tone = b.tone === 'warning' ? '#ffb020' : t.color.accent;
  const c = new Container();
  const padX = 16;
  const padY = 12;
  const textW = innerW - padX * 2 - 4;
  const title = b.title
    ? new Text({ text: ui.t(b.title), style: { fontFamily: t.type.family, fontSize: 14, fill: tone, fontWeight: '800', letterSpacing: 0.3 } })
    : null;
  title?.anchor.set(0, 0);
  const bodyNode = richParagraphNode(ui.t(b.text), ui, textW, { fontFamily: t.type.family, fontSize: 14, fill: t.color.text, lineHeight: 20 });
  const bodyH = bodyNode.height;
  const titleH = title ? title.height + 6 : 0;
  const h = padY * 2 + titleH + bodyH;
  const x = -innerW / 2;
  const bg = new Graphics()
    .roundRect(x, -h / 2, innerW, h, 10)
    .fill({ color: tone, alpha: 0.08 })
    .roundRect(x, -h / 2, innerW, h, 10)
    .stroke({ width: 1.5, color: tone, alpha: 0.5 })
    .roundRect(x, -h / 2, 4, h, 2)
    .fill({ color: tone });
  c.addChild(bg);
  if (title) {
    title.position.set(x + padX, -h / 2 + padY);
    c.addChild(title);
  }
  bodyNode.position.set(x + padX + textW / 2, -h / 2 + padY + titleH + bodyH / 2);
  c.addChild(bodyNode);
  return c;
}

export function statGridNode(b: Extract<BlockSpec, { kind: 'stat-grid' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const rowH = 30;
  const totalH = Math.max(b.items.length * rowH, rowH);
  b.items.forEach((it, i) => {
    const cy = -totalH / 2 + rowH / 2 + i * rowH;
    if (i > 0) {
      c.addChild(new Graphics().moveTo(-innerW / 2, cy - rowH / 2).lineTo(innerW / 2, cy - rowH / 2).stroke({ width: 1, color: t.color.textDim, alpha: 0.18 }));
    }
    const label = new Text({ text: ui.t(it.label), style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.textDim } });
    label.anchor.set(0, 0.5);
    label.position.set(-innerW / 2, cy);
    const value = new Text({ text: ui.t(it.value), style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.text, fontWeight: '700' } });
    value.anchor.set(1, 0.5);
    value.position.set(innerW / 2, cy);
    c.addChild(label, value);
  });
  return c;
}

/** A thin full-width rule used to separate sections (e.g. before legal copy). */
export function dividerNode(innerW: number, ui: OpenUI): Container {
  const c = new Container();
  c.addChild(new Graphics().rect(-innerW / 2, -0.5, innerW, 1).fill({ color: ui.theme.color.textDim, alpha: 0.3 }));
  return c;
}

/** A generic table: an optional bold header row + body rows of cells. First column
 *  left-aligned (labels); every cell flows through `ui.t`. */
export function tableNode(b: Extract<BlockSpec, { kind: 'table' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const head = b.columns && b.columns.length ? [b.columns] : [];
  const allRows = [...head, ...b.rows];
  const cols = Math.max(1, b.columns?.length ?? b.rows[0]?.length ?? 1);
  const colW = innerW / cols;
  const rowH = 30;
  const totalH = Math.max(allRows.length * rowH, rowH);
  const left = -innerW / 2;
  allRows.forEach((row, ri) => {
    const cy = -totalH / 2 + rowH / 2 + ri * rowH;
    const isHeader = head.length > 0 && ri === 0;
    if (ri > 0) {
      c.addChild(new Graphics().moveTo(left, cy - rowH / 2).lineTo(innerW / 2, cy - rowH / 2).stroke({ width: 1, color: t.color.textDim, alpha: 0.18 }));
    }
    for (let ci = 0; ci < cols; ci++) {
      const raw = row[ci] ?? '';
      const cx = left + ci * colW + 8;
      const fill = isHeader ? t.color.text : ci === 0 ? t.color.text : t.color.accent;
      const weight = isHeader ? '800' : ci === 0 ? '700' : '700';
      const txt = new Text({ text: ui.t(raw), style: { fontFamily: t.type.family, fontSize: 13, fill, fontWeight: weight } });
      txt.anchor.set(0, 0.5);
      txt.position.set(cx, cy);
      c.addChild(txt);
    }
  });
  return c;
}

/** A row of feature cards (icon on top + bold title + dim text), wrapping to fit. */
export function cardsNode(b: Extract<BlockSpec, { kind: 'cards' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const n = b.items.length || 1;
  const gap = 12;
  const cols = Math.max(1, Math.min(n, Math.floor((innerW + gap) / (150 + gap))));
  const cardW = (innerW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(n / cols);
  const cardH = 132;
  const totalH = rows * cardH + (rows - 1) * gap;
  b.items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cardX = -innerW / 2 + col * (cardW + gap);
    const cardY = -totalH / 2 + row * (cardH + gap);
    const card = new Container();
    card.addChild(
      new Graphics()
        .roundRect(0, 0, cardW, cardH, 12)
        .fill({ color: t.color.surfaceAlt, alpha: 0.6 })
        .roundRect(0, 0, cardW, cardH, 12)
        .stroke({ width: 1, color: t.color.textDim, alpha: 0.15 }),
    );
    if (it.icon) {
      const icon = imageBoxNode(it.icon, 44, 44, ui);
      icon.position.set(cardW / 2, 34);
      card.addChild(icon);
    }
    const title = new Text({ text: ui.t(it.title), style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.text, fontWeight: '800' } });
    title.anchor.set(0.5, 0);
    title.position.set(cardW / 2, it.icon ? 64 : 14);
    card.addChild(title);
    if (it.text) {
      const para = richParagraphNode(ui.t(it.text), ui, cardW - 20, { fontFamily: t.type.family, fontSize: 12, fill: t.color.textDim, lineHeight: 16 });
      para.position.set(cardW / 2, (it.icon ? 96 : 46) + para.height / 2);
      card.addChild(para);
    }
    card.position.set(cardX, cardY);
    c.addChild(card);
  });
  return c;
}

/** Image + text side-by-side (image left or right), vertically centered. */
export function mediaNode(b: Extract<BlockSpec, { kind: 'media' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const imgW = Math.min(b.width ?? 200, Math.round(innerW * 0.4));
  const imgH = b.width && b.height ? Math.round((imgW * b.height) / b.width) : Math.round(imgW * 0.62);
  const gap = 18;
  const textW = innerW - imgW - gap;
  const side = b.side ?? 'left';
  const imgX = side === 'left' ? -innerW / 2 + imgW / 2 : innerW / 2 - imgW / 2;
  const textCx = side === 'left' ? -innerW / 2 + imgW + gap + textW / 2 : -innerW / 2 + textW / 2;

  const title = b.title
    ? new Text({ text: ui.t(b.title), style: { fontFamily: t.type.family, fontSize: 15, fill: t.color.text, fontWeight: '800' } })
    : null;
  title?.anchor.set(0, 0);
  const para = richParagraphNode(ui.t(b.text), ui, textW, { fontFamily: t.type.family, fontSize: 14, fill: t.color.textDim, lineHeight: 19 });
  const titleH = title ? title.height + 8 : 0;
  const textH = titleH + para.height;
  const h = Math.max(imgH, textH);

  const img = imageBoxNode(b.src, imgW, imgH, ui);
  img.position.set(imgX, 0);
  c.addChild(img);
  if (title) {
    title.position.set(textCx - textW / 2, -textH / 2);
    c.addChild(title);
  }
  para.position.set(textCx, -textH / 2 + titleH + para.height / 2);
  c.addChild(para);
  // reserve the full height so placeAuto spaces the next block correctly
  c.addChild(new Graphics().rect(-innerW / 2, -h / 2, 1, h).fill({ color: 0xffffff, alpha: 0 }));
  return c;
}

/** A sized box that holds the image's intended footprint while it loads, then
 *  renders the image RAW (no imposed border/rounding — designers style their own
 *  art). Loads via an `Image` element + `Texture.from` so ANY URL/format works
 *  (incl. extensionless/SVG hosts like placehold.co) with CORS. */
export function imageBoxNode(src: string, w: number, h: number, ui: OpenUI): Container {
  const t = ui.theme;
  const box = new Container();
  // a faint, un-framed loading placeholder (removed once the image paints)
  const placeholder = new Graphics().rect(-w / 2, -h / 2, w, h).fill({ color: t.color.surfaceAlt, alpha: 0.5 });
  box.addChild(placeholder);
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (box.destroyed) return;
      try {
        const sp = new Sprite(Texture.from(img));
        sp.anchor.set(0.5);
        sp.width = w;
        sp.height = h;
        box.addChild(sp);
        placeholder.visible = false; // show the raw image, not over a placeholder box
      } catch {
        /* keep the placeholder if the texture can't be created */
      }
    };
    img.onerror = () => {
      /* keep the placeholder box (it shows the intended size) */
    };
    img.src = src;
  }
  return box;
}

/** The 40-line paylines matrix: a wrapped flow of little REELS×ROWS masks, each with the
 *  cell that line pays on lit. Plain black-and-white (lit #111 / unlit #e2e5ea), no outlines
 *  or rounding, an index number under each — matches the reference design. */
export function paylinesNode(b: Extract<BlockSpec, { kind: 'paylines' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const GAP_X = 12;
  const ITEM_MIN = 76;
  const cols = Math.max(1, Math.floor((innerW + GAP_X) / (ITEM_MIN + GAP_X)));
  const itemW = (innerW - GAP_X * (cols - 1)) / cols;
  const cellGap = 2;
  const gridW = Math.min(72, itemW);
  const cell = (gridW - cellGap * (b.reels - 1)) / b.reels;
  const drawnW = cell * b.reels + cellGap * (b.reels - 1);
  const drawnH = cell * b.rows + cellGap * (b.rows - 1);
  const labelH = 16;
  const itemH = drawnH + 5 + labelH;
  const gridRows = Math.ceil(b.lines.length / cols);
  const totalH = gridRows * itemH + (gridRows - 1) * GAP_X;

  b.lines.forEach((line, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const itemCx = -innerW / 2 + col * (itemW + GAP_X) + itemW / 2;
    const gy0 = -totalH / 2 + row * (itemH + GAP_X);
    const gx0 = itemCx - drawnW / 2;
    const g = new Graphics();
    for (let r = 0; r < b.rows; r++) {
      for (let re = 0; re < b.reels; re++) {
        g.rect(gx0 + re * (cell + cellGap), gy0 + r * (cell + cellGap), cell, cell).fill({ color: line[re] === r ? 0x111111 : 0xe2e5ea });
      }
    }
    const idx = new Text({ text: String(i + 1), style: { fontFamily: t.type.family, fontSize: 11, fill: t.color.textDim, fontWeight: '700' } });
    idx.anchor.set(0.5, 0);
    idx.position.set(itemCx, gy0 + drawnH + 5);
    c.addChild(g, idx);
  });
  c.addChild(new Graphics().rect(-innerW / 2, -totalH / 2, 1, totalH).fill({ color: 0xffffff, alpha: 0 }));
  return c;
}

export type PaytableBlock = Extract<BlockSpec, { kind: 'paytable' }>;

/** Paytable: a multi-column symbol grid (icon/name + tiered payouts) when
 *  `columns > 1` (the reference design), else a single-column list. */
export function paytableNode(b: PaytableBlock, ui: OpenUI, innerW: number): Container {
  const want = Math.max(1, b.columns ?? 1);
  const fit = Math.max(1, Math.floor(innerW / 170)); // auto-reduce to fit narrow menus
  const cols = Math.max(1, Math.min(want, fit, b.rows.length || 1));
  return cols <= 1 ? paytableList(b, ui, innerW) : paytableGrid(b, ui, innerW, cols);
}

export function paytableList(b: PaytableBlock, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const rowH = 44;
  const totalH = Math.max(b.rows.length * rowH, rowH);
  const hasIcons = b.rows.some((r) => r.icon);
  const left = -innerW / 2;
  const symbolX = left + (hasIcons ? 48 : 4);
  b.rows.forEach((r, i) => {
    const cy = -totalH / 2 + rowH / 2 + i * rowH;
    if (i > 0) {
      c.addChild(new Graphics().moveTo(left, cy - rowH / 2).lineTo(innerW / 2, cy - rowH / 2).stroke({ width: 1, color: t.color.textDim, alpha: 0.15 }));
    }
    if (r.icon) {
      const icon = imageBoxNode(r.icon, 36, 36, ui);
      icon.position.set(left + 22, cy);
      c.addChild(icon);
    }
    const sym = new Text({ text: ui.t(r.symbol ?? ''), style: { fontFamily: t.type.family, fontSize: 15, fill: t.color.text, fontWeight: '700' } });
    sym.anchor.set(0, 0.5);
    sym.position.set(symbolX, cy);
    const pay = new Text({ text: r.payouts, style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.accent, fontWeight: '700' } });
    pay.anchor.set(1, 0.5);
    pay.position.set(innerW / 2, cy);
    c.addChild(sym, pay);
  });
  return c;
}

export function paytableGrid(b: PaytableBlock, ui: OpenUI, innerW: number, cols: number): Container {
  const c = new Container();
  const cellW = innerW / cols;
  const gridRows = Math.ceil(b.rows.length / cols);
  const lineH = 17;
  const maxLines = b.rows.reduce((m, r) => Math.max(m, (r.payouts || '').split('\n').length), 1);
  const cellH = Math.max(48, 14 + maxLines * lineH);
  const totalH = gridRows * cellH;
  b.rows.forEach((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cell = paytableCell(r, ui, cellW, lineH);
    cell.position.set(-innerW / 2 + col * cellW + cellW / 2, -totalH / 2 + row * cellH + cellH / 2);
    c.addChild(cell);
  });
  return c;
}

/** One symbol cell: an icon (or bold name) on the left, the tiered payouts on the
 *  right — each line "label: value" with the tier label bold (matching the design). */
export function paytableCell(r: PaytableBlock['rows'][number], ui: OpenUI, cellW: number, lineH: number): Container {
  const t = ui.theme;
  const cell = new Container();
  const lx = -cellW / 2 + 10;
  let leftW = 0;
  if (r.icon) {
    const icon = imageBoxNode(r.icon, 40, 40, ui);
    icon.position.set(lx + 20, 0);
    cell.addChild(icon);
    leftW = 52;
  } else if (r.symbol) {
    const sym = new Text({ text: ui.t(r.symbol), style: { fontFamily: t.type.family, fontSize: 14, fontWeight: '800', fill: t.color.text } });
    sym.anchor.set(0, 0.5);
    sym.position.set(lx, 0);
    cell.addChild(sym);
    leftW = sym.width + 14;
  }
  const lines = (r.payouts || '').split('\n');
  const blockH = lines.length * lineH;
  const px = lx + leftW;
  lines.forEach((ln, j) => {
    const ly = -blockH / 2 + lineH / 2 + j * lineH;
    const ci = ln.indexOf(':');
    if (ci >= 0) {
      const label = new Text({ text: ln.slice(0, ci + 1), style: { fontFamily: t.type.family, fontSize: 13, fontWeight: '800', fill: t.color.text } });
      label.anchor.set(0, 0.5);
      label.position.set(px, ly);
      const val = new Text({ text: ln.slice(ci + 1), style: { fontFamily: t.type.family, fontSize: 13, fontWeight: '700', fill: t.color.accent } });
      val.anchor.set(0, 0.5);
      val.position.set(px + label.width + 4, ly);
      cell.addChild(label, val);
    } else {
      const txt = new Text({ text: ln, style: { fontFamily: t.type.family, fontSize: 13, fontWeight: '700', fill: t.color.accent } });
      txt.anchor.set(0, 0.5);
      txt.position.set(px, ly);
      cell.addChild(txt);
    }
  });
  return cell;
}

/* ── the wider vocabulary ─────────────────────────────────────────────────── */

/** One REELS×ROWS mask with arbitrary cells lit — a scatter pattern, a cluster,
 *  a way. `paylines` is the repeated form of this; `grid` is the single figure. */
export function gridNode(b: Extract<BlockSpec, { kind: 'grid' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const lit = new Set(b.cells.map(([re, r]) => `${re}:${r}`));
  const cellGap = 3;
  const cell = Math.min(34, (Math.min(innerW, 260) - cellGap * (b.reels - 1)) / b.reels);
  const gw = cell * b.reels + cellGap * (b.reels - 1);
  const gh = cell * b.rows + cellGap * (b.rows - 1);
  const labelH = b.label ? 20 : 0;
  const totalH = gh + labelH;
  const x0 = -gw / 2;
  const y0 = -totalH / 2;
  const g = new Graphics();
  for (let r = 0; r < b.rows; r++) {
    for (let re = 0; re < b.reels; re++) {
      const on = lit.has(`${re}:${r}`);
      g.rect(x0 + re * (cell + cellGap), y0 + r * (cell + cellGap), cell, cell).fill({ color: on ? 0x111111 : 0xe2e5ea });
    }
  }
  c.addChild(g);
  if (b.symbol) {
    for (const [re, r] of b.cells) {
      const s = new Text({ text: b.symbol, style: { fontFamily: t.type.family, fontSize: Math.round(cell * 0.5), fill: '#ffffff', fontWeight: '800' } });
      s.anchor.set(0.5);
      s.position.set(x0 + re * (cell + cellGap) + cell / 2, y0 + r * (cell + cellGap) + cell / 2);
      c.addChild(s);
    }
  }
  if (b.label) {
    const lb = new Text({ text: ui.t(b.label), style: { fontFamily: t.type.family, fontSize: 12, fill: t.color.textDim, fontWeight: '700' } });
    lb.anchor.set(0.5, 0);
    lb.position.set(0, y0 + gh + 6);
    c.addChild(lb);
  }
  c.addChild(new Graphics().rect(-innerW / 2, y0, innerW, totalH).fill({ color: 0xffffff, alpha: 0 }));
  return c;
}

/** The symbol table: a `counts` header, then one row per symbol (icon or glyph +
 *  name) with what each count pays. */
export function symbolsNode(b: Extract<BlockSpec, { kind: 'symbols' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const payCols = Math.max(1, b.counts?.length ?? b.rows[0]?.pays.length ?? 1);
  const iconW = 46;
  const nameW = Math.min(120, Math.max(60, innerW * 0.26));
  const payW = (innerW - iconW - nameW) / payCols;
  const rowH = 46;
  const headH = b.counts?.length ? 24 : 0;
  const totalH = headH + b.rows.length * rowH;
  const left = -innerW / 2;
  const top = -totalH / 2;

  b.counts?.forEach((label, i) => {
    const txt = new Text({ text: ui.t(label), style: { fontFamily: t.type.family, fontSize: 12, fill: t.color.textDim, fontWeight: '800', letterSpacing: 0.4 } });
    txt.anchor.set(0.5, 0.5);
    txt.position.set(left + iconW + nameW + i * payW + payW / 2, top + headH / 2);
    c.addChild(txt);
  });

  b.rows.forEach((r, ri) => {
    const cy = top + headH + ri * rowH + rowH / 2;
    if (ri > 0) {
      c.addChild(new Graphics().moveTo(left, cy - rowH / 2).lineTo(innerW / 2, cy - rowH / 2).stroke({ width: 1, color: t.color.textDim, alpha: 0.18 }));
    }
    if (r.icon) {
      const box = imageBoxNode(r.icon, 38, 38, ui);
      box.position.set(left + iconW / 2, cy);
      c.addChild(box);
    } else if (r.symbol) {
      const glyph = new Text({ text: r.symbol, style: { fontFamily: t.type.family, fontSize: 22, fill: t.color.text, fontWeight: '800' } });
      glyph.anchor.set(0.5);
      glyph.position.set(left + iconW / 2, cy);
      c.addChild(glyph);
    }
    if (r.name) {
      const nm = new Text({ text: ui.t(r.name), style: { fontFamily: t.type.family, fontSize: 13, fill: t.color.text, fontWeight: '700' } });
      nm.anchor.set(0, 0.5);
      nm.position.set(left + iconW, cy);
      c.addChild(nm);
    }
    r.pays.forEach((pay, pi) => {
      if (pi >= payCols) return;
      const txt = new Text({ text: ui.t(pay), style: { fontFamily: t.type.family, fontSize: 13, fill: t.color.accent, fontWeight: '700' } });
      txt.anchor.set(0.5, 0.5);
      txt.position.set(left + iconW + nameW + pi * payW + payW / 2, cy);
      c.addChild(txt);
    });
  });
  return c;
}

/** Term / description pairs — a glossary, a spec sheet. */
export function kvNode(b: Extract<BlockSpec, { kind: 'kv' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const termW = Math.min(170, Math.max(90, innerW * 0.32));
  const gap = 14;
  const padY = 10;
  const left = -innerW / 2;
  const rows = b.items.map((it) => {
    const term = new Text({ text: ui.t(it.term), style: { fontFamily: t.type.family, fontSize: 13, fill: t.color.text, fontWeight: '800' } });
    term.anchor.set(0, 0);
    const text = richParagraphNode(ui.t(it.text), ui, innerW - termW - gap, { fontFamily: t.type.family, fontSize: 13, fill: t.color.textDim, lineHeight: 19 });
    return { term, text, h: Math.max(term.height, text.height) + padY * 2 };
  });
  const totalH = rows.reduce((a, r) => a + r.h, 0);
  let y = -totalH / 2;
  rows.forEach((r, i) => {
    if (i > 0) c.addChild(new Graphics().moveTo(left, y).lineTo(innerW / 2, y).stroke({ width: 1, color: t.color.textDim, alpha: 0.18 }));
    r.term.position.set(left + 2, y + padY);
    r.text.position.set(left + termW + gap + (innerW - termW - gap) / 2, y + padY + r.text.height / 2);
    c.addChild(r.term, r.text);
    y += r.h;
  });
  return c;
}

/** A 0..max gauge drawn as pips — volatility, risk, hit rate. */
export function meterNode(b: Extract<BlockSpec, { kind: 'meter' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const max = Math.max(1, Math.round(b.max ?? 5));
  const on = Math.max(0, Math.min(max, Math.round(b.value)));
  const left = -innerW / 2;
  const label = b.label
    ? new Text({ text: ui.t(b.label), style: { fontFamily: t.type.family, fontSize: 13, fill: t.color.text, fontWeight: '800' } })
    : null;
  label?.anchor.set(0, 0.5);
  const labelW = label ? label.width + 14 : 0;
  const pipGap = 5;
  const pipW = Math.max(10, Math.min(30, (innerW - labelW - pipGap * (max - 1)) / max));
  const pipH = 10;
  const cap = b.caption
    ? richParagraphNode(ui.t(b.caption), ui, innerW, { fontFamily: t.type.family, fontSize: 12, fill: t.color.textDim, lineHeight: 17 })
    : null;
  const rowH = Math.max(label?.height ?? 0, pipH);
  const totalH = rowH + (cap ? cap.height + 8 : 0);
  const rowCy = -totalH / 2 + rowH / 2;
  if (label) { label.position.set(left, rowCy); c.addChild(label); }
  const g = new Graphics();
  for (let i = 0; i < max; i++) {
    g.rect(left + labelW + i * (pipW + pipGap), rowCy - pipH / 2, pipW, pipH)
      .fill(i < on ? { color: t.color.accent } : { color: t.color.textDim, alpha: 0.25 });
  }
  c.addChild(g);
  if (cap) { cap.position.set(0, rowCy + rowH / 2 + 8 + cap.height / 2); c.addChild(cap); }
  return c;
}

/** A wrapping row of chips: mechanic tags, "243 ways", "max win 5,000x". */
export function badgesNode(b: Extract<BlockSpec, { kind: 'badges' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const padX = 11;
  const h = 26;
  const gap = 8;
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: t.color.surfaceAlt, fg: t.color.text },
    accent: { bg: t.color.accent, fg: t.color.accentText },
    bonus: { bg: t.color.bonus, fg: '#ffffff' },
    warning: { bg: t.color.featureBuy, fg: t.color.featureBuyText },
  };
  const chips = b.items.map((it) => {
    const txt = new Text({ text: ui.t(it.text), style: { fontFamily: t.type.family, fontSize: 11.5, fill: (tones[it.tone ?? 'neutral'] as { fg: string }).fg, fontWeight: '800', letterSpacing: 0.5 } });
    txt.anchor.set(0.5);
    return { txt, w: txt.width + padX * 2, tone: it.tone ?? 'neutral' };
  });
  // Lay out left-to-right, wrapping when the next chip would overflow the column.
  const lines: Array<Array<(typeof chips)[number]>> = [[]];
  let used = 0;
  for (const chip of chips) {
    const line = lines[lines.length - 1] as Array<(typeof chips)[number]>;
    if (line.length && used + gap + chip.w > innerW) { lines.push([chip]); used = chip.w; }
    else { line.push(chip); used += (line.length > 1 ? gap : 0) + chip.w; }
  }
  const totalH = lines.length * h + (lines.length - 1) * gap;
  lines.forEach((line, li) => {
    const cy = -totalH / 2 + li * (h + gap) + h / 2;
    let x = -innerW / 2;
    for (const chip of line) {
      const { bg } = tones[chip.tone] as { bg: string };
      c.addChild(new Graphics().roundRect(x, cy - h / 2, chip.w, h, h / 2).fill({ color: bg }));
      chip.txt.position.set(x + chip.w / 2, cy);
      c.addChild(chip.txt);
      x += chip.w + gap;
    }
  });
  return c;
}

/** A pulled-out note in the author's voice: an accent rule down the left edge. */
export function quoteNode(b: Extract<BlockSpec, { kind: 'quote' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const barW = 3;
  const padX = 16;
  const textW = innerW - barW - padX;
  const text = richParagraphNode(ui.t(b.text), ui, textW, { fontFamily: t.type.family, fontSize: 15, fill: t.color.text, lineHeight: 22 });
  const cite = b.cite
    ? new Text({ text: ui.t(b.cite), style: { fontFamily: t.type.family, fontSize: 12, fill: t.color.textDim } })
    : null;
  cite?.anchor.set(0, 0);
  const totalH = text.height + (cite ? cite.height + 6 : 0) + 8;
  const left = -innerW / 2;
  c.addChild(new Graphics().rect(left, -totalH / 2, barW, totalH).fill({ color: t.color.accent }));
  text.position.set(left + barW + padX + textW / 2, -totalH / 2 + 4 + text.height / 2);
  c.addChild(text);
  if (cite) { cite.position.set(left + barW + padX, -totalH / 2 + 4 + text.height + 6); c.addChild(cite); }
  return c;
}

/** An image strip with captions. */
export function galleryNode(b: Extract<BlockSpec, { kind: 'gallery' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const gap = 12;
  const cols = Math.max(1, Math.min(b.columns ?? 3, b.items.length || 1));
  const cellW = (innerW - gap * (cols - 1)) / cols;
  const imgH = Math.round(cellW * 0.62);
  const capH = b.items.some((i) => i.caption) ? 20 : 0;
  const rows = Math.ceil((b.items.length || 1) / cols);
  const cellH = imgH + capH;
  const totalH = rows * cellH + (rows - 1) * gap;
  b.items.forEach((it, i) => {
    const cx = -innerW / 2 + (i % cols) * (cellW + gap) + cellW / 2;
    const cy = -totalH / 2 + Math.floor(i / cols) * (cellH + gap);
    const box = imageBoxNode(it.src, cellW, imgH, ui);
    box.position.set(cx, cy + imgH / 2);
    c.addChild(box);
    if (it.caption) {
      const cap = new Text({
        text: ui.t(it.caption),
        style: { fontFamily: t.type.family, fontSize: 12, fill: t.color.textDim, align: 'center', wordWrap: true, wordWrapWidth: cellW },
      });
      cap.anchor.set(0.5, 0);
      cap.position.set(cx, cy + imgH + 5);
      c.addChild(cap);
    }
  });
  return c;
}

/** What happens when: numbered markers down the left, title + copy beside each. */
export function timelineNode(b: Extract<BlockSpec, { kind: 'timeline' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const dot = 30;
  const gap = 14;
  const textW = innerW - dot - gap;
  const left = -innerW / 2;
  const rows = b.items.map((it, i) => {
    const title = new Text({ text: ui.t(it.title), style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.text, fontWeight: '800' } });
    title.anchor.set(0, 0);
    const text = it.text
      ? richParagraphNode(ui.t(it.text), ui, textW, { fontFamily: t.type.family, fontSize: 13, fill: t.color.textDim, lineHeight: 19 })
      : null;
    const mark = new Text({
      text: it.marker ?? String(i + 1),
      style: { fontFamily: t.type.family, fontSize: 13, fill: t.color.accentText, fontWeight: '800' },
    });
    mark.anchor.set(0.5);
    return { title, text, mark, h: Math.max(dot, title.height + (text ? text.height + 4 : 0)) };
  });
  const totalH = rows.reduce((a, r) => a + r.h, 0) + Math.max(0, rows.length - 1) * gap;
  let y = -totalH / 2;
  rows.forEach((r, i) => {
    if (i > 0) {
      c.addChild(new Graphics().rect(left + dot / 2 - 1, y - gap, 2, gap).fill({ color: t.color.textDim, alpha: 0.3 }));
    }
    c.addChild(new Graphics().circle(left + dot / 2, y + dot / 2, dot / 2).fill({ color: t.color.accent }));
    r.mark.position.set(left + dot / 2, y + dot / 2);
    r.title.position.set(left + dot + gap, y + 2);
    c.addChild(r.mark, r.title);
    if (r.text) {
      r.text.position.set(left + dot + gap + textW / 2, y + r.title.height + 4 + r.text.height / 2);
      c.addChild(r.text);
    }
    y += r.h + gap;
  });
  return c;
}

/** A/B comparison: base game vs bonus, this mode vs that one. */
export function compareNode(b: Extract<BlockSpec, { kind: 'compare' }>, ui: OpenUI, innerW: number): Container {
  return tableNode(
    {
      kind: 'table',
      id: `${b.id}-table`,
      columns: ['', ui.t(b.columns[0]), ui.t(b.columns[1])],
      rows: b.rows.map((r) => [r.label, r.a, r.b]),
    },
    ui,
    innerW,
  );
}

/** A link out. Underlined accent text; clicking opens it in a new tab. */
export function linkNode(b: Extract<BlockSpec, { kind: 'link' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const txt = new Text({ text: ui.t(b.text), style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.accent, fontWeight: '700' } });
  txt.anchor.set(0, 0.5);
  txt.position.set(-innerW / 2, 0);
  c.addChild(txt);
  c.addChild(new Graphics().rect(-innerW / 2, txt.height / 2 - 1, txt.width, 1).fill({ color: t.color.accent, alpha: 0.8 }));
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.on('pointertap', () => {
    try {
      (globalThis as { open?: (url: string, target?: string) => unknown }).open?.(b.href, b.external === false ? '_self' : '_blank');
    } catch {
      /* a host without a window just gets a dead link, not a crash */
    }
  });
  return c;
}

/** Deliberate vertical air. */
export function spacerNode(b: Extract<BlockSpec, { kind: 'spacer' }>, innerW: number): Container {
  const h = b.size === 'sm' ? 8 : b.size === 'lg' ? 40 : 20;
  const c = new Container();
  c.addChild(new Graphics().rect(-innerW / 2, -h / 2, innerW, h).fill({ color: 0xffffff, alpha: 0 }));
  return c;
}
