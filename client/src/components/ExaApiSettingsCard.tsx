import { useEffect, useState } from 'react';
import { api, type SettingsResponse } from '../api.ts';
import { Card, CardBody, CardHeader } from './Card.tsx';
import { Button } from './Button.tsx';

export function ExaApiSettingsCard() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [numInput, setNumInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applySettings(s: SettingsResponse) {
    setSettings(s);
    setKeyInput(s.exa_api_key);
    setNumInput(String(s.exa_num_results));
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
    const trimmedNum = numInput.trim();
    const parsedNum = Number(trimmedNum);
    if (!trimmedNum || !Number.isInteger(parsedNum) || parsedNum < 1 || parsedNum > 100) {
      setError('numResults must be an integer between 1 and 100.');
      return;
    }
    setSaving(true); setMsg(null); setError(null);
    try {
      const s = await api.settings.update({
        exa_api_key: keyInput.trim(),
        exa_num_results: parsedNum,
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
    if (!confirm('Reset Exa API key and numResults to defaults?')) return;
    setSaving(true); setMsg(null); setError(null);
    try {
      const s = await api.settings.update({ exa_api_key: '', exa_num_results: null });
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
    (keyInput.trim() !== settings.exa_api_key ||
      Number(numInput) !== settings.exa_num_results);

  const hasOverride =
    !!settings && (settings.exa_api_key_is_custom || settings.exa_num_results_is_custom);

  return (
    <Card>
      <CardHeader
        title="Exa API"
        description="Credentials for Exa People Search. The default key is used unless you override it."
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
            <label htmlFor="exa-api-key" className="block text-xs font-medium text-slate-700">
              EXA_API_KEY{' '}
              {settings?.exa_api_key_is_custom ? (
                <span className="ml-1 text-indigo-700">(custom)</span>
              ) : (
                <span className="ml-1 text-slate-500">(default)</span>
              )}
            </label>
            <input
              id="exa-api-key"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="paste your Exa API key"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">
              Sent as the <code className="rounded bg-slate-200 px-1">x-api-key</code> header to{' '}
              <code className="rounded bg-slate-200 px-1">api.exa.ai/search</code>.
            </p>
          </div>
          <div>
            <label htmlFor="exa-num-results" className="block text-xs font-medium text-slate-700">
              numResults{' '}
              {settings?.exa_num_results_is_custom ? (
                <span className="ml-1 text-indigo-700">(custom)</span>
              ) : (
                <span className="ml-1 text-slate-500">(default)</span>
              )}
            </label>
            <input
              id="exa-num-results"
              type="number"
              min={1}
              max={100}
              step={1}
              value={numInput}
              onChange={(e) => setNumInput(e.target.value)}
              className="mt-1 block w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">
              Number of people returned per search (1–100). The Exa search endpoint does not paginate.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save'}
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
