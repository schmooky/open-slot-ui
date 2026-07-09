// The info menu (☰ → Settings · Paytable · Rules) as the library's ONE polished design:
// a white card with gold accents + section rules, driven ENTIRELY by the `UISpec.menu`
// (banner · settings · paytable · rules) and wired to the live `OpenUI` state. It renders
// the full modular BlockSpec palette, is fully localized (every string flows through
// `ui.t`, re-translates on locale change), and is a DOM overlay over the canvas (works in
// every browser + the Stake iframe). `mountHud` mounts it by default; pass `menu:false` to
// supply your own instead. The look matches the Open-UI Figma reference.

import type { Application } from 'pixi.js';
import { LOCALE_LABELS, type BlockSpec, type MenuSpec, type OpenUI } from '@open-slot-ui/core';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Escape, then turn `**bold**` runs into `<b>` — the same inline syntax the Pixi renderer uses. */
const rich = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

/** Render a declarative rules `BlockSpec[]` to HTML — the full modular palette. */
function renderBlocks(blocks: BlockSpec[], tr: (s: string) => string): string {
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
      case 'table': {
        const head = b.columns?.length ? `<thead><tr>${b.columns.map((c) => `<th>${esc(tr(c))}</th>`).join('')}</tr></thead>` : '';
        const body = b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(tr(c))}</td>`).join('')}</tr>`).join('');
        out.push(`<table class="ohm-table">${head}<tbody>${body}</tbody></table>`);
        break;
      }
      case 'stat-grid': {
        const rows = b.items.map((it) => `<div><dt>${esc(tr(it.label))}</dt><dd>${esc(tr(it.value))}</dd></div>`).join('');
        out.push(`<dl class="ohm-stats">${rows}</dl>`);
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
        out.push(`<div class="ohm-group">${b.title ? `<h4 class="ohm-subh">${esc(tr(b.title))}</h4>` : ''}${renderBlocks(b.children, tr)}</div>`);
        break;
      default:
        break; // interactive kinds render in the Settings section, not the rules body
    }
  }
  return out.join('\n');
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

/** Render the game's extra settings blocks (label-left / control-right, with a hint). */
function renderSettingBlock(b: BlockSpec, tr: (s: string) => string): string {
  const hint = 'hint' in b && b.hint ? `<div class="ohm-hint">${esc(tr(b.hint))}</div>` : '';
  const label = 'label' in b && b.label ? esc(tr(b.label)) : '';
  switch (b.kind) {
    case 'toggle':
      return `<div class="ohm-setting"><label class="ohm-row ohm-check"><span>${label}</span><span class="ohm-ctl"><input data-set="${b.id}" type="checkbox"${b.on ? ' checked' : ''}></span></label>${hint}</div>`;
    case 'slider':
      return `<div class="ohm-setting"><label class="ohm-row"><span>${label}</span><input data-set="${b.id}" type="range" min="0" max="1" step="0.01" value="${b.initial ?? 1}"></label>${hint}</div>`;
    case 'select': {
      const opts = b.options.map((o, i) => `<option value="${esc(o.value)}"${i === (b.index ?? 0) ? ' selected' : ''}>${esc(tr(o.label))}</option>`).join('');
      return `<div class="ohm-setting"><label class="ohm-row"><span>${label}</span><select data-set="${b.id}">${opts}</select></label>${hint}</div>`;
    }
    default:
      return '';
  }
}

/**
 * Mount the info menu overlay for a booted `OpenUI`. Reads `ui.spec.menu`; opens/closes with
 * `ui.settingsPanel` (the canvas ☰ drives it). Returns a leak-free teardown.
 */
