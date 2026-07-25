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
/** Escape, then turn `**bold**` runs into `<b>` — the shared inline syntax. */
export const richHtml = (s: string): string => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

const esc = escapeHtml;
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
      const icon = r.icon ? `<img class="ohm-symimg" src="${r.icon}" alt="" loading="lazy">` : `<span class="ohm-emoji">${esc(tr(r.symbol ?? ''))}</span>`;
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
        out.push(`<img class="ohm-feature" alt="${esc(tr(b.alt ?? ''))}" src="${b.src}" loading="lazy">`);
        break;
      case 'media': {
        const img = `<img alt="${esc(tr(b.alt ?? ''))}" src="${b.src}" loading="lazy">`;
        const body = `<div class="ohm-media-body">${b.title ? `<h4>${esc(tr(b.title))}</h4>` : ''}<p>${rich(tr(b.text))}</p></div>`;
        out.push(`<div class="ohm-media ohm-media--${b.side ?? 'left'}">${img}${body}</div>`);
        break;
      }
      case 'cards': {
        const cards = b.items
          .map((it) => `<div class="ohm-fcard">${it.icon ? `<img src="${it.icon}" alt="" loading="lazy">` : ''}<h5>${esc(tr(it.title))}</h5>${it.text ? `<p>${rich(tr(it.text))}</p>` : ''}</div>`)
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
.ohm-sec { display: flex; align-items: center; gap: 14px; margin: 26px 0 14px; color: var(--text); font-weight: 800; letter-spacing: 1px; }
.ohm-sec::before, .ohm-sec::after { content: ""; flex: 1; height: 2px; background: color-mix(in srgb, var(--text) 80%, transparent); border-radius: 2px; }
.ohm-root *, .ohm-root *::before, .ohm-root *::after { box-sizing: border-box; }
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
`;
