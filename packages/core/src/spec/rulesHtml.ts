/**
 * The ONE in-game rules/menu HTML renderer — the white-card-with-gold-accents
 * design the info menu shows in every game — as PURE string builders (zero deps,
 * no DOM required), so the SAME renderer that draws the menu in-game also powers
 * external tooling (the stakeplate rules editor's WYSIWYG preview, docs, CI
 * snapshots). `@open-slot-ui/pixi`'s `mountInfoMenu` consumes these — there is
 * exactly one source of truth for how a rules block looks.
 */
import type { BlockSpec } from './types';
import { modeStatsItems, type GameFacts, type RulesAuditIssue } from './facts';

/** Escape text for safe HTML interpolation. */
export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/**
 * Escape for an ATTRIBUTE value — quotes included.
 *
 * `escapeHtml` is for text between tags, where a quote is just a quote. In
 * `alt="…"` or `href="…"` it is the delimiter, so a string carrying one would end
 * the attribute and everything after it would be parsed as markup.
 */
export const escapeAttr = (s: string): string => escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Escape, then turn `**bold**` runs into `<b>` — the shared inline syntax. */
export const richHtml = (s: string): string => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

const esc = escapeHtml;
const att = escapeAttr;
const rich = richHtml;

/** The stat-grid `<dl>` markup shared by `stat-grid` and the auto `mode-stats` block. */
function statGridHtml(items: ReadonlyArray<{ label: string; value: string }>, tr: (s: string) => string): string {
  const rows = items.map((it) => `<div><dt>${esc(tr(it.label))}</dt><dd>${esc(tr(it.value))}</dd></div>`).join('');
  return `<dl class="ohm-stats">${rows}</dl>`;
}

/**
 * A stack of TITLED PANELS — what both `sections` and `tabs` render as.
 *
 * Never `<details>`, never a tab strip: a rules document may not hide a word of
 * itself behind a click, because content a player had to reveal is content they
 * can later say they never saw.
 */
function panelStackHtml(
  items: ReadonlyArray<{ title: string; children: BlockSpec[] }>,
  tr: (s: string) => string,
  facts?: GameFacts,
): string {
  const panels = items
    .map((it) => `<section class="ohm-panel"><h4 class="ohm-panel-title">${esc(tr(it.title))}</h4><div class="ohm-panel-body">${renderBlocksHtml(it.children, tr, facts)}</div></section>`)
    .join('');
  return `<div class="ohm-panels">${panels}</div>`;
}

type PayRow = Extract<BlockSpec, { kind: 'paytable' }>['rows'][number];

/** The Figma symbols grid: an icon (image or emoji/text) + its payout lines. */
function renderPaytable(rows: readonly PayRow[], tr: (s: string) => string): string {
  return rows
    .map((r) => {
      const icon = r.icon ? `<img class="ohm-symimg" src="${att(r.icon)}" alt="" loading="lazy">` : `<span class="ohm-emoji">${esc(tr(r.symbol ?? ''))}</span>`;
      const lines = r.payouts
        .split('\n')
        .map((line) => {
          const i = line.indexOf(':');
          return i >= 0 ? `<div><b>${esc(line.slice(0, i))}</b><span>${esc(line.slice(i + 1))}</span></div>` : `<div><span>${esc(line)}</span></div>`;
        })
        .join('');
      return `<div class="ohm-sym">${icon}<div class="ohm-pay">${lines}</div></div>`;
    })
    .join('');
}

/**
 * Render a declarative rules `BlockSpec[]` to the in-game HTML — the full modular
 * palette. `tr` is the translate function (pass a translate-and-interpolate so
 * `{{rtp.base}}`-style tokens resolve — see `factsVars`); `facts` feeds the auto
 * `mode-stats` block.
 */