export function mountInfoMenu(app: Application, ui: OpenUI): () => void {
  const menu: MenuSpec = ui.spec?.menu ?? {};
  const tr = (k: string): string => ui.t(k);
  const disposers: Array<() => void> = [];

  const host = document.createElement('div');
  host.className = 'ohm-root';
  const vars: Record<string, string> = {
    '--accent': '#d99000', '--accent-text': '#1a1200',
    '--surface': '#ffffff', '--surface-alt': '#eef1f6',
    '--text': '#181b20', '--text-dim': '#5b6472',
    '--card-radius': '8px', '--font': ui.theme.type.family,
  };
  for (const [k, v] of Object.entries(vars)) host.style.setProperty(k, v);

  // Built-in settings: Sound · Language (2+ locales) · Quick spin (turbo). Plus any custom
  // `menu.settings` the game supplied — all label-left / control-right, each with a hint.
  const locales = ui.spec?.locale ? Array.from(new Set([ui.spec.locale.locale, ...Object.keys(ui.spec.locale.messages)])) : [];
  const langRow = locales.length > 1
    ? `<div class="ohm-setting"><label class="ohm-row"><span>${tr('Language')}</span><select id="ohm-lang">${locales.map((c) => `<option value="${c}"${c === ui.locale.get() ? ' selected' : ''}>${esc(LOCALE_LABELS[c] ?? c)}</option>`).join('')}</select></label></div>`
    : '';
  const turbo = ui.turbo;
  const cap = (m: string): string => m.charAt(0).toUpperCase() + m.slice(1);
  const turboCtl = turbo.modeCount <= 2
    ? `<span class="ohm-ctl"><input id="ohm-turbo" type="checkbox"></span>`
    : `<span class="ohm-ctl"><div class="ohm-segmented" id="ohm-turbo-seg">${turbo.modes.map((m, i) => `<button class="ohm-seg" data-i="${i}">${esc(tr(cap(m)))}</button>`).join('')}</div></span>`;
  const customSettings = (menu.settings ?? []).map((b) => renderSettingBlock(b, tr)).join('');

  const paytableHtml = menu.paytable ? renderBlocks(menu.paytable, tr) : '';
  const rulesHtml = menu.rules ? renderBlocks(menu.rules, tr) : '';
  const banner = menu.banner
    ? `<img class="ohm-logo" alt="" src="${menu.banner.src}"${menu.banner.width ? ` width="${menu.banner.width}"` : ''}${menu.banner.height ? ` height="${menu.banner.height}"` : ''}>`
    : ui.gameInfo.name
      ? `<h1 class="ohm-logo-text">${esc(ui.gameInfo.name)}</h1>`
      : '';

  host.innerHTML = `
    <div class="ohm-backdrop" data-close></div>
    <button class="ohm-x" data-close aria-label="Close">✕</button>
    <div class="ohm-card" role="dialog" aria-modal="true">
      <div class="ohm-body">
        ${banner}
        <div class="ohm-sec"><span>${tr('Settings')}</span></div>
        <div class="ohm-setting"><label class="ohm-row ohm-check"><span>${tr('Sound')}</span><span class="ohm-ctl"><input id="ohm-sound" type="checkbox" checked></span></label><div class="ohm-hint">${tr('Turn all game sound and music on or off.')}</div></div>
        ${langRow}
        <div class="ohm-setting"><div class="ohm-row ohm-check"><span>${tr('Quick spin')}</span>${turboCtl}</div><div class="ohm-hint">${tr('Speed up rounds by shortening the animation. The result is identical.')}</div></div>
        ${customSettings}
        ${paytableHtml ? `<div class="ohm-sec"><span>${tr('Paytable')}</span></div>${paytableHtml}` : ''}
        ${rulesHtml ? `<div class="ohm-sec"><span>${tr('Rules')}</span></div><div class="ohm-rules" id="ohm-rules">${rulesHtml}</div>` : ''}
      </div>
    </div>`;
  const style = document.createElement('style');
  style.textContent = OHM_CSS;
  host.appendChild(style);
  document.body.appendChild(host);

  const $ = <T extends Element>(sel: string): T | null => host.querySelector(sel) as T | null;

  // Sound → mute state.
  const sound = $<HTMLInputElement>('#ohm-sound');
  if (sound) {
    sound.checked = !ui.muted.get();
    sound.addEventListener('change', () => ui.setMuted(!sound.checked));
    disposers.push(ui.muted.subscribe((m) => { sound.checked = !m; }));
  }
  // Language.
  const lang = $<HTMLSelectElement>('#ohm-lang');
  if (lang) lang.addEventListener('change', () => ui.setLocale(lang.value));
  // Quick spin → turbo.
  if (turbo.modeCount <= 2) {
    const tg = $<HTMLInputElement>('#ohm-turbo');
    if (tg) {
      tg.checked = turbo.isOn;
      tg.addEventListener('change', () => turbo.set(tg.checked));
      disposers.push(turbo.index.subscribe(() => { tg.checked = turbo.isOn; }));
    }
  } else {
    const segs = Array.from(host.querySelectorAll<HTMLButtonElement>('.ohm-seg'));
    segs.forEach((b) => b.addEventListener('click', () => turbo.setIndex(Number(b.dataset.i))));
    const sync = (): void => segs.forEach((b, i) => b.classList.toggle('active', i === turbo.index.get()));
    disposers.push(turbo.index.subscribe(sync));
    sync();
  }
  // Custom settings → emit events the host can handle.
  host.querySelectorAll<HTMLElement>('[data-set]').forEach((el) => {
    const id = el.dataset.set!;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.addEventListener('change', () => ui.bus.emit('toggled', { id, on: el.checked }));
    else if (el instanceof HTMLInputElement && el.type === 'range') el.addEventListener('input', () => ui.bus.emit('valueChanged', { id, value: Number(el.value) }));
    else if (el instanceof HTMLSelectElement) el.addEventListener('change', () => ui.bus.emit('optionSelected', { id, value: el.value, index: el.selectedIndex }));
  });

  host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => ui.settingsPanel.closePanel()));

  // Re-translate the whole menu on locale change (labels + the rules body).
  disposers.push(
    ui.locale.subscribe(() => {
      const body = host.querySelector('.ohm-body');
      if (body) {
        // simplest robust path: rebuild the localized rules body
        const rulesEl = host.querySelector('#ohm-rules');
        if (rulesEl && menu.rules) rulesEl.innerHTML = renderBlocks(menu.rules, tr);
        if (lang) lang.value = ui.locale.get();
      }
    }),
  );

  // Open/close follows the settings panel state.
  disposers.push(ui.settingsPanel.state.subscribe(() => host.classList.toggle('open', ui.settingsPanel.isOpen)));

  return () => {
    for (const d of disposers.splice(0)) d();
    host.remove();
  };
}

const OHM_CSS = `
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
