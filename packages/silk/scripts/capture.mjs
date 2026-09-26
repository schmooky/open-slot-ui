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
 * And it does this at EVERY SIZE THE SKIN LAYS OUT DIFFERENTLY. A HUD is not one
 * design scaled up and down: the stylesheet reflows it, moves the coin, swaps the
 * channel from desktop to touch and re-breaks every paragraph. Measuring one window
 * and scaling it would be a photograph. So each breakpoint is walked in turn, and
 * the canvas replays the one nearest the window it is given.
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
  // A round in flight has two looks: first the arrow dimmed while the answer is on
  // its way, then the stop button once it can be skipped. Between them they are what
  // a player spends the most time looking at.
  { id: 'spinning', enter: () => document.getElementById('PlaceBetBtn')?.click(), settle: 420 },
  { id: 'stopping', enter: () => document.getElementById('PlaceBetBtn')?.click(), settle: 900 },
  {
    id: 'history',
    enter: () => {
      document.getElementById('MainMenuToggle')?.click();
      document.getElementById('BetHistoryBtn')?.click();
    },
  },
];

/**
 * The sizes worth measuring: the two desktop widths the bar behaves differently at,
 * a tablet, and a phone in both orientations. Touch is what flips the stylesheet to
 * its mobile channel, so the small ones are captured as touch devices.
 */
const SIZES = [
  { w: 1920, h: 1080, touch: false },
  { w: 1440, h: 900, touch: false },
  { w: 1180, h: 820, touch: false },
  { w: 834, h: 1112, touch: true },
  { w: 932, h: 430, touch: true },
  { w: 430, h: 932, touch: true },
];

