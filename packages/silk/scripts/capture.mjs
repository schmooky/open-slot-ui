import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * CAPTURE THE SKIN, STATE BY STATE.
 *
 * Hand-drawing a casino skin on canvas is how two renderers drift: someone eyeballs
 * a radius, a window gets forgotten, and six months later the two products differ in
 * ways nobody can enumerate. So nothing here is drawn by hand. This opens the DOM
 * HUD in a real browser, walks it into each state a player can put it in — the menu
 * open, the autoplay drawer out, each window up — and writes down every box it can
 * see: position, size, fill, border, radius, shadow, text, font, and the icon
 * codepoint where the glyph comes from a font.
 *
 * The canvas binding replays those boxes. That makes 1:1 a property of the pipeline
 * rather than a promise, and re-measuring after a skin change is one command.
 *
 * Three things a naive walk would miss, and this does not:
 *   - the zone an element belongs to (the bar, the top strip, a window), so the
 *     canvas can anchor each to the edge CSS anchors it to instead of scaling one
 *     photograph of a 1440x900 window;
 *   - the clipping ancestor, so a scrolled window's content stops where the window
 *     stops;
 *   - pseudo-element boxes, because the dim behind every modal is a ::before and a
 *     window without it looks nothing like the real one.
 *
 *   node packages/silk/scripts/capture.mjs [url]
 */
const url = process.argv[2] ?? 'http://localhost:5199/';
const out = fileURLToPath(new URL('../src/skin.capture.json', import.meta.url));

