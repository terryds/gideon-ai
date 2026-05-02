import {
  getSetting,
  DEFAULT_EXA_API_KEY,
  DEFAULT_EXA_NUM_RESULTS,
} from './db.ts';

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

function resolveNumResults(): number {
  const override = getSetting('exa_num_results');
  if (override === null) return DEFAULT_EXA_NUM_RESULTS;
  const n = Number(override);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : DEFAULT_EXA_NUM_RESULTS;
}

function pickString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function normalizeResult(raw: Record<string, unknown>): ExaPerson {
  const highlightsRaw = raw.highlights;
  const highlights: string[] = Array.isArray(highlightsRaw)
    ? highlightsRaw.filter((h): h is string => typeof h === 'string')
    : [];
  return {
    id: pickString(raw, 'id') ?? '',
    title: pickString(raw, 'title') ?? '',
    url: pickString(raw, 'url') ?? '',
    author: pickString(raw, 'author'),
    published_date: pickString(raw, 'publishedDate'),
    image: pickString(raw, 'image'),
    favicon: pickString(raw, 'favicon'),
    text: pickString(raw, 'text'),
    highlights,
    summary: pickString(raw, 'summary'),
  };
}

export async function searchExaPeople(query: string): Promise<ExaSearchResult> {
  const apiKey = (getSetting('exa_api_key') ?? DEFAULT_EXA_API_KEY).trim();
  const numResults = resolveNumResults();
  if (!apiKey) {
    return { ok: false, error: 'EXA_API_KEY is not configured.' };
  }

  const body = {
    query,
    category: 'people',
    numResults,
    contents: {
      highlights: { maxCharacters: 500 },
    },
  };

  let res: Response;
  try {
    res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const text = await res.text();
  if (!res.ok) {
    const snippet = text.slice(0, 300).replace(/\s+/g, ' ').trim();
    return {
      ok: false,
      error: `Exa returned ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ''}`,
    };
  }

  let data: {
    results?: Array<Record<string, unknown>>;
    requestId?: string;
    costDollars?: { total?: number };
  };
  try {
    data = JSON.parse(text);
  } catch (parseErr) {
    return {
      ok: false,
      error: `Could not parse Exa response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)} — ${text.slice(0, 200)}`,
    };
  }

  const list = Array.isArray(data.results) ? data.results : [];
  return {
    ok: true,
    results: list.map(normalizeResult),
    cost: typeof data.costDollars?.total === 'number' ? data.costDollars.total : null,
    request_id: typeof data.requestId === 'string' ? data.requestId : null,
  };
}
