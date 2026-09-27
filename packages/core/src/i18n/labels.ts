import type { OpenUI } from '../OpenUI';

/**
 * THE LABEL DICTIONARY, shared by every binding.
 *
 * A HUD's markup labels itself with the reference's key names, so a studio can drop
 * in the language files it already has. Resolution goes: the host's own translator
 * first (a game that localizes its HUD localizes these too), then the `openui.*`
 * key each one maps to, then the English default here.
 *
 * It lives in core because it is only data and a lookup — the DOM binding fills
 * `[data-translation]` attributes with it, the canvas ones draw the same strings.
 */
export const LABEL_KEYS: Readonly<Record<string, { openui?: string; en: string }>> = Object.freeze({
  accept_uc: { openui: 'openui.ok', en: 'ACCEPT' },
  autoplay: { openui: 'openui.autoplay', en: 'AUTOPLAY' },
  autoplay_cost: { openui: 'openui.autoplay.total', en: 'Total: {{amount}}' },
  autoplay_feature_stop: { openui: 'openui.autoplay.stopOnFeature', en: 'STOP ON SPECIAL FEATURE WIN' },
  autoplay_any_win_stop: { openui: 'openui.autoplay.stopOnAnyWin', en: 'STOP ON ANY WIN' },
  support_uc: { openui: 'openui.menu.support', en: 'SUPPORT' },
  autoplay_menu_advanced: { openui: 'openui.autoplay.advanced', en: 'ADVANCED' },
  autoplay_menu_basic: { openui: 'openui.autoplay.basic', en: 'BASIC' },
  back_uc: { openui: 'openui.cancel', en: 'BACK' },
  balance: { openui: 'openui.balance', en: 'BALANCE' },
  base_game_uc: { openui: 'openui.baseGame', en: 'BASE GAME' },
  bet_history: { openui: 'openui.history', en: 'HISTORY' },
  bet_past: { openui: 'openui.bet', en: 'BET' },
  bonus_game_uc: { openui: 'openui.bonusGame', en: 'BONUS GAME' },
  custom: { openui: 'openui.autoplay.custom', en: 'CUSTOM' },
  date: { openui: 'openui.date', en: 'DATE' },
  deposit_uc: { openui: 'openui.deposit', en: 'DEPOSIT' },
  feature_buy_action_uc: { openui: 'openui.buyBonus', en: 'BUY BONUS' },
  feature_buy_confirm: { en: 'Will be subtracted from your balance' },
  activate_uc: { openui: 'openui.activate', en: 'ACTIVATE' },
  feature_buy_uc: { openui: 'openui.buyFeature.title', en: 'BONUS BUY' },
  feature_spins_active_uc: { en: 'FEATURE SPINS ACTIVATED' },
  feature_active: { en: '{{name}} ACTIVATED' },
  disable_uc: { openui: 'openui.disable', en: 'DISABLE' },
  free_round_uc: { openui: 'openui.freeRounds', en: 'FREE ROUND' },
  free_spins_label_uc: { openui: 'openui.freeSpins', en: 'FREE SPINS' },
  game_info: { openui: 'openui.info', en: 'GAME INFO' },
  history: { openui: 'openui.history', en: 'HISTORY' },
  history_all_games_uc: { en: 'ALL GAMES' },
  history_bet_uc: { openui: 'openui.history', en: 'HISTORY' },
  history_biggest_wins_uc: { en: 'BIGGEST WINS' },
  history_current_game_uc: { en: 'CURRENT GAME' },
  home: { openui: 'openui.home', en: 'HOME' },
  info_uc: { openui: 'openui.info', en: 'INFO' },
  jackpot_uc: { openui: 'openui.maxWin', en: 'MAX WIN' },
  leave_promotion_uc: { en: 'LEAVE PROMOTION' },
  loss_limit: { openui: 'openui.autoplay.lossLimit', en: 'LOSS LIMIT' },
  maxwin_header_uc: { openui: 'openui.maxWin', en: 'MAX WIN' },
  music: { openui: 'openui.music', en: 'MUSIC' },
  net: { openui: 'openui.net', en: 'NET' },
  no_limit: { openui: 'openui.autoplay.noLimit', en: 'NO LIMIT' },
  nr_autoplay_rounds: { openui: 'openui.autoplay.rounds', en: 'NUMBER OF ROUNDS' },
  odds_uc: { openui: 'openui.odds', en: 'ODDS' },
  ok_uc: { openui: 'openui.ok', en: 'OK' },
  real_money_uc: { openui: 'openui.realMoney', en: 'REAL MONEY' },
  rtp_label: { openui: 'openui.rtp', en: 'RTP' },
  session: { openui: 'openui.session', en: 'SESSION' },
  shift_enter_accept: { en: 'SHIFT+ENTER to accept' },
  sound: { openui: 'openui.sound', en: 'SOUND' },
  start_autoplay_uc: { openui: 'openui.autoplay.start', en: 'START AUTOPLAY' },
  super_turbo_uc: { openui: 'openui.superTurbo', en: 'SUPER TURBO' },
  total_win_uc: { openui: 'openui.totalWin', en: 'TOTAL WIN' },
  turbo: { openui: 'openui.turbo', en: 'TURBO' },
  win_limit: { openui: 'openui.autoplay.winLimit', en: 'SINGLE WIN LIMIT' },
  win_uc: { openui: 'openui.win', en: 'WIN' },
  // ── messages the strip raises ─────────────────────────────────────────────
  press_play: { openui: 'openui.pressPlay', en: 'PRESS PLAY TO SPIN!' },
  bet_increased_uc: { openui: 'openui.betIncreased', en: 'BET INCREASED' },
  bet_decreased_uc: { openui: 'openui.betDecreased', en: 'BET DECREASED' },
  max_bet_reached_uc: { openui: 'openui.maxBet', en: 'MAX BET REACHED' },
  min_bet_reached_uc: { openui: 'openui.minBet', en: 'MIN BET REACHED' },
  insufficient_funds: { openui: 'openui.err.ipb', en: 'You have insufficient funds. Please reduce the stake or add more funds to your account.' },
  notification_losslimit_required_uc: { openui: 'openui.autoplay.needLossLimit', en: 'LOSS LIMIT IS REQUIRED TO START AUTOPLAY' },
  notification_winlimit_required_uc: { openui: 'openui.autoplay.needWinLimit', en: 'WIN LIMIT IS REQUIRED TO START AUTOPLAY' },
  spin_win: { en: 'SPIN TO WIN!' },
});

/**
 * Resolve one markup key.
 *
 * Order matters, and it is deliberate: a HOST dictionary wins (whether it uses the
 * reference's key names or open-ui's), then the markup's own English, then the
 * `openui.*` default. The reference's copy comes second rather than last because it
 * IS the design — "BALANCE" is set in caps by the layout, and quietly swapping in
 * open-ui's sentence-case "Balance" would change the look of a HUD nobody asked to
 * restyle.
 */
export function labelFor(ui: OpenUI, key: string, vars?: Record<string, string | number>): string {
  const entry = LABEL_KEYS[key];
  const direct = ui.t(key, vars);
  if (direct !== key) return direct; // the host carries this exact key
  const hostDict = !!ui.spec?.locale;
  if (hostDict && entry?.openui) {
    const mapped = ui.t(entry.openui, vars);
    if (mapped !== entry.openui) return mapped;
  }
  let out = entry?.en;
  if (out == null) {
    const mapped = entry?.openui ? ui.t(entry.openui, vars) : key;
    return mapped;
  }
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(String(v));
  return out;
}

