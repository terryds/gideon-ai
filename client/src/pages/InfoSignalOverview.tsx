import { useEffect, useState } from 'react';
import {
  api,
  type InfoSignal,
  type InfoSignalFrequency,
} from '../api.ts';
import { formatRelative, formatFuture } from '../format.ts';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { InfoSignalSubNav } from '../components/InfoSignalSubNav.tsx';
import { InfoSignalApiKeysCard } from '../components/InfoSignalApiKeysCard.tsx';

const FREQS: Array<{ value: InfoSignalFrequency; label: string; seconds: number }> = [
  { value: '30m', label: 'every 30 minutes', seconds: 30 * 60 },
  { value: '1h', label: 'every hour', seconds: 60 * 60 },
  { value: '6h', label: 'every 6 hours', seconds: 6 * 60 * 60 },
  { value: '12h', label: 'every 12 hours', seconds: 12 * 60 * 60 },
  { value: '1d', label: 'every day', seconds: 24 * 60 * 60 },
  { value: '1w', label: 'every week', seconds: 7 * 24 * 60 * 60 },
];

const FREQ_LABEL: Record<InfoSignalFrequency, string> = Object.fromEntries(
  FREQS.map((f) => [f.value, f.label])
) as Record<InfoSignalFrequency, string>;

const FREQ_SECONDS: Record<InfoSignalFrequency, number> = Object.fromEntries(
  FREQS.map((f) => [f.value, f.seconds])
) as Record<InfoSignalFrequency, number>;

type Form = {
  name: string;
  search_query: string;
  notify_condition: string;
  frequency: InfoSignalFrequency;
};

const defaultForm: Form = {
  name: '',
  search_query: '',
  notify_condition: '',
  frequency: '6h',
};

function nextCheck(s: InfoSignal): number | null {
  if (!s.last_checked_at) return null;
  return s.last_checked_at + FREQ_SECONDS[s.frequency];
}

