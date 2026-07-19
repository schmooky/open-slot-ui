// The info menu (☰ → Settings · Paytable · Rules) as the library's ONE polished design:
// a white card with gold accents + section rules, driven ENTIRELY by the `UISpec.menu`
// (banner · settings · paytable · rules) and wired to the live `OpenUI` state. It renders
// the full modular BlockSpec palette, is fully localized (every string flows through
// `ui.t`, re-translates on locale change), and is a DOM overlay over the canvas (works in
// every browser + the Stake iframe). `mountHud` mounts it by default; pass `menu:false` to
// supply your own instead. The look matches the Open-UI Figma reference.

import type { Application } from 'pixi.js';
import {
  INFO_MENU_CSS,
  INFO_MENU_VARS,
  LOCALE_LABELS,
  auditRules,
  escapeHtml as esc,
  factsVars,
  renderBlocksHtml as renderBlocks,
  renderRulesAuditHtml,
  type BlockSpec,
  type MenuSpec,
  type OpenUI,
} from '@open-slot-ui/core';

// The block renderer + the stylesheet live in CORE (`spec/rulesHtml.ts`) so the
// SAME code that draws this menu in-game powers external tooling (the stakeplate
// rules editor's WYSIWYG preview) — one source of truth for how a block looks.
/* removed local renderBlocks — see @open-slot-ui/core renderBlocksHtml */
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
  const vars: Record<string, string> = { ...INFO_MENU_VARS, '--font': ui.theme.type.family };
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

  // Sound config: a toggle only, + a master Volume slider, or + Music & Effects sliders.
  const soundMode = menu.sound ?? 'sliders';
  const volRow = (id: string, label: string, hint: string, val: number): string =>
    `<div class="ohm-setting"><label class="ohm-row"><span>${esc(tr(label))}</span><input class="ohm-slider" data-vol="${id}" type="range" min="0" max="1" step="0.01" value="${val}"></label><div class="ohm-hint">${esc(tr(hint))}</div></div>`;
  const soundSliders =
    soundMode === 'master'
      ? volRow('master', 'Volume', 'Adjust the overall game volume.', ui.sfxSlider.value.get())
      : soundMode === 'sliders'
        ? volRow('music', 'Music', 'Adjust the background music volume.', ui.musicSlider.value.get()) +
          volRow('sfx', 'Effects', 'Adjust the sound-effects volume.', ui.sfxSlider.value.get())
        : '';

  // ── rules-completeness audit ("forgotten declarations") ─────────────────────
  // The declared game facts (spec.facts + runtime declareFacts — the buy-feature
  // modal auto-declares its features) are audited against the rules blocks. Every
  // missing REQUIRED declaration (a mode's RTP / max win, an undescribed feature)
  // and each HIGHLY RECOMMENDED one (free-spins count + retrigger, legal, controls)
  // renders as an explicit warning card at the top of the Rules section — a
  // forgotten declaration is stated when the rules open, never silent.
  // Rules copy translates WITH the facts interpolation vars: `{{rtp.base}}`-style
  // tokens (see `factsVars`) resolve from the LIVE declared facts + the game info,
  // so a stated RTP / max win / price can never drift from the configuration. The
  // audit resolves through the exact same function — copy is audited AS RENDERED.
  const rulesTr = (): ((s: string) => string) => {
    const vars = factsVars(ui.facts.get(), { 'game.name': ui.gameInfo.name ?? '', 'game.version': ui.gameInfo.version ?? '' });
    return (s: string): string => ui.t(s, vars);
  };
  const auditCardHtml = (trr: (s: string) => string): string => {
    if (!menu.rules?.length) return '';
    return renderRulesAuditHtml(auditRules(ui.facts.get(), menu.rules, { resolve: trr }), tr);
  };
  const rulesInnerHtml = (): string => {
    if (!menu.rules) return '';
    const trr = rulesTr();
    return auditCardHtml(trr) + renderBlocks(menu.rules, trr, ui.facts.get());
  };

  const paytableHtml = menu.paytable ? renderBlocks(menu.paytable, tr, ui.facts.get()) : '';
  const rulesHtml = rulesInnerHtml();
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
        ${soundSliders}
        ${langRow}
        <div class="ohm-setting"><div class="ohm-row ohm-check"><span>${tr('Quick spin')}</span>${turboCtl}</div><div class="ohm-hint">${tr('Speed up rounds by shortening the animation. The result is identical.')}</div></div>
        ${customSettings}
        ${paytableHtml ? `<div class="ohm-sec"><span>${tr('Paytable')}</span></div>${paytableHtml}` : ''}
        ${rulesHtml ? `<div class="ohm-sec"><span>${tr('Rules')}</span></div><div class="ohm-rules" id="ohm-rules">${rulesHtml}</div>` : ''}
      </div>
    </div>`;
  const style = document.createElement('style');
  style.textContent = INFO_MENU_CSS;
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
  // Volume sliders → the music / sfx slider controls (which emit valueChanged for the host).
  host.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((el) => {
    const which = el.dataset.vol!;
    el.addEventListener('input', () => {
      const v = Number(el.value);
      if (which === 'music') ui.musicSlider.setNormalized(v);
      else if (which === 'sfx') ui.sfxSlider.setNormalized(v);
      else { ui.musicSlider.setNormalized(v); ui.sfxSlider.setNormalized(v); } // master
    });
    // reflect external changes (e.g. mute drops both to 0, unmute restores).
    const src = which === 'music' ? ui.musicSlider : ui.sfxSlider;
    disposers.push(src.value.subscribe((v) => { el.value = String(v); }));
  });
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

  // Re-translate the whole menu on locale change (labels + the rules body), and
  // re-audit + re-render the rules whenever the declared game facts change (e.g.
  // the buy-feature modal declaring its features after this menu mounted).
  const refreshRules = (): void => {
    const rulesEl = host.querySelector('#ohm-rules');
    if (rulesEl && menu.rules) rulesEl.innerHTML = rulesInnerHtml();
  };
  disposers.push(
    ui.locale.subscribe(() => {
      const body = host.querySelector('.ohm-body');
      if (body) {
        // simplest robust path: rebuild the localized rules body
        refreshRules();
        if (lang) lang.value = ui.locale.get();
      }
    }),
    ui.facts.subscribe(refreshRules),
  );

  // Open/close follows the settings panel state. While open, LOCK the HUD (ref-counted) so
  // pointer/keyboard input can't fall through the menu overlay onto the controls underneath.
  let menuLocked = false;
  disposers.push(
    ui.settingsPanel.state.subscribe(() => {
      const isOpen = ui.settingsPanel.isOpen;
      host.classList.toggle('open', isOpen);
      if (isOpen && !menuLocked) { ui.lock(); menuLocked = true; }
      else if (!isOpen && menuLocked) { ui.unlock(); menuLocked = false; }
    }),
  );

  return () => {
    for (const d of disposers.splice(0)) d();
    if (menuLocked) { ui.unlock(); menuLocked = false; } // don't leak the lock on teardown
    host.remove();
  };
}
