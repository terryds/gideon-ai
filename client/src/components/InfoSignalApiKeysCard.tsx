import { useEffect, useState } from 'react';
import { api, type SettingsResponse } from '../api.ts';
import { Card, CardBody, CardHeader } from './Card.tsx';
import { Button } from './Button.tsx';

export function InfoSignalApiKeysCard() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [perplexityInput, setPerplexityInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applySettings(s: SettingsResponse) {
    setSettings(s);
    setPerplexityInput(s.perplexity_api_key);
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
    setSaving(true); setMsg(null); setError(null);
    try {
      const s = await api.settings.update({
        perplexity_api_key: perplexityInput.trim(),
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
    if (!confirm('Clear the Perplexity API key?')) return;
    setSaving(true); setMsg(null); setError(null);
    try {
      const s = await api.settings.update({ perplexity_api_key: '' });
      applySettings(s);
      setMsg('Cleared.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const isDirty =
    !!settings && perplexityInput.trim() !== settings.perplexity_api_key;

  const hasOverride = !!settings && settings.perplexity_api_key_is_custom;

  return (
    <Card>
      <CardHeader
        title="Information Signal API key"
        description="Used by the scheduler to ask Perplexity to search the web and decide whether to notify you."
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
            <label htmlFor="perplexity-key" className="block text-xs font-medium text-slate-700">
              PERPLEXITY_API_KEY{' '}
              {settings?.perplexity_api_key_is_custom ? (
                <span className="ml-1 text-indigo-700">(set)</span>
              ) : (
                <span className="ml-1 text-slate-500">(not set)</span>
              )}
            </label>
            <input
              id="perplexity-key"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={perplexityInput}
              onChange={(e) => setPerplexityInput(e.target.value)}
              placeholder="paste your Perplexity API key"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">
              Sent as <code className="rounded bg-slate-200 px-1">Authorization: Bearer …</code> to{' '}
              <code className="rounded bg-slate-200 px-1">api.perplexity.ai/v1/agent</code> with preset{' '}
              <code className="rounded bg-slate-200 px-1">{settings?.info_signal_perplexity_preset ?? 'pro-search'}</code>{' '}
              and a JSON Schema response_format that returns{' '}
              <code className="rounded bg-slate-200 px-1">{'{notify, reason, summary}'}</code>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {hasOverride && (
              <Button type="button" variant="ghost" onClick={handleReset} disabled={saving}>
                Clear
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
