// Standalone boot / fatal ERROR screen — a full-screen block shown when the game
// cannot reach or authenticate with the RGS BEFORE the HUD mounts (so the HUD's own
// `showFatal` isn't available yet). It uses the open-ui dark + yellow palette so it
// looks like the HUD's own modals, and it PREVENTS PLAY (non-dismissible; the only way
// out is Reload, which re-runs the whole handshake) — Stake requires that a failed
// connection/auth never silently continues. Pure DOM, no pixi needed.

export interface BootErrorOptions {
  title?: string;
  message?: string;
  /** Small technical detail for support (e.g. the RGS status line). */
  detail?: string;
  reloadLabel?: string;
  /** Reload handler (default: `window.location.reload()`). Pass `null` for no button. */
  onReload?: (() => void) | null;
}

let host: HTMLElement | null = null;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Show the open-ui-themed blocking boot error. Idempotent (replaces its content). */
export function showBootError(opts: BootErrorOptions = {}): void {
  const title = opts.title ?? 'Connection lost';
  const message = opts.message ?? 'The game could not reach the game server. Please reload to reconnect and continue.';
  const showReload = opts.onReload !== null;
  host ??= document.createElement('div');
  host.className = 'openui-boot-error';
  host.setAttribute('role', 'alertdialog');
  host.setAttribute('aria-modal', 'true');
  host.innerHTML = `
    <div class="openui-be-card">
      <div class="openui-be-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="48" height="48"><path d="M24 4 3 42h42L24 4Z" fill="none" stroke="#ffc935" stroke-width="3" stroke-linejoin="round"/><rect x="22" y="18" width="4" height="12" rx="2" fill="#ffc935"/><circle cx="24" cy="35" r="2.4" fill="#ffc935"/></svg>
      </div>
      <h1 class="openui-be-title">${esc(title)}</h1>
      <p class="openui-be-msg">${esc(message)}</p>
      ${opts.detail ? `<p class="openui-be-detail">${esc(opts.detail)}</p>` : ''}
      ${showReload ? `<button class="openui-be-reload" type="button">${esc(opts.reloadLabel ?? 'Reload')}</button>` : ''}
    </div>
    <style>
      .openui-boot-error { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e9edf2;
        background: rgba(6,8,11,.92); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
      .openui-be-card { width: min(90%, 440px); text-align: center; padding: 38px 32px 34px;
        background: #161b22; border: 1.5px solid #ffc935; border-radius: 16px; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
      .openui-be-icon { margin-bottom: 14px; line-height: 0; }
      .openui-be-title { margin: 0 0 12px; font-size: 24px; font-weight: 800; color: #ffc935; letter-spacing: .3px; }
      .openui-be-msg { margin: 0 0 20px; font-size: 15px; line-height: 1.55; color: #c4ccd6; }
      .openui-be-detail { margin: 0 0 20px; font-size: 12px; line-height: 1.4; color: #78828f; word-break: break-word; }
      .openui-be-reload { appearance: none; border: 0; cursor: pointer; padding: 13px 42px; border-radius: 999px;
        background: #ffc935; color: #161b22; font-weight: 800; font-size: 15px; letter-spacing: .3px;
        box-shadow: 0 8px 22px rgba(255,201,53,.32); transition: transform .12s, filter .12s; }
      .openui-be-reload:hover { filter: brightness(1.06); }
      .openui-be-reload:active { transform: scale(.96); }
    </style>`;
  if (showReload) {
    host.querySelector('.openui-be-reload')?.addEventListener('click', () => (opts.onReload ?? (() => window.location.reload()))());
  }
  if (!host.isConnected) document.body.appendChild(host);
}

/** Remove the boot error screen (e.g. after a successful retry). */
export function hideBootError(): void {
  host?.remove();
  host = null;
}