/** The states worth drawing, and how to get the DOM HUD into each one. */
const STATES = [
  { id: 'idle', enter: () => {} },
  { id: 'menu', enter: () => document.getElementById('MainMenuToggle')?.click() },
  { id: 'autoplay', enter: () => document.getElementById('AutoplayBtn')?.click() },
  {
    id: 'info',
    enter: () => {
      document.getElementById('MainMenuToggle')?.click();
      document.getElementById('GameInfoBtn')?.click();
    },
  },
  { id: 'buy', enter: () => document.getElementById('FeatureBuyToggle')?.click() },
  {
    id: 'history',
    enter: () => {
      document.getElementById('MainMenuToggle')?.click();
      document.getElementById('BetHistoryBtn')?.click();
    },
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.UiRibbonUserPanel__container');
await page.waitForTimeout(1500);

/** Everything the canvas needs to draw one element. Runs in the page. */
const WALK = `(() => {
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;
  const isPaint = (c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
  const nodes = [];
  /**
   * Every element the skin gave an id, whether or not it paints anything of its own.
   * A button whose look is entirely its child glyph draws nothing, but a player still
   * presses it, so the canvas needs its box to put a hit area there.
   */
  const hits = [];
  const seen = new Set();
  const root = document.querySelector('.HacksawCasinoUiContainer');
  if (!root) return { nodes };

  /**
   * Which edge of the screen an element is anchored to. A slot HUD is three layers:
   * the bar at the bottom, the compliance strip at the top, and windows over the
   * middle. Recording it lets the canvas move each one the way CSS would.
   */
  const zoneOf = (el, inherited) => {
    if (el.id === 'CoreOverlay' || el.id === 'NotificationHolder') return 'top';
    if (el.id === 'UiWrapper') return 'bottom';
    if (el.classList && el.classList.contains('Modal')) return 'window';
    return inherited;
  };

  /**
   * What paints over what. The three layers are siblings with z-indexes — the bar is
   * above the windows in this skin, which is why the coin stays lit while a window is
   * open — so the number is read off the markup rather than assumed.
   */
  const rankOf = (el) => {
    const z = parseInt(getComputedStyle(el).zIndex, 10);
    return Number.isFinite(z) ? z : 0;
  };

  const rect = (b) => [Math.round(b.x * 100) / 100, Math.round(b.y * 100) / 100, Math.round(b.width * 100) / 100, Math.round(b.height * 100) / 100];
  const clips = (cs) => cs.overflowY !== 'visible' || cs.overflowX !== 'visible';
  const narrow = (clip, b) => {
    const x = Math.max(clip ? clip[0] : -1e6, b.left);
    const y = Math.max(clip ? clip[1] : -1e6, b.top);
    const r = Math.min(clip ? clip[0] + clip[2] : 1e6, b.right);
    const bo = Math.min(clip ? clip[1] + clip[3] : 1e6, b.bottom);
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round((r - x) * 100) / 100, Math.round((bo - y) * 100) / 100];
  };

  /**
   * The angle a CSS transform turns an element by, and the box it had before it was
   * turned. A rotated element's bounding rect is the rect of its corners, not its
   * own box — the close button's cross is two 24x3 bars whose rect reads 19x19 —
   * so the canvas is given the untransformed box and the angle, and turns it itself.
   */
  const spin = (el, cs, b) => {
    const a = cs.transform && cs.transform !== 'none'
      ? Math.atan2(new DOMMatrixReadOnly(cs.transform).b, new DOMMatrixReadOnly(cs.transform).a)
      : 0;
    const cx = Math.round((b.left + b.width / 2) * 100) / 100;
    const cy = Math.round((b.top + b.height / 2) * 100) / 100;
    if (!a) return { a: 0, cx, cy, w: px(b.width), h: px(b.height) };
    const w = el.offsetWidth || b.width;
    const h = el.offsetHeight || b.height;
    return { a: Math.round(a * 10000) / 10000, cx, cy, w: px(w), h: px(h) };
  };

  const pseudoBoxes = (el, box) => {
    const out = [];
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content === 'none' || cs.display === 'none' || parseFloat(cs.opacity) < 0.02) continue;
      const ch = (cs.content || '').replace(/^"|"$/g, '');
      if (ch && ch.codePointAt(0) >= 0xe000) continue; // an icon glyph, captured elsewhere
      const bw = px(cs.borderTopWidth);
      if (!isPaint(cs.backgroundColor) && !(bw > 0)) continue;
      const w = px(cs.width);
      const h = px(cs.height);
      if (!(w > 0) || !(h > 0)) continue;
      const abs = cs.position === 'absolute' || cs.position === 'fixed';
      const left = abs && cs.left !== 'auto' ? px(cs.left) : 0;
      const top = abs && cs.top !== 'auto' ? px(cs.top) : 0;
      // A pseudo can be turned on its own account as well as by its owner — the
      // close button's cross is one bar at +45 and one at -45 — so the two angles
      // add up.
      const own = cs.transform && cs.transform !== 'none'
        ? Math.atan2(new DOMMatrixReadOnly(cs.transform).b, new DOMMatrixReadOnly(cs.transform).a)
        : 0;
      out.push({
        pseudo,
        spin: Math.round(own * 10000) / 10000 || undefined,
        x: Math.round((box.x + left) * 100) / 100,
        y: Math.round((box.y + top) * 100) / 100,
        w, h,
        bg: isPaint(cs.backgroundColor) ? cs.backgroundColor : undefined,
        radius: px(cs.borderTopLeftRadius) || undefined,
        radii: [px(cs.borderTopLeftRadius), px(cs.borderTopRightRadius), px(cs.borderBottomRightRadius), px(cs.borderBottomLeftRadius)],
        border: bw > 0 && isPaint(cs.borderTopColor) ? { w: bw, color: cs.borderTopColor } : undefined,
        opacity: parseFloat(cs.opacity) < 1 ? parseFloat(cs.opacity) : undefined,
      });
    }
    return out;
  };

  /** A 2D context kept around to ask the browser where a glyph's ink actually falls. */
  const ruler = document.createElement('canvas').getContext('2d');

  /**
   * WHERE THE ICON IS, not where its box is.
   *
   * An icon is a character in a font, and a character sits inside its line box
   * wherever the font says — off-centre, usually. Centring the glyph in the button
   * therefore puts it a few pixels from where the browser puts it, which is exactly
   * the kind of difference a player notices and nobody can name. So the browser is
   * asked to measure the glyph's ink, and the canvas is told to land the ink there.
   */
  const inkOf = (el, cs, ch) => {
    const b = el.getBoundingClientRect();
    const padL = px(cs.paddingLeft) + px(cs.borderLeftWidth);
    const padR = px(cs.paddingRight) + px(cs.borderRightWidth);
    const padT = px(cs.paddingTop) + px(cs.borderTopWidth);
    const padB = px(cs.paddingBottom) + px(cs.borderBottomWidth);
    const cw = b.width - padL - padR;
    const chh = b.height - padT - padB;
    const family = cs.fontFamily;
    const size = px(cs.fontSize);
    ruler.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + size + 'px ' + family;
    const m = ruler.measureText(ch);
    if (!Number.isFinite(m.actualBoundingBoxAscent)) return null;
    const lineH = cs.lineHeight === 'normal' ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : px(cs.lineHeight);
    // The line box is centred in the content box when the element is one line tall,
    // which every icon button in this skin is; the baseline sits inside it where the
    // font's own ascent puts it.
    const isFlex = cs.display.includes('flex');
    const down = isFlex ? cs.alignItems : 'center';
    const lineTop = b.top + padT + (down === 'flex-start' || down === 'start' ? 0 : down === 'flex-end' || down === 'end' ? Math.max(0, chh - lineH) : Math.max(0, (chh - lineH) / 2));
    const baseline = lineTop + (lineH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    // How the glyph is placed across its box: a flex row places it by
    // justify-content, and anything else by text-align. Every icon button in this
    // skin is a centred flex box, and guessing left-aligned put them all a few
    // pixels out.
    const how = isFlex ? cs.justifyContent : cs.textAlign;
    const centred = how === 'center' || how === 'space-around' || how === 'space-evenly';
    const ended = how === 'flex-end' || how === 'end' || how === 'right';
    const left = b.left + padL + (centred ? Math.max(0, (cw - m.width) / 2) : ended ? Math.max(0, cw - m.width) : 0);
    return {
      x: px(left - m.actualBoundingBoxLeft),
      y: px(baseline - m.actualBoundingBoxAscent),
      w: px(m.actualBoundingBoxLeft + m.actualBoundingBoxRight),
      h: px(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent),
    };
  };

  const glyphOf = (el) => {
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      const content = cs.content;
      if (!content || content === 'none' || content === 'normal') continue;
      const ch = content.replace(/^"|"$/g, '');
      // Only PUA codepoints are icons; a quotation mark of real text is not.
      if (!ch || ch.codePointAt(0) < 0xe000) continue;
      return {
        ch,
        font: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
        size: px(cs.fontSize),
        color: cs.color,
        pseudo,
        ink: inkOf(el, cs, ch),
      };
    }
    return null;
  };

  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.replace(/\\s+/g, ' ').trim();
  };

  /**
   * Where each LINE of an element's own text actually landed.
   *
   * Handing the canvas a paragraph and a width means asking a second text engine to
   * break the lines the same way the browser did, which it will not. So the browser
   * is asked where every line begins and ends — by measuring the text a character at
   * a time and grouping what shares a baseline — and the canvas draws those lines
   * where they were measured. No wrapping, no guessing.
   */
  const ownLines = (el, turnedOff) => {
    // A turned element's characters do not sit on an axis-aligned line, so their
    // rects are useless. The turn is paint, not layout: taking it off for the
    // measurement gives the lines in the element's own frame — which is the frame
    // the canvas draws them in, inside a frame it turns.
    let restore;
    if (turnedOff) {
      restore = { transform: el.style.transform, transition: el.style.transition };
      // Two things fight this: the stylesheet, which an ordinary inline value loses
      // to, and the button's own transition, which would animate towards upright
      // over 150ms and hand back the old value in the meantime.
      el.style.setProperty('transition', 'none', 'important');
      el.style.setProperty('transform', 'none', 'important');
    }
    const lines = [];
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      const text = node.textContent;
      let run = null;
      for (let i = 0; i < text.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const top = Math.round(r.top * 2) / 2;
        if (run && Math.abs(run.top - top) < 1.5) {
          run.text += text[i];
          run.right = Math.max(run.right, r.right);
          run.bottom = Math.max(run.bottom, r.bottom);
        } else {
          if (run) lines.push(run);
          run = { top, text: text[i], left: r.left, right: r.right, bottom: r.bottom };
        }
      }
      if (run) lines.push(run);
    }
    // The spaces AROUND a run are part of where the next run starts — trimming them
    // is what turns "Wild substitutes" into "Wildsubstitutes" — so runs of
    // whitespace are collapsed to one and kept.
    const out = lines
      .map((l) => ({ text: l.text.replace(/\\s+/g, ' '), x: px(l.left), y: px(l.top), w: px(l.right - l.left), h: px(l.bottom - l.top) }))
      .filter((l) => l.text.trim());
    if (turnedOff) {
      el.style.removeProperty('transform');
      el.style.removeProperty('transition');
      if (restore.transform) el.style.transform = restore.transform;
      if (restore.transition) el.style.transition = restore.transition;
    }
    return out;
  };

  const visit = (el, depth, inherited, clip) => {
    const turned = inherited.turned;
    if (seen.has(el) || depth > 24) return;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.02) return;
    const b = el.getBoundingClientRect();
    const t = spin(el, cs, b);
    const zone = zoneOf(el, inherited.zone);
    // The layer roots are the elements that carry the z-index; everything inside one
    // paints with it.
    const isLayerRoot = el.id === 'CoreOverlay' || el.id === 'NotificationHolder' || el.id === 'UiWrapper' || (el.classList && el.classList.contains('Modal'));
    const rank = isLayerRoot ? rankOf(el) : inherited.rank;
    // A window is its own coordinate space, so its content is not clipped by
    // whatever was clipping the bar behind it.
    if (zone !== inherited.zone) clip = undefined;
    const clipped = clip ? narrow(clip, b) : null;
    const visible = clipped ? clipped[2] > 0.5 && clipped[3] > 0.5 : true;
    const onScreen = b.width > 0 && b.height > 0 && b.right > -200 && b.left < innerWidth + 200 && b.bottom > -200 && b.top < innerHeight + 200;
    if (onScreen && visible && el.id) {
      hits.push({ id: el.id, x: rect(b)[0], y: rect(b)[1], w: rect(b)[2], h: rect(b)[3], zone });
    }
    if (onScreen && visible) {
      // The element's own box, untransformed, with the angle recorded beside it.
      const own = { x: Math.round((t.cx - t.w / 2) * 100) / 100, y: Math.round((t.cy - t.h / 2) * 100) / 100, w: t.w, h: t.h };
      // A pseudo-element is laid out inside its owner, so it turns with it — and it
      // paints where CSS says it does: ::before under the element's own box, ::after
      // over it. Pushing both before the box is how the buy coin lost its ring.
      const pseudos = pseudoBoxes(el, own).map((ps) => {
        const turn = Math.round(((t.a || 0) + (ps.spin || 0)) * 10000) / 10000;
        return {
          cls: (el.className || '').toString().split(' ')[0] + ps.pseudo,
          z: nodes.length,
          zone,
          rank,
          clip: clip || undefined,
          ...ps,
          spin: undefined,
          rotate: turn || undefined,
          rx: turn ? ps.x + ps.w / 2 : undefined,
          ry: turn ? ps.y + ps.h / 2 : undefined,
        };
      });
      for (const ps of pseudos) if (ps.pseudo === '::before') nodes.push(ps);
      const text = ownText(el);
      const glyph = glyphOf(el);
      const bg = cs.backgroundColor;
      const bw = px(cs.borderTopWidth);
      const shadow = cs.boxShadow === 'none' ? null : cs.boxShadow;
      const paints = isPaint(bg) || bw > 0 || text || glyph || shadow || el.tagName === 'IMG';
      if (paints) {
        nodes.push({
          id: el.id || undefined,
          cls: (el.className || '').toString().split(' ')[0] || undefined,
          x: own.x,
          y: own.y,
          w: own.w,
          h: own.h,
          z: nodes.length,
          bg: isPaint(bg) ? bg : undefined,
          radius: px(cs.borderTopLeftRadius) || undefined,
          radii: [px(cs.borderTopLeftRadius), px(cs.borderTopRightRadius), px(cs.borderBottomRightRadius), px(cs.borderBottomLeftRadius)],
          border: bw > 0 && isPaint(cs.borderTopColor) ? { w: bw, color: cs.borderTopColor } : undefined,
          shadow: shadow || undefined,
          text: text || undefined,
          lines: text && !turned ? ownLines(el, !!t.a) : undefined,
          glyph: glyph || undefined,
          font: text ? { size: px(cs.fontSize), weight: cs.fontWeight, family: cs.fontFamily.split(',')[0].replace(/["']/g, ''), align: cs.textAlign, lineHeight: px(cs.lineHeight) || px(cs.fontSize) * 1.2, spacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing), transform: cs.textTransform } : undefined,
          color: text || glyph ? cs.color : undefined,
          opacity: parseFloat(cs.opacity) < 1 ? parseFloat(cs.opacity) : undefined,
          rotate: t.a || undefined,
          rx: t.a ? t.cx : undefined,
          ry: t.a ? t.cy : undefined,
          img: el.tagName === 'IMG' ? el.getAttribute('src') : undefined,
          zone,
          rank,
          clip: clip || undefined,
        });
      }
      for (const ps of pseudos) if (ps.pseudo === '::after') nodes.push(ps);
    }
    const inner = clips(cs) ? narrow(clip, b) : clip;
    for (const child of el.children) visit(child, depth + 1, { zone, rank, turned: turned || !!t.a }, inner);
  };
  visit(root, 0, { zone: 'bottom', rank: 0, turned: false }, undefined);
  return { nodes, hits, viewport: { w: innerWidth, h: innerHeight } };
})()`;

const capture = { viewport: { w: 1440, h: 900 }, states: {}, hits: {} };
for (const state of STATES) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.evaluate(`(${state.enter.toString()})()`);
  await page.waitForTimeout(700);
  const tree = await page.evaluate(WALK);
  capture.states[state.id] = tree.nodes;
  capture.hits[state.id] = tree.hits;
  capture.viewport = tree.viewport ?? capture.viewport;
  console.log(`${state.id.padEnd(9)} ${tree.nodes.length} boxes, ${tree.hits.length} named elements`);
}
await browser.close();

writeFileSync(out, JSON.stringify(capture));
console.log(`\ncapture → ${out} (${(JSON.stringify(capture).length / 1024).toFixed(0)} KB)`);
