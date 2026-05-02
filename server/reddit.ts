import {
  getSetting,
  DEFAULT_PROXY_URL,
  DEFAULT_USER_AGENT,
  DEFAULT_REDDIT_RESULT_LIMIT,
} from './db.ts';

export type RedditPost = {
  id: string;
  title: string;
  permalink: string;
  url: string;
  subreddit: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  selftext: string;
  is_self: boolean;
  thumbnail: string | null;
};

export type SearchResult =
  | { ok: true; posts: RedditPost[]; after: string | null; query_url: string }
  | { ok: false; error: string; query_url: string };

export type SearchOptions = {
  after?: string | null;
  count?: number;
};

function resolveLimit(): number {
  const override = getSetting('reddit_result_limit');
  if (override === null) return DEFAULT_REDDIT_RESULT_LIMIT;
  const n = Number(override);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : DEFAULT_REDDIT_RESULT_LIMIT;
}

export async function searchReddit(
  keyword: string,
  subreddit: string | null,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const proxy = getSetting('proxy_url') ?? DEFAULT_PROXY_URL;
  const ua = getSetting('user_agent') ?? DEFAULT_USER_AGENT;
  const limit = resolveLimit();

  const params = new URLSearchParams({ q: keyword, limit: String(limit), sort: 'new' });
  if (options.after) params.set('after', options.after);
  if (typeof options.count === 'number' && options.count > 0) {
    params.set('count', String(options.count));
  }
  let queryUrl: string;
  if (subreddit) {
    params.set('restrict_sr', 'on');
    queryUrl = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json?${params}`;
  } else {
    queryUrl = `https://www.reddit.com/search.json?${params}`;
  }

  try {
    const init: RequestInit & { proxy?: string } = {
      headers: { 'User-Agent': ua, Accept: 'application/json' },
    };
    if (proxy) init.proxy = proxy;
    const res = await fetch(queryUrl, init);
    const body = await res.text();
    if (!res.ok) {
      const snippet = body.slice(0, 200).replace(/\s+/g, ' ').trim();
      return {
        ok: false,
        error: `Reddit returned ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ''}`,
        query_url: queryUrl,
      };
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      const snippet = body.slice(0, 200).replace(/\s+/g, ' ').trim();
      return {
        ok: false,
        error: `Expected JSON but got ${contentType || 'unknown content-type'} (likely a bot-block or proxy error page) — ${snippet}`,
        query_url: queryUrl,
      };
    }
    let data: { data?: { children?: Array<{ data?: Record<string, unknown> }>; after?: string | null } };
    try {
      data = JSON.parse(body);
    } catch (parseErr) {
      const snippet = body.slice(0, 200).replace(/\s+/g, ' ').trim();
      return {
        ok: false,
        error: `Could not parse JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)} — ${snippet}`,
        query_url: queryUrl,
      };
    }
    const children = data?.data?.children;
    if (!Array.isArray(children)) {
      return { ok: false, error: 'Unexpected response shape', query_url: queryUrl };
    }
    const posts: RedditPost[] = children.map((c) => {
      const d = (c.data ?? {}) as Record<string, unknown>;
      const permalink = typeof d.permalink === 'string' ? d.permalink : '';
      const thumbRaw = typeof d.thumbnail === 'string' ? d.thumbnail : '';
      return {
        id: String(d.id ?? ''),
        title: String(d.title ?? ''),
        permalink: permalink ? `https://www.reddit.com${permalink}` : '',
        url: String(d.url ?? ''),
        subreddit: String(d.subreddit ?? ''),
        author: String(d.author ?? ''),
        score: Number(d.score ?? 0),
        num_comments: Number(d.num_comments ?? 0),
        created_utc: Number(d.created_utc ?? 0),
        selftext: String(d.selftext ?? ''),
        is_self: !!d.is_self,
        thumbnail: thumbRaw.startsWith('http') ? thumbRaw : null,
      };
    });
    const after = typeof data?.data?.after === 'string' ? data.data.after : null;
    return { ok: true, posts, after, query_url: queryUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), query_url: queryUrl };
  }
}
