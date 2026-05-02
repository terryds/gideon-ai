import { useEffect, useState } from 'react';
import { api, type SettingsResponse, type TwitterCliStatus } from '../api.ts';
import { Card, CardBody, CardHeader } from './Card.tsx';
import { Button } from './Button.tsx';

export function TwitterAuthSettingsCard() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [authToken, setAuthToken] = useState('');
  const [ct0, setCt0] = useState('');
  const [proxyInput, setProxyInput] = useState('');
  const [limitInput, setLimitInput] = useState('');
  const [cli, setCli] = useState<TwitterCliStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applySettings(s: SettingsResponse) {
    setSettings(s);
    setProxyInput(s.twitter_proxy);
    setLimitInput(String(s.twitter_result_limit));
  }

  useEffect(() => {
    (async () => {
      try {
        applySettings(await api.settings.get());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      try {
        setCli(await api.twitter.cliStatus());
      } catch {
        setCli({ ok: false, error: 'Could not check CLI status' });
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
      const body: {
        twitter_proxy: string;
        twitter_result_limit: number;
        twitter_auth_token?: string;
        twitter_ct0?: string;
      } = {
        twitter_proxy: proxyInput.trim(),
        twitter_result_limit: parsedLimit,
      };
      if (authToken.trim()) body.twitter_auth_token = authToken.trim();
      if (ct0.trim()) body.twitter_ct0 = ct0.trim();
      const s = await api.settings.update(body);
      applySettings(s);
      setAuthToken('');
      setCt0('');
      setMsg('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function clearAuthToken() {
    if (!confirm('Remove the stored TWITTER_AUTH_TOKEN?')) return;
    setError(null); setMsg(null);
    try {
      const s = await api.settings.update({ twitter_auth_token: '' });
      applySettings(s);
      setMsg('TWITTER_AUTH_TOKEN cleared.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function clearCt0() {
    if (!confirm('Remove the stored TWITTER_CT0?')) return;
    setError(null); setMsg(null);
    try {
      const s = await api.settings.update({ twitter_ct0: '' });
      applySettings(s);
      setMsg('TWITTER_CT0 cleared.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const tokenSaved = !!settings?.twitter_auth_token_set;
  const ct0Saved = !!settings?.twitter_ct0_set;

  return (
    <Card>
      <CardHeader
        title="Twitter / X auth & fetch"
        description="Credentials for the local twitter-cli. Stored server-side and injected as env vars when the CLI runs."
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
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="font-medium text-slate-700">CLI status:</span>{' '}
          {cli === null ? (
            <span className="text-slate-500">checking…</span>
          ) : cli.ok ? (
            <span className="text-emerald-700">
              installed at <code className="rounded bg-white px-1 font-mono">{cli.path}</code>
            </span>
          ) : (
            <span className="text-red-700">
              {cli.error} — install with{' '}
              <code className="rounded bg-white px-1 font-mono">uv tool install twitter-cli</code> or{' '}
              <code className="rounded bg-white px-1 font-mono">pipx install twitter-cli</code>
            </span>
          )}
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label htmlFor="tw-auth-token" className="block text-xs font-medium text-slate-700">
              TWITTER_AUTH_TOKEN{' '}
              {tokenSaved ? (
                <span className="ml-1 text-emerald-700">(saved)</span>
              ) : (
                <span className="ml-1 text-slate-500">(not set)</span>
              )}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="tw-auth-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder={tokenSaved ? '••••••••  (leave blank to keep)' : 'paste auth_token cookie value'}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
              />
              {tokenSaved && (
                <Button type="button" variant="ghost" onClick={clearAuthToken}>Clear</Button>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="tw-ct0" className="block text-xs font-medium text-slate-700">
              TWITTER_CT0{' '}
              {ct0Saved ? (
                <span className="ml-1 text-emerald-700">(saved)</span>
              ) : (
                <span className="ml-1 text-slate-500">(not set)</span>
              )}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="tw-ct0"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={ct0}
                onChange={(e) => setCt0(e.target.value)}
                placeholder={ct0Saved ? '••••••••  (leave blank to keep)' : 'paste ct0 cookie value'}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
              />
              {ct0Saved && (
                <Button type="button" variant="ghost" onClick={clearCt0}>Clear</Button>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="tw-proxy" className="block text-xs font-medium text-slate-700">
              TWITTER_PROXY <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="tw-proxy"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={proxyInput}
              onChange={(e) => setProxyInput(e.target.value)}
              placeholder="http://user:pass@host:port  or  socks5://host:port"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label htmlFor="tw-limit" className="block text-xs font-medium text-slate-700">
              Result limit{' '}
              {settings?.twitter_result_limit_is_custom ? (
                <span className="ml-1 text-indigo-700">(custom)</span>
              ) : (
                <span className="ml-1 text-slate-500">(default)</span>
              )}
            </label>
            <input
              id="tw-limit"
              type="number"
              min={1}
              max={100}
              step={1}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="mt-1 block w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">
              Passed as <code className="rounded bg-slate-200 px-1">--max</code> to{' '}
              <code className="rounded bg-slate-200 px-1">twitter search</code>. 1–100.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          Tip: grab <code className="rounded bg-slate-200 px-1">auth_token</code> and{' '}
          <code className="rounded bg-slate-200 px-1">ct0</code> cookies from x.com via your browser's
          DevTools → Application → Cookies.
        </p>
      </CardBody>
    </Card>
  );
}
