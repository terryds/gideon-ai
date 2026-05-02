import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { api, type ChatInfo, type ClaudeCheckResult } from '../api.ts';
import { Card, CardBody, CardHeader } from '../components/Card.tsx';
import { Button } from '../components/Button.tsx';

type Step = 1 | 2;

function chatLabel(chat: ChatInfo): string {
  if (chat.title) return chat.title;
  if (chat.username) return `@${chat.username}`;
  if (chat.first_name) return chat.first_name;
  return `Chat ${chat.id}`;
}

export default function Setup() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [claudeConfirmed, setClaudeConfirmed] = useState(false);
  const [telegramConfirmed, setTelegramConfirmed] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome — let's get you set up</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Two quick steps. You can change everything later in Settings.
        </p>
      </div>

      <ol className="flex items-center gap-3 text-sm">
        <Pill n={1} active={step === 1} done={claudeConfirmed} label="Claude Code" />
        <span aria-hidden className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
        <Pill n={2} active={step === 2} done={telegramConfirmed} label="Telegram" />
      </ol>

      {step === 1 && (
        <ClaudeStep
          onConfirm={() => {
            setClaudeConfirmed(true);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <TelegramStep
          onBack={() => setStep(1)}
          onConfirm={async () => {
            setTelegramConfirmed(true);
            await api.onboarding.complete();
            navigate('/');
          }}
        />
      )}
    </div>
  );
}