const browser = await chromium.launch();

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
      const ramp = cs.backgroundImage && cs.backgroundImage.startsWith('linear-gradient') ? cs.backgroundImage : undefined;
      if (!isPaint(cs.backgroundColor) && !ramp && !(bw > 0)) continue;
      const w = px(cs.width);
      const h = px(cs.height);
      if (!(w > 0) || !(h > 0)) continue;

      const abs = cs.position === 'absolute' || cs.position === 'fixed';
      // An absolutely positioned pseudo is placed by its insets — from the right or
      // the bottom when that is the side it was given.
      const owner = getComputedStyle(el);
      let left = 0;
      let top = 0;
      if (abs) {
        left = cs.left !== 'auto' ? px(cs.left) : cs.right !== 'auto' ? box.w - px(cs.right) - w : 0;
        top = cs.top !== 'auto' ? px(cs.top) : cs.bottom !== 'auto' ? box.h - px(cs.bottom) - h : 0;
      } else if (owner.display.includes('flex') && !owner.flexDirection.startsWith('column')) {
        // A static pseudo in a flex row is an item of that row: ::before opens it and
        // ::after closes it. This is the "line — TITLE — line" heading of the rules.
        const padL = px(owner.paddingLeft) + px(owner.borderLeftWidth);
        const padR = px(owner.paddingRight) + px(owner.borderRightWidth);
        left = pseudo === '::before' ? padL : box.w - padR - w;
        top = (box.h - h) / 2;
      }
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
        ramp,
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

  /**
   * A clip belongs to a containing block, not to every ancestor.
   *
   * The mobile menu button lives inside a zero-width, overflow-hidden box and is
   * still perfectly visible, because it is absolutely positioned against something
   * further up. Treating every ancestor's overflow as a clip loses it — so an
   * absolutely positioned element is clipped only by POSITIONED ancestors, and a
   * fixed one by nothing at all.
   */
  const visit = (el, depth, inherited, clip, clipAbs) => {
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
    if (zone !== inherited.zone) clip = clipAbs = undefined;
    let after = [];
    const pos = cs.position;
    const mine = pos === 'fixed' ? undefined : pos === 'absolute' ? clipAbs : clip;
    const clipped = mine ? narrow(mine, b) : null;
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
          clip: mine || undefined,
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
      // An <img> is painted inside its box, not stretched across it: object-fit
      // letterboxes it and object-position centres it. Handing the canvas the box
      // would stretch every picture the markup fits.
      const picture = el.tagName === 'IMG' && el.naturalWidth > 0 ? (() => {
        const fit = cs.objectFit;
        const iw = el.naturalWidth;
        const ih = el.naturalHeight;
        let pw = own.w;
        let ph = own.h;
        if (fit === 'contain' || fit === 'scale-down') {
          const k = Math.min(own.w / iw, own.h / ih, fit === 'scale-down' ? 1 : Infinity);
          pw = iw * k;
          ph = ih * k;
        } else if (fit === 'cover') {
          const k = Math.max(own.w / iw, own.h / ih);
          pw = iw * k;
          ph = ih * k;
        } else if (fit === 'none') {
          pw = iw;
          ph = ih;
        }
        return { x: px(own.x + (own.w - pw) / 2), y: px(own.y + (own.h - ph) / 2), w: px(pw), h: px(ph), over: pw > own.w + 0.5 || ph > own.h + 0.5 };
      })() : null;
      const bg = cs.backgroundColor;
      // A background can be a ramp rather than a colour — the reel cells in the
      // rules and half the buttons are — and a flat fill where the markup has a
      // gradient is the difference a reader notices without being able to name it.
      const ramp = cs.backgroundImage && cs.backgroundImage.startsWith('linear-gradient') ? cs.backgroundImage : undefined;
      const bw = px(cs.borderTopWidth);
      const shadow = cs.boxShadow === 'none' ? null : cs.boxShadow;
      const paints = isPaint(bg) || ramp || bw > 0 || text || glyph || shadow || el.tagName === 'IMG';
      if (paints) {
        nodes.push({
          id: el.id || undefined,
          cls: (el.className || '').toString().split(' ')[0] || undefined,
          x: picture ? picture.x : own.x,
          y: picture ? picture.y : own.y,
          w: picture ? picture.w : own.w,
          h: picture ? picture.h : own.h,
          z: nodes.length,
          bg: isPaint(bg) ? bg : undefined,
          ramp,
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
          // A picture that overflows its box is clipped by it, the way cover does.
          clip: (picture && picture.over ? narrow(mine, b) : mine) || undefined,
        });
      }
      after = pseudos.filter((ps) => ps.pseudo === '::after');
    }
    const inner = clips(cs) ? narrow(mine, b) : mine;
    // A positioned box clips its absolute descendants; a static one does not.
    const innerAbs = pos === 'static' ? clipAbs : inner;
    for (const child of el.children) visit(child, depth + 1, { zone, rank, turned: turned || !!t.a }, inner, innerAbs);
    // ::after paints as the element's LAST child — over its own content, which is
    // what makes the fade at the bottom of a scrolling window a fade.
    for (const ps of after) nodes.push(ps);
  };
  visit(root, 0, { zone: 'bottom', rank: 0, turned: false }, undefined, undefined);
  return { nodes, hits, viewport: { w: innerWidth, h: innerHeight }, channel: root.dataset.channel || document.querySelector('[data-channel]')?.dataset.channel };
})()`;

const capture = { sizes: [] };
for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1,
    hasTouch: size.touch,
    isMobile: size.touch,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.UiRibbonUserPanel__container');
  await page.waitForTimeout(1200);
  const shot = { w: size.w, h: size.h, channel: 'desktop', states: {}, hits: {} };
  for (const state of STATES) {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    await page.evaluate(`(${state.enter.toString()})()`);
    await page.waitForTimeout(state.settle ?? 700);
    const tree = await page.evaluate(WALK);
    shot.states[state.id] = tree.nodes;
    shot.hits[state.id] = tree.hits;
    shot.channel = tree.channel ?? shot.channel;
  }
  capture.sizes.push(shot);
  const boxes = Object.values(shot.states).reduce((n, list) => n + list.length, 0);
  console.log(`${String(size.w).padStart(4)}x${String(size.h).padEnd(5)} ${shot.channel.padEnd(7)} ${boxes} boxes over ${STATES.length} states`);
  await context.close();
}
await browser.close();

/**
 * The same capture, smaller.
 *
 * Six breakpoints of a HUD is a lot of repeated text: the same font on four hundred
 * boxes, the same clip rect on every line of a window. Repeats are pulled into
 * tables and referenced by index, which the binding expands on load. Nothing is
 * rounded away — this is the same data, spelled once.
 */
/**
 * The names a box is written under in the file. Long names are for reading code, not
 * for shipping six breakpoints of them over a wire; the binding expands these on
 * load, and the map travels with the data so the file stays self-describing.
 */
const SHORT = {
  id: 'i', cls: 'c', x: 'x', y: 'y', w: 'w', h: 'h', bg: 'b', ramp: 'G', radius: 'r', radii: 'R',
  border: 'd', shadow: 's', text: 't', lines: 'L', glyph: 'g', font: 'f', color: 'k',
  opacity: 'o', rotate: 'a', rx: 'u', ry: 'v', img: 'm', zone: 'z', rank: 'n', clip: 'p',
};
const SHORT_LINE = { text: 't', x: 'x', y: 'y', w: 'w', h: 'h' };
const SHORT_GLYPH = { ch: 'c', font: 'f', size: 's', color: 'k', ink: 'n' };

const rename = (obj, map) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && map[k]) out[map[k]] = v;
  return out;
};

function compact(shot) {
  const fonts = [];
  const clips = [];
  const colors = [];
  const ramps = [];
  const seen = new Map();
  const index = (list, value) => {
    let known = seen.get(list);
    if (!known) seen.set(list, (known = new Map()));
    const key = JSON.stringify(value);
    const at = known.get(key);
    if (at !== undefined) return at;
    const put = list.push(value) - 1;
    known.set(key, put);
    return put;
  };
  // A colour is written the same way a few hundred times; the table spells it once.
  const hue = (v) => (v === undefined ? undefined : `#${index(colors, v)}`);
  const round = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);
  for (const list of Object.values(shot.states)) {
    for (const n of list) {
      delete n.z;
      delete n.pseudo;
      // Four equal corners are one number.
      if (n.radii && n.radii.every((v) => v === n.radii[0])) delete n.radii;
      if (n.font) n.font = index(fonts, n.font);
      if (n.clip) n.clip = index(clips, n.clip);
      n.bg = hue(n.bg);
      if (n.ramp) n.ramp = index(ramps, n.ramp);
      n.color = hue(n.color);
      if (n.border) n.border = { w: n.border.w, color: hue(n.border.color) };
      if (n.glyph) {
        n.glyph.color = hue(n.glyph.color);
        delete n.glyph.pseudo;
        if (n.glyph.ink) for (const k of ['x', 'y', 'w', 'h']) n.glyph.ink[k] = round(n.glyph.ink[k]);
      }
      for (const k of ['x', 'y', 'w', 'h', 'rx', 'ry', 'radius']) n[k] = round(n[k]);
      // A single line that says what its box says need not say it twice.
      if (n.lines) {
        for (const l of n.lines) {
          for (const k of ['x', 'y', 'w', 'h']) l[k] = round(l[k]);
          if (l.text === n.text) delete l.text;
        }
      }
      for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k];
    }
  }
  for (const [state, list] of Object.entries(shot.states)) {
    shot.states[state] = list.map((n) => {
      if (n.lines) n.lines = n.lines.map((l) => rename(l, SHORT_LINE));
      if (n.glyph) n.glyph = rename(n.glyph, SHORT_GLYPH);
      return rename(n, SHORT);
    });
  }
  shot.fonts = fonts;
  shot.clips = clips;
  shot.colors = colors;
  shot.ramps = ramps;
  return shot;
}

for (const shot of capture.sizes) compact(shot);
capture.keys = { node: SHORT, line: SHORT_LINE, glyph: SHORT_GLYPH };
const json = JSON.stringify(capture);
writeFileSync(out, json);
console.log(`\ncapture → ${out} (${(json.length / 1024).toFixed(0)} KB)`);
