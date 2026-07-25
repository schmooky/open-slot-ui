// Standalone boot / fatal ERROR screen — a full-screen block shown when the game
// cannot reach or authenticate with the RGS BEFORE the HUD mounts (so the HUD's own
// `showFatal` isn't available yet). It is deliberately MONOCHROME (a black-and-white
// card — white surface, black border/mark/button, no theme accent) so it reads as a
// neutral, out-of-game system notice over ANY game's art, and it PREVENTS PLAY
// (non-dismissible; the only way out is Reload, which re-runs the whole handshake) —
// Stake requires that a failed connection/auth never silently continues. Pure DOM.

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
        <svg viewBox="0 0 48 48" width="46" height="46"><path d="M24 5 4 41h40L24 5Z" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/><rect x="22" y="19" width="4" height="12" rx="2" fill="#000"/><circle cx="24" cy="35.5" r="2.5" fill="#000"/></svg>
      </div>
      <h1 class="openui-be-title">${esc(title)}</h1>
      <p class="openui-be-msg">${esc(message)}</p>
      ${opts.detail ? `<p class="openui-be-detail">${esc(opts.detail)}</p>` : ''}
      ${showReload ? `<button class="openui-be-reload" type="button">${esc(opts.reloadLabel ?? 'Reload')}</button>` : ''}
    </div>
    <style>
      /* MONOCHROME by design — a neutral black-and-white system card, no theme accent. */
      .openui-boot-error { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #181b20;
        background: rgba(8,8,8,.62); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
      .openui-be-card { width: min(90%, 440px); text-align: center; padding: 40px 36px 32px;
        display: flex; flex-direction: column; align-items: center; gap: 14px;
        background: #fff; border: 4px solid #000; border-radius: 24px; box-shadow: 0 24px 60px rgba(0,0,0,.55); }
      .openui-be-icon { display: grid; place-items: center; width: 72px; height: 72px; border-radius: 999px;
        border: 4px solid #000; line-height: 0; }
      .openui-be-title { margin: 0; font-size: 26px; font-weight: 800; color: #000; letter-spacing: .01em; }
      .openui-be-msg { margin: 0; font-size: 16px; line-height: 1.5; font-weight: 600; color: #3a3f47; max-width: 34ch; }
      .openui-be-detail { margin: 0; font-size: 12px; line-height: 1.4; color: #8a9099; word-break: break-word;
        font-family: ui-monospace, "SF Mono", Menlo, monospace; max-width: 40ch; }
      .openui-be-reload { appearance: none; cursor: pointer; margin-top: 8px; padding: 14px 42px; border-radius: 999px;
        border: 4px solid #000; background: #000; color: #fff; font-weight: 800; font-size: 16px; letter-spacing: .03em;
        transition: transform .1s ease, background .12s ease; }
      .openui-be-reload:hover { background: #1c1c1c; }
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
