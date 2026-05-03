import { getSetting, DEFAULT_PERPLEXITY_API_KEY } from './db.ts';

export type PerplexitySearchResult = {
  title: string;
  url: string;
  description: string;
  age: string | null;
};

export type NotifyDecision = {
  notify: boolean;
  reason: string;
  summary: string;
};

export type PerplexityEvaluateResult =
  | {
      ok: true;
      decision: NotifyDecision;
      search_results: PerplexitySearchResult[];
      raw: unknown;
    }
  | { ok: false; error: string };

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    notify: {
      type: 'boolean',
      description:
        "true if the latest web information satisfies the user's notify condition right now.",
    },
    reason: {
      type: 'string',
      description:
        'One or two sentences explaining why you decided to notify or not. Cite the most relevant finding.',
    },
    summary: {
      type: 'string',
      description:
        'A short, factual summary (1–3 sentences) of the relevant findings to include in the notification body.',
    },
  },
  required: ['notify', 'reason', 'summary'],
  additionalProperties: false,
} as const;

function buildInput(searchQuery: string, notifyCondition: string): string {
  return [
    'You are evaluating live web information to decide whether to send the user a notification.',
    '',
    `Topic the user is tracking: "${searchQuery}"`,
    `Notify condition (in the user's own words): "${notifyCondition}"`,
    '',
    'Search the web for the most current relevant information about the topic, then decide whether the notify condition is met right now based on what you find.',
    'Please return the data as a JSON object with the following structure: {notify: boolean, reason: string, summary: string}. Match the schema exactly.',
    'If the search results do not contain enough information to evaluate the condition, set notify=false and explain in reason.',
  ].join('\n');
}

function pickString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function normalizeSearchResults(raw: unknown): PerplexitySearchResult[] {
  if (!Array.isArray(raw)) return [];
  const out: PerplexitySearchResult[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      out.push({ title: item, url: item, description: '', age: null });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const url = pickString(o, 'url') ?? pickString(o, 'link');
    if (!url) continue;
    out.push({
      title: pickString(o, 'title') ?? pickString(o, 'name') ?? url,
      url,
      description:
        pickString(o, 'snippet') ??
        pickString(o, 'description') ??
        pickString(o, 'text') ??
        '',
      age: pickString(o, 'date') ?? pickString(o, 'published_date') ?? pickString(o, 'age'),
    });
  }
  return out;
}

function extractOutputText(parsed: Record<string, unknown>): string | null {
  const direct = pickString(parsed, 'output_text');
  if (direct) return direct;
  const output = parsed.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (!c || typeof c !== 'object') continue;
        const t = pickString(c as Record<string, unknown>, 'text');
        if (t) parts.push(t);
      }
    }
    if (parts.length) return parts.join('');
  }
  return null;
}

export async function evaluateInfoSignal(
  searchQuery: string,
  notifyCondition: string
): Promise<PerplexityEvaluateResult> {
  const apiKey = (getSetting('perplexity_api_key') ?? DEFAULT_PERPLEXITY_API_KEY).trim();
  if (!apiKey) return { ok: false, error: 'PERPLEXITY_API_KEY is not configured.' };

  const body = {
    preset: 'pro-search',
    input: buildInput(searchQuery, notifyCondition),
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'notify_decision', schema: DECISION_SCHEMA },
    },
  };

  let res: Response;
  try {
    res = await fetch('https://api.perplexity.ai/v1/agent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
      error: `Perplexity returned ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ''}`,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    return {
      ok: false,
      error: `Could not parse Perplexity response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    };
  }

  const outputText = extractOutputText(parsed);
  if (!outputText) {
    return { ok: false, error: 'Perplexity response did not include output text.' };
  }

  let decisionRaw: unknown;
  try {
    decisionRaw = JSON.parse(outputText);
  } catch (parseErr) {
    return {
      ok: false,
      error: `Model output was not valid JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    };
  }
  if (!decisionRaw || typeof decisionRaw !== 'object') {
    return { ok: false, error: 'Model output was not a JSON object.' };
  }
  const d = decisionRaw as Record<string, unknown>;
  const decision: NotifyDecision = {
    notify: !!d.notify,
    reason: typeof d.reason === 'string' ? d.reason : '',
    summary: typeof d.summary === 'string' ? d.summary : '',
  };

  const search_results = normalizeSearchResults(
    parsed.search_results ?? parsed.citations ?? []
  );

  return { ok: true, decision, search_results, raw: parsed };
}
