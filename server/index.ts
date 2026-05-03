import {
  db,
  setSetting,
  getSetting,
  DEFAULT_PROXY_URL,
  DEFAULT_USER_AGENT,
  DEFAULT_REDDIT_RESULT_LIMIT,
  DEFAULT_TWITTER_RESULT_LIMIT,
  DEFAULT_EXA_API_KEY,
  DEFAULT_EXA_NUM_RESULTS,
  DEFAULT_PERPLEXITY_API_KEY,
  INFO_SIGNAL_PERPLEXITY_PRESET,
  type Signal,
  type RunRow,
  type RedditKeyword,
  type TwitterKeyword,
  type TwitterTab,
  type ExaKeyword,
  type InfoSignal,
  type InfoSignalFrequency,
  type InfoSignalRunRow,
} from './db.ts';
import { PAIRS, getPair } from './pairs.ts';
import { fetchAllRates, fetchPair } from './rates.ts';
import { sendTelegram, getTelegramConfig, getBotInfo, getRecentChats } from './telegram.ts';
import {
  startListener,
  getIncomingHandler,
  getIncomingImagesEnabled,
  onIncomingHandlerChanged,
  type IncomingHandler,
} from './tg-listener.ts';
import {
  runPoll,
  startScheduler,
  checkSignal,
  formatTestAlertMessage,
  getScheduleInfo,
  getConfiguredCron,
  isValidCron,
} from './scheduler.ts';
import { searchReddit } from './reddit.ts';
import { searchTwitter, checkTwitterCli } from './twitter.ts';
import { searchExaPeople } from './exa.ts';
import {
  startInfoSignalScheduler,
  runInfoSignal,
} from './info-signal-scheduler.ts';
import { checkClaudeCli, isOnboarded, markOnboarded, resetOnboarding } from './onboarding.ts';

const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);
const err = (message: string, status: number) => Response.json({ error: message }, { status });

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function settingsResponse() {
  const cfg = getTelegramConfig();
  const proxyOverride = getSetting('proxy_url');
  const uaOverride = getSetting('user_agent');
  const limitOverride = getSetting('reddit_result_limit');
  const parsedLimit = limitOverride !== null ? Number(limitOverride) : null;
  const twitterLimitOverride = getSetting('twitter_result_limit');
  const parsedTwitterLimit = twitterLimitOverride !== null ? Number(twitterLimitOverride) : null;
  return {
    telegram_bot_token_set: !!cfg.botToken,
    telegram_chat_id: cfg.chatId,
    poll_cron: getConfiguredCron(),
    poll_cron_is_custom: !!db
      .prepare("SELECT 1 FROM settings WHERE key = 'poll_cron'")
      .get(),
    incoming_handler: getIncomingHandler(),
    incoming_images_enabled: getIncomingImagesEnabled(),
    proxy_url: proxyOverride ?? DEFAULT_PROXY_URL,
    proxy_url_is_custom: proxyOverride !== null,
    user_agent: uaOverride ?? DEFAULT_USER_AGENT,
    user_agent_is_custom: uaOverride !== null,
    reddit_result_limit:
      parsedLimit !== null && Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_REDDIT_RESULT_LIMIT,
    reddit_result_limit_is_custom: limitOverride !== null,
    twitter_auth_token_set: !!getSetting('twitter_auth_token'),
    twitter_ct0_set: !!getSetting('twitter_ct0'),
    twitter_proxy: getSetting('twitter_proxy') ?? '',
    twitter_proxy_is_custom: getSetting('twitter_proxy') !== null,
    twitter_result_limit:
      parsedTwitterLimit !== null && Number.isFinite(parsedTwitterLimit)
        ? parsedTwitterLimit
        : DEFAULT_TWITTER_RESULT_LIMIT,
    twitter_result_limit_is_custom: twitterLimitOverride !== null,
    exa_api_key: getSetting('exa_api_key') ?? DEFAULT_EXA_API_KEY,
    exa_api_key_is_custom: getSetting('exa_api_key') !== null,
    exa_num_results: (() => {
      const o = getSetting('exa_num_results');
      const n = o !== null ? Number(o) : null;
      return n !== null && Number.isFinite(n) ? n : DEFAULT_EXA_NUM_RESULTS;
    })(),
    exa_num_results_is_custom: getSetting('exa_num_results') !== null,
    perplexity_api_key: getSetting('perplexity_api_key') ?? DEFAULT_PERPLEXITY_API_KEY,
    perplexity_api_key_is_custom: getSetting('perplexity_api_key') !== null,
    info_signal_perplexity_preset: INFO_SIGNAL_PERPLEXITY_PRESET,
  };
}

