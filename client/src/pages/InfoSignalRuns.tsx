import { useEffect, useState } from 'react';
import { api, type InfoSignalRunWithMeta } from '../api.ts';
import { formatRelative, formatDateTime } from '../format.ts';
import { Card, CardBody } from '../components/Card.tsx';
import { InfoSignalSubNav } from '../components/InfoSignalSubNav.tsx';

export default function InfoSignalRuns() {
  const [runs, setRuns] = useState<InfoSignalRunWithMeta[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setRuns(await api.infoSignals.allRuns());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  function toggle(id: number) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-6">
      <InfoSignalSubNav />

      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      {runs.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-600">
              No runs yet. They'll appear here once the scheduler ticks (every minute) or you click "Run now" on a signal.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul role="list" className="divide-y divide-slate-200">
            {runs.map((r) => {
              const isOpen = !!expanded[r.id];
              const decision = r.model_decision === 1 ? 'NOTIFY' : r.model_decision === 0 ? 'no notify' : null;
              return (
                <li key={r.id} className="bg-white">
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                        r.status === 'error'
                          ? 'bg-red-500'
                          : r.model_decision === 1
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                    />
                    <Chevron open={isOpen} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {r.signal_name?.trim() || r.signal_search_query || `signal #${r.signal_id}`}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {formatDateTime(r.started_at)} · {formatRelative(r.started_at)} · {r.duration_ms} ms ·{' '}
                        {r.triggered_by}
                        {decision && <> · {decision}</>}
                        {r.telegram_sent ? ' · 📨 sent' : r.telegram_error ? ' · ✗ telegram' : ''}
                        {r.status === 'error' && ' · errored'}
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
                      <RunDetail run={r} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function RunDetail({ run }: { run: InfoSignalRunWithMeta }) {
  return (
    <div className="space-y-4">
      {run.error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <span className="font-medium">Error: </span>{run.error}
        </div>
      )}

      {run.model_decision !== null && (
        <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Model decision</p>
          <p className="mt-1">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                run.model_decision === 1
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {run.model_decision === 1 ? 'notify = true' : 'notify = false'}
            </span>
          </p>
          {run.model_reason && (
            <p className="mt-2"><span className="text-xs font-medium uppercase tracking-wide text-slate-500">Reason — </span>{run.model_reason}</p>
          )}
          {run.model_summary && (
            <p className="mt-1"><span className="text-xs font-medium uppercase tracking-wide text-slate-500">Summary — </span>{run.model_summary}</p>
          )}
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Telegram</p>
        <p className="mt-1">
          {run.telegram_sent ? (
            <span className="text-emerald-700">✓ Sent.</span>
          ) : run.telegram_error ? (
            <span className="text-red-700">✗ {run.telegram_error}</span>
          ) : run.model_decision === 1 ? (
            <span className="text-slate-600">notify=true but no Telegram chat configured.</span>
          ) : (
            <span className="text-slate-500">Not sent (decision was no notify).</span>
          )}
        </p>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Brave search results {run.search_results ? `(${run.search_results.length})` : ''}
        </p>
        {!run.search_results || run.search_results.length === 0 ? (
          <p className="mt-1 text-slate-500">none</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {run.search_results.map((res, i) => (
              <li key={i}>
                <a
                  href={res.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-indigo-700 hover:underline"
                >
                  {i + 1}. {res.title || res.url}
                </a>
                <p className="text-xs text-slate-500">
                  {res.url.replace(/^https?:\/\//, '').slice(0, 80)}
                  {res.age && <> · {res.age}</>}
                </p>
                {res.description && (
                  <p className="mt-1 line-clamp-3 text-xs text-slate-700">{res.description}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.21 5.23a.75.75 0 011.06.02l4.25 4.5a.75.75 0 010 1.04l-4.25 4.5a.75.75 0 11-1.08-1.04L11.06 10 7.19 6.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}
