import {
  getSetting,
  DEFAULT_TWITTER_RESULT_LIMIT,
  type TwitterTab,
} from './db.ts';

export type TwitterUser = {
  id: string;
  screen_name: string;
  name: string;
  avatar: string | null;
};

export type TwitterPost = {
  id: string;
  text: string;
  created_at: string | null;
  url: string;
  user: TwitterUser;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    bookmarks: number;
    views: number;
  };
};

export type TwitterSearchResult =
  | { ok: true; posts: TwitterPost[]; next_cursor: string | null; cmd: string }
  | { ok: false; error: string; cmd: string };

export type SearchOptions = {
  cursor?: string | null;
  limit?: number;
  tab?: TwitterTab;
};

function resolveLimit(): number {
  const override = getSetting('twitter_result_limit');
  if (override === null) return DEFAULT_TWITTER_RESULT_LIMIT;
  const n = Number(override);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : DEFAULT_TWITTER_RESULT_LIMIT;
}

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') env[k] = v;
  }
  const authToken = getSetting('twitter_auth_token');
  const ct0 = getSetting('twitter_ct0');
  const proxy = getSetting('twitter_proxy');
  if (authToken) env.TWITTER_AUTH_TOKEN = authToken;
  if (ct0) env.TWITTER_CT0 = ct0;
  if (proxy) env.TWITTER_PROXY = proxy;
  return env;
}

function pickString(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string') return v;
  }
  return '';
}

function pickNumber(o: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

function normalizeTweet(raw: Record<string, unknown>): TwitterPost {
  const userRaw = (raw.user ?? raw.author ?? {}) as Record<string, unknown>;
  const screenName = pickString(userRaw, 'screen_name', 'screenName', 'username', 'handle');
  const userName = pickString(userRaw, 'name', 'display_name', 'displayName');
  const userId = pickString(userRaw, 'id', 'user_id', 'rest_id');
  const avatar = pickString(userRaw, 'avatar', 'profile_image_url', 'profile_image');
  const id = pickString(raw, 'id', 'tweet_id', 'rest_id');
  const text = pickString(raw, 'text', 'full_text', 'body', 'content');
  const url = pickString(raw, 'url', 'permalink') ||
    (id && screenName ? `https://x.com/${screenName}/status/${id}` : '');
  const metricsRaw = (raw.metrics ?? raw.stats ?? raw.public_metrics ?? raw) as Record<string, unknown>;
  return {
    id,
    text,
    created_at: pickString(raw, 'created_at', 'createdAt', 'time') || null,
    url,
    user: {
      id: userId,
      screen_name: screenName,
      name: userName || screenName,
      avatar: avatar || null,
    },
    metrics: {
      likes: pickNumber(metricsRaw, 'likes', 'favorite_count', 'favoriteCount', 'like_count'),
      retweets: pickNumber(metricsRaw, 'retweets', 'retweet_count', 'retweetCount'),
      replies: pickNumber(metricsRaw, 'replies', 'reply_count', 'replyCount'),
      bookmarks: pickNumber(metricsRaw, 'bookmarks', 'bookmark_count', 'bookmarkCount'),
      views: pickNumber(metricsRaw, 'views', 'view_count', 'viewCount', 'impressions'),
    },
  };
}

export async function searchTwitter(
  keyword: string,
  options: SearchOptions = {}
): Promise<TwitterSearchResult> {
  const max = options.limit ?? resolveLimit();
  const tab = options.tab ?? 'Latest';
  const args = ['search', keyword, '--json', '--max', String(max), '-t', tab, '--full-text'];
  if (options.cursor) args.push('--cursor', options.cursor);
  const cmd = `twitter ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`;

  let stdout: string;
  let stderr: string;
  let code: number | null;
  try {
    const proc = Bun.spawn(['twitter', ...args], {
      env: buildEnv(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [out, errText] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    code = await proc.exited;
    stdout = out;
    stderr = errText;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ENOENT|not found|no such file/i.test(msg)) {
      return {
        ok: false,
        error: 'twitter CLI not found on PATH. Install it (`uv tool install twitter-cli` or `pipx install twitter-cli`) and ensure the bun server can reach the binary.',
        cmd,
      };
    }
    return { ok: false, error: `Failed to run twitter CLI: ${msg}`, cmd };
  }

  if (code !== 0) {
    const tail = (stderr || stdout).slice(-400).trim();
    return {
      ok: false,
      error: `twitter CLI exited ${code}${tail ? ` — ${tail}` : ''}`,
      cmd,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (parseErr) {
    return {
      ok: false,
      error: `Could not parse twitter CLI JSON output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)} — first 200 chars: ${stdout.slice(0, 200)}`,
      cmd,
    };
  }

  const env = parsed as {
    ok?: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
    pagination?: { nextCursor?: string | null };
  };

  if (env.ok === false) {
    const e = env.error ?? {};
    return {
      ok: false,
      error: `${e.code ?? 'cli_error'}: ${e.message ?? 'unknown error'}`,
      cmd,
    };
  }

  const dataRaw = env.data;
  const list: Array<Record<string, unknown>> = Array.isArray(dataRaw)
    ? (dataRaw as Array<Record<string, unknown>>)
    : Array.isArray((dataRaw as { tweets?: unknown })?.tweets)
      ? ((dataRaw as { tweets: Array<Record<string, unknown>> }).tweets)
      : [];
  const posts = list.map(normalizeTweet);
  const nextCursor =
    typeof env.pagination?.nextCursor === 'string' && env.pagination.nextCursor.length > 0
      ? env.pagination.nextCursor
      : null;

  return { ok: true, posts, next_cursor: nextCursor, cmd };
}

export type CliStatus =
  | { ok: true; path: string }
  | { ok: false; error: string };

export async function checkTwitterCli(): Promise<CliStatus> {
  try {
    const proc = Bun.spawn(['which', 'twitter'], {
      env: buildEnv(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const out = (await new Response(proc.stdout).text()).trim();
    const code = await proc.exited;
    if (code !== 0 || !out) {
      return { ok: false, error: 'twitter CLI not found on PATH' };
    }
    return { ok: true, path: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
