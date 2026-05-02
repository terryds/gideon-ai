import { useEffect, useState } from 'react';
import { api, type RedditKeyword, type RedditPost } from '../api.ts';
import { formatRelative } from '../format.ts';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { RedditFetchSettingsCard } from '../components/RedditFetchSettingsCard.tsx';

type Form = {
  keyword: string;
  subreddit: string;
};

const defaultForm: Form = { keyword: '', subreddit: '' };

type ResultsState = {
  loading: boolean;
  loadingMore: boolean;
  posts: RedditPost[];
  after: string | null;
  error: string | null;
  query_url: string | null;
  loaded: boolean;
};

const emptyResults = (): ResultsState => ({
  loading: false,
  loadingMore: false,
  posts: [],
  after: null,
  error: null,
  query_url: null,
  loaded: false,
});

export default function RedditTracker() {
  const [keywords, setKeywords] = useState<RedditKeyword[]>([]);
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
      const list = await api.reddit.keywords.list();
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
      const data = await api.reddit.keywords.search(id);
      setResults((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          loadingMore: false,
          posts: data.ok ? data.posts : [],
          after: data.ok ? data.after : null,
          error: data.ok ? null : data.error,
          query_url: data.query_url,
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

  async function loadMore(id: number) {
    const cur = results[id];
    if (!cur || !cur.after || cur.loadingMore) return;
    setResults((prev) => ({ ...prev, [id]: { ...cur, loadingMore: true, error: null } }));
    try {
      const data = await api.reddit.keywords.search(id, { after: cur.after, count: cur.posts.length });
      setResults((prev) => {
        const c = prev[id];
        if (!c) return prev;
        if (!data.ok) {
          return { ...prev, [id]: { ...c, loadingMore: false, error: data.error } };
        }
        const seen = new Set(c.posts.map((p) => p.id));
        const fresh = data.posts.filter((p) => !seen.has(p.id));
        return {
          ...prev,
          [id]: {
            ...c,
            loadingMore: false,
            posts: [...c.posts, ...fresh],
            after: data.after,
            query_url: data.query_url,
          },
        };
      });
    } catch (err) {
      setResults((prev) => {
        const c = prev[id];
        if (!c) return prev;
        return { ...prev, [id]: { ...c, loadingMore: false, error: err instanceof Error ? err.message : String(err) } };
      });
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
    const keyword = form.keyword.trim();
    if (!keyword) {
      setError('Keyword is required.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.reddit.keywords.create({
        keyword,
        subreddit: form.subreddit.trim() || undefined,
        enabled: true,
      });
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

  async function handleToggle(kw: RedditKeyword, enabled: boolean) {
    setError(null);
    try {
      await api.reddit.keywords.update(kw.id, { enabled });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(kw: RedditKeyword) {
    if (!confirm(`Remove keyword "${kw.keyword}"?`)) return;
    setError(null);
    try {
      await api.reddit.keywords.remove(kw.id);
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
      setMsg('Keyword removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function startEdit(kw: RedditKeyword) {
    setEditingId(kw.id);
    setEditForm({ keyword: kw.keyword, subreddit: kw.subreddit ?? '' });
    setError(null);
    setMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(defaultForm);
  }

  async function handleSaveEdit(id: number) {
    const keyword = editForm.keyword.trim();
    if (!keyword) {
      setError('Keyword is required.');
      return;
    }
    setError(null);
    try {
      await api.reddit.keywords.update(id, {
        keyword,
        subreddit: editForm.subreddit.trim(),
      });
      cancelEdit();
      await refresh();
      if (expanded[id]) await loadFresh(id);
      setMsg('Keyword updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Reddit Tracker</h1>
        <p className="mt-1 text-sm text-slate-600">
          Track keywords across Reddit. Click a keyword to load and view live results.
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
        <CardHeader title="Add keyword" description="Subreddit is optional — leave blank to search all of Reddit." />
        <CardBody>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="kw-keyword" className="block text-xs font-medium text-slate-700">
                Keyword
              </label>
              <input
                id="kw-keyword"
                type="text"
                value={form.keyword}
                onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
                placeholder="e.g. claude code"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="kw-subreddit" className="block text-xs font-medium text-slate-700">
                Subreddit <span className="text-slate-500">(optional)</span>
              </label>
              <input
                id="kw-subreddit"
                type="text"
                value={form.subreddit}
                onChange={(e) => setForm((f) => ({ ...f, subreddit: e.target.value }))}
                placeholder="e.g. ClaudeAI"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={busy || !form.keyword.trim()}>
              {busy ? 'Adding…' : 'Add keyword'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {keywords.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-600">
              No keywords yet. Add one above to start tracking.
            </p>
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
                onLoadMore={() => loadMore(kw.id)}
              />
            ))}
          </ul>
        </div>
      )}

      <RedditFetchSettingsCard />
    </div>
  );
}

type RowProps = {
  kw: RedditKeyword;
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
  onLoadMore: () => void;
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
            className={`inline-block h-2 w-2 rounded-full transition ${
              kw.enabled ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          />
          <Chevron open={isOpen} />
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-slate-900">{kw.keyword}</span>
            <span className="block text-xs text-slate-500">
              {kw.subreddit ? `r/${kw.subreddit}` : 'all subreddits'} · added {formatRelative(kw.created_at)}
              {results?.loaded && results.posts.length > 0 && (
                <> · {results.posts.length}{results.after ? '+' : ''} loaded</>
              )}
            </span>
          </span>
        </button>
        {!isEditing && (
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              id={`kw-enabled-${kw.id}`}
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
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700">Keyword</label>
              <input
                type="text"
                value={editForm.keyword}
                onChange={(e) => setEditForm((f) => ({ ...f, keyword: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Subreddit</label>
              <input
                type="text"
                value={editForm.subreddit}
                onChange={(e) => setEditForm((f) => ({ ...f, subreddit: e.target.value }))}
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
          <ResultsPanel state={results} onRefresh={props.onRefresh} onLoadMore={props.onLoadMore} />
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
  onLoadMore,
}: {
  state: ResultsState | undefined;
  onRefresh: () => void;
  onLoadMore: () => void;
}) {
  if (!state || (state.loading && state.posts.length === 0)) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }
  if (state.error && state.posts.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-700">Search failed: {state.error}</p>
        {state.query_url && (
          <p className="break-all text-xs text-slate-500">{state.query_url}</p>
        )}
        <Button variant="secondary" onClick={onRefresh}>Try again</Button>
      </div>
    );
  }
  if (state.posts.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">No matching posts.</p>
        <Button variant="secondary" onClick={onRefresh}>Refresh</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {state.posts.length} result{state.posts.length === 1 ? '' : 's'}
          {state.after ? ' (more available)' : ' (end of results)'}
        </p>
        <Button variant="ghost" onClick={onRefresh} disabled={state.loading}>
          {state.loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <ul role="list" className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white px-4 sm:px-5">
        {state.posts.map((p) => (
          <li key={p.id} className="py-4 first:pt-4 last:pb-4">
            <a
              href={p.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-base font-medium text-indigo-700 hover:underline"
            >
              {p.title || '(no title)'}
            </a>
            <p className="mt-1 text-sm text-slate-600">
              r/{p.subreddit} · u/{p.author} · {p.score} pts · {p.num_comments} comments ·{' '}
              {formatRelative(p.created_utc)}
            </p>
            {p.selftext && (
              <p className="mt-2 line-clamp-3 text-sm text-slate-700">{p.selftext}</p>
            )}
          </li>
        ))}
      </ul>
      {state.error && (
        <p className="text-sm text-red-700">Error loading more: {state.error}</p>
      )}
      {state.after && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={onLoadMore} disabled={state.loadingMore}>
            {state.loadingMore ? 'Loading more…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