export function renderBlocksHtml(blocks: BlockSpec[], tr: (s: string) => string, facts?: GameFacts): string {
  const out: string[] = [];
  // Where each section heading landed in `out`, so an EMPTY section can be dropped
  // at the end: the interactive blocks are drawn by the control layer, not here, so
  // a host whose Settings section is all controls would otherwise get a heading with
  // a blank space under it.
  const headings: number[] = [];
  for (const b of blocks) {
    if (b.kind === 'heading') headings.push(out.length);
    switch (b.kind) {
      case 'text':
        out.push(`<p>${rich(tr(b.text))}</p>`);
        break;
      case 'heading':
        out.push(`<div class="ohm-sec"><span>${esc(tr(b.text))}</span></div>`);
        break;
      case 'subheading':
        out.push(`<h4 class="ohm-subh">${esc(tr(b.text))}</h4>`);
        break;
      case 'legal':
        out.push(`<p class="ohm-legal">${rich(tr(b.text))}</p>`);
        break;
      case 'divider':
        out.push('<hr class="ohm-hr">');
        break;
      case 'image':
        out.push(`<img class="ohm-feature" alt="${att(tr(b.alt ?? ''))}" src="${att(b.src)}" loading="lazy">`);
        break;
      case 'media': {
        const img = `<img alt="${att(tr(b.alt ?? ''))}" src="${att(b.src)}" loading="lazy">`;
        const body = `<div class="ohm-media-body">${b.title ? `<h4>${esc(tr(b.title))}</h4>` : ''}<p>${rich(tr(b.text))}</p></div>`;
        out.push(`<div class="ohm-media${b.side === 'right' ? ' ohm-media--right' : ''}">${img}${body}</div>`);
        break;
      }
      case 'cards': {
        const cards = b.items
          .map((it) => `<div class="ohm-fcard">${it.icon ? `<img src="${att(it.icon)}" alt="" loading="lazy">` : ''}<h5>${esc(tr(it.title))}</h5>${it.text ? `<p>${rich(tr(it.text))}</p>` : ''}</div>`)
          .join('');
        out.push(`<div class="ohm-cards">${cards}</div>`);
        break;
      }
      case 'paytable':
        out.push(`<div class="ohm-grid">${renderPaytable(b.rows, tr)}</div>`);
        break;
      case 'paylines': {
        const masks = b.lines.map((line, i) => {
          const cells: string[] = [];
          for (let row = 0; row < b.rows; row++) for (let reel = 0; reel < b.reels; reel++) cells.push(`<i class="${line[reel] === row ? 'on' : ''}"></i>`);
          return `<div class="ohm-line"><div class="ohm-linegrid" style="grid-template-columns:repeat(${b.reels},1fr)">${cells.join('')}</div><span>${i + 1}</span></div>`;
        }).join('');
        out.push(`<div class="ohm-lines">${masks}</div>`);
        break;
      }
      case 'table': {
        const head = b.columns?.length ? `<thead><tr>${b.columns.map((c) => `<th>${esc(tr(c))}</th>`).join('')}</tr></thead>` : '';
        const body = b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(tr(c))}</td>`).join('')}</tr>`).join('');
        out.push(`<table class="ohm-table">${head}<tbody>${body}</tbody></table>`);
        break;
      }
      case 'stat-grid':
        out.push(statGridHtml(b.items, tr));
        break;
      // The AUTO per-mode RTP / Max-win grid — rendered straight from the declared
      // game facts (+ any host extras), so the table can never drift from the config.
      // `modeStatsItems` localizes the label PARTS itself ("Max win" · the mode name),
      // so the grid renderer gets identity-tr — no double translation.
      case 'mode-stats': {
        const extras = (b.extras ?? []).map((e) => ({ label: tr(e.label), value: tr(e.value) }));
        out.push(statGridHtml([...modeStatsItems(facts, tr), ...extras], (s) => s));
        break;
      }
      case 'steps': {
        const items = b.items.map((s) => `<li>${rich(tr(s))}</li>`).join('');
        out.push(b.ordered ? `<ol class="ohm-steps">${items}</ol>` : `<ul class="ohm-steps">${items}</ul>`);
        break;
      }
      case 'callout':
        out.push(`<div class="ohm-callout ohm-callout--${b.tone ?? 'info'}">${b.title ? `<b>${esc(tr(b.title))}</b>` : ''}<p>${rich(tr(b.text))}</p></div>`);
        break;
      case 'group':
        out.push(`<div class="ohm-group">${b.title ? `<h4 class="ohm-subh">${esc(tr(b.title))}</h4>` : ''}${renderBlocksHtml(b.children, tr, facts)}</div>`);
        break;

      // ── the wider vocabulary ──────────────────────────────────────────────
      case 'grid': {
        const lit = new Set(b.cells.map(([reel, row]) => `${reel},${row}`));
        const cells: string[] = [];
        for (let row = 0; row < b.rows; row++) {
          for (let reel = 0; reel < b.reels; reel++) {
            const on = lit.has(`${reel},${row}`);
            cells.push(`<i class="${on ? 'on' : ''}">${on && b.symbol ? esc(tr(b.symbol)) : ''}</i>`);
          }
        }
        out.push(
          `<figure class="ohm-rgrid"><div class="ohm-linegrid" style="grid-template-columns:repeat(${b.reels},1fr)">${cells.join('')}</div>${b.label ? `<figcaption>${esc(tr(b.label))}</figcaption>` : ''}</figure>`,
        );
        break;
      }
      case 'symbols': {
        const head = b.counts?.length
          ? `<thead><tr><th></th><th></th>${b.counts.map((c) => `<th>${esc(tr(c))}</th>`).join('')}</tr></thead>`
          : '';
        const body = b.rows
          .map((r) => {
            const icon = r.icon
              ? `<img class="ohm-symimg" src="${att(r.icon)}" alt="" loading="lazy">`
              : `<span class="ohm-emoji">${esc(tr(r.symbol ?? ''))}</span>`;
            const pays = r.pays.map((v) => `<td>${esc(tr(v))}</td>`).join('');
            return `<tr><td class="ohm-symcell">${icon}</td><th scope="row">${esc(tr(r.name ?? ''))}</th>${pays}</tr>`;
          })
          .join('');
        out.push(`<table class="ohm-table ohm-symbols">${head}<tbody>${body}</tbody></table>`);
        break;
      }
      case 'kv': {
        const rows = b.items.map((it) => `<div><dt>${esc(tr(it.term))}</dt><dd>${rich(tr(it.text))}</dd></div>`).join('');
        out.push(`<dl class="ohm-kv">${rows}</dl>`);
        break;
      }
      case 'meter': {
        const max = Math.max(1, b.max ?? 5);
        const value = Math.max(0, Math.min(max, b.value));
        const pips = Array.from({ length: max }, (_, i) => `<i class="${i < value ? 'on' : ''}"></i>`).join('');
        out.push(
          `<div class="ohm-meter">${b.label ? `<span class="ohm-meter-label">${esc(tr(b.label))}</span>` : ''}<span class="ohm-meter-pips" role="img" aria-label="${value} / ${max}">${pips}</span>${b.caption ? `<span class="ohm-meter-cap">${esc(tr(b.caption))}</span>` : ''}</div>`,
        );
        break;
      }
      case 'badges':
        out.push(
          `<div class="ohm-badges">${b.items.map((it) => `<span class="ohm-badge${it.tone && it.tone !== 'neutral' ? ` ohm-badge--${it.tone}` : ''}">${esc(tr(it.text))}</span>`).join('')}</div>`,
        );
        break;
      // `tabs` and `sections` render the same way on purpose: an open stack of
      // titled panels. See the `tabs` block in types.ts — nothing in a rules
      // document may sit behind a click.
      case 'tabs':
        out.push(panelStackHtml(b.tabs.map((t) => ({ title: t.label, children: t.children })), tr, facts));
        break;
      case 'sections':
        out.push(panelStackHtml(b.items, tr, facts));
        break;
      case 'columns':
        out.push(
          `<div class="ohm-cols ohm-cols--${b.of ?? b.children.length}">${b.children.map((col) => `<div>${renderBlocksHtml(col, tr, facts)}</div>`).join('')}</div>`,
        );
        break;
      case 'quote':
        out.push(`<blockquote class="ohm-quote"><p>${rich(tr(b.text))}</p>${b.cite ? `<cite>${esc(tr(b.cite))}</cite>` : ''}</blockquote>`);
        break;
      case 'gallery': {
        const figs = b.items
          .map((it) => `<figure><img src="${att(it.src)}" alt="${att(tr(it.alt ?? ''))}" loading="lazy">${it.caption ? `<figcaption>${esc(tr(it.caption))}</figcaption>` : ''}</figure>`)
          .join('');
        out.push(`<div class="ohm-gallery" style="--cols:${Math.max(1, Math.min(6, Math.round(Number(b.columns) || Math.min(3, b.items.length) || 1)))}">${figs}</div>`);
        break;
      }
      case 'timeline': {
        const items = b.items
          // No marker? The step's number — an empty circle says nothing.
          .map((it, i) => `<li><span class="ohm-tl-mark">${esc(tr(it.marker ?? String(i + 1)))}</span><div><b>${esc(tr(it.title))}</b>${it.text ? `<p>${rich(tr(it.text))}</p>` : ''}</div></li>`)
          .join('');
        out.push(`<ol class="ohm-timeline">${items}</ol>`);
        break;
      }
      case 'compare': {
        const head = `<thead><tr><th></th><th>${esc(tr(b.columns[0]))}</th><th>${esc(tr(b.columns[1]))}</th></tr></thead>`;
        const body = b.rows.map((r) => `<tr><th scope="row">${esc(tr(r.label))}</th><td>${esc(tr(r.a))}</td><td>${esc(tr(r.b))}</td></tr>`).join('');
        out.push(`<table class="ohm-table ohm-compare">${head}<tbody>${body}</tbody></table>`);
        break;
      }
      case 'link': {
        // A link in the rules leads OUT of the game, so it opens in its own tab
        // unless the author says otherwise — and never with window access back.
        const ext = b.external !== false;
        out.push(
          `<p class="ohm-linkrow"><a class="ohm-link" href="${att(b.href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(tr(b.text))}${ext ? '<span aria-hidden="true"> ↗</span>' : ''}</a></p>`,
        );
        break;
      }
      case 'spacer':
        out.push(`<div class="ohm-spacer ohm-spacer--${b.size ?? 'md'}"></div>`);
        break;
      default:
        break; // interactive kinds render in the Settings section, not the rules body
    }
  }
  for (let i = headings.length - 1; i >= 0; i--) {
    const at = headings[i] as number;
    const nextHeading = i + 1 < headings.length ? (headings[i + 1] as number) : out.length;
    if (nextHeading - at <= 1) out.splice(at, 1); // nothing between this heading and the next
  }
  return out.join('\n');
}

