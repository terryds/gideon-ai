import {
  db,
  FREQUENCY_SECONDS,
  FREQUENCY_LABELS,
  type InfoSignal,
  type InfoSignalFrequency,
} from './db.ts';
import { braveSearch } from './brave.ts';
import { evaluateNotify } from './anthropic.ts';
import { sendTelegram } from './telegram.ts';

const TICK_MS = 60_000;
let tickHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

export function isInfoSignalDue(s: InfoSignal, now: number): boolean {
  if (!s.enabled) return false;
  if (!s.last_checked_at) return true;
  const interval = FREQUENCY_SECONDS[s.frequency as InfoSignalFrequency];
  return s.last_checked_at + interval <= now;
}

function buildTelegramMessage(s: InfoSignal, summary: string, reason: string): string {
  const esc = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const title = s.name?.trim() || s.search_query;
  return [
    `🔔 <b>${esc(title)}</b>`,
    '',
    esc(summary),
    '',
    `<i>Why: ${esc(reason)}</i>`,
    '',
    `<i>Tracking: ${esc(s.search_query)} · ${FREQUENCY_LABELS[s.frequency]}</i>`,
  ].join('\n');
}

export async function runInfoSignal(
  signal: InfoSignal,
  triggeredBy: 'schedule' | 'manual' = 'schedule'
): Promise<{ run_id: number }> {
  const startedAt = Math.floor(Date.now() / 1000);
  const startMs = Date.now();

  const search = await braveSearch(signal.search_query);
  if (!search.ok) {
    const completed = Math.floor(Date.now() / 1000);
    const durationMs = Date.now() - startMs;
    const info = db
      .prepare(
        `INSERT INTO info_signal_runs
          (signal_id, started_at, completed_at, duration_ms, status, error, search_results, telegram_sent, triggered_by)
         VALUES (?, ?, ?, ?, 'error', ?, NULL, 0, ?)`
      )
      .run(signal.id, startedAt, completed, durationMs, `Brave search failed: ${search.error}`, triggeredBy);
    db.prepare('UPDATE info_signals SET last_checked_at = ? WHERE id = ?').run(completed, signal.id);
    return { run_id: Number(info.lastInsertRowid) };
  }

  const evalResult = await evaluateNotify(
    signal.search_query,
    signal.notify_condition,
    search.results
  );
  if (!evalResult.ok) {
    const completed = Math.floor(Date.now() / 1000);
    const durationMs = Date.now() - startMs;
    const info = db
      .prepare(
        `INSERT INTO info_signal_runs
          (signal_id, started_at, completed_at, duration_ms, status, error, search_results, telegram_sent, triggered_by)
         VALUES (?, ?, ?, ?, 'error', ?, ?, 0, ?)`
      )
      .run(
        signal.id,
        startedAt,
        completed,
        durationMs,
        `Model evaluation failed: ${evalResult.error}`,
        JSON.stringify(search.results),
        triggeredBy
      );
    db.prepare('UPDATE info_signals SET last_checked_at = ? WHERE id = ?').run(completed, signal.id);
    return { run_id: Number(info.lastInsertRowid) };
  }

  const decision = evalResult.decision;
  let telegramSent = 0;
  let telegramError: string | null = null;
  let lastNotifiedAt: number | null = null;
  if (decision.notify) {
    const tg = await sendTelegram(
      buildTelegramMessage(signal, decision.summary, decision.reason)
    );
    if (tg.ok) {
      telegramSent = 1;
      lastNotifiedAt = Math.floor(Date.now() / 1000);
    } else {
      telegramError = tg.error ?? 'Telegram send failed';
    }
  }

  const completed = Math.floor(Date.now() / 1000);
  const durationMs = Date.now() - startMs;
  const info = db
    .prepare(
      `INSERT INTO info_signal_runs
        (signal_id, started_at, completed_at, duration_ms, status, error,
         search_results, model_decision, model_reason, model_summary,
         telegram_sent, telegram_error, triggered_by)
       VALUES (?, ?, ?, ?, 'ok', NULL, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      signal.id,
      startedAt,
      completed,
      durationMs,
      JSON.stringify(search.results),
      decision.notify ? 1 : 0,
      decision.reason,
      decision.summary,
      telegramSent,
      telegramError,
      triggeredBy
    );

  if (lastNotifiedAt) {
    db.prepare(
      'UPDATE info_signals SET last_checked_at = ?, last_notified_at = ? WHERE id = ?'
    ).run(completed, lastNotifiedAt, signal.id);
  } else {
    db.prepare('UPDATE info_signals SET last_checked_at = ? WHERE id = ?').run(completed, signal.id);
  }

  return { run_id: Number(info.lastInsertRowid) };
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = Math.floor(Date.now() / 1000);
    const due = db
      .prepare(
        `SELECT * FROM info_signals
         WHERE enabled = 1
           AND (last_checked_at IS NULL OR last_checked_at + (
             CASE frequency
               WHEN '30m' THEN 1800
               WHEN '1h'  THEN 3600
               WHEN '6h'  THEN 21600
               WHEN '12h' THEN 43200
               WHEN '1d'  THEN 86400
               WHEN '1w'  THEN 604800
             END
           ) <= ?)
         ORDER BY last_checked_at ASC NULLS FIRST`
      )
      .all(now) as InfoSignal[];
    for (const s of due) {
      try {
        await runInfoSignal(s, 'schedule');
      } catch (e) {
        console.error('[info-signal] run failed', s.id, e);
      }
    }
  } finally {
    running = false;
  }
}

export function startInfoSignalScheduler() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick();
}

export function stopInfoSignalScheduler() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}
