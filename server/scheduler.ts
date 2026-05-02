import { db, getSetting, type Signal } from './db.ts';
import { fetchPair } from './rates.ts';
import { sendTelegram, getTelegramConfig } from './telegram.ts';
import { describeSource, formatValue, getPair } from './pairs.ts';

export function formatTestAlertMessage(
  sig: Signal,
  value: number
): { condition_met: boolean; text: string } {
  const pairDef = getPair(sig.pair);
  const label = pairDef ? `${pairDef.label} (${sig.pair})` : sig.pair;
  const cmp = sig.direction === 'above' ? '&gt;' : '&lt;';
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false });
  const conditionMet = sig.direction === 'above' ? value >= sig.threshold : value <= sig.threshold;

  if (conditionMet) {
    const alert = formatAlertMessage(sig, value, null);
    return {
      condition_met: true,
      text: `<b>🧪 Test alert — condition met, this is what would fire:</b>\n\n${alert}`,
    };
  }

  const gap = sig.direction === 'above' ? sig.threshold - value : value - sig.threshold;
  const pct = value !== 0 ? (gap / value) * 100 : 0;
  const needs = sig.direction === 'above'
    ? `needs to rise to at least ${formatValue(sig.pair, sig.threshold)}`
    : `needs to fall to at most ${formatValue(sig.pair, sig.threshold)}`;
  const side = sig.direction === 'above' ? 'below' : 'above';

  return {
    condition_met: false,
    text: [
      `<b>🧪 Test alert — would not fire</b>`,
      `<b>${label}</b>`,
      `Current: <b>${formatValue(sig.pair, value)}</b>`,
      `Threshold: ${cmp} ${formatValue(sig.pair, sig.threshold)}`,
      `Reason: current is ${side} the threshold by ${formatValue(sig.pair, gap)} (${pct.toFixed(2)}%) — ${needs}.`,
      `<i>${now} WIB</i>`,
    ].join('\n'),
  };
}

function formatAlertMessage(sig: Signal, value: number, previousValue: number | null): string {
  const pairDef = getPair(sig.pair);
  const label = pairDef ? `${pairDef.label} (${sig.pair})` : sig.pair;
  const arrow = sig.direction === 'above' ? '↑' : '↓';
  const cmp = sig.direction === 'above' ? '&gt;' : '&lt;';
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false });

  const lines = [
    `<b>${arrow} ${label}</b>`,
    `Crossed threshold: <b>${cmp} ${formatValue(sig.pair, sig.threshold)}</b>`,
    `Current: <b>${formatValue(sig.pair, value)}</b>`,
  ];
  if (previousValue !== null) {
    const delta = value - previousValue;
    const pct = previousValue !== 0 ? (delta / previousValue) * 100 : 0;
    const sign = delta >= 0 ? '+' : '';
    lines.push(`Previous: ${formatValue(sig.pair, previousValue)} (${sign}${pct.toFixed(2)}%)`);
  }
  lines.push(`<i>${now} WIB</i>`);
  return lines.join('\n');
}

export type CheckResult = {
  triggered: boolean;
  value: number | null;
  error: string | null;
  source: string;
  source_url: string;
  notified: boolean;
  notify_skipped_reason: string | null;
};

export async function checkSignal(sig: Signal): Promise<CheckResult> {
  const pairDef = getPair(sig.pair);
  const { source, url } = pairDef
    ? describeSource(pairDef)
    : { source: 'unknown', url: '' };

  let value: number;
  try {
    value = await fetchPair(sig.pair);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare('UPDATE signals SET last_checked_at = unixepoch() WHERE id = ?').run(sig.id);
    return {
      triggered: false,
      value: null,
      error: msg,
      source,
      source_url: url,
      notified: false,
      notify_skipped_reason: null,
    };
  }

  const prevValue = sig.last_value;
  const newState: 'above' | 'below' = value >= sig.threshold ? 'above' : 'below';
  const triggered = sig.direction === 'above' ? value >= sig.threshold : value <= sig.threshold;

  db.prepare(
    'UPDATE signals SET last_state = ?, last_value = ?, last_checked_at = unixepoch() WHERE id = ?'
  ).run(newState, value, sig.id);

  if (!triggered) {
    return {
      triggered: false,
      value,
      error: null,
      source,
      source_url: url,
      notified: false,
      notify_skipped_reason: null,
    };
  }

  db.prepare('UPDATE signals SET last_triggered_at = unixepoch() WHERE id = ?').run(sig.id);

  if (!sig.notify_telegram) {
    return {
      triggered: true,
      value,
      error: null,
      source,
      source_url: url,
      notified: false,
      notify_skipped_reason: 'Telegram notifications disabled for this signal',
    };
  }

  const tg = getTelegramConfig();
  if (!tg.botToken || !tg.chatId) {
    return {
      triggered: true,
      value,
      error: null,
      source,
      source_url: url,
      notified: false,
      notify_skipped_reason: 'Telegram is not fully configured (bot token or chat ID missing)',
    };
  }

  const message = formatAlertMessage(sig, value, prevValue);
  const result = await sendTelegram(message);
  if (result.ok) {
    return {
      triggered: true,
      value,
      error: null,
      source,
      source_url: url,
      notified: true,
      notify_skipped_reason: null,
    };
  }
  console.error(`[telegram] ${result.error}`);
  return {
    triggered: true,
    value,
    error: null,
    source,
    source_url: url,
    notified: false,
    notify_skipped_reason: result.error || 'Telegram send failed',
  };
}

