import { useEffect, useMemo, useState } from 'react';
import { api, type PairDef, type RateMap, type ScheduleInfo, type Signal } from '../api.ts';
import { formatValue, formatRelative, formatFuture } from '../format.ts';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { FinanceSubNav } from '../components/FinanceSubNav.tsx';

type Form = {
  pair: string;
  direction: 'above' | 'below';
  threshold: string;
  notify_telegram: boolean;
};

const defaultForm: Form = { pair: '', direction: 'above', threshold: '', notify_telegram: true };

export default function Dashboard() {
  const [pairs, setPairs] = useState<PairDef[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [rates, setRates] = useState<RateMap>({});
  const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
  const [form, setForm] = useState<Form>(defaultForm);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const pairMap = useMemo(() => new Map(pairs.map((p) => [p.id, p])), [pairs]);

  async function refresh() {
    try {
      const [p, s, r, sch] = await Promise.all([
        api.pairs(),
        api.signals.list(),
        api.rates(),
        api.schedule(),
      ]);
      setPairs(p);
      setSignals(s);
      setRates(r);
      setSchedule(sch);
      if (!form.pair && p.length) setForm((f) => ({ ...f, pair: p[0].id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    const t = parseFloat(form.threshold);
    if (!Number.isFinite(t) || t <= 0) {
      setError('Threshold must be a positive number.');
      return;
    }
    setBusy(true);
    try {
      await api.signals.create({
        pair: form.pair,
        direction: form.direction,
        threshold: t,
        notify_telegram: form.notify_telegram,
        enabled: true,
      });
      setForm((f) => ({ ...defaultForm, pair: f.pair }));
      setMsg('Signal created.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleEnabled(sig: Signal, enabled: boolean) {
    await api.signals.update(sig.id, { enabled });
    await refresh();
  }

  async function handleToggleNotify(sig: Signal, notify: boolean) {
    await api.signals.update(sig.id, { notify_telegram: notify });
    await refresh();
  }

  async function handleDelete(sig: Signal) {
    if (!confirm(`Delete signal for ${sig.pair}?`)) return;
    await api.signals.remove(sig.id);
    await refresh();
  }

  async function handleTestAlert(sig: Signal) {
    setMsg(null);
    setError(null);
    setTestingId(sig.id);
    try {
      const r = await api.signals.testAlert(sig.id);
      if (r.ok) {
        setMsg(
          r.condition_met
            ? `Test alert sent — condition met (current ${r.value}). You'd get this for real on next poll.`
            : `Test alert sent — condition not met (current ${r.value}). Telegram explains why it wouldn't fire.`
        );
      } else {
        setError(r.error || 'Failed to send test alert.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingId(null);
    }
  }

  async function handlePollNow() {
    setPolling(true);
    setMsg(null);
    setError(null);
    try {
      await api.poll();
      setMsg('Poll complete.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPolling(false);
    }
  }

  const selectedPair = pairMap.get(form.pair);

  return (
    <div className="space-y-6">
      <FinanceSubNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Your signals</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Watching {signals.filter((s) => s.enabled).length} of {signals.length} threshold{signals.length === 1 ? '' : 's'}.
          </p>
          {schedule && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Last poll {formatRelative(schedule.last_poll_at)} · next poll{' '}
              {formatFuture(schedule.next_poll_at)} ·{' '}
              <span className="font-mono">{schedule.cron}</span>
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={handlePollNow} disabled={polling}>
          {polling ? 'Polling…' : 'Poll now'}
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}
      {msg && (
        <div role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {msg}
        </div>
      )}

      <Card>
        <CardHeader title="Add a threshold" description="Get notified when a rate crosses your threshold." />
        <CardBody>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label htmlFor="pair" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Pair</label>
              <select
                id="pair"
                value={form.pair}
                onChange={(e) => setForm({ ...form, pair: e.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {pairs.map((p) => (
                  <option key={p.id} value={p.id}>{p.id} — {p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="direction" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Direction</label>
              <select
                id="direction"
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as 'above' | 'below' })}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="above">goes above</option>
                <option value="below">drops below</option>
              </select>
            </div>
            <div>
              <label htmlFor="threshold" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Threshold {selectedPair && <span className="text-slate-500">({selectedPair.quote})</span>}
              </label>
              <input
                id="threshold"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                required
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                placeholder={selectedPair ? (selectedPair.decimals === 0 ? '16500' : '65000') : ''}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Toggle
                id="notify_telegram"
                checked={form.notify_telegram}
                onChange={(v) => setForm({ ...form, notify_telegram: v })}
                label="Notify via Telegram"
                description="Requires bot token + chat ID in Settings."
              />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Adding…' : 'Add signal'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Active signals" />
        {signals.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-600 dark:text-slate-400">No signals yet. Add one above.</p>
          </CardBody>
        ) : (
          <ul role="list" className="divide-y divide-slate-200 dark:divide-slate-800">
            {signals.map((sig) => {
              const p = pairMap.get(sig.pair);
              const rate = rates[sig.pair];
              const current = rate?.value ?? sig.last_value;
              const met =
                current !== null
                  ? sig.direction === 'above'
                    ? current >= sig.threshold
                    : current <= sig.threshold
                  : null;
              return (
                <li key={sig.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold">{sig.pair}</span>
                      {p && <span className="text-xs text-slate-500 dark:text-slate-400">{p.label}</span>}
                      {met !== null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            met
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                              : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                          }`}
                        >
                          {met ? 'triggered' : 'armed'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      Notify when {sig.direction === 'above' ? '≥' : '≤'}{' '}
                      <span className="font-mono tabular-nums">{formatValue(sig.threshold, p)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Current: <span className="font-mono tabular-nums">{formatValue(current, p)}</span>
                      {' · '}checked {formatRelative(sig.last_checked_at)}
                      {sig.last_triggered_at ? ` · last fired ${formatRelative(sig.last_triggered_at)}` : ''}
                      {rate?.error ? ` · ${rate.error}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <Toggle
                      id={`enabled-${sig.id}`}
                      checked={!!sig.enabled}
                      onChange={(v) => handleToggleEnabled(sig, v)}
                      label="Enabled"
                    />
                    <Toggle
                      id={`notify-${sig.id}`}
                      checked={!!sig.notify_telegram}
                      onChange={(v) => handleToggleNotify(sig, v)}
                      label="Telegram"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => handleTestAlert(sig)}
                      disabled={testingId === sig.id}
                      aria-label={`Send test alert for ${sig.pair}`}
                    >
                      {testingId === sig.id ? 'Sending…' : 'Test alert'}
                    </Button>
                    <Button variant="ghost" onClick={() => handleDelete(sig)} aria-label={`Delete ${sig.pair} signal`}>
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
