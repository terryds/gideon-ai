import { getSetting, DEFAULT_BRAVE_SEARCH_API_KEY } from './db.ts';

export type BraveResult = {
  title: string;
  url: string;
  description: string;
  age: string | null;
};

export type BraveSearchResult =
  | { ok: true; results: BraveResult[]; query: string }
  | { ok: false; error: string };

function pickString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

export async function braveSearch(query: string, count = 10): Promise<BraveSearchResult> {
  const apiKey = (getSetting('brave_search_api_key') ?? DEFAULT_BRAVE_SEARCH_API_KEY).trim();
  if (!apiKey) return { ok: false, error: 'BRAVE_SEARCH_API_KEY is not configured.' };

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const body = await res.text();
  if (!res.ok) {
    const snippet = body.slice(0, 300).replace(/\s+/g, ' ').trim();
    return { ok: false, error: `Brave returned ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ''}` };
  }

  let data: { web?: { results?: Array<Record<string, unknown>> } };
  try {
    data = JSON.parse(body);
  } catch (parseErr) {
    return {
      ok: false,
      error: `Could not parse Brave response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)} — ${body.slice(0, 200)}`,
    };
  }

  const list = Array.isArray(data.web?.results) ? data.web!.results! : [];
  const results: BraveResult[] = list.slice(0, count).map((r) => ({
    title: stripHtml(pickString(r, 'title') ?? ''),
    url: pickString(r, 'url') ?? '',
    description: stripHtml(pickString(r, 'description') ?? '').slice(0, 600),
    age: pickString(r, 'age'),
  }));
  return { ok: true, results, query };
}
