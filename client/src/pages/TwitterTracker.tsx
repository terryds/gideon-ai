import { useEffect, useState } from 'react';
import {
  api,
  type TwitterKeyword,
  type TwitterPost,
  type TwitterTab,
} from '../api.ts';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { TwitterAuthSettingsCard } from '../components/TwitterAuthSettingsCard.tsx';

const TABS: TwitterTab[] = ['Latest', 'Top', 'Photos', 'Videos'];

type Form = {
  keyword: string;
  tab: TwitterTab;
};

const defaultForm: Form = { keyword: '', tab: 'Latest' };

type ResultsState = {
  loading: boolean;
  loadingMore: boolean;
  posts: TwitterPost[];
  cursor: string | null;
  error: string | null;
  cmd: string | null;
  loaded: boolean;
};

const emptyResults = (): ResultsState => ({
  loading: false,
  loadingMore: false,
  posts: [],
  cursor: null,
  error: null,
  cmd: null,
  loaded: false,
});

function formatTweetTime(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const diff = Date.now() / 1000 - d.getTime() / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TwitterTracker() {
  const [keywords, setKeywords] = useState<TwitterKeyword[]>([]);
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
      const list = await api.twitter.keywords.list();
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
      const data = await api.twitter.keywords.search(id);
      setResults((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          loadingMore: false,
          posts: data.ok ? data.posts : [],
          cursor: data.ok ? data.next_cursor : null,
          error: data.ok ? null : data.error,
          cmd: data.cmd,
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
    if (!cur || !cur.cursor || cur.loadingMore) return;
    setResults((prev) => ({ ...prev, [id]: { ...cur, loadingMore: true, error: null } }));
    try {
      const data = await api.twitter.keywords.search(id, { cursor: cur.cursor });
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
            cursor: data.next_cursor,
            cmd: data.cmd,
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
      const created = await api.twitter.keywords.create({
        keyword,
        tab: form.tab,
        enabled: true,
      });
      setForm({ ...defaultForm, tab: form.tab });
      await refresh();
      setExpanded((prev) => ({ ...prev, [created.id]: true }));
      await loadFresh(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(kw: TwitterKeyword, enabled: boolean) {
    setError(null);
    try {
      await api.twitter.keywords.update(kw.id, { enabled });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(kw: TwitterKeyword) {
    if (!confirm(`Remove keyword "${kw.keyword}"?`)) return;
    setError(null);
    try {
      await api.twitter.keywords.remove(kw.id);
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

  function startEdit(kw: TwitterKeyword) {
    setEditingId(kw.id);
    setEditForm({ keyword: kw.keyword, tab: kw.tab });
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
      await api.twitter.keywords.update(id, { keyword, tab: editForm.tab });
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Twitter / X Tracker</h1>
        <p className="mt-1 text-sm text-slate-600">
          Track search queries via the local <code className="rounded bg-slate-200 px-1 font-mono">twitter-cli</code>.
          Twitter search syntax (e.g. <code className="rounded bg-slate-200 px-1 font-mono">from:elonmusk lang:en</code>,{' '}
          <code className="rounded bg-slate-200 px-1 font-mono">-filter:retweets</code>) works inline.
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
        <CardHeader title="Add keyword" description="Pick a tab. Click a row in the list below to fetch results lazily." />
        <CardBody>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div>
              <label htmlFor="tw-keyword" className="block text-xs font-medium text-slate-700">
                Query
              </label>
              <input
                id="tw-keyword"
                type="text"
                value={form.keyword}
                onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
                placeholder='e.g. "claude code" lang:en -filter:retweets'
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="tw-tab" className="block text-xs font-medium text-slate-700">
                Tab
              </label>
              <select
                id="tw-tab"
                value={form.tab}
                onChange={(e) => setForm((f) => ({ ...f, tab: e.target.value as TwitterTab }))}
                className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {TABS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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
              No keywords yet. Make sure you've configured the auth card below, then add one above.
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

      <TwitterAuthSettingsCard />
    </div>
  );
}

type RowProps = {
  kw: TwitterKeyword;
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
            className={`inline-block h-2 w-2 rounded-full ${kw.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          />
          <Chevron open={isOpen} />
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-slate-900">{kw.keyword}</span>
            <span className="block text-xs text-slate-500">
              tab: {kw.tab}
              {results?.loaded && results.posts.length > 0 && (
                <> · {results.posts.length}{results.cursor ? '+' : ''} loaded</>
              )}
            </span>
          </span>
        </button>
        {!isEditing && (
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              id={`tw-enabled-${kw.id}`}
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
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700">Query</label>
              <input
                type="text"
                value={editForm.keyword}
                onChange={(e) => setEditForm((f) => ({ ...f, keyword: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Tab</label>
              <select
                value={editForm.tab}
                onChange={(e) => setEditForm((f) => ({ ...f, tab: e.target.value as TwitterTab }))}
                className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {TABS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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
        {state.cmd && (
          <p className="break-all text-xs text-slate-500">
            <span className="font-mono">{state.cmd}</span>
          </p>
        )}
        <Button variant="secondary" onClick={onRefresh}>Try again</Button>
      </div>
    );
  }
  if (state.posts.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">No matching tweets.</p>
        <Button variant="secondary" onClick={onRefresh}>Refresh</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {state.posts.length} tweet{state.posts.length === 1 ? '' : 's'}
          {state.cursor ? ' (more available)' : ' (end of cursor)'}
        </p>
        <Button variant="ghost" onClick={onRefresh} disabled={state.loading}>
          {state.loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <ul role="list" className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white px-4 sm:px-5">
        {state.posts.map((p) => (
          <li key={p.id || `${p.user.screen_name}-${Math.random()}`} className="py-4 first:pt-4 last:pb-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-900">{p.user.name || p.user.screen_name}</span>
              {p.user.screen_name && (
                <span className="text-slate-500">@{p.user.screen_name}</span>
              )}
              {p.created_at && <span className="text-slate-400">· {formatTweetTime(p.created_at)}</span>}
            </div>
            {p.text && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{p.text}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {p.metrics.likes} likes · {p.metrics.retweets} RTs · {p.metrics.replies} replies
              {p.metrics.views > 0 && <> · {p.metrics.views.toLocaleString()} views</>}
              {p.url && (
                <>
                  {' '}·{' '}
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
                    open
                  </a>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
      {state.error && (
        <p className="text-sm text-red-700">Error loading more: {state.error}</p>
      )}
      {state.cursor && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={onLoadMore} disabled={state.loadingMore}>
            {state.loadingMore ? 'Loading more…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
