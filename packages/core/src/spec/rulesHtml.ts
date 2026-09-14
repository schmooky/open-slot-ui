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
  for (const b of blocks) {
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
      case 'tabs': {
        // Radio inputs + labels: real tabs with no JavaScript, so the same markup
        // works in the game, in a docs page and in a static export.
        const name = `ohm-tabs-${att(b.id)}`;
        const labels = b.tabs
          .map((t, i) => `<input type="radio" name="${name}" id="${name}-${att(t.id)}"${i === 0 ? ' checked' : ''}><label for="${name}-${att(t.id)}">${esc(tr(t.label))}</label>`)
          .join('');
        const panels = b.tabs.map((t) => `<section class="ohm-tabpanel">${renderBlocksHtml(t.children, tr, facts)}</section>`).join('');
        out.push(`<div class="ohm-tabs" data-count="${b.tabs.length | 0}">${labels}<div class="ohm-tabpanels">${panels}</div></div>`);
        break;
      }
      case 'accordion': {
        const items = b.items
          .map((it) => `<details class="ohm-acc"${it.open ? ' open' : ''}><summary>${esc(tr(it.title))}</summary><div class="ohm-acc-body">${renderBlocksHtml(it.children, tr, facts)}</div></details>`)
          .join('');
        out.push(`<div class="ohm-accs">${items}</div>`);
        break;
      }
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
          .map((it) => `<li><span class="ohm-tl-mark">${esc(tr(it.marker ?? ''))}</span><div><b>${esc(tr(it.title))}</b>${it.text ? `<p>${rich(tr(it.text))}</p>` : ''}</div></li>`)
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
.ohm-sec { display: flex; align-items: center; gap: 14px; margin: 26px 0 14px; color: var(--text); font-weight: 800; letter-spacing: 1px; }
.ohm-sec::before, .ohm-sec::after { content: ""; flex: 1; height: 2px; background: color-mix(in srgb, var(--text) 80%, transparent); border-radius: 2px; }
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
.ohm-segmented { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface-alt); border-radius: 999px; border: 1px solid color-mix(in srgb, var(--text-dim) 30%, transparent); }
.ohm-seg { border: 0; background: transparent; color: var(--text-dim); font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 999px; cursor: pointer; transition: background .12s, color .12s; }
.ohm-seg.active { background: var(--accent); color: var(--accent-text); }
.ohm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.ohm-sym { display: flex; align-items: center; gap: 16px; padding: 6px 4px; }
.ohm-emoji { font-size: 48px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,.3)); }
.ohm-symimg { width: 56px; height: 56px; object-fit: contain; flex: none; }
.ohm-pay { font-size: 13px; line-height: 1.6; }
.ohm-pay div { display: flex; gap: 6px; }
.ohm-pay b { min-width: 42px; }
.ohm-pay span { color: var(--accent); font-weight: 700; }
.ohm-body p { color: var(--text-dim); line-height: 1.6; }
.ohm-body p b { color: var(--text); }
.ohm-feature { display: block; width: 100%; height: auto; margin: 10px 0; }
.ohm-stats { margin: 12px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
.ohm-stats > div { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 20%, transparent); }
.ohm-stats dt { color: var(--text-dim); margin: 0; } .ohm-stats dd { margin: 0; font-weight: 700; }
.ohm-audit { margin: 12px 0 18px; padding: 14px 16px; border-radius: 12px; border: 2px solid #d03131; background: color-mix(in srgb, #d03131 8%, transparent); }
.ohm-audit-title { font-weight: 900; letter-spacing: .5px; color: #b31d1d; }
.ohm-audit-sub { margin-top: 8px; font-size: 13px; font-weight: 800; color: #b31d1d; }
.ohm-audit-sub--rec { color: #b07d09; }
.ohm-audit ul { margin: 6px 0 0; padding-left: 20px; color: var(--text); font-size: 13.5px; line-height: 1.55; }
.ohm-audit li { margin: 3px 0; }
.ohm-audit-rec ul { color: var(--text-dim); }
.ohm-callout { margin: 16px 0 4px; padding: 14px 16px; border-radius: 12px; border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
.ohm-callout b { color: var(--accent); } .ohm-callout p { margin: 4px 0 0; color: var(--text); }
.ohm-callout--warning { border-left-color: #e0a106; background: color-mix(in srgb, #e0a106 10%, transparent); }
.ohm-callout--warning b { color: #b07d09; }
.ohm-subh { margin: 22px 0 8px; font-size: 15px; font-weight: 800; letter-spacing: .5px; color: var(--text); }
.ohm-legal { font-size: 12px; line-height: 1.6; color: var(--text-dim); opacity: .85; }
.ohm-hr { border: 0; border-top: 1px solid color-mix(in srgb, var(--text-dim) 30%, transparent); margin: 18px 0; }
.ohm-media { display: flex; align-items: center; gap: 18px; margin: 14px 0; }
.ohm-media--right { flex-direction: row-reverse; }
.ohm-media > img { width: 40%; max-width: 320px; height: auto; flex: none; }
.ohm-media-body { flex: 1; }
.ohm-media-body h4 { margin: 0 0 6px; font-size: 16px; color: var(--text); }
.ohm-media-body p { margin: 0; }
.ohm-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 12px 0; }
.ohm-fcard { padding: 8px 6px; text-align: center; }
.ohm-fcard img { display: block; width: 48px; height: 48px; margin: 0 auto 8px; }
.ohm-fcard h5 { margin: 0 0 4px; font-size: 14px; color: var(--text); }
.ohm-fcard p { margin: 0; font-size: 12px; line-height: 1.5; }
.ohm-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
.ohm-table th { text-align: left; padding: 8px 10px; font-weight: 800; color: var(--text); border-bottom: 2px solid color-mix(in srgb, var(--text-dim) 35%, transparent); }
.ohm-table td { padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 18%, transparent); }
.ohm-table td:first-child { color: var(--text); font-weight: 700; }
.ohm-table td:not(:first-child) { color: var(--accent); font-weight: 700; }
.ohm-steps { margin: 12px 0; padding-left: 22px; color: var(--text-dim); line-height: 1.7; }
.ohm-steps li { margin: 5px 0; }
.ohm-steps b { color: var(--text); }
.ohm-group { margin: 8px 0; }
/* ── the wider block vocabulary ─────────────────────────────────────────── */
/* The reel masks: a wrapped flow of REELS×ROWS grids, lit cell black, unlit grey —
   plain black-and-white, no outlines or rounding, as the reference draws them. */
.ohm-lines { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 14px; margin: 14px 0; justify-items: center; }
.ohm-line { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.ohm-line > span { font-size: 11px; font-weight: 700; color: var(--text-dim); }
.ohm-linegrid { display: grid; gap: 2px; width: 72px; }
.ohm-linegrid i { aspect-ratio: 1; background: #e2e5ea; }
.ohm-linegrid i.on { background: #111; }
.ohm-rgrid { margin: 14px 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ohm-rgrid .ohm-linegrid { width: min(240px, 100%); gap: 3px; }
.ohm-rgrid .ohm-linegrid i { display: grid; place-items: center; font-size: 14px; font-weight: 800; color: #fff; }
.ohm-rgrid figcaption { color: var(--text-dim); font-size: 12.5px; text-align: center; }
.ohm-symbols td, .ohm-symbols th { text-align: center; }
.ohm-symbols th[scope=row] { text-align: left; white-space: nowrap; }
.ohm-symbols .ohm-symcell { width: 1%; padding-right: 0; }
.ohm-symbols .ohm-symimg { width: 38px; height: 38px; object-fit: contain; display: block; }
.ohm-kv { margin: 12px 0; display: grid; gap: 1px; background: var(--surface-alt); border-radius: 6px; overflow: hidden; }
.ohm-kv > div { display: grid; grid-template-columns: minmax(120px, 34%) 1fr; gap: 12px; background: var(--surface); padding: 10px 14px; }
.ohm-kv dt { margin: 0; font-weight: 700; }
.ohm-kv dd { margin: 0; color: var(--text-dim); }
.ohm-meter { display: flex; align-items: center; gap: 10px; margin: 12px 0; flex-wrap: wrap; }
.ohm-meter-label { font-weight: 700; }
.ohm-meter-pips { display: inline-flex; gap: 4px; }
.ohm-meter-pips i { width: 26px; height: 10px; border-radius: 2px; background: var(--surface-alt); }
.ohm-meter-pips i.on { background: var(--accent); }
.ohm-meter-cap { color: var(--text-dim); font-size: 13px; }
.ohm-badges { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.ohm-badge { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 5px 10px; border-radius: 999px; background: var(--surface-alt); color: var(--text); }
.ohm-badge--accent { background: var(--accent); color: var(--accent-text); }
.ohm-badge--bonus { background: #17803d; color: #fff; }
.ohm-badge--warning { background: #b4410f; color: #fff; }
.ohm-tabs { margin: 16px 0; }
.ohm-tabs > input { position: absolute; opacity: 0; pointer-events: none; }
.ohm-tabs > label { display: inline-block; padding: 8px 14px; font-weight: 700; cursor: pointer; border-bottom: 3px solid transparent; color: var(--text-dim); }
.ohm-tabs > input:checked + label { color: var(--text); border-bottom-color: var(--accent); }
.ohm-tabs > input:focus-visible + label { outline: 2px solid var(--accent); outline-offset: 2px; }
.ohm-tabpanels > .ohm-tabpanel { display: none; padding-top: 8px; }
.ohm-tabs > input:nth-of-type(1):checked ~ .ohm-tabpanels > .ohm-tabpanel:nth-of-type(1),
.ohm-tabs > input:nth-of-type(2):checked ~ .ohm-tabpanels > .ohm-tabpanel:nth-of-type(2),
.ohm-tabs > input:nth-of-type(3):checked ~ .ohm-tabpanels > .ohm-tabpanel:nth-of-type(3),
.ohm-tabs > input:nth-of-type(4):checked ~ .ohm-tabpanels > .ohm-tabpanel:nth-of-type(4),
.ohm-tabs > input:nth-of-type(5):checked ~ .ohm-tabpanels > .ohm-tabpanel:nth-of-type(5),
.ohm-tabs > input:nth-of-type(6):checked ~ .ohm-tabpanels > .ohm-tabpanel:nth-of-type(6) { display: block; }
.ohm-accs { margin: 12px 0; display: grid; gap: 8px; }
.ohm-acc { border: 1px solid var(--surface-alt); border-radius: 6px; overflow: hidden; }
.ohm-acc > summary { cursor: pointer; padding: 12px 14px; font-weight: 700; background: var(--surface-alt); list-style: none; }
.ohm-acc > summary::-webkit-details-marker { display: none; }
.ohm-acc > summary::after { content: '+'; float: right; font-weight: 400; }
.ohm-acc[open] > summary::after { content: '\\2212'; }
.ohm-acc-body { padding: 4px 14px 12px; }
.ohm-cols { display: grid; gap: 18px; margin: 14px 0; grid-template-columns: 1fr; }
@media (min-width: 720px) {
  .ohm-cols--2 { grid-template-columns: repeat(2, 1fr); }
  .ohm-cols--3 { grid-template-columns: repeat(3, 1fr); }
  .ohm-cols--4 { grid-template-columns: repeat(4, 1fr); }
}
.ohm-quote { margin: 16px 0; padding: 10px 0 10px 16px; border-left: 3px solid var(--accent); }
.ohm-quote p { margin: 0; font-size: 16px; }
.ohm-quote cite { display: block; margin-top: 6px; color: var(--text-dim); font-size: 13px; font-style: normal; }
.ohm-gallery { display: grid; grid-template-columns: repeat(var(--cols, 3), 1fr); gap: 12px; margin: 14px 0; }
.ohm-gallery figure { margin: 0; }
.ohm-gallery img { width: 100%; border-radius: 6px; display: block; }
.ohm-gallery figcaption { margin-top: 6px; color: var(--text-dim); font-size: 13px; text-align: center; }
.ohm-timeline { list-style: none; margin: 14px 0; padding: 0; display: grid; gap: 14px; }
.ohm-timeline li { display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: start; }
.ohm-tl-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: var(--accent); color: var(--accent-text); font-weight: 800; font-size: 13px; }
.ohm-timeline p { margin: 4px 0 0; color: var(--text-dim); }
.ohm-compare th[scope=row] { text-align: left; }
.ohm-linkrow { margin: 10px 0; }
.ohm-link { color: var(--accent); font-weight: 700; text-decoration: none; border-bottom: 1px solid currentColor; }
.ohm-spacer { width: 100%; }
.ohm-spacer--sm { height: 8px; }
.ohm-spacer--md { height: 20px; }
.ohm-spacer--lg { height: 40px; }
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