/**
 * The "⚠ Rules incomplete" warning card the info menu shows at the top of Rules
 * when the audit finds forgotten declarations. `tr` localizes the chrome strings
 * (`openui.rulesAudit.*`) + the finding messages. Empty issues → ''.
 */
export function renderRulesAuditHtml(issues: RulesAuditIssue[], tr: (s: string) => string): string {
  if (!issues.length) return '';
  const req = issues.filter((i) => i.level === 'required');
  const rec = issues.filter((i) => i.level === 'recommended');
  const list = (items: RulesAuditIssue[]): string => `<ul>${items.map((i) => `<li>${esc(tr(i.message))}</li>`).join('')}</ul>`;
  return `<div class="ohm-audit" role="alert">
      <div class="ohm-audit-title">⚠ ${esc(tr('openui.rulesAudit.title'))}</div>
      ${req.length ? `<div class="ohm-audit-sub">${esc(tr('openui.rulesAudit.required'))}</div>${list(req)}` : ''}
      ${rec.length ? `<div class="ohm-audit-sub ohm-audit-sub--rec">${esc(tr('openui.rulesAudit.recommended'))}</div><div class="ohm-audit-rec">${list(rec)}</div>` : ''}
    </div>`;
}

/**
 * The in-game info-menu stylesheet (the white card + gold accents design). One
 * copy, used by `mountInfoMenu` AND any external preview. Expects the CSS custom
 * properties `--accent --accent-text --surface --surface-alt --text --text-dim
 * --card-radius --font` on the `.ohm-root` (see {@link INFO_MENU_VARS}).
 */
