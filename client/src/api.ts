export type PairDef = {
  id: string;
  label: string;
  quote: string;
  decimals: number;
  source: 'binance' | 'forex';
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
  direction?: 'above' | 'below';
  threshold?: number;
  source?: string;
  source_url?: string;
  value: number | null;
  error: string | null;
  triggered: boolean;
  notified?: boolean;
  notify_skipped_reason?: string | null;
};

export type Run = {
  id: number;
  started_at: number;
  completed_at: number;
  duration_ms: number;
  signals_checked: number;
  signals_errored: number;
  signals_triggered: number;
  results: RunResult[];
};

export type ScheduleInfo = {
  cron: string;
  last_poll_at: number | null;
  next_poll_at: number | null;
};

export type IncomingHandler = 'none' | 'claude';

export type SettingsResponse = {
  telegram_bot_token_set: boolean;
  telegram_chat_id: string | null;
  poll_cron: string;
  poll_cron_is_custom: boolean;
  incoming_handler: IncomingHandler;
  incoming_images_enabled: boolean;
  proxy_url: string;
  proxy_url_is_custom: boolean;
  user_agent: string;
  user_agent_is_custom: boolean;
  reddit_result_limit: number;
  reddit_result_limit_is_custom: boolean;
  twitter_auth_token_set: boolean;
  twitter_ct0_set: boolean;
  twitter_proxy: string;
  twitter_proxy_is_custom: boolean;
  twitter_result_limit: number;
  twitter_result_limit_is_custom: boolean;
  exa_api_key: string;
  exa_api_key_is_custom: boolean;
  exa_num_results: number;
  exa_num_results_is_custom: boolean;
  perplexity_api_key: string;
  perplexity_api_key_is_custom: boolean;
  info_signal_perplexity_preset: string;
};

export type RedditKeyword = {
  id: number;
  keyword: string;
  subreddit: string | null;
  enabled: number;
  created_at: number;
};

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

export type RedditSearchResult =
  | { ok: true; posts: RedditPost[]; after: string | null; query_url: string }
  | { ok: false; error: string; query_url: string };

export type TwitterTab = 'Top' | 'Latest' | 'Photos' | 'Videos';

export type TwitterKeyword = {
  id: number;
  keyword: string;
  tab: TwitterTab;
  enabled: number;
  created_at: number;
};

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

export type TwitterCliStatus = { ok: true; path: string } | { ok: false; error: string };

export type ExaKeyword = {
  id: number;
  query: string;
  enabled: number;
  created_at: number;
};

export type ExaPerson = {
  id: string;
  title: string;
  url: string;
  author: string | null;
  published_date: string | null;
  image: string | null;
  favicon: string | null;
  text: string | null;
  highlights: string[];
  summary: string | null;
};

export type ExaSearchResult =
  | { ok: true; results: ExaPerson[]; cost: number | null; request_id: string | null }
  | { ok: false; error: string };

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

export type InfoSignalSearchResult = {
  title: string;
  url: string;
  description: string;
  age: string | null;
};

export type InfoSignalRun = {
  id: number;
  signal_id: number;
  started_at: number;
  completed_at: number;
  duration_ms: number;
  status: 'ok' | 'error';
  error: string | null;
  search_results: InfoSignalSearchResult[] | null;
  model_decision: number | null;
  model_reason: string | null;
  model_summary: string | null;
  telegram_sent: number;
  telegram_error: string | null;
  triggered_by: string;
};

export type InfoSignalRunWithMeta = InfoSignalRun & {
  signal_name: string | null;
  signal_search_query: string | null;
};

export type BotInfo = { id: number; username: string; first_name: string };

export type ChatInfo = {
  id: number;
  type: string;
  title: string | null;
  username: string | null;
  first_name: string | null;
  last_message_at: number | null;
};

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

export type RateMap = Record<string, { value: number | null; error: string | null }>;

const API_PREFIX = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export type OnboardingStatus = {
  onboarded: boolean;
  telegram_bot_token_set: boolean;
  telegram_chat_id: string | null;
};

export type ClaudeCheckResult =
  | { ok: true; version: string }
  | { ok: false; error: string };

