// The UNIVERSAL confirm modal — one HTML white-card dialog (the dice-cascade design) used
// everywhere a purchase/activation must be confirmed: the buy-feature modal (buy + activate)
// and `hud.requestBuyFeature`. It layers over both the pixi canvas and the HTML buy modal, so
// there is a single, consistent confirm across the whole HUD.

/** Minimal HUD surface the confirm needs — the translator + theme font. */
interface ConfirmUI {
  t(key: string, params?: Record<string, string | number>): string;
  theme: { type: { family: string } };
}

export interface ConfirmOptions {
  /** Heading (already resolved text, or an i18n key). Default `Buy Feature`. */
  title?: string;
  /** Body message (already resolved). */
  message: string;
  /** Confirm button label (resolved text or i18n key). Default `openui.confirm`. */
  confirmLabel?: string;
  /** Cancel button label. Default `openui.cancel`. */
  cancelLabel?: string;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Show the universal confirm dialog. Resolves `true` on Confirm, `false` on Cancel / backdrop
 * / Escape. Self-mounting + self-cleaning; layers above everything (z-index above the buy modal).
 */
export function showConfirm(ui: ConfirmUI, opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const host = document.createElement('div');
    host.className = 'osc-confirm';
    host.style.setProperty('--font', ui.theme.type.family);

    const title = ui.t(opts.title ?? 'Buy Feature');
    const yes = ui.t(opts.confirmLabel ?? 'openui.confirm');
    const no = ui.t(opts.cancelLabel ?? 'openui.cancel');
    host.innerHTML = `
      <div class="osc-confirm-backdrop" data-no></div>
      <div class="osc-confirm-card" role="dialog" aria-modal="true">
        ${title ? `<h3 class="osc-confirm-title">${esc(title)}</h3>` : ''}
        <p class="osc-confirm-msg">${esc(opts.message)}</p>
        <div class="osc-confirm-row">
          <button class="osc-confirm-btn osc-confirm-no" data-no>${esc(no)}</button>
          <button class="osc-confirm-btn osc-confirm-yes" data-yes>${esc(yes)}</button>
        </div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = CONFIRM_CSS;
    host.appendChild(style);
    document.body.appendChild(host);
    // Shown immediately (no opacity/transform transition to reveal it) so it can't be
    // left invisible when the page's animation frames are throttled (embedded/backgrounded).

    let settled = false;
    const close = (val: boolean): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener('keydown', onKey);
      host.remove();
      resolve(val);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    host.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => close(false)));
    host.querySelector('[data-yes]')?.addEventListener('click', () => close(true));
    window.addEventListener('keydown', onKey);
  });
}

const CONFIRM_CSS = `
.osc-confirm { position: fixed; inset: 0; z-index: 12000; display: grid; place-items: center; font-family: var(--font); }
.osc-confirm *, .osc-confirm *::before, .osc-confirm *::after { box-sizing: border-box; }
.osc-confirm-backdrop { position: absolute; inset: 0; background: rgba(8,6,4,.6); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.osc-confirm-card { position: relative; width: min(90vw, 420px); background: #ffffff; color: #181b20; border: 3px solid #000; border-radius: 14px; padding: 24px; box-shadow: 0 24px 60px rgba(0,0,0,.55); text-align: center; }
.osc-confirm-title { margin: 0 0 12px; font-size: 22px; font-weight: 800; letter-spacing: .3px; }
.osc-confirm-msg { margin: 0 0 22px; font-size: 19px; font-weight: 700; line-height: 1.4; }
.osc-confirm-row { display: flex; gap: 14px; }
.osc-confirm-btn { flex: 1; padding: 14px 10px; border-radius: 12px; border: 3px solid #000; font-size: 15px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; cursor: pointer; transition: transform .1s, background .12s; }
.osc-confirm-btn:active { transform: scale(.96); }
.osc-confirm-no { background: #ffffff; color: #181b20; }
.osc-confirm-no:hover { background: #eef1f6; }
.osc-confirm-yes { background: #d99000; color: #1a1200; }
.osc-confirm-yes:hover { filter: brightness(1.05); }
`;
