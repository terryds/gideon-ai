import { useEffect, useState } from 'react';
import { api, type SettingsResponse } from '../api.ts';
import { Card, CardBody, CardHeader } from './Card.tsx';
import { Button } from './Button.tsx';

export function RedditFetchSettingsCard() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [proxyInput, setProxyInput] = useState('');
  const [uaInput, setUaInput] = useState('');
  const [limitInput, setLimitInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applySettings(s: SettingsResponse) {
    setSettings(s);
    setProxyInput(s.proxy_url);
    setUaInput(s.user_agent);
    setLimitInput(String(s.reddit_result_limit));
  }

  useEffect(() => {
    (async () => {
      try {
        applySettings(await api.settings.get());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedLimit = limitInput.trim();
    const parsedLimit = Number(trimmedLimit);
    if (!trimmedLimit || !Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      setError('Result limit must be an integer between 1 and 100.');
      return;
    }
    setSaving(true); setMsg(null); setError(null);
    try {
      const s = await api.settings.update({
        proxy_url: proxyInput.trim(),
        user_agent: uaInput.trim(),
        reddit_result_limit: parsedLimit,
      });
      applySettings(s);
      setMsg('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('Reset proxy, user-agent, and result limit to defaults?')) return;
    setSaving(true); setMsg(null); setError(null);
    try {
      const s = await api.settings.update({ proxy_url: '', user_agent: '', reddit_result_limit: null });
      applySettings(s);
      setMsg('Reset to defaults.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const isDirty =
    !!settings &&
    (proxyInput.trim() !== settings.proxy_url ||
      uaInput.trim() !== settings.user_agent ||
      Number(limitInput) !== settings.reddit_result_limit);

  const hasOverride =
    !!settings &&
    (settings.proxy_url_is_custom ||
      settings.user_agent_is_custom ||
      settings.reddit_result_limit_is_custom);

  return (
    <Card>
      <CardHeader
        title="Reddit fetch"
        description="Proxy, User-Agent, and result limit used when fetching from Reddit. Leave blank to use defaults."
      />
      <CardBody>
        {error && (
          <div role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        )}
        {msg && (
          <div role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {msg}
          </div>
        )}
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label htmlFor="proxy-url" className="block text-xs font-medium text-slate-700">
              Proxy URL{' '}
              {settings?.proxy_url_is_custom ? (
                <span className="ml-1 text-indigo-700">(custom)</span>
              ) : (
                <span className="ml-1 text-slate-500">(default)</span>
              )}
            </label>
            <input
              id="proxy-url"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={proxyInput}
              onChange={(e) => setProxyInput(e.target.value)}
              placeholder="http://user:pass@host:port"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label htmlFor="user-agent" className="block text-xs font-medium text-slate-700">
              User-Agent{' '}
              {settings?.user_agent_is_custom ? (
                <span className="ml-1 text-indigo-700">(custom)</span>
              ) : (
                <span className="ml-1 text-slate-500">(default)</span>
              )}
            </label>
            <input
              id="user-agent"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={uaInput}
              onChange={(e) => setUaInput(e.target.value)}
              placeholder="Mozilla/5.0 …"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label htmlFor="result-limit" className="block text-xs font-medium text-slate-700">
              Result limit{' '}
              {settings?.reddit_result_limit_is_custom ? (
                <span className="ml-1 text-indigo-700">(custom)</span>
              ) : (
                <span className="ml-1 text-slate-500">(default)</span>
              )}
            </label>
            <input
              id="result-limit"
              type="number"
              min={1}
              max={100}
              step={1}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="mt-1 block w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">
              Passed as <code className="rounded bg-slate-200 px-1">limit</code> to{' '}
              <code className="rounded bg-slate-200 px-1">reddit.com/search.json</code>. 1–100.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save fetch settings'}
            </Button>
            {hasOverride && (
              <Button type="button" variant="ghost" onClick={handleReset} disabled={saving}>
                Reset to defaults
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