const port = Number(process.env.PORT || 3000);

const server = Bun.serve({
  port,
  routes: {
    '/api/onboarding/status': () =>
      json({
        onboarded: isOnboarded(),
        telegram_bot_token_set: !!getTelegramConfig().botToken,
        telegram_chat_id: getTelegramConfig().chatId,
      }),

    '/api/onboarding/check-claude': async () => json(await checkClaudeCli()),

    '/api/onboarding/complete': {
      POST: async () => {
        const cfg = getTelegramConfig();
        if (!cfg.botToken || !cfg.chatId) {
          return err('Telegram bot token and chat must be configured first.', 400);
        }
        await markOnboarded();
        return json({ ok: true });
      },
    },

    '/api/onboarding/reset': {
      POST: () => {
        resetOnboarding();
        return json({ ok: true });
      },
    },

    '/api/pairs': () => json(PAIRS),

    '/api/rates': async () => json(await fetchAllRates()),

    '/api/signals': {
      GET: () =>
        json(db.prepare('SELECT * FROM signals ORDER BY created_at DESC').all() as Signal[]),
      POST: async (req) => {
        const body = await readJson(req);
        const pair = String(body.pair ?? '');
        const direction = body.direction;
        const threshold = Number(body.threshold);
        const notify = body.notify_telegram ?? 1;
        const enabled = body.enabled ?? 1;

        if (!pair || !getPair(pair)) return err('Invalid pair', 400);
        if (direction !== 'above' && direction !== 'below') return err('Invalid direction', 400);
        if (!Number.isFinite(threshold) || threshold <= 0) return err('Invalid threshold', 400);

        const info = db
          .prepare(
            `INSERT INTO signals (pair, direction, threshold, notify_telegram, enabled)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(pair, direction, threshold, notify ? 1 : 0, enabled ? 1 : 0);
        const row = db
          .prepare('SELECT * FROM signals WHERE id = ?')
          .get(Number(info.lastInsertRowid)) as Signal;
        return json(row, { status: 201 });
      },
    },

    '/api/signals/:id': {
      PATCH: async (req) => {
        const id = Number(req.params.id);
        const sig = db.prepare('SELECT * FROM signals WHERE id = ?').get(id) as Signal | undefined;
        if (!sig) return err('Not found', 404);
        const body = await readJson(req);

        const fields: string[] = [];
        const values: (string | number)[] = [];
        if (typeof body.threshold === 'number') {
          fields.push('threshold = ?');
          values.push(body.threshold);
        }
        if (body.direction === 'above' || body.direction === 'below') {
          fields.push('direction = ?');
          values.push(body.direction);
        }
        if (typeof body.notify_telegram === 'boolean' || body.notify_telegram === 0 || body.notify_telegram === 1) {
          fields.push('notify_telegram = ?');
          values.push(body.notify_telegram ? 1 : 0);
        }
        if (typeof body.enabled === 'boolean' || body.enabled === 0 || body.enabled === 1) {
          fields.push('enabled = ?');
          values.push(body.enabled ? 1 : 0);
        }
        if (!fields.length) return json(sig);

        values.push(id);
        db.prepare(`UPDATE signals SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM signals WHERE id = ?').get(id) as Signal;
        return json(updated);
      },
      DELETE: (req) => {
        const id = Number(req.params.id);
        db.prepare('DELETE FROM signals WHERE id = ?').run(id);
        return json({ ok: true });
      },
    },

    '/api/signals/:id/check': {
      POST: async (req) => {
        const id = Number(req.params.id);
        const sig = db.prepare('SELECT * FROM signals WHERE id = ?').get(id) as Signal | undefined;
        if (!sig) return err('Not found', 404);
        return json(await checkSignal(sig));
      },
    },

    '/api/signals/:id/test-alert': {
      POST: async (req) => {
        const id = Number(req.params.id);
        const sig = db.prepare('SELECT * FROM signals WHERE id = ?').get(id) as Signal | undefined;
        if (!sig) return err('Not found', 404);

        let value: number;
        try {
          value = await fetchPair(sig.pair);
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          return json({ ok: false, error: `Could not fetch ${sig.pair}: ${msg}` });
        }

        const { condition_met, text } = formatTestAlertMessage(sig, value);
        const result = await sendTelegram(text);
        return json({
          ok: result.ok,
          error: result.error,
          condition_met,
          value,
        });
      },
    },

    '/api/poll': {
      POST: async () => {
        await runPoll();
        return json({ ok: true });
      },
    },

    '/api/schedule': () => json(getScheduleInfo()),

    '/api/runs': () => {
      const rows = db
        .prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT 100')
        .all() as RunRow[];
      return json(
        rows.map((r) => ({ ...r, results: JSON.parse(r.results) }))
      );
    },

    '/api/settings': {
      GET: () => json(settingsResponse()),
      PUT: async (req) => {
        const body = await readJson(req);
        if (typeof body.telegram_bot_token === 'string') {
          if (body.telegram_bot_token.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'telegram_bot_token'").run();
          } else {
            setSetting('telegram_bot_token', body.telegram_bot_token);
          }
        }
        if (typeof body.telegram_chat_id === 'string') {
          if (body.telegram_chat_id.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'telegram_chat_id'").run();
          } else {
            setSetting('telegram_chat_id', body.telegram_chat_id);
          }
        }
        if (typeof body.incoming_images_enabled === 'boolean') {
          if (body.incoming_images_enabled) {
            db.prepare("DELETE FROM settings WHERE key = 'incoming_images_enabled'").run();
          } else {
            setSetting('incoming_images_enabled', 'off');
          }
        }
        if (typeof body.incoming_handler === 'string') {
          const next = body.incoming_handler === 'claude' ? 'claude' : 'none';
          const prev = getIncomingHandler();
          if (next !== prev) {
            if (next === 'claude') {
              setSetting('incoming_handler', 'claude');
            } else {
              db.prepare("DELETE FROM settings WHERE key = 'incoming_handler'").run();
            }
            await onIncomingHandlerChanged(next as IncomingHandler);
          }
        }
        if (typeof body.proxy_url === 'string') {
          const trimmed = body.proxy_url.trim();
          if (trimmed.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'proxy_url'").run();
          } else {
            setSetting('proxy_url', trimmed);
          }
        }
        if (typeof body.user_agent === 'string') {
          const trimmed = body.user_agent.trim();
          if (trimmed.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'user_agent'").run();
          } else {
            setSetting('user_agent', trimmed);
          }
        }
        if (body.reddit_result_limit === null || body.reddit_result_limit === '') {
          db.prepare("DELETE FROM settings WHERE key = 'reddit_result_limit'").run();
        } else if (body.reddit_result_limit !== undefined) {
          const n = Number(body.reddit_result_limit);
          if (!Number.isInteger(n) || n < 1 || n > 100) {
            return err('reddit_result_limit must be an integer between 1 and 100', 400);
          }
          setSetting('reddit_result_limit', String(n));
        }
        if (typeof body.twitter_auth_token === 'string') {
          const v = body.twitter_auth_token.trim();
          if (v.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'twitter_auth_token'").run();
          } else {
            setSetting('twitter_auth_token', v);
          }
        }
        if (typeof body.twitter_ct0 === 'string') {
          const v = body.twitter_ct0.trim();
          if (v.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'twitter_ct0'").run();
          } else {
            setSetting('twitter_ct0', v);
          }
        }
        if (typeof body.twitter_proxy === 'string') {
          const v = body.twitter_proxy.trim();
          if (v.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'twitter_proxy'").run();
          } else {
            setSetting('twitter_proxy', v);
          }
        }
        if (body.twitter_result_limit === null || body.twitter_result_limit === '') {
          db.prepare("DELETE FROM settings WHERE key = 'twitter_result_limit'").run();
        } else if (body.twitter_result_limit !== undefined) {
          const n = Number(body.twitter_result_limit);
          if (!Number.isInteger(n) || n < 1 || n > 100) {
            return err('twitter_result_limit must be an integer between 1 and 100', 400);
          }
          setSetting('twitter_result_limit', String(n));
        }
        if (typeof body.exa_api_key === 'string') {
          const v = body.exa_api_key.trim();
          if (v.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'exa_api_key'").run();
          } else {
            setSetting('exa_api_key', v);
          }
        }
        if (body.exa_num_results === null || body.exa_num_results === '') {
          db.prepare("DELETE FROM settings WHERE key = 'exa_num_results'").run();
        } else if (body.exa_num_results !== undefined) {
          const n = Number(body.exa_num_results);
          if (!Number.isInteger(n) || n < 1 || n > 100) {
            return err('exa_num_results must be an integer between 1 and 100', 400);
          }
          setSetting('exa_num_results', String(n));
        }
        if (typeof body.perplexity_api_key === 'string') {
          const v = body.perplexity_api_key.trim();
          if (v.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'perplexity_api_key'").run();
          } else {
            setSetting('perplexity_api_key', v);
          }
        }
        if (typeof body.poll_cron === 'string') {
          const trimmed = body.poll_cron.trim();
          if (trimmed.length === 0) {
            db.prepare("DELETE FROM settings WHERE key = 'poll_cron'").run();
            startScheduler(getConfiguredCron());
          } else if (!isValidCron(trimmed)) {
            return err(`Invalid cron expression: "${trimmed}"`, 400);
          } else {
            setSetting('poll_cron', trimmed);
            startScheduler(trimmed);
          }
        }
        return json(settingsResponse());
      },
    },

    '/api/settings/test-telegram': {
      POST: async () => {
        const result = await sendTelegram(
          '<b>Gideon AI Dashboard</b>\nTest message — Telegram is wired up correctly.'
        );
        return json(result, { status: result.ok ? 200 : 400 });
      },
    },

    '/api/settings/telegram/bot-info': async () => json(await getBotInfo()),

    '/api/settings/telegram/chats': async () => json(await getRecentChats()),

    '/api/reddit/keywords': {
      GET: () =>
        json(
          db
            .prepare('SELECT * FROM reddit_keywords ORDER BY created_at DESC')
            .all() as RedditKeyword[]
        ),
      POST: async (req) => {
        const body = await readJson(req);
        const keyword = String(body.keyword ?? '').trim();
        const subredditRaw = typeof body.subreddit === 'string' ? body.subreddit.trim() : '';
        const enabled = body.enabled ?? 1;
        if (!keyword) return err('Keyword is required', 400);

        const subreddit = subredditRaw.length > 0 ? subredditRaw.replace(/^r\//i, '') : null;
        const info = db
          .prepare(
            `INSERT INTO reddit_keywords (keyword, subreddit, enabled)
             VALUES (?, ?, ?)`
          )
          .run(keyword, subreddit, enabled ? 1 : 0);
        const row = db
          .prepare('SELECT * FROM reddit_keywords WHERE id = ?')
          .get(Number(info.lastInsertRowid)) as RedditKeyword;
        return json(row, { status: 201 });
      },
    },

    '/api/reddit/keywords/:id/search': {
      GET: async (req) => {
        const id = Number(req.params.id);
        const kw = db
          .prepare('SELECT * FROM reddit_keywords WHERE id = ?')
          .get(id) as RedditKeyword | undefined;
        if (!kw) return err('Not found', 404);
        const url = new URL(req.url);
        const after = url.searchParams.get('after') || null;
        const countParam = url.searchParams.get('count');
        const count = countParam ? Number(countParam) : undefined;
        return json(
          await searchReddit(kw.keyword, kw.subreddit, {
            after,
            count: Number.isFinite(count) ? count : undefined,
          })
        );
      },
    },

    '/api/twitter/cli-status': async () => json(await checkTwitterCli()),

    '/api/twitter/keywords': {
      GET: () =>
        json(
          db
            .prepare('SELECT * FROM twitter_keywords ORDER BY created_at DESC')
            .all() as TwitterKeyword[]
        ),
      POST: async (req) => {
        const body = await readJson(req);
        const keyword = String(body.keyword ?? '').trim();
        const tabRaw = typeof body.tab === 'string' ? body.tab : 'Latest';
        const tab: TwitterTab =
          tabRaw === 'Top' || tabRaw === 'Photos' || tabRaw === 'Videos' ? tabRaw : 'Latest';
        const enabled = body.enabled ?? 1;
        if (!keyword) return err('Keyword is required', 400);

        const info = db
          .prepare(
            `INSERT INTO twitter_keywords (keyword, tab, enabled)
             VALUES (?, ?, ?)`
          )
          .run(keyword, tab, enabled ? 1 : 0);
        const row = db
          .prepare('SELECT * FROM twitter_keywords WHERE id = ?')
          .get(Number(info.lastInsertRowid)) as TwitterKeyword;
        return json(row, { status: 201 });
      },
    },

    '/api/twitter/keywords/:id/search': {
      GET: async (req) => {
        const id = Number(req.params.id);
        const kw = db
          .prepare('SELECT * FROM twitter_keywords WHERE id = ?')
          .get(id) as TwitterKeyword | undefined;
        if (!kw) return err('Not found', 404);
        const url = new URL(req.url);
        const cursor = url.searchParams.get('cursor') || null;
        return json(await searchTwitter(kw.keyword, { cursor, tab: kw.tab }));
      },
    },

    '/api/exa/keywords': {
      GET: () =>
        json(
          db
            .prepare('SELECT * FROM exa_keywords ORDER BY created_at DESC')
            .all() as ExaKeyword[]
        ),
      POST: async (req) => {
        const body = await readJson(req);
        const query = String(body.query ?? '').trim();
        const enabled = body.enabled ?? 1;
        if (!query) return err('Query is required', 400);

        const info = db
          .prepare(
            `INSERT INTO exa_keywords (query, enabled) VALUES (?, ?)`
          )
          .run(query, enabled ? 1 : 0);
        const row = db
          .prepare('SELECT * FROM exa_keywords WHERE id = ?')
          .get(Number(info.lastInsertRowid)) as ExaKeyword;
        return json(row, { status: 201 });
      },
    },

    '/api/exa/keywords/:id/search': {
      GET: async (req) => {
        const id = Number(req.params.id);
        const kw = db
          .prepare('SELECT * FROM exa_keywords WHERE id = ?')
          .get(id) as ExaKeyword | undefined;
        if (!kw) return err('Not found', 404);
        return json(await searchExaPeople(kw.query));
      },
    },

    '/api/exa/keywords/:id': {
      PATCH: async (req) => {
        const id = Number(req.params.id);
        const existing = db
          .prepare('SELECT * FROM exa_keywords WHERE id = ?')
          .get(id) as ExaKeyword | undefined;
        if (!existing) return err('Not found', 404);
        const body = await readJson(req);

        const fields: string[] = [];
        const values: (string | number)[] = [];
        if (typeof body.query === 'string') {
          const q = body.query.trim();
          if (!q) return err('Query is required', 400);
          fields.push('query = ?');
          values.push(q);
        }
        if (typeof body.enabled === 'boolean' || body.enabled === 0 || body.enabled === 1) {
          fields.push('enabled = ?');
          values.push(body.enabled ? 1 : 0);
        }
        if (!fields.length) return json(existing);

        values.push(id);
        db.prepare(`UPDATE exa_keywords SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        const updated = db
          .prepare('SELECT * FROM exa_keywords WHERE id = ?')
          .get(id) as ExaKeyword;
        return json(updated);
      },
      DELETE: (req) => {
        const id = Number(req.params.id);
        db.prepare('DELETE FROM exa_keywords WHERE id = ?').run(id);
        return json({ ok: true });
      },
    },

    '/api/info-signals': {
      GET: () =>
        json(
          db
            .prepare('SELECT * FROM info_signals ORDER BY created_at DESC')
            .all() as InfoSignal[]
        ),
      POST: async (req) => {
        const body = await readJson(req);
        const search_query = String(body.search_query ?? '').trim();
        const notify_condition = String(body.notify_condition ?? '').trim();
        const frequencyRaw = String(body.frequency ?? '');
        const allowedFreq: InfoSignalFrequency[] = ['30m', '1h', '6h', '12h', '1d', '1w'];
        if (!search_query) return err('search_query is required', 400);
        if (!notify_condition) return err('notify_condition is required', 400);
        if (!allowedFreq.includes(frequencyRaw as InfoSignalFrequency)) {
          return err('frequency must be one of 30m, 1h, 6h, 12h, 1d, 1w', 400);
        }
        const name = typeof body.name === 'string' ? body.name.trim() || null : null;
        const enabled = body.enabled ?? 1;

        const info = db
          .prepare(
            `INSERT INTO info_signals (name, search_query, notify_condition, frequency, enabled)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(name, search_query, notify_condition, frequencyRaw, enabled ? 1 : 0);
        const row = db
          .prepare('SELECT * FROM info_signals WHERE id = ?')
          .get(Number(info.lastInsertRowid)) as InfoSignal;
        return json(row, { status: 201 });
      },
    },

    '/api/info-signals/runs': () => {
      const url = new URL('http://x'); // placeholder, we read from req via signature below
      void url;
      const rows = db
        .prepare(
          `SELECT r.*, s.name AS signal_name, s.search_query AS signal_search_query
             FROM info_signal_runs r
             LEFT JOIN info_signals s ON s.id = r.signal_id
             ORDER BY r.started_at DESC
             LIMIT 200`
        )
        .all() as Array<InfoSignalRunRow & { signal_name: string | null; signal_search_query: string | null }>;
      return json(
        rows.map((r) => ({
          ...r,
          search_results: r.search_results ? JSON.parse(r.search_results) : null,
        }))
      );
    },

    '/api/info-signals/:id/runs': (req) => {
      const id = Number(req.params.id);
      const rows = db
        .prepare(
          'SELECT * FROM info_signal_runs WHERE signal_id = ? ORDER BY started_at DESC LIMIT 200'
        )
        .all(id) as InfoSignalRunRow[];
      return json(
        rows.map((r) => ({
          ...r,
          search_results: r.search_results ? JSON.parse(r.search_results) : null,
        }))
      );
    },

    '/api/info-signals/:id/run-now': {
      POST: async (req) => {
        const id = Number(req.params.id);
        const sig = db
          .prepare('SELECT * FROM info_signals WHERE id = ?')
          .get(id) as InfoSignal | undefined;
        if (!sig) return err('Not found', 404);
        const result = await runInfoSignal(sig, 'manual');
        const run = db
          .prepare(
            'SELECT * FROM info_signal_runs WHERE id = ?'
          )
          .get(result.run_id) as InfoSignalRunRow | undefined;
        return json({
          ok: true,
          run: run
            ? {
                ...run,
                search_results: run.search_results ? JSON.parse(run.search_results) : null,
              }
            : null,
        });
      },
    },

    '/api/info-signals/:id': {
      PATCH: async (req) => {
        const id = Number(req.params.id);
        const existing = db
          .prepare('SELECT * FROM info_signals WHERE id = ?')
          .get(id) as InfoSignal | undefined;
        if (!existing) return err('Not found', 404);
        const body = await readJson(req);

        const fields: string[] = [];
        const values: (string | number | null)[] = [];
        if (typeof body.name === 'string') {
          fields.push('name = ?');
          values.push(body.name.trim() || null);
        }
        if (typeof body.search_query === 'string') {
          const v = body.search_query.trim();
          if (!v) return err('search_query is required', 400);
          fields.push('search_query = ?');
          values.push(v);
        }
        if (typeof body.notify_condition === 'string') {
          const v = body.notify_condition.trim();
          if (!v) return err('notify_condition is required', 400);
          fields.push('notify_condition = ?');
          values.push(v);
        }
        if (typeof body.frequency === 'string') {
          const allowed: InfoSignalFrequency[] = ['30m', '1h', '6h', '12h', '1d', '1w'];
          if (!allowed.includes(body.frequency as InfoSignalFrequency)) {
            return err('frequency must be one of 30m, 1h, 6h, 12h, 1d, 1w', 400);
          }
          fields.push('frequency = ?');
          values.push(body.frequency);
        }
        if (typeof body.enabled === 'boolean' || body.enabled === 0 || body.enabled === 1) {
          fields.push('enabled = ?');
          values.push(body.enabled ? 1 : 0);
        }
        if (!fields.length) return json(existing);

        values.push(id);
        db.prepare(`UPDATE info_signals SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        const updated = db
          .prepare('SELECT * FROM info_signals WHERE id = ?')
          .get(id) as InfoSignal;
        return json(updated);
      },
      DELETE: (req) => {
        const id = Number(req.params.id);
        db.prepare('DELETE FROM info_signal_runs WHERE signal_id = ?').run(id);
        db.prepare('DELETE FROM info_signals WHERE id = ?').run(id);
        return json({ ok: true });
      },
    },

    '/api/twitter/keywords/:id': {
      PATCH: async (req) => {
        const id = Number(req.params.id);
        const existing = db
          .prepare('SELECT * FROM twitter_keywords WHERE id = ?')
          .get(id) as TwitterKeyword | undefined;
        if (!existing) return err('Not found', 404);
        const body = await readJson(req);

        const fields: string[] = [];
        const values: (string | number)[] = [];
        if (typeof body.keyword === 'string') {
          const k = body.keyword.trim();
          if (!k) return err('Keyword is required', 400);
          fields.push('keyword = ?');
          values.push(k);
        }
        if (typeof body.tab === 'string') {
          if (
            body.tab !== 'Top' &&
            body.tab !== 'Latest' &&
            body.tab !== 'Photos' &&
            body.tab !== 'Videos'
          ) {
            return err('tab must be one of Top, Latest, Photos, Videos', 400);
          }
          fields.push('tab = ?');
          values.push(body.tab);
        }
        if (typeof body.enabled === 'boolean' || body.enabled === 0 || body.enabled === 1) {
          fields.push('enabled = ?');
          values.push(body.enabled ? 1 : 0);
        }
        if (!fields.length) return json(existing);

        values.push(id);
        db.prepare(`UPDATE twitter_keywords SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        const updated = db
          .prepare('SELECT * FROM twitter_keywords WHERE id = ?')
          .get(id) as TwitterKeyword;
        return json(updated);
      },
      DELETE: (req) => {
        const id = Number(req.params.id);
        db.prepare('DELETE FROM twitter_keywords WHERE id = ?').run(id);
        return json({ ok: true });
      },
    },

    '/api/reddit/keywords/:id': {
      PATCH: async (req) => {
        const id = Number(req.params.id);
        const existing = db
          .prepare('SELECT * FROM reddit_keywords WHERE id = ?')
          .get(id) as RedditKeyword | undefined;
        if (!existing) return err('Not found', 404);
        const body = await readJson(req);

        const fields: string[] = [];
        const values: (string | number | null)[] = [];
        if (typeof body.keyword === 'string') {
          const k = body.keyword.trim();
          if (!k) return err('Keyword is required', 400);
          fields.push('keyword = ?');
          values.push(k);
        }
        if (typeof body.subreddit === 'string') {
          const s = body.subreddit.trim();
          fields.push('subreddit = ?');
          values.push(s.length > 0 ? s.replace(/^r\//i, '') : null);
        }
        if (typeof body.enabled === 'boolean' || body.enabled === 0 || body.enabled === 1) {
          fields.push('enabled = ?');
          values.push(body.enabled ? 1 : 0);
        }
        if (!fields.length) return json(existing);

        values.push(id);
        db.prepare(`UPDATE reddit_keywords SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        const updated = db
          .prepare('SELECT * FROM reddit_keywords WHERE id = ?')
          .get(id) as RedditKeyword;
        return json(updated);
      },
      DELETE: (req) => {
        const id = Number(req.params.id);
        db.prepare('DELETE FROM reddit_keywords WHERE id = ?').run(id);
        return json({ ok: true });
      },
    },
  },

  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = Bun.file(`./dist/client${pathname}`);
    if (await file.exists()) return new Response(file);
    const index = Bun.file('./dist/client/index.html');
    if (await index.exists()) return new Response(index);
    return new Response('Not found — run `bun run build` to produce the client.', { status: 404 });
  },
});

console.log(`[server] listening on http://localhost:${server.port}`);
startScheduler(getConfiguredCron());
startListener();
startInfoSignalScheduler();
