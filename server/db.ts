import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || './data/dashboard.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath, { create: true });
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

db.run(`
  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
    threshold REAL NOT NULL,
    notify_telegram INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_state TEXT,
    last_value REAL,
    last_checked_at INTEGER,
    last_triggered_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    signals_checked INTEGER NOT NULL,
    signals_errored INTEGER NOT NULL,
    signals_triggered INTEGER NOT NULL,
    results TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

  CREATE TABLE IF NOT EXISTS reddit_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    subreddit TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_reddit_keywords_created ON reddit_keywords(created_at DESC);

  CREATE TABLE IF NOT EXISTS twitter_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    tab TEXT NOT NULL DEFAULT 'Latest' CHECK (tab IN ('Top','Latest','Photos','Videos')),
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_twitter_keywords_created ON twitter_keywords(created_at DESC);

  CREATE TABLE IF NOT EXISTS exa_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_exa_keywords_created ON exa_keywords(created_at DESC);

  CREATE TABLE IF NOT EXISTS info_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    search_query TEXT NOT NULL,
    notify_condition TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('30m','1h','6h','12h','1d','1w')),
    enabled INTEGER NOT NULL DEFAULT 1,
    last_checked_at INTEGER,
    last_notified_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_info_signals_created ON info_signals(created_at DESC);

  CREATE TABLE IF NOT EXISTS info_signal_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ok','error')),
    error TEXT,
    search_results TEXT,
    model_decision INTEGER,
    model_reason TEXT,
    model_summary TEXT,
    telegram_sent INTEGER NOT NULL DEFAULT 0,
    telegram_error TEXT,
    triggered_by TEXT NOT NULL DEFAULT 'schedule',
    FOREIGN KEY(signal_id) REFERENCES info_signals(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_info_signal_runs_started ON info_signal_runs(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_info_signal_runs_signal ON info_signal_runs(signal_id, started_at DESC);
`);

export const DEFAULT_PROXY_URL = '';
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
export const DEFAULT_REDDIT_RESULT_LIMIT = 10;
export const DEFAULT_TWITTER_RESULT_LIMIT = 20;
export const DEFAULT_EXA_API_KEY = '';
export const DEFAULT_EXA_NUM_RESULTS = 10;
export const DEFAULT_BRAVE_SEARCH_API_KEY = '';
export const DEFAULT_ANTHROPIC_API_KEY = '';
export const DEFAULT_INFO_SIGNAL_MODEL = 'claude-haiku-4-5-20251001';

export const FREQUENCY_SECONDS: Record<InfoSignalFrequency, number> = {
  '30m': 30 * 60,
  '1h': 60 * 60,
  '6h': 6 * 60 * 60,
  '12h': 12 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
};

export const FREQUENCY_LABELS: Record<InfoSignalFrequency, string> = {
  '30m': 'every 30 minutes',
  '1h': 'every hour',
  '6h': 'every 6 hours',
  '12h': 'every 12 hours',
  '1d': 'every day',
  '1w': 'every week',
};

export type RedditKeyword = {
  id: number;
  keyword: string;
  subreddit: string | null;
  enabled: number;
  created_at: number;
};

export type TwitterTab = 'Top' | 'Latest' | 'Photos' | 'Videos';

export type TwitterKeyword = {
  id: number;
  keyword: string;
  tab: TwitterTab;
  enabled: number;
  created_at: number;
};

export type ExaKeyword = {
  id: number;
  query: string;
  enabled: number;
  created_at: number;
};

export type InfoSignalFrequency = '30m' | '1h' | '6h' | '12h' | '1d' | '1w';

export type InfoSignal = {
  id: number;
  name: string | null;
  search_query: string;
  notify_condition: string;
  frequency: InfoSignalFrequency;
  enabled: number;
  last_checked_at: number | null;
  last_notified_at: number | null;
  created_at: number;
};

export type InfoSignalRunRow = {
  id: number;
  signal_id: number;
  started_at: number;
  completed_at: number;
  duration_ms: number;
  status: 'ok' | 'error';
  error: string | null;
  search_results: string | null;
  model_decision: number | null;
  model_reason: string | null;
  model_summary: string | null;
  telegram_sent: number;
  telegram_error: string | null;
  triggered_by: string;
};

export type Signal = {
  id: number;
  pair: string;
  direction: 'above' | 'below';
  threshold: number;
  notify_telegram: number;
  enabled: number;
  last_state: 'above' | 'below' | null;
  last_value: number | null;
  last_checked_at: number | null;
  last_triggered_at: number | null;
  created_at: number;
};

export type RunResult = {
  signal_id: number;
  pair: string;
  value: number | null;
  error: string | null;
  triggered: boolean;
};

export type RunRow = {
  id: number;
  started_at: number;
  completed_at: number;
  duration_ms: number;
  signals_checked: number;
  signals_errored: number;
  signals_triggered: number;
  results: string;
};

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}