export const INFO_MENU_VARS: Readonly<Record<string, string>> = Object.freeze({
  '--accent': '#d99000',
  '--accent-text': '#1a1200',
  '--surface': '#ffffff',
  '--surface-alt': '#eef1f6',
  '--text': '#181b20',
  '--text-dim': '#5b6472',
  '--card-radius': '8px',
  '--font': 'system-ui, sans-serif',
});

/**
 * The BLOCK VOCABULARY's stylesheet — every `.ohm-*` class `renderBlocksHtml`
 * emits, and nothing else.
 *
 * It is deliberately separate from the modal chrome below: the canvas menu draws
 * its own window and wants both, while a DOM host already HAS a window (its own
 * skin's) and wants only the blocks inside it. Colours come from the six custom
 * properties in {@link INFO_MENU_VARS}, so a host restyles the whole vocabulary
 * by setting those on its container.
 */
export const BLOCK_CSS = `
/* ── the rhythm every block shares ──────────────────────────────────────────
   Colour comes from the host (the six properties in INFO_MENU_VARS); spacing is
   the vocabulary's own, declared once here so a page of blocks reads as one
   document instead of a pile of widgets. Every rule below falls back to a literal
   value, so a block still looks right rendered outside the menu container. */
/* The blocks size themselves against THEIR container, not the viewport: the info
   window is a card inside the game, often half the screen wide, so a viewport media
   query would put three columns in a 400px window. */
.ohm-body { container-type: inline-size; container-name: ohm; }
.ohm-body, .ohm-root {
  --ohm-gap: 18px;      /* between two blocks */
  --ohm-gap-sm: 10px;   /* heading to the thing it introduces */
  --ohm-gap-lg: 34px;   /* air before a new section */
  --ohm-pad: 16px;      /* inside a box */
  /* The reference's info screen is drawn in flat rectangles — bordered cells, a
     dark fill, square corners. Rounded cards and pill-shaped chips read as a
     different product bolted into the window, so the radius here is a hairline. */
  --ohm-radius: 2px;
  --ohm-rule: color-mix(in srgb, var(--text-dim) 30%, transparent);
  /* A tint of the INK, not a fixed black or white: it darkens a light card and
     lightens a dark one, so a cell reads the same in either theme. */
  --ohm-fill: color-mix(in srgb, var(--text-dim) 10%, transparent);
}
/* No block carries its top margin at the top of a container, or its bottom margin
   at the bottom — the container's own padding is the edge. */
.ohm-body > :first-child, .ohm-panel-body > :first-child,
.ohm-group > :first-child, .ohm-cols > div > :first-child { margin-top: 0; }
.ohm-body > :last-child, .ohm-panel-body > :last-child,
.ohm-group > :last-child, .ohm-cols > div > :last-child { margin-bottom: 0; }

/* ── prose ─────────────────────────────────────────────────────────────────── */
.ohm-body p { margin: 0 0 var(--ohm-gap, 18px); padding: 0; color: var(--text-dim); font-size: 14.5px; line-height: 1.7; }
.ohm-body p b { color: var(--text); font-weight: 700; }
.ohm-sec { display: flex; align-items: center; gap: 14px; margin: var(--ohm-gap-lg, 34px) 0 var(--ohm-gap, 18px); color: var(--text); font-size: 15px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
.ohm-sec::before, .ohm-sec::after { content: ""; flex: 1; height: 2px; background: color-mix(in srgb, var(--text) 75%, transparent); border-radius: 2px; }
.ohm-subh { margin: var(--ohm-gap-lg, 34px) 0 var(--ohm-gap-sm, 10px); font-size: 14px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: var(--text); }
.ohm-sec + .ohm-subh { margin-top: 0; }
.ohm-legal { margin: var(--ohm-gap, 18px) 0 0; font-size: 12px; line-height: 1.65; color: var(--text-dim); opacity: .8; }
.ohm-hr { border: 0; border-top: 1px solid var(--ohm-rule); margin: var(--ohm-gap-lg, 34px) 0; }
.ohm-group { margin: 0 0 var(--ohm-gap, 18px); }
.ohm-quote { margin: var(--ohm-gap, 18px) 0; padding: 2px 0 2px var(--ohm-pad, 16px); border-left: 3px solid var(--accent); }
.ohm-quote p { margin: 0; color: var(--text); font-size: 15px; line-height: 1.6; }
.ohm-quote cite { display: block; margin-top: 8px; color: var(--text-dim); font-size: 12.5px; font-style: normal; }
.ohm-linkrow { margin: var(--ohm-gap, 18px) 0; }
.ohm-link { color: var(--accent); font-weight: 700; font-size: 14px; text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); padding-bottom: 1px; }
.ohm-link:hover { border-bottom-color: currentColor; }
.ohm-spacer { width: 100%; }
.ohm-spacer--sm { height: 8px; }
.ohm-spacer--md { height: 20px; }
.ohm-spacer--lg { height: 40px; }

/* ── lists ─────────────────────────────────────────────────────────────────── */
.ohm-steps { margin: 0 0 var(--ohm-gap, 18px); padding-left: 20px; list-style-position: outside; color: var(--text-dim); font-size: 14.5px; line-height: 1.7; }
.ohm-steps li { margin: 7px 0; padding-left: 2px; }
.ohm-steps li::marker { color: var(--accent); font-weight: 700; }
.ohm-steps b { color: var(--text); }

/* ── boxes ─────────────────────────────────────────────────────────────────── */
/* A callout is the same bordered cell the reference uses everywhere, with a small
   uppercase tag for its title — not a rounded, tinted speech bubble. The tone is
   carried by the tag and the top edge, so a page of them still reads as one page. */
.ohm-callout { margin: var(--ohm-gap, 18px) 0; padding: 13px var(--ohm-pad, 16px); border: 1px solid var(--ohm-rule); border-top: 2px solid var(--accent); background: var(--ohm-fill); }
.ohm-callout b { display: block; margin-bottom: 5px; color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.ohm-callout p { margin: 0; color: var(--text); }
.ohm-callout--info { border-top-color: var(--accent); }
.ohm-callout--warning { border-top-color: #e0a106; }
.ohm-callout--warning b { color: #e0a106; }
.ohm-callout--bonus { border-top-color: #2ea44f; }
.ohm-callout--bonus b { color: #45c46a; }
.ohm-audit { margin: 0 0 var(--ohm-gap-lg, 34px); padding: 16px 18px; border: 1px solid #d03131; border-top: 3px solid #d03131; background: color-mix(in srgb, #d03131 12%, transparent); }
.ohm-audit-title { font-weight: 900; letter-spacing: .5px; color: #ff6b6b; }
.ohm-audit-sub { margin-top: 10px; font-size: 13px; font-weight: 800; letter-spacing: .3px; color: #ff6b6b; }
.ohm-audit-sub--rec { color: #e0a106; }
.ohm-audit ul { margin: 6px 0 0; padding-left: 20px; color: var(--text); font-size: 13.5px; line-height: 1.6; }
.ohm-audit li { margin: 4px 0; }
.ohm-audit-rec ul { color: var(--text-dim); }

/* ── settings rows (the interactive blocks, rendered by the canvas overlay) ── */
.ohm-row { display: flex; align-items: center; gap: 16px; margin: 14px 0; font-weight: 700; }
.ohm-setting { margin: 14px 0; }
.ohm-setting .ohm-row { margin: 0; }
.ohm-hint { margin: 3px 0 0; font-size: 12.5px; font-weight: 500; color: var(--text-dim); }
.ohm-row > span:first-child { flex: none; min-width: 110px; }
.ohm-row input[type=range] { flex: 1; min-width: 0; max-width: min(440px, 60dvw); accent-color: var(--accent); height: 6px; }
.ohm-row select { flex: 1; min-width: 0; max-width: min(440px, 60dvw); padding: 11px 14px; border-radius: 4px; border: 2px solid var(--accent); background: var(--surface-alt); color: var(--text); font-weight: 700; font-size: 15px; cursor: pointer; }
.ohm-row select option { background: var(--surface); color: var(--text); font-weight: 600; }
.ohm-row select option:checked { background: var(--accent); color: var(--accent-text); }
.ohm-ctl { flex: 1; min-width: 0; max-width: min(440px, 60dvw); display: flex; align-items: center; justify-content: flex-end; }
.ohm-check input[type=checkbox] { appearance: none; -webkit-appearance: none; width: 50px; height: 28px; border-radius: 999px; background: color-mix(in srgb, var(--text-dim) 38%, transparent); position: relative; cursor: pointer; transition: background .15s; flex: none; }
.ohm-check input[type=checkbox]:checked { background: var(--accent); }
.ohm-check input[type=checkbox]::before { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 999px; background: #fff; transition: left .15s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.ohm-check input[type=checkbox]:checked::before { left: 25px; }
.ohm-segmented { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface-alt); border-radius: 999px; border: 1px solid var(--ohm-rule); }
.ohm-seg { border: 0; background: transparent; color: var(--text-dim); font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 999px; cursor: pointer; transition: background .12s, color .12s; }
.ohm-seg.active { background: var(--accent); color: var(--accent-text); }

/* ── the paytable grid ─────────────────────────────────────────────────────── */
.ohm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px 20px; margin: 0 0 var(--ohm-gap, 18px); }
.ohm-sym { display: flex; align-items: center; gap: 14px; padding: 8px 0; }
.ohm-emoji { font-size: 42px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,.3)); }
.ohm-symimg { width: 52px; height: 52px; object-fit: contain; flex: none; }
.ohm-pay { font-size: 13px; line-height: 1.65; }
.ohm-pay div { display: flex; gap: 8px; }
.ohm-pay b { min-width: 42px; color: var(--text); }
.ohm-pay span { color: var(--accent); font-weight: 700; }

/* ── pictures ──────────────────────────────────────────────────────────────── */
.ohm-feature { display: block; width: 100%; height: auto; margin: var(--ohm-gap, 18px) 0; }
.ohm-media { display: flex; align-items: flex-start; gap: 20px; margin: var(--ohm-gap, 18px) 0; }
.ohm-media--right { flex-direction: row-reverse; }
.ohm-media > img { width: 38%; max-width: 300px; height: auto; flex: none; }
.ohm-media-body { flex: 1; min-width: 0; }
.ohm-media-body h4 { margin: 0 0 8px; font-size: 15px; font-weight: 800; letter-spacing: .3px; color: var(--text); }
.ohm-media-body p { margin: 0; }
@container ohm (max-width: 560px) {
  .ohm-media, .ohm-media--right { flex-direction: column; gap: 12px; }
  .ohm-media > img { width: 100%; max-width: none; }
}
.ohm-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 0 0 var(--ohm-gap, 18px); }
.ohm-fcard { padding: 16px 12px; text-align: center; border: 1px solid var(--ohm-rule); background: var(--ohm-fill); }
.ohm-fcard img { display: block; width: 46px; height: 46px; margin: 0 auto 10px; }
.ohm-fcard h5 { margin: 0 0 6px; font-size: 13.5px; font-weight: 800; letter-spacing: .3px; color: var(--text); }
.ohm-fcard p { margin: 0; font-size: 12.5px; line-height: 1.55; }
.ohm-gallery { display: grid; grid-template-columns: repeat(var(--cols, 3), 1fr); gap: 14px; margin: var(--ohm-gap, 18px) 0; }
.ohm-gallery figure { margin: 0; }
.ohm-gallery img { width: 100%; display: block; }
.ohm-gallery figcaption { margin-top: 8px; color: var(--text-dim); font-size: 12.5px; text-align: center; }
@container ohm (max-width: 560px) { .ohm-gallery { grid-template-columns: repeat(2, 1fr); gap: 10px; } }

/* ── tables ────────────────────────────────────────────────────────────────── */
.ohm-table { width: 100%; border-collapse: collapse; margin: 0 0 var(--ohm-gap, 18px); font-size: 14px; }
.ohm-table th { text-align: left; padding: 10px 12px; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--text-dim); border-bottom: 1px solid var(--ohm-rule); }
.ohm-table td { padding: 11px 12px; border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 14%, transparent); }
.ohm-table tbody tr:last-child td { border-bottom: 0; }
.ohm-table td:first-child { color: var(--text); font-weight: 700; }
.ohm-table td:not(:first-child) { color: var(--accent); font-weight: 700; }
.ohm-symbols td, .ohm-symbols th { text-align: center; }
.ohm-symbols th[scope=row] { text-align: left; white-space: nowrap; font-size: 13.5px; font-weight: 700; letter-spacing: 0; text-transform: none; color: var(--text); border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 14%, transparent); }
.ohm-symbols tbody tr:last-child th[scope=row] { border-bottom: 0; }
.ohm-symbols .ohm-symcell { width: 1%; padding: 8px 4px 8px 0; }
.ohm-symbols .ohm-symimg { width: 36px; height: 36px; object-fit: contain; display: block; }
.ohm-compare th[scope=row] { text-align: left; font-size: 13.5px; font-weight: 700; letter-spacing: 0; text-transform: none; color: var(--text); border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 14%, transparent); }
.ohm-compare thead th:first-child { width: 32%; }
.ohm-stats { margin: 0 0 var(--ohm-gap, 18px); display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
.ohm-stats > div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 16%, transparent); }
.ohm-stats dt { margin: 0; color: var(--text-dim); font-size: 13.5px; }
.ohm-stats dd { margin: 0; font-weight: 700; font-size: 13.5px; color: var(--text); }
@container ohm (max-width: 560px) { .ohm-stats { grid-template-columns: 1fr; } }
/* Tinted with the vocabulary's own fill and divided by rules — NOT with the host's
   --surface, which a skin is free to define as a light panel colour, and a pale
   slab in the middle of a dark rules page looks like a bug. */
.ohm-kv { margin: 0 0 var(--ohm-gap, 18px); display: grid; background: var(--ohm-fill); border: 1px solid var(--ohm-rule); }
.ohm-kv > div { display: grid; grid-template-columns: minmax(110px, 30%) 1fr; gap: 16px; padding: 13px var(--ohm-pad, 16px); border-bottom: 1px solid var(--ohm-rule); }
.ohm-kv > div:last-child { border-bottom: 0; }
.ohm-kv dt { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--text); }
.ohm-kv dd { margin: 0; font-size: 13.5px; line-height: 1.6; color: var(--text-dim); }
@container ohm (max-width: 560px) { .ohm-kv > div { grid-template-columns: 1fr; gap: 4px; } }

/* ── at a glance ───────────────────────────────────────────────────────────── */
.ohm-badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 var(--ohm-gap, 18px); }
.ohm-badge { display: inline-flex; align-items: center; height: 28px; padding: 0 11px; border: 1px solid var(--ohm-rule); background: var(--ohm-fill); color: var(--text); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.ohm-badge--accent { border-color: color-mix(in srgb, var(--accent) 60%, transparent); color: var(--accent); }
.ohm-badge--bonus { border-color: color-mix(in srgb, #2ea44f 60%, transparent); color: #45c46a; }
.ohm-badge--warning { border-color: color-mix(in srgb, #e0a106 60%, transparent); color: #e0a106; }
.ohm-meter { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 var(--ohm-gap, 18px); }
.ohm-meter-label { font-size: 13px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--text); }
.ohm-meter-pips { display: inline-flex; gap: 5px; align-self: center; }
.ohm-meter-pips i { width: 24px; height: 9px; background: color-mix(in srgb, var(--text-dim) 25%, transparent); }
.ohm-meter-pips i.on { background: var(--accent); }
.ohm-meter-cap { flex-basis: 100%; margin: 0; color: var(--text-dim); font-size: 13px; }
.ohm-timeline { list-style: none; margin: 0 0 var(--ohm-gap, 18px); padding: 0; display: grid; gap: 16px; }
.ohm-timeline > li { list-style: none; }
.ohm-timeline li { display: grid; grid-template-columns: 28px 1fr; gap: 14px; align-items: start; }
.ohm-tl-mark { display: grid; place-items: center; width: 28px; height: 28px; background: var(--accent); color: var(--accent-text); font-weight: 800; font-size: 12.5px; }
.ohm-timeline b { display: block; padding-top: 4px; font-size: 14px; color: var(--text); }
.ohm-timeline p { margin: 5px 0 0; font-size: 13.5px; line-height: 1.6; color: var(--text-dim); }

/* ── the reel masks ────────────────────────────────────────────────────────── */
/* Lit cell black, unlit grey — plain black-and-white, no outlines or rounding,
   as the reference draws them. */
.ohm-lines { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 16px 12px; margin: 0 0 var(--ohm-gap, 18px); justify-items: center; }
.ohm-line { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ohm-line > span { font-size: 11px; font-weight: 700; color: var(--text-dim); }
.ohm-linegrid { display: grid; gap: 2px; width: 62px; }
.ohm-linegrid i { aspect-ratio: 1; background: #e2e5ea; }
.ohm-linegrid i.on { background: #111; }
.ohm-rgrid { margin: 0 0 var(--ohm-gap, 18px); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.ohm-rgrid .ohm-linegrid { width: min(170px, 100%); gap: 3px; }
.ohm-rgrid .ohm-linegrid i { display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #fff; }
.ohm-rgrid figcaption { color: var(--text-dim); font-size: 12.5px; line-height: 1.5; text-align: center; }

/* ── containers ────────────────────────────────────────────────────────────── */
/* Titled panels, all of them open — nothing in a rules document is ever hidden
   behind a click (see the 'sections' block). */
.ohm-panels { margin: 0 0 var(--ohm-gap, 18px); display: grid; gap: 10px; }
.ohm-panel { border: 1px solid var(--ohm-rule); }
.ohm-panel-title { margin: 0; padding: 11px var(--ohm-pad, 16px); font-size: 13px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--text); background: var(--ohm-fill); border-bottom: 1px solid var(--ohm-rule); }
.ohm-panel-body { padding: var(--ohm-pad, 16px); }
.ohm-cols { display: grid; gap: 20px; margin: 0 0 var(--ohm-gap, 18px); grid-template-columns: 1fr; }
@container ohm (min-width: 560px) {
  .ohm-cols--2 { grid-template-columns: repeat(2, 1fr); }
  .ohm-cols--3 { grid-template-columns: repeat(3, 1fr); }
}
@container ohm (min-width: 760px) {
  .ohm-cols--4 { grid-template-columns: repeat(4, 1fr); }
}

`;

