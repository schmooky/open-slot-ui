/**
 * Declarative test/control HARNESS — drives the demo into any state over the
 * `postMessage` API instead of URL params or hand-poked globals, so an external
 * driver (Playwright, a parent frame, the RGS host emulator) can set up scenarios
 * deterministically and await an ack:
 *
 *   // driver → page
 *   window.postMessage({ __openui: 'cmd', id: 7, cmd: 'enterBonus', args: [8] }, '*');
 *   // page → driver
 *   window.postMessage({ __openui: 'ack', id: 7, ok: true, result: undefined }, '*');
 *
 * The command map is supplied by `main.ts` (it wires each verb to the real
 * `hud`/`ui`/game-sim), so this file stays a tiny, generic dispatcher.
 */

export interface HarnessCommands {
  [cmd: string]: (...args: unknown[]) => unknown | Promise<unknown>;
}

interface CmdMessage {
  __openui: 'cmd';
  id: number;
  cmd: string;
  args?: unknown[];
}

function isCmd(d: unknown): d is CmdMessage {
  return !!d && typeof d === 'object' && (d as { __openui?: unknown }).__openui === 'cmd';
}

/** Wire the postMessage command channel. Returns a disposer that unbinds it. */
export function mountHarness(commands: HarnessCommands): () => void {
  const onMessage = (e: MessageEvent): void => {
    if (!isCmd(e.data)) return;
    const { id, cmd, args = [] } = e.data;
    void (async () => {
      try {
        const fn = commands[cmd];
        if (!fn) throw new Error(`unknown command: ${cmd}`);
        const result = await fn(...args);
        window.postMessage({ __openui: 'ack', id, ok: true, result: result ?? null }, '*');
      } catch (err) {
        window.postMessage({ __openui: 'ack', id, ok: false, error: String((err as Error)?.message ?? err) }, '*');
      }
    })();
  };
  window.addEventListener('message', onMessage);
  // Announce readiness so a driver can wait for the channel instead of racing it.
  window.postMessage({ __openui: 'ready', commands: Object.keys(commands) }, '*');
  return () => window.removeEventListener('message', onMessage);
}