export default function InfoSignalOverview() {
  const [signals, setSignals] = useState<InfoSignal[]>([]);
  const [form, setForm] = useState<Form>(defaultForm);
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Form>(defaultForm);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await api.infoSignals.list();
      setSignals(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    if (!form.search_query.trim() || !form.notify_condition.trim()) {
      setError('Search query and notify condition are required.');
      return;
    }
    setBusy(true);
    try {
      await api.infoSignals.create({
        name: form.name.trim() || undefined,
        search_query: form.search_query.trim(),
        notify_condition: form.notify_condition.trim(),
        frequency: form.frequency,
        enabled: true,
      });
      setForm({ ...defaultForm, frequency: form.frequency });
      setMsg('Signal created. The scheduler will run it within a minute.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(s: InfoSignal, enabled: boolean) {
    setError(null);
    try {
      await api.infoSignals.update(s.id, { enabled });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(s: InfoSignal) {
    const label = s.name || s.search_query;
    if (!confirm(`Remove "${label}" and all of its run history?`)) return;
    setError(null);
    try {
      await api.infoSignals.remove(s.id);
      await refresh();
      setMsg('Signal removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRunNow(s: InfoSignal) {
    setError(null); setMsg(null);
    setRunningId(s.id);
    try {
      const result = await api.infoSignals.runNow(s.id);
      const r = result.run;
      if (!r) {
        setMsg('Run finished but no run record returned.');
      } else if (r.status === 'error') {
        setError(`Run errored: ${r.error}`);
      } else {
        const decided = r.model_decision === 1 ? 'NOTIFY' : 'no notify';
        setMsg(
          `Run finished — decision: ${decided}. ${r.telegram_sent ? 'Telegram sent.' : ''}`
        );
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningId(null);
    }
  }

  function startEdit(s: InfoSignal) {
    setEditingId(s.id);
    setEditForm({
      name: s.name ?? '',
      search_query: s.search_query,
      notify_condition: s.notify_condition,
      frequency: s.frequency,
    });
    setError(null); setMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(defaultForm);
  }

  async function handleSaveEdit(id: number) {
    if (!editForm.search_query.trim() || !editForm.notify_condition.trim()) {
      setError('Search query and notify condition are required.');
      return;
    }
    setError(null);
    try {
      await api.infoSignals.update(id, {
        name: editForm.name.trim(),
        search_query: editForm.search_query.trim(),
        notify_condition: editForm.notify_condition.trim(),
        frequency: editForm.frequency,
      });
      cancelEdit();
      await refresh();
      setMsg('Signal updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <InfoSignalSubNav />

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
        <CardHeader
          title="Add information signal"
          description='Example — search: "weather in Bandung today" · condition: "let me know if it goes below 20 deg C" · every 6 hours.'
        />
        <CardBody>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Name <span className="text-slate-500">(optional)</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Bandung weather"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Search query</label>
              <input
                type="text"
                value={form.search_query}
                onChange={(e) => setForm((f) => ({ ...f, search_query: e.target.value }))}
                placeholder="weather in Bandung today"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Notify condition (natural language)</label>
              <textarea
                value={form.notify_condition}
                onChange={(e) => setForm((f) => ({ ...f, notify_condition: e.target.value }))}
                placeholder="let me know if it drops below 20°C"
                rows={2}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Check frequency</label>
              <select
                value={form.frequency}
                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as InfoSignalFrequency }))}
                className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {FREQS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy || !form.search_query.trim() || !form.notify_condition.trim()}>
              {busy ? 'Adding…' : 'Add signal'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {signals.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-600">No signals yet. Add one above.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul role="list" className="divide-y divide-slate-200">
            {signals.map((s) => {
              const isEditing = editingId === s.id;
              return (
                <li key={s.id} className="bg-white">
                  <div className="px-4 py-4 sm:px-5">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700">Name</label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">Search query</label>
                          <input
                            type="text"
                            value={editForm.search_query}
                            onChange={(e) => setEditForm((f) => ({ ...f, search_query: e.target.value }))}
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">Notify condition</label>
                          <textarea
                            value={editForm.notify_condition}
                            onChange={(e) => setEditForm((f) => ({ ...f, notify_condition: e.target.value }))}
                            rows={2}
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">Frequency</label>
                          <select
                            value={editForm.frequency}
                            onChange={(e) => setEditForm((f) => ({ ...f, frequency: e.target.value as InfoSignalFrequency }))}
                            className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                          >
                            {FREQS.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" onClick={() => handleSaveEdit(s.id)}>Save</Button>
                          <Button type="button" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={`inline-block h-2 w-2 rounded-full ${s.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                              />
                              <h3 className="truncate text-base font-semibold text-slate-900">
                                {s.name?.trim() || s.search_query}
                              </h3>
                            </div>
                            {s.name && (
                              <p className="mt-0.5 text-xs text-slate-500">
                                searches: <span className="font-mono">{s.search_query}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Toggle
                              id={`is-enabled-${s.id}`}
                              checked={!!s.enabled}
                              onChange={(v) => handleToggle(s, v)}
                              label={s.enabled ? 'On' : 'Off'}
                            />
                            <Button
                              variant="secondary"
                              onClick={() => handleRunNow(s)}
                              disabled={runningId === s.id}
                            >
                              {runningId === s.id ? 'Running…' : 'Run now'}
                            </Button>
                            <Button variant="ghost" onClick={() => startEdit(s)}>Edit</Button>
                            <Button variant="danger" onClick={() => handleDelete(s)}>Delete</Button>
                          </div>
                        </div>
                        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Notify when</span>
                          <br />
                          {s.notify_condition}
                        </p>
                        <p className="text-xs text-slate-500">
                          {FREQ_LABEL[s.frequency]} · last checked {formatRelative(s.last_checked_at)} · next{' '}
                          {formatFuture(nextCheck(s))}
                          {s.last_notified_at && (
                            <> · last notified {formatRelative(s.last_notified_at)}</>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <InfoSignalApiKeysCard />
    </div>
  );
}
