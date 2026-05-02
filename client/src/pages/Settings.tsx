import { useEffect, useState } from 'react';
import { api, type BotInfo, type ChatInfo, type IncomingHandler, type SettingsResponse } from '../api.ts';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';
import { Toggle } from '../components/Toggle.tsx';
import { RedditFetchSettingsCard } from '../components/RedditFetchSettingsCard.tsx';
import { TwitterAuthSettingsCard } from '../components/TwitterAuthSettingsCard.tsx';
import { ExaApiSettingsCard } from '../components/ExaApiSettingsCard.tsx';
import { InfoSignalApiKeysCard } from '../components/InfoSignalApiKeysCard.tsx';

function chatLabel(chat: ChatInfo): string {
  if (chat.title) return chat.title;
  if (chat.username) return `@${chat.username}`;
  if (chat.first_name) return chat.first_name;
  return `Chat ${chat.id}`;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [bot, setBot] = useState<BotInfo | null>(null);
  const [token, setToken] = useState('');
  const [cronInput, setCronInput] = useState('');
  const [savingCron, setSavingCron] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [chats, setChats] = useState<ChatInfo[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const s = await api.settings.get();
    setSettings(s);
    setCronInput(s.poll_cron);
    if (s.telegram_bot_token_set) {
      const r = await api.settings.botInfo();
      setBot(r.ok ? r.bot : null);
    } else {
      setBot(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true); setMsg(null); setError(null);
    try {
      const s = await api.settings.update({ telegram_bot_token: token.trim() });
      setSettings(s);
      setToken('');
      setMsg('Bot token saved.');
      const r = await api.settings.botInfo();
      if (r.ok) setBot(r.bot);
      else setError(r.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClearToken() {
    if (!confirm('Remove the stored bot token? This also unlinks the chat.')) return;
    const s = await api.settings.update({ telegram_bot_token: '', telegram_chat_id: '' });
    setSettings(s);
    setBot(null);
    setChats(null);
    setMsg('Bot token cleared.');
  }

  async function handleDetect() {
    setDetecting(true); setMsg(null); setError(null); setChats(null);
    try {
      const r = await api.settings.chats();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.chats.length === 0) {
        setMsg('No recent messages found. Open your bot and send any message, then try again.');
        setChats([]);
      } else if (r.chats.length === 1) {
        await selectChat(r.chats[0]);
      } else {
        setChats(r.chats);
        setMsg('Multiple chats found — pick one.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetecting(false);
    }
  }

  async function selectChat(chat: ChatInfo) {
    setBusy(true); setError(null);
    try {
      const s = await api.settings.update({ telegram_chat_id: String(chat.id) });
      setSettings(s);
      setChats(null);
      setMsg(`Linked to ${chatLabel(chat)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlinkChat() {
    if (!confirm('Unlink this chat?')) return;
    const s = await api.settings.update({ telegram_chat_id: '' });
    setSettings(s);
    setMsg('Chat unlinked.');
  }

  async function handleSaveCron(e: React.FormEvent) {
    e.preventDefault();
    setSavingCron(true); setMsg(null); setError(null);
    try {
      const s = await api.settings.update({ poll_cron: cronInput.trim() });
      setSettings(s);
      setCronInput(s.poll_cron);
      setMsg(`Poll schedule updated to "${s.poll_cron}". Scheduler restarted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingCron(false);
    }
  }

  async function handleResetCron() {
    if (!confirm('Reset the poll schedule to the default (every 15 minutes)?')) return;
    setSavingCron(true); setMsg(null); setError(null);
    try {
      const s = await api.settings.update({ poll_cron: '' });
      setSettings(s);
      setCronInput(s.poll_cron);
      setMsg(`Reset. Poll schedule now "${s.poll_cron}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingCron(false);
    }
  }

  async function handleImagesToggle(next: boolean) {
    setMsg(null); setError(null);
    try {
      const s = await api.settings.update({ incoming_images_enabled: next });
      setSettings(s);
      setMsg(next ? 'Image attachments will be forwarded to Claude.' : 'Incoming images will be ignored.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleHandlerChange(next: IncomingHandler) {
    if (next === 'claude') {
      const warn = `Incoming Telegram messages will be relayed to Claude Code on this VPS with --permission-mode bypassPermissions (no tool confirmations).

Only the linked chat (${settings?.telegram_chat_id ?? 'unknown'}) can send messages. Continue?`;
      if (!confirm(warn)) return;
    }
    setMsg(null); setError(null);
    try {
      const s = await api.settings.update({ incoming_handler: next });
      setSettings(s);
      setMsg(
        next === 'claude'
          ? 'Incoming messages now relay to Claude Code. /new_session starts a fresh conversation.'
          : 'Incoming message handler disabled.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleTest() {
    setTesting(true); setMsg(null); setError(null);
    try {
      const r = await api.settings.testTelegram();
      if (r.ok) setMsg('Test message sent — check Telegram.');
      else setError(r.error || 'Failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  const tokenSaved = !!settings?.telegram_bot_token_set;
  const chatLinked = !!settings?.telegram_chat_id;
  const botLink = bot?.username ? `https://t.me/${bot.username}` : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Settings</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Configure Telegram notifications.</p>
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
        <CardHeader
          title="Poll schedule"
          description="How often the dashboard fetches rates and checks thresholds. Standard 5-field cron expression. Runs in UTC."
        />
        <CardBody>
          <form onSubmit={handleSaveCron} className="space-y-3">
            <div>
              <label htmlFor="poll-cron" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Cron expression{' '}
                {settings?.poll_cron_is_custom ? (
                  <span className="ml-1 text-indigo-700 dark:text-indigo-400">(custom)</span>
                ) : (
                  <span className="ml-1 text-slate-500 dark:text-slate-400">(default)</span>
                )}
              </label>
              <input
                id="poll-cron"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={cronInput}
                onChange={(e) => setCronInput(e.target.value)}
                placeholder="*/15 * * * *"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-900"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Examples:{' '}
                <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">*/5 * * * *</code> every 5 min ·{' '}
                <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">0 * * * *</code> hourly ·{' '}
                <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">@daily</code> once a day at 00:00 UTC
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={savingCron || cronInput.trim() === settings?.poll_cron}
              >
                {savingCron ? 'Saving…' : 'Save schedule'}
              </Button>
              {settings?.poll_cron_is_custom && (
                <Button type="button" variant="ghost" onClick={handleResetCron} disabled={savingCron}>
                  Reset to default
                </Button>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      <RedditFetchSettingsCard />

      <TwitterAuthSettingsCard />

      <ExaApiSettingsCard />

      <InfoSignalApiKeysCard />

      <Card>
        <CardHeader
          title="Step 1 · Bot token"
          description="Create a bot with @BotFather, then paste its token here."
        />
        <CardBody>
          {tokenSaved ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm">
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">✓ Token saved.</span>
                  {bot && (
                    <>
                      {' '}Bot: <span className="font-mono">{bot.first_name}</span>
                      {bot.username && <> (<span className="font-mono">@{bot.username}</span>)</>}
                    </>
                  )}
                </p>
              </div>
              <Button variant="ghost" onClick={handleClearToken}>Clear token</Button>
            </div>
          ) : (
            <form onSubmit={handleSaveToken} className="space-y-3">
              <div>
                <label htmlFor="token" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Bot token
                </label>
                <input
                  id="token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="e.g. 1234567890:ABCdef…"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <Button type="submit" disabled={busy || !token.trim()}>
                {busy ? 'Saving…' : 'Save token'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      {tokenSaved && (
        <Card>
          <CardHeader
            title="Step 2 · Link a chat"
            description={
              chatLinked
                ? 'Messages will be sent to the linked chat.'
                : 'Send any message to your bot, then click Detect.'
            }
          />
          <CardBody>
            {chatLinked ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">✓ Linked</span>{' '}
                  <span className="text-slate-600 dark:text-slate-400">chat ID</span>{' '}
                  <span className="font-mono">{settings?.telegram_chat_id}</span>
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleTest}
                    disabled={testing}
                  >
                    {testing ? 'Sending…' : 'Send test message'}
                  </Button>
                  <Button variant="ghost" onClick={handleUnlinkChat}>Unlink</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                  <li>
                    Open your bot{' '}
                    {botLink ? (
                      <a href={botLink} target="_blank" rel="noreferrer" className="font-mono text-indigo-700 underline dark:text-indigo-400">
                        @{bot?.username}
                      </a>
                    ) : (
                      'in Telegram'
                    )}{' '}
                    and send any message (e.g. <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">/start</code>).
                  </li>
                  <li>Click the button below — I'll find your chat automatically.</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleDetect} disabled={detecting || busy}>
                    {detecting ? 'Detecting…' : 'Detect my chat'}
                  </Button>
                </div>

                {chats && chats.length > 0 && (
                  <fieldset className="mt-2 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                    <legend className="px-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                      Pick a chat
                    </legend>
                    <ul role="list" className="divide-y divide-slate-200 dark:divide-slate-800">
                      {chats.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{chatLabel(c)}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {c.type} · id <span className="font-mono">{c.id}</span>
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() => selectChat(c)}
                            disabled={busy}
                            aria-label={`Link ${chatLabel(c)}`}
                          >
                            Use this
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tokenSaved && chatLinked && (
        <Card>
          <CardHeader
            title="Incoming messages"
            description="What happens when the linked chat messages the bot."
          />
          <CardBody>
            <fieldset className="space-y-3">
              <legend className="sr-only">Incoming message handler</legend>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <input
                  type="radio"
                  name="incoming-handler"
                  value="none"
                  checked={settings?.incoming_handler === 'none'}
                  onChange={() => handleHandlerChange('none')}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Do nothing (default)</span>
                  <span className="block text-xs text-slate-600 dark:text-slate-400">
                    Incoming messages are ignored. The bot only sends out alerts.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <input
                  type="radio"
                  name="incoming-handler"
                  value="claude"
                  checked={settings?.incoming_handler === 'claude'}
                  onChange={() => handleHandlerChange('claude')}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Relay to Claude Code</span>
                  <span className="block text-xs text-slate-600 dark:text-slate-400">
                    Each message is sent to <code className="rounded bg-slate-200 px-1 text-[11px] dark:bg-slate-800">claude -p</code>{' '}
                    with{' '}
                    <code className="rounded bg-slate-200 px-1 text-[11px] dark:bg-slate-800">--permission-mode bypassPermissions</code>.
                    Subsequent messages continue the conversation via{' '}
                    <code className="rounded bg-slate-200 px-1 text-[11px] dark:bg-slate-800">--resume</code>.
                    Send <code className="rounded bg-slate-200 px-1 text-[11px] dark:bg-slate-800">/new_session</code> to start a fresh one.
                  </span>
                </span>
              </label>

              {settings?.incoming_handler === 'claude' && (
                <>
                  <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                    <Toggle
                      id="incoming-images"
                      checked={settings.incoming_images_enabled}
                      onChange={handleImagesToggle}
                      label="Forward image attachments to Claude"
                      description="When on, photos and image documents you send are downloaded and shown to Claude. When off, images are ignored with a one-line reply."
                    />
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    ⚠️ The bot can now execute shell commands and edit files with no confirmation. Only the linked chat is allowed; keep the bot token secret.
                  </p>
                </>
              )}
            </fieldset>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
