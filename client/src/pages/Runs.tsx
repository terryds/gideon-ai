import { useEffect, useState } from 'react';
import { api, type PairDef, type Run } from '../api.ts';
import { formatValue, formatRelative, formatDateTime } from '../format.ts';
import { Card, CardHeader } from '../components/Card.tsx';
import { FinanceSubNav } from '../components/FinanceSubNav.tsx';

export default function Runs() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [pairs, setPairs] = useState<PairDef[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [r, p] = await Promise.all([api.runs(), api.pairs()]);
      setRuns(r);
      setPairs(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  const pairMap = new Map(pairs.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <FinanceSubNav />
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Run history</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Each row is one scheduler tick. Most recent first (last 100).
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      <Card>
        <CardHeader title={`${runs.length} run${runs.length === 1 ? '' : 's'}`} />
        {runs.length === 0 ? (
          <p className="p-5 text-sm text-slate-600 dark:text-slate-400">No runs yet. The first scheduled poll will appear here.</p>
        ) : (
          <ul role="list" className="divide-y divide-slate-200 dark:divide-slate-800">
            {runs.map((run) => {
              const anyError = run.signals_errored > 0;
              const anyTriggered = run.signals_triggered > 0;
              return (
                <li key={run.id} className="px-4 py-3 sm:px-5">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 list-none">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">
                          <time dateTime={new Date(run.started_at * 1000).toISOString()}>
                            {formatDateTime(run.started_at)}
                          </time>
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatRelative(run.started_at)} · {run.duration_ms}ms
                        </span>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium dark:bg-slate-800">
                          {run.signals_checked} checked
                        </span>
                        {anyTriggered && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            {run.signals_triggered} triggered
                          </span>
                        )}
                        {anyError && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950 dark:text-red-200">
                            {run.signals_errored} errored
                          </span>
                        )}
                      </div>
                      <span aria-hidden="true" className="text-xs text-slate-500 dark:text-slate-400">
                        expand
                      </span>
                    </summary>

                    {run.results.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        No enabled signals at the time of this run.
                      </p>
                    ) : (
                      <ul role="list" className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
                        {run.results.map((r) => {
                          const p = pairMap.get(r.pair);
                          const outcomeTag = r.error
                            ? { label: 'error', cls: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200' }
                            : r.triggered
                              ? { label: 'triggered', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' }
                              : { label: 'ok', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
                          const notifyTag = r.triggered
                            ? r.notified
                              ? { label: '📨 notified', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' }
                              : { label: 'not notified', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
                            : null;
                          return (
                            <li key={r.signal_id} className="rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold">
                                  {r.pair}
                                  {r.direction !== undefined && r.threshold !== undefined && (
                                    <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                                      notify {r.direction === 'above' ? '≥' : '≤'}{' '}
                                      <span className="font-mono tabular-nums">{formatValue(r.threshold, p)}</span>
                                    </span>
                                  )}
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${outcomeTag.cls}`}>
                                    {outcomeTag.label}
                                  </span>
                                  {notifyTag && (
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${notifyTag.cls}`}>
                                      {notifyTag.label}
                                    </span>
                                  )}
                                </span>
                              </div>

                              <dl className="mt-1.5 grid grid-cols-[max-content,1fr] gap-x-3 gap-y-0.5 text-xs">
                                <dt className="text-slate-500 dark:text-slate-400">Fetched value</dt>
                                <dd className="font-mono tabular-nums">
                                  {r.value === null ? (
                                    <span className="text-red-700 dark:text-red-300">— (fetch failed)</span>
                                  ) : (
                                    formatValue(r.value, p)
                                  )}
                                </dd>

                                {r.source && (
                                  <>
                                    <dt className="text-slate-500 dark:text-slate-400">Source</dt>
                                    <dd>
                                      <code className="text-[11px]">{r.source}</code>
                                      {r.source_url && (
                                        <>
                                          {' — '}
                                          <a
                                            href={r.source_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="break-all text-[11px] text-indigo-700 underline dark:text-indigo-400"
                                          >
                                            {r.source_url}
                                          </a>
                                        </>
                                      )}
                                    </dd>
                                  </>
                                )}

                                {r.error && (
                                  <>
                                    <dt className="text-slate-500 dark:text-slate-400">Error</dt>
                                    <dd className="text-red-700 dark:text-red-300">{r.error}</dd>
                                  </>
                                )}

                                {r.triggered && !r.notified && r.notify_skipped_reason && (
                                  <>
                                    <dt className="text-slate-500 dark:text-slate-400">Why no notify</dt>
                                    <dd className="text-slate-700 dark:text-slate-300">{r.notify_skipped_reason}</dd>
                                  </>
                                )}
                              </dl>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