export const api = {
  onboarding: {
    status: () => request<OnboardingStatus>('/onboarding/status'),
    checkClaude: () => request<ClaudeCheckResult>('/onboarding/check-claude'),
    complete: () => request<{ ok: boolean }>('/onboarding/complete', { method: 'POST' }),
    reset: () => request<{ ok: boolean }>('/onboarding/reset', { method: 'POST' }),
  },
  pairs: () => request<PairDef[]>('/pairs'),
  rates: () => request<RateMap>('/rates'),
  signals: {
    list: () => request<Signal[]>('/signals'),
    create: (body: { pair: string; direction: 'above' | 'below'; threshold: number; notify_telegram: boolean; enabled: boolean }) =>
      request<Signal>('/signals', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<{ threshold: number; direction: 'above' | 'below'; notify_telegram: boolean; enabled: boolean }>) =>
      request<Signal>(`/signals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) => request<{ ok: boolean }>(`/signals/${id}`, { method: 'DELETE' }),
    testAlert: (id: number) =>
      request<{ ok: boolean; error?: string; condition_met?: boolean; value?: number }>(
        `/signals/${id}/test-alert`,
        { method: 'POST' }
      ),
  },
  poll: () => request<{ ok: boolean }>('/poll', { method: 'POST' }),
  schedule: () => request<ScheduleInfo>('/schedule'),
  runs: () => request<Run[]>('/runs'),
  settings: {
    get: () => request<SettingsResponse>('/settings'),
    update: (body: {
      telegram_bot_token?: string;
      telegram_chat_id?: string;
      poll_cron?: string;
      incoming_handler?: IncomingHandler;
      incoming_images_enabled?: boolean;
      proxy_url?: string;
      user_agent?: string;
      reddit_result_limit?: number | null;
      twitter_auth_token?: string;
      twitter_ct0?: string;
      twitter_proxy?: string;
      twitter_result_limit?: number | null;
      exa_api_key?: string;
      exa_num_results?: number | null;
      perplexity_api_key?: string;
    }) => request<SettingsResponse>('/settings', { method: 'PUT', body: JSON.stringify(body) }),
    testTelegram: () => request<{ ok: boolean; error?: string }>('/settings/test-telegram', { method: 'POST' }),
    botInfo: () => request<Ok<{ bot: BotInfo }> | Err>('/settings/telegram/bot-info'),
    chats: () => request<Ok<{ chats: ChatInfo[] }> | Err>('/settings/telegram/chats'),
  },
  reddit: {
    keywords: {
      list: () => request<RedditKeyword[]>('/reddit/keywords'),
      create: (body: { keyword: string; subreddit?: string; enabled?: boolean }) =>
        request<RedditKeyword>('/reddit/keywords', { method: 'POST', body: JSON.stringify(body) }),
      update: (id: number, body: Partial<{ keyword: string; subreddit: string; enabled: boolean }>) =>
        request<RedditKeyword>(`/reddit/keywords/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      remove: (id: number) =>
        request<{ ok: boolean }>(`/reddit/keywords/${id}`, { method: 'DELETE' }),
      search: (id: number, opts?: { after?: string | null; count?: number }) => {
        const params = new URLSearchParams();
        if (opts?.after) params.set('after', opts.after);
        if (typeof opts?.count === 'number') params.set('count', String(opts.count));
        const qs = params.toString();
        return request<RedditSearchResult>(
          `/reddit/keywords/${id}/search${qs ? `?${qs}` : ''}`
        );
      },
    },
  },
  twitter: {
    cliStatus: () => request<TwitterCliStatus>('/twitter/cli-status'),
    keywords: {
      list: () => request<TwitterKeyword[]>('/twitter/keywords'),
      create: (body: { keyword: string; tab?: TwitterTab; enabled?: boolean }) =>
        request<TwitterKeyword>('/twitter/keywords', { method: 'POST', body: JSON.stringify(body) }),
      update: (id: number, body: Partial<{ keyword: string; tab: TwitterTab; enabled: boolean }>) =>
        request<TwitterKeyword>(`/twitter/keywords/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      remove: (id: number) =>
        request<{ ok: boolean }>(`/twitter/keywords/${id}`, { method: 'DELETE' }),
      search: (id: number, opts?: { cursor?: string | null }) => {
        const params = new URLSearchParams();
        if (opts?.cursor) params.set('cursor', opts.cursor);
        const qs = params.toString();
        return request<TwitterSearchResult>(
          `/twitter/keywords/${id}/search${qs ? `?${qs}` : ''}`
        );
      },
    },
  },
  infoSignals: {
    list: () => request<InfoSignal[]>('/info-signals'),
    create: (body: {
      name?: string;
      search_query: string;
      notify_condition: string;
      frequency: InfoSignalFrequency;
      enabled?: boolean;
    }) =>
      request<InfoSignal>('/info-signals', { method: 'POST', body: JSON.stringify(body) }),
    update: (
      id: number,
      body: Partial<{
        name: string;
        search_query: string;
        notify_condition: string;
        frequency: InfoSignalFrequency;
        enabled: boolean;
      }>
    ) => request<InfoSignal>(`/info-signals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/info-signals/${id}`, { method: 'DELETE' }),
    runNow: (id: number) =>
      request<{ ok: boolean; run: InfoSignalRun | null }>(
        `/info-signals/${id}/run-now`,
        { method: 'POST' }
      ),
    runs: (id: number) => request<InfoSignalRun[]>(`/info-signals/${id}/runs`),
    allRuns: () => request<InfoSignalRunWithMeta[]>('/info-signals/runs'),
  },
  exa: {
    keywords: {
      list: () => request<ExaKeyword[]>('/exa/keywords'),
      create: (body: { query: string; enabled?: boolean }) =>
        request<ExaKeyword>('/exa/keywords', { method: 'POST', body: JSON.stringify(body) }),
      update: (id: number, body: Partial<{ query: string; enabled: boolean }>) =>
        request<ExaKeyword>(`/exa/keywords/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      remove: (id: number) =>
        request<{ ok: boolean }>(`/exa/keywords/${id}`, { method: 'DELETE' }),
      search: (id: number) => request<ExaSearchResult>(`/exa/keywords/${id}/search`),
    },
  },
};
