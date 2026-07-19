/**
 * The UNIVERSAL RULES DOCUMENT — one portable, editable JSON file that carries a
 * game's whole rules surface: the ordered block list, its i18next-compatible
 * per-locale messages (flat keys, `{{token}}` interpolation — use i18next with
 * `keySeparator: false` if you consume them elsewhere), the social/sweepstakes
 * overrides, and (optionally) the game facts it was authored against.
 *
 * Authoring convention: a block's `text` is an i18n KEY (or literal English —
 * a string is its own key, the house convention); `messages` supplies per-locale
 * copy; any string may use the `factsVars` tokens (`{{rtp.base}}`,
 * `{{maxWin.bonus}}`, `{{freeSpins.count}}`, …) which the info menu resolves from
 * the LIVE declared facts — so stated numbers can never drift from config.
 *
 * A game consumes the file with ONE call:
 *
 *   import doc from './rules.doc.json';
 *   const hud = mountHud(app, applyRulesDoc(spec, doc as RulesDoc));
 *
 * The stakeplate rules editor (`npx` runnable) reads/writes this exact format and
 * validates it against `validateSpec` + `auditRules` while you edit.
 */
import type { BlockSpec, UISpec } from './types';
import { mergeFacts, auditRules, factsVars, type GameFacts, type RulesAuditIssue } from './facts';

export interface RulesDoc {
  /** Format version — currently 1. */
  version: 1;
  /** The ordered rules blocks (the same modular `BlockSpec` palette the menu renders). */
  blocks: BlockSpec[];
  /** i18next-compatible flat resources per locale (string keys → copy; `{{token}}` ok). */
  messages?: Record<string, Record<string, string>>;
  /** Social / sweepstakes wording overrides, same shape, consulted only in social mode. */
  socialMessages?: Record<string, Record<string, string>>;
  /** The facts this document was authored against — merged into `spec.facts` (the
   *  spec's own facts win), and used by editors/CI to run the audit stand-alone. */
  facts?: GameFacts;
}

/** Runtime shape check — never throws. A malformed doc reports false and is skipped. */
export function isRulesDoc(doc: unknown): doc is RulesDoc {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as Record<string, unknown>;
  return d.version === 1 && Array.isArray(d.blocks);
}

const mergeLocaleMaps = (
  under: Record<string, Record<string, string>> | undefined,
  over: Record<string, Record<string, string>> | undefined,
): Record<string, Record<string, string>> => {
  const out: Record<string, Record<string, string>> = {};
  for (const src of [under, over]) {
    for (const [loc, map] of Object.entries(src ?? {})) out[loc] = { ...out[loc], ...map };
  }
  return out;
};

/**
 * Fold a rules document into a UISpec (pure — returns a NEW spec): the doc's blocks
 * become `menu.rules`, its messages/socialMessages merge UNDER the spec's own
 * dictionaries (host copy wins on conflicts), and its facts merge under `spec.facts`.
 * A malformed doc returns the spec unchanged (never-reject, Charter P11).
 */
export function applyRulesDoc(spec: UISpec, doc: RulesDoc): UISpec {
  if (!isRulesDoc(doc)) return spec;
  const messages = mergeLocaleMaps(doc.messages, spec.locale?.messages);
  const socialMessages = mergeLocaleMaps(doc.socialMessages, spec.locale?.socialMessages);
  return {
    ...spec,
    menu: { ...spec.menu, rules: doc.blocks },
    locale: {
      locale: spec.locale?.locale ?? 'en',
      messages: Object.keys(messages).length ? messages : { en: {} },
      ...(Object.keys(socialMessages).length ? { socialMessages } : {}),
    },
    ...(doc.facts ? { facts: mergeFacts(doc.facts, spec.facts ?? {}) } : {}),
  };
}

/**
 * Audit a rules document STAND-ALONE (editor / CI use): resolves each string through
 * the doc's own `locale` messages (default `'en'`) and interpolates the facts tokens,
 * exactly like the info menu renders it, then runs {@link auditRules}.
 */
export function auditRulesDoc(doc: RulesDoc, opts: { locale?: string; facts?: GameFacts } = {}): RulesAuditIssue[] {
  if (!isRulesDoc(doc)) return [];
  const facts = opts.facts ? mergeFacts(doc.facts ?? {}, opts.facts) : doc.facts;
  const dict = doc.messages?.[opts.locale ?? 'en'] ?? {};
  const vars = factsVars(facts);
  const resolve = (s: string): string =>
    (dict[s] ?? s).replace(/\{\{([\w.-]+)\}\}/g, (_m, k: string) => String(vars[k] ?? `{{${k}}}`));
  return auditRules(facts, doc.blocks, { resolve });
}
