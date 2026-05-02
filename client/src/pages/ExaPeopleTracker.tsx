import { useEffect, useState } from 'react';
import { api, type ExaKeyword, type ExaPerson, type ExaSearchResult } from '../api.ts';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { ExaApiSettingsCard } from '../components/ExaApiSettingsCard.tsx';

type Form = { query: string };
const defaultForm: Form = { query: '' };

type ResultsState = {
  loading: boolean;
  results: ExaPerson[];
  cost: number | null;
  request_id: string | null;
  error: string | null;
  loaded: boolean;
};

const emptyResults = (): ResultsState => ({
  loading: false,
  results: [],
  cost: null,
  request_id: null,
  error: null,
  loaded: false,
});

export default function ExaPeopleTracker() {
  const [keywords, setKeywords] = useState<ExaKeyword[]>([]);
  const [results, setResults] = useState<Record<number, ResultsState>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [form, setForm] = useState<Form>(defaultForm);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Form>(defaultForm);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await api.exa.keywords.list();
      setKeywords(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function loadFresh(id: number) {
    setResults((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyResults()), loading: true, error: null },
    }));
    try {
      const data: ExaSearchResult = await api.exa.keywords.search(id);
      setResults((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          results: data.ok ? data.results : [],
          cost: data.ok ? data.cost : null,
          request_id: data.ok ? data.request_id : null,
          error: data.ok ? null : data.error,
          loaded: true,
        },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? emptyResults()),
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          loaded: true,
        },
      }));
    }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = !prev[id];
      const out = { ...prev, [id]: next };
      if (next && !results[id]?.loaded) {
        loadFresh(id);
      }
      return out;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    const query = form.query.trim();
    if (!query) {
      setError('Query is required.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.exa.keywords.create({ query, enabled: true });
      setForm(defaultForm);
      await refresh();
      setExpanded((prev) => ({ ...prev, [created.id]: true }));
      await loadFresh(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(kw: ExaKeyword, enabled: boolean) {
    setError(null);
    try {
      await api.exa.keywords.update(kw.id, { enabled });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(kw: ExaKeyword) {
    if (!confirm(`Remove query "${kw.query}"?`)) return;
    setError(null);
    try {
      await api.exa.keywords.remove(kw.id);
      setResults((prev) => {
        const next = { ...prev };
        delete next[kw.id];
        return next;
      });
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[kw.id];
        return next;
      });
      await refresh();
      setMsg('Query removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function startEdit(kw: ExaKeyword) {
    setEditingId(kw.id);
    setEditForm({ query: kw.query });
    setError(null);
    setMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(defaultForm);
  }

  async function handleSaveEdit(id: number) {
    const query = editForm.query.trim();
    if (!query) {
      setError('Query is required.');
      return;
    }
    setError(null);
    try {
      await api.exa.keywords.update(id, { query });
      cancelEdit();
      await refresh();
      if (expanded[id]) await loadFresh(id);
      setMsg('Query updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Exa People Search</h1>
        <p className="mt-1 text-sm text-slate-600">
          Find people via Exa's <code className="rounded bg-slate-200 px-1 font-mono">category=people</code>{' '}
          search (1B+ public profiles). Try queries like <em>"VP of Product at Microsoft"</em> or{' '}
          <em>"enterprise sales reps from Microsoft in EMEA"</em>.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Note: Exa search has no pagination — each refresh returns up to{' '}
          <code className="rounded bg-slate-200 px-1">numResults</code> people in one call.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          {error}
        </div>
      )}
      {msg && (
        <div role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {msg}
        </div>
      )}

      <Card>
        <CardHeader title="Add query" description="Click a row in the list below to fetch results lazily." />
        <CardBody>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label htmlFor="exa-query" className="block text-xs font-medium text-slate-700">
                Query
              </label>
              <input
                id="exa-query"
                type="text"
                value={form.query}
                onChange={(e) => setForm({ query: e.target.value })}
                placeholder='e.g. "Founders of AI startups in San Francisco"'
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                required
              />
            </div>
            <Button type="submit" disabled={busy || !form.query.trim()}>
              {busy ? 'Adding…' : 'Add query'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {keywords.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-600">No queries yet. Add one above to start searching.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul role="list" className="divide-y divide-slate-200">
            {keywords.map((kw) => (
              <KeywordRow
                key={kw.id}
                kw={kw}
                isOpen={!!expanded[kw.id]}
                isEditing={editingId === kw.id}
                editForm={editForm}
                setEditForm={setEditForm}
                results={results[kw.id]}
                onToggleOpen={() => toggleExpand(kw.id)}
                onToggleEnabled={(v) => handleToggle(kw, v)}
                onEdit={() => startEdit(kw)}
                onCancelEdit={cancelEdit}
                onSaveEdit={() => handleSaveEdit(kw.id)}
                onDelete={() => handleDelete(kw)}
                onRefresh={() => loadFresh(kw.id)}
              />
            ))}
          </ul>
        </div>
      )}

      <ExaApiSettingsCard />
    </div>
  );
}

type RowProps = {
  kw: ExaKeyword;
  isOpen: boolean;
  isEditing: boolean;
  editForm: Form;
  setEditForm: React.Dispatch<React.SetStateAction<Form>>;
  results: ResultsState | undefined;
  onToggleOpen: () => void;
  onToggleEnabled: (v: boolean) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
};

function KeywordRow(props: RowProps) {
  const { kw, isOpen, isEditing, editForm, setEditForm, results } = props;
  return (
    <li className="bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={props.onToggleOpen}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          disabled={isEditing}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${kw.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          />
          <Chevron open={isOpen} />
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-slate-900">{kw.query}</span>
            <span className="block text-xs text-slate-500">
              {results?.loaded && results.results.length > 0 && (
                <>{results.results.length} result{results.results.length === 1 ? '' : 's'} loaded</>
              )}
              {results?.loaded && results.cost !== null && (
                <> · ${results.cost.toFixed(4)}</>
              )}
            </span>
          </span>
        </button>
        {!isEditing && (
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              id={`exa-enabled-${kw.id}`}
              checked={!!kw.enabled}
              onChange={props.onToggleEnabled}
              label={kw.enabled ? 'On' : 'Off'}
            />
            <Button variant="ghost" onClick={props.onEdit}>Edit</Button>
            <Button variant="danger" onClick={props.onDelete}>Delete</Button>
          </div>
        )}
      </div>

      {isEditing && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700">Query</label>
              <input
                type="text"
                value={editForm.query}
                onChange={(e) => setEditForm({ query: e.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={props.onSaveEdit}>Save</Button>
              <Button type="button" variant="ghost" onClick={props.onCancelEdit}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {isOpen && !isEditing && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
          <ResultsPanel state={results} onRefresh={props.onRefresh} />
        </div>
      )}
    </li>
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

function ResultsPanel({
  state,
  onRefresh,
}: {
  state: ResultsState | undefined;
  onRefresh: () => void;
}) {
  if (!state || (state.loading && state.results.length === 0)) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }
  if (state.error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-700">Search failed: {state.error}</p>
        <Button variant="secondary" onClick={onRefresh}>Try again</Button>
      </div>
    );
  }
  if (state.results.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">No matching people.</p>
        <Button variant="secondary" onClick={onRefresh}>Refresh</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {state.results.length} result{state.results.length === 1 ? '' : 's'}
          {state.cost !== null && <> · ${state.cost.toFixed(4)} this call</>}
        </p>
        <Button variant="ghost" onClick={onRefresh} disabled={state.loading}>
          {state.loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <ul role="list" className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {state.results.map((p) => (
          <li key={p.id || p.url} className="flex gap-3 px-4 py-4 sm:px-5">
            {p.image ? (
              <img
                src={p.image}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full border border-slate-200 object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-base font-semibold text-slate-500">
                {(p.title || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-base font-medium text-indigo-700 hover:underline"
              >
                {p.title || p.url}
              </a>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {p.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                {p.author && <> · {p.author}</>}
              </p>
              {p.highlights.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {p.highlights.slice(0, 3).map((h, i) => (
                    <li key={i} className="line-clamp-2">{h}</li>
                  ))}
                </ul>
              )}
              {!p.highlights.length && p.summary && (
                <p className="mt-2 line-clamp-3 text-sm text-slate-700">{p.summary}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