let lastPollAt: number | null = null;
let currentCron: string = '*/15 * * * *';

export const DEFAULT_CRON = '*/15 * * * *';

export function isValidCron(expr: string): boolean {
  try {
    return Bun.cron.parse(expr) !== null;
  } catch {
    return false;
  }
}

export function getConfiguredCron(): string {
  const fromSettings = getSetting('poll_cron');
  if (fromSettings && isValidCron(fromSettings)) return fromSettings;
  const fromEnv = process.env.POLL_CRON;
  if (fromEnv && isValidCron(fromEnv)) return fromEnv;
  return DEFAULT_CRON;
}

export function getScheduleInfo(): {
  cron: string;
  last_poll_at: number | null;
  next_poll_at: number | null;
} {
  const next = Bun.cron.parse(currentCron);
  return {
    cron: currentCron,
    last_poll_at: lastPollAt,
    next_poll_at: next ? Math.floor(next.getTime() / 1000) : null,
  };
}

export async function runPoll(): Promise<void> {
  const startedAt = Date.now();
  const signals = db.prepare('SELECT * FROM signals WHERE enabled = 1').all() as Signal[];
  console.log(`[poll] checking ${signals.length} signal(s)`);

  const results: Array<{
    signal_id: number;
    pair: string;
    direction: 'above' | 'below';
    threshold: number;
    source: string;
    source_url: string;
    value: number | null;
    error: string | null;
    triggered: boolean;
    notified: boolean;
    notify_skipped_reason: string | null;
  }> = [];
  let errored = 0;
  let triggered = 0;

  for (const sig of signals) {
    try {
      const r = await checkSignal(sig);
      results.push({
        signal_id: sig.id,
        pair: sig.pair,
        direction: sig.direction,
        threshold: sig.threshold,
        source: r.source,
        source_url: r.source_url,
        value: r.value,
        error: r.error,
        triggered: r.triggered,
        notified: r.notified,
        notify_skipped_reason: r.notify_skipped_reason,
      });
      if (r.error) {
        errored++;
        console.error(`[poll] ${sig.pair}: ${r.error}`);
      } else if (r.triggered) {
        triggered++;
        const note = r.notified
          ? 'notified'
          : `not notified (${r.notify_skipped_reason})`;
        console.log(
          `[poll] TRIGGERED ${sig.pair} ${sig.direction} ${sig.threshold} @ ${r.value} — ${note}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const pairDef = getPair(sig.pair);
      const { source, url } = pairDef
        ? describeSource(pairDef)
        : { source: 'unknown', url: '' };
      results.push({
        signal_id: sig.id,
        pair: sig.pair,
        direction: sig.direction,
        threshold: sig.threshold,
        source,
        source_url: url,
        value: null,
        error: msg,
        triggered: false,
        notified: false,
        notify_skipped_reason: null,
      });
      errored++;
      console.error(`[poll] unexpected error for signal ${sig.id}:`, err);
    }
  }

  const completedAt = Date.now();
  db.prepare(
    `INSERT INTO runs (started_at, completed_at, duration_ms, signals_checked, signals_errored, signals_triggered, results)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    Math.floor(startedAt / 1000),
    Math.floor(completedAt / 1000),
    completedAt - startedAt,
    signals.length,
    errored,
    triggered,
    JSON.stringify(results)
  );
  db.prepare(
    'DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT 500)'
  ).run();

  lastPollAt = Math.floor(completedAt / 1000);
}

let job: Bun.CronJob | null = null;

export function startScheduler(expression: string): void {
  if (job) job.stop();
  const expr = isValidCron(expression) ? expression : DEFAULT_CRON;
  if (expr !== expression) {
    console.error(`[scheduler] invalid cron "${expression}" — falling back to "${expr}"`);
  }
  currentCron = expr;
  job = Bun.cron(expr, async () => {
    try {
      await runPoll();
    } catch (err) {
      console.error('[scheduler] poll failed:', err);
    }
  });
  console.log(`[scheduler] cron "${expr}" (UTC)`);
  runPoll().catch((err) => console.error('[scheduler] initial poll failed:', err));
}
