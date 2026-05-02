import {
  getSetting,
  DEFAULT_ANTHROPIC_API_KEY,
  DEFAULT_INFO_SIGNAL_MODEL,
} from './db.ts';
import type { BraveResult } from './brave.ts';

export type NotifyDecision = {
  notify: boolean;
  reason: string;
  summary: string;
};

export type EvaluateResult =
  | { ok: true; decision: NotifyDecision; raw: unknown }
  | { ok: false; error: string };

const DECISION_TOOL = {
  name: 'notify_decision',
  description:
    'Decide whether to notify the user based on the search results and the user-supplied notify condition.',
  input_schema: {
    type: 'object',
    properties: {
      notify: {
        type: 'boolean',
        description: 'true if the search results satisfy the user\'s notify condition right now.',
      },
      reason: {
        type: 'string',
        description:
          'One or two sentences explaining why you decided to notify or not. Cite the most relevant snippet.',
      },
      summary: {
        type: 'string',
        description:
          'A short, factual summary (1–3 sentences) of the relevant findings to include in the notification body.',
      },
    },
    required: ['notify', 'reason', 'summary'],
  },
} as const;

function buildPrompt(
  searchQuery: string,
  notifyCondition: string,
  results: BraveResult[]
): string {
  const lines = [
    'You are evaluating live web search results to decide whether to send the user a notification.',
    '',
    `Search query the user is tracking: "${searchQuery}"`,
    `Notify condition (in the user's own words): "${notifyCondition}"`,
    '',
    'Top web search results from Brave:',
  ];
  if (results.length === 0) {
    lines.push('(no results returned)');
  } else {
    results.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title}`);
      lines.push(`   ${r.url}`);
      if (r.description) lines.push(`   ${r.description}`);
    });
  }
  lines.push(
    '',
    'Decide ONLY based on the results above. If the results do not contain enough information to evaluate the condition, set notify=false and explain in the reason. Use the notify_decision tool to return your answer.'
  );
  return lines.join('\n');
}

export async function evaluateNotify(
  searchQuery: string,
  notifyCondition: string,
  results: BraveResult[]
): Promise<EvaluateResult> {
  const apiKey = (getSetting('anthropic_api_key') ?? DEFAULT_ANTHROPIC_API_KEY).trim();
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY is not configured.' };

  const body = {
    model: DEFAULT_INFO_SIGNAL_MODEL,
    max_tokens: 512,
    tools: [DECISION_TOOL],
    tool_choice: { type: 'tool', name: 'notify_decision' },
    messages: [
      { role: 'user', content: buildPrompt(searchQuery, notifyCondition, results) },
    ],
  };

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
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
      error: `Anthropic returned ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ''}`,
    };
  }

  let parsed: { content?: Array<{ type: string; name?: string; input?: unknown }> };
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    return {
      ok: false,
      error: `Could not parse Anthropic response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    };
  }

  const tool = parsed.content?.find(
    (c) => c.type === 'tool_use' && c.name === 'notify_decision'
  );
  if (!tool || !tool.input || typeof tool.input !== 'object') {
    return { ok: false, error: 'Model did not return a notify_decision tool call.' };
  }

  const input = tool.input as Record<string, unknown>;
  const decision: NotifyDecision = {
    notify: !!input.notify,
    reason: typeof input.reason === 'string' ? input.reason : '',
    summary: typeof input.summary === 'string' ? input.summary : '',
  };
  return { ok: true, decision, raw: parsed };
}