/** The info-menu MODAL chrome (backdrop, card, close button, scrollbar) — plus the
 *  block vocabulary itself, so the canvas menu injects one stylesheet. */
export const INFO_MENU_CSS = `
.ohm-root { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; font-family: var(--font); opacity: 0; pointer-events: none; transition: opacity .18s ease; }
.ohm-root.open { opacity: 1; pointer-events: auto; }
.ohm-backdrop { position: absolute; inset: 0; background: rgba(8,6,4,0); backdrop-filter: blur(0px) saturate(1); -webkit-backdrop-filter: blur(0px) saturate(1); transition: background .4s ease, backdrop-filter .4s ease, -webkit-backdrop-filter .4s ease; }
.ohm-root.open .ohm-backdrop { background: rgba(8,6,4,.34); backdrop-filter: blur(6px) saturate(1.1); -webkit-backdrop-filter: blur(6px) saturate(1.1); }
.ohm-card { position: relative; width: min(92%, 1100px); max-height: 86vh; display: flex; flex-direction: column; background: var(--surface); color: var(--text); border: 1.5px solid #000; border-radius: var(--card-radius); box-shadow: 0 30px 80px rgba(0,0,0,.5); overflow: hidden; transform: translateY(8px) scale(.99); transition: transform .18s ease; }
.ohm-root.open .ohm-card { transform: none; }
.ohm-x { position: absolute; top: 18px; right: 22px; width: 46px; height: 46px; border-radius: 999px; border: 0; background: rgba(18,14,10,.82); color: #fff; font-size: 18px; cursor: pointer; display: grid; place-items: center; box-shadow: 0 6px 18px rgba(0,0,0,.45); z-index: 2; transition: transform .12s, background .12s; }
.ohm-x:hover { transform: scale(1.08); background: rgba(18,14,10,.95); }
.ohm-body { padding: 24px 26px 26px; overflow-y: scroll; }
.ohm-body::-webkit-scrollbar { width: 18px; }
.ohm-body::-webkit-scrollbar-track { background: transparent; margin: 12px 0; }
.ohm-body::-webkit-scrollbar-thumb { background-color: #111; border: 6px solid transparent; background-clip: padding-box; border-radius: 999px; min-height: 44px; }
.ohm-body::-webkit-scrollbar-thumb:hover { background-color: #000; }
.ohm-logo { display: block; margin: 6px auto 18px; max-width: 64%; height: auto; }
.ohm-logo-text { margin: 6px 0 18px; text-align: center; font-size: 30px; font-weight: 900; letter-spacing: 1px; color: var(--text); }
.ohm-root *, .ohm-root *::before, .ohm-root *::after { box-sizing: border-box; }
` + BLOCK_CSS;