function Pill({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <li
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
        active
          ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-950 dark:text-indigo-200'
          : done
            ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200'
            : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
      }`}
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-semibold dark:bg-slate-900">
        {done ? '✓' : n}
      </span>
      {label}
    </li>
  );
}

function ClaudeStep({ onConfirm }: { onConfirm: () => void }) {
  const [result, setResult] = useState<ClaudeCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runCheck() {
    setChecking(true); setErr(null);
    try {
      setResult(await api.onboarding.checkClaude());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    runCheck();
  }, []);

  const installed = result?.ok === true;

  return (
    <Card>
      <CardHeader
        title="Step 1 — Claude Code"
        description="Some features (Information Signal, Telegram-to-Claude relay) need the Claude Code CLI installed and on your PATH."
      />
      <CardBody className="space-y-4">
        {checking && <p className="text-sm text-slate-600 dark:text-slate-400">Checking for <code>claude</code>…</p>}

        {!checking && result?.ok && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            <p className="font-medium">Claude Code is installed.</p>
            <p className="mt-1 font-mono text-xs">{result.version}</p>
          </div>
        )}

        {!checking && result?.ok === false && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-medium">Claude Code was not found.</p>
            <p className="mt-1">Install it, then click "Re-check". Install instructions:</p>
            <pre className="mt-2 overflow-x-auto rounded bg-amber-100 p-2 font-mono text-xs dark:bg-amber-900/40">npm install -g @anthropic-ai/claude-code
# or
brew install --cask claude-code</pre>
            <p className="mt-2">After install, run <code>claude</code> once in a terminal to log in.</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs">Error details</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-amber-100 p-2 font-mono text-xs dark:bg-amber-900/40">{result.error}</pre>
            </details>
          </div>
        )}

        {err && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {err}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runCheck} disabled={checking} variant="secondary">
            {checking ? 'Checking…' : 'Re-check'}
          </Button>
          <Button onClick={onConfirm} disabled={!installed}>
            Continue
          </Button>
          {!installed && (
            <button
              type="button"
              onClick={onConfirm}
              className="text-xs text-slate-500 underline dark:text-slate-400"
            >
              Skip for now (some features won't work)
            </button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function TelegramStep({ onBack, onConfirm }: { onBack: () => void; onConfirm: () => void }) {
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [bot, setBot] = useState<{ username: string; first_name: string } | null>(null);
  const [chats, setChats] = useState<ChatInfo[] | null>(null);
  const [linkedChat, setLinkedChat] = useState<ChatInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await api.settings.get();
      if (s.telegram_bot_token_set) {
        setTokenSaved(true);
        const r = await api.settings.botInfo();
        if (r.ok) setBot({ username: r.bot.username, first_name: r.bot.first_name });
      }
      if (s.telegram_chat_id) {
        setLinkedChat({
          id: Number(s.telegram_chat_id),
          type: '',
          title: null,
          username: null,
          first_name: null,
          last_message_at: null,
        });
      }
    })();
  }, []);

  async function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.settings.update({ telegram_bot_token: tokenInput.trim() });
      setTokenInput('');
      setTokenSaved(true);
      const r = await api.settings.botInfo();
      if (r.ok) {
        setBot({ username: r.bot.username, first_name: r.bot.first_name });
        setMsg(`Connected to @${r.bot.username}.`);
      } else {
        setErr(r.error);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDetect() {
    setDetecting(true); setErr(null); setMsg(null); setChats(null);
    try {
      const r = await api.settings.chats();
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      if (r.chats.length === 0) {
        setMsg('No messages detected yet. Send any message to your bot, then click "Detect chat" again.');
        setChats([]);
      } else if (r.chats.length === 1) {
        await selectChat(r.chats[0]);
      } else {
        setChats(r.chats);
        setMsg('Multiple chats found — pick the one you want to receive notifications in.');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  }

  async function selectChat(chat: ChatInfo) {
    setBusy(true); setErr(null);
    try {
      await api.settings.update({ telegram_chat_id: String(chat.id) });
      setLinkedChat(chat);
      setChats(null);
      setMsg(`Linked to ${chatLabel(chat)}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setTesting(true); setErr(null); setMsg(null);
    try {
      const r = await api.settings.testTelegram();
      if (r.ok) setMsg('Test message sent — check Telegram.');
      else setErr(r.error || 'Failed to send.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  const canFinish = tokenSaved && !!linkedChat;
  const botUrl = bot?.username ? `https://t.me/${bot.username}` : null;

  return (
    <Card>
      <CardHeader
        title="Step 2 — Telegram"
        description="Notifications are sent to a Telegram chat through a bot you control. Just two things: paste the bot token, then send any message to detect your chat ID."
      />
      <CardBody className="space-y-5">
        {err && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {err}
          </div>
        )}
        {msg && (
          <div role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {msg}
          </div>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">2a. Bot token</h3>
          {!tokenSaved && (
            <details className="text-xs text-slate-600 dark:text-slate-400">
              <summary className="cursor-pointer">How do I get a bot token?</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Open Telegram and message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-indigo-600 underline dark:text-indigo-400">@BotFather</a>.</li>
                <li>Send <code>/newbot</code>, follow the prompts to name your bot.</li>
                <li>BotFather replies with a token like <code>123456:ABC-DEF...</code> — paste it below.</li>
              </ol>
            </details>
          )}

          {tokenSaved && bot ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950">
              <p className="text-emerald-900 dark:text-emerald-200">
                Connected as <strong>{bot.first_name}</strong>{' '}
                {botUrl && (
                  <a href={botUrl} target="_blank" rel="noreferrer" className="underline">
                    @{bot.username}
                  </a>
                )}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSaveToken} className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[280px]">
                <label htmlFor="bot-token" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Bot token
                </label>
                <input
                  id="bot-token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="123456:ABC-DEF..."
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <Button type="submit" disabled={busy || !tokenInput.trim()}>
                {busy ? 'Saving…' : 'Save token'}
              </Button>
            </form>
          )}
        </section>

        {tokenSaved && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">2b. Link your chat</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Open your bot {botUrl ? <a href={botUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline dark:text-indigo-400">(@{bot?.username})</a> : null} in Telegram, send any message (a simple "hi" works), then click "Detect chat" — we'll auto-detect your chat ID.
            </p>

            {linkedChat ? (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950">
                <p className="text-emerald-900 dark:text-emerald-200">
                  Linked to chat <strong>{chatLabel(linkedChat)}</strong>{' '}
                  <span className="font-mono text-xs">({linkedChat.id})</span>
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleDetect} disabled={detecting}>
                  {detecting ? 'Detecting…' : 'Detect chat'}
                </Button>
              </div>
            )}

            {chats && chats.length > 1 && (
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {chats.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{chatLabel(c)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.type} · id <span className="font-mono">{c.id}</span>
                      </p>
                    </div>
                    <Button onClick={() => selectChat(c)} disabled={busy} variant="secondary">
                      Use this
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {linkedChat && (
              <div>
                <Button onClick={handleTest} disabled={testing} variant="secondary">
                  {testing ? 'Sending…' : 'Send test message'}
                </Button>
              </div>
            )}
          </section>
        )}

        {canFinish && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-semibold">Heads up — finishing setup enables the Telegram → Claude Code relay.</p>
            <p className="mt-1">
              Messages from your linked chat will be sent to <code>claude</code> on this host with{' '}
              <code>--permission-mode bypassPermissions</code>. Anyone who can message that chat can run shell
              commands. You can disable this later in <strong>Settings → Incoming messages</strong>.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
          <Button onClick={onBack} variant="secondary">
            Back
          </Button>
          <Button onClick={onConfirm} disabled={!canFinish}>
            Finish setup
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
