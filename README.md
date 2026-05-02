# Gideon AI Dashboard

A self-hosted personal AI assistant dashboard. Talk to **your own Claude Code** through Telegram, and let it monitor the things you care about — crypto/forex prices, Reddit, Twitter, web search, people on the internet — and ping you when something happens.

Everything runs on your own machine. SQLite for storage, Bun + React for the app. No accounts, no SaaS.

> **Designed for single-user use on a VPS.** One bot, one linked Telegram chat, one operator. No multi-user auth, no tenant isolation, no permission model — the linked chat effectively has shell access (see [Security notes](#security-notes)). If you need multi-user support, look at [OpenClaw](https://openclaw.ai/) instead.

```
                    ┌────────────────────┐
   you ── Telegram ─┤  Gideon dashboard  ├── Claude Code (your own)
                    │                    │
                    │  • Finance signal  │── Binance, Yahoo Finance
                    │  • Reddit tracker  │── reddit.com (via proxy)
                    │  • Twitter tracker │── twitter-cli
                    │  • Exa people      │── Exa API
                    │  • Info signal     │── Brave Search + Claude Haiku
                    └────────────────────┘
```

## How does this compare to OpenClaw?

Think of Gideon as a **lightweight, opinionated alternative to [OpenClaw](https://openclaw.ai/)**.

|  | Gideon AI Dashboard | [OpenClaw](https://openclaw.ai/) |
|---|---|---|
| Channels | Telegram only | Telegram, WhatsApp, Discord, Slack, Signal, iMessage, Teams, Matrix, … |
| Stack | Bun + React + SQLite, single repo, `bun run dev` | Docker gateway, multiple services |
| Built-in monitoring | Finance / Reddit / Twitter / Exa / web-search signals all in one dashboard | None — pure agent gateway |
| Setup | Two-step in-browser wizard | More configuration |
| Scope | Personal dashboard with a Claude relay attached | General-purpose, multi-channel agent gateway |

**Pick OpenClaw** if you want to talk to Claude from many platforms and don't need a monitoring UI.
**Pick Gideon** if you live in Telegram, want everything in one small Bun process, and want monitoring features bundled in.

## Table of contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- Features
  - [1. Telegram → Claude Code relay](#1-telegram--claude-code-relay)
  - [2. Finance Signal](#2-finance-signal)
  - [3. Reddit Tracker](#3-reddit-tracker) (proxy required)
  - [4. Twitter Tracker](#4-twitter-tracker) (twitter-cli required)
  - [5. Exa People Search](#5-exa-people-search)
  - [6. Information Signal](#6-information-signal) (Brave + Claude Haiku)
- [Security notes](#security-notes)
- [License](#license)

## Quick start

### Requirements

- [Bun](https://bun.sh) ≥ 1.3.12
- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/overview) — install once, log in once: `npm install -g @anthropic-ai/claude-code` (or `brew install --cask claude-code`), then run `claude` in a terminal.
- A Telegram bot token (free, 30 seconds via [@BotFather](https://t.me/BotFather))

### Install

```bash
git clone https://github.com/<your-fork>/gideon-ai-public.git
cd gideon-ai-public
bun install
cp .env.example .env   # optional — defaults are fine for local dev
bun run dev
```

Open <http://localhost:5173>. You'll be redirected to `/setup` for a two-step onboarding:

1. **Claude Code check** — verifies `claude --version` works.
2. **Telegram setup** — paste your bot token, send any message to your bot, click "Detect chat".

After you finish setup the **Telegram → Claude Code relay is enabled by default** so you can immediately chat with your machine. (You can turn it off in Settings → Incoming messages if you'd rather use this purely as a notification dashboard.)

### Production

```bash
bun run build   # bundles the client into dist/
bun run start   # serves API + bundled client on $PORT (default 3000)
```

## Configuration

Most settings live in the SQLite DB and are configured in the in-app **Settings** page. The `.env` file only controls server-level concerns:

| Var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `POLL_CRON` | Default cron for finance polling (UTC) | `*/15 * * * *` |
| `DB_PATH` | SQLite file path | `./data/dashboard.db` |
| `VITE_BASE_PATH` | Sub-path if reverse-proxied (e.g. `/signal/`) | (root) |

---

## 1. Telegram → Claude Code relay

Send any message to your linked Telegram chat and it gets relayed to a `claude` headless session running on the host. Claude can read code, run commands, edit files, and reply back through Telegram. Photos and image documents are passed in as well.

**Setup:** done automatically by the onboarding wizard. The relay is **enabled by default** after setup completes.

**Commands inside the chat:**
- `/new_session` — start a fresh Claude conversation (drops the resumed session ID)
- `/help` — show usage

**Toggle / configure:** Settings → Incoming messages
- **Enable / disable relay** — flip the dropdown between `claude` and `none`.
- **Image attachments** — toggle whether photos/image-documents are downloaded and passed to Claude.

> ⚠️ Claude is invoked with `--permission-mode bypassPermissions` (no tool confirmations). Anyone who can message your linked Telegram chat can run shell commands on the host. Only enable the relay if you trust everyone in that chat.

---

## 2. Finance Signal

Watch crypto and forex pairs and get a Telegram alert when one crosses a threshold.

**Built-in pairs** (defined in [server/pairs.ts](server/pairs.ts)):
- Crypto via Binance: BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, PAXG/USDT
- Forex via Yahoo Finance: USD/IDR, EUR/USD, SGD/IDR

**Setup:** none — works out of the box.

**Usage:**
1. Go to **Finance Signal** in the nav.
2. Pick a pair, set a direction (`above` / `below`) and a threshold price.
3. The scheduler runs every 15 minutes by default and notifies you on threshold crossings (state transitions only — you won't be spammed every poll).
4. Adjust the cron in **Settings → Poll schedule** (standard 5-field cron, UTC).

**Run history:** Finance Signal → Runs tab. Each poll records what was checked, the value, and whether anything triggered.

---

## 3. Reddit Tracker

Pull recent posts for a keyword (optionally restricted to a subreddit) on demand.

**Setup:** Reddit will rate-limit / block direct requests from data-center IPs and from Bun's default User-Agent. **You almost certainly need a residential or rotating proxy** to use this reliably. Free options exist for low volume; paid services (Oxylabs, Bright Data, Floxy, etc.) are more reliable.

Configure in **Settings → Reddit fetch:**
- **Proxy URL** — `http://user:pass@host:port` (HTTP/HTTPS proxies; Bun's `fetch` supports the `proxy` option)
- **User-Agent** — any browser-like UA string. Reddit blocks `bun/x.y.z` and similar.
- **Result limit** — 1–100 (passed as `limit` to `reddit.com/search.json`)

**Usage:**
1. Go to **Reddit Tracker**.
2. Add a keyword and (optionally) a subreddit (`programming`, `r/programming`, etc.).
3. Click "Search" to pull the latest posts. Results page through using Reddit's `after` cursor.

If you see "Expected JSON but got text/html" or 429s, your proxy/UA combo is being blocked. Try a different proxy or rotate.

---

## 4. Twitter Tracker

Search Twitter (X) by keyword across Top / Latest / Photos / Videos tabs.

**Setup:** This feature shells out to the [`twitter`](https://github.com/vladkens/twitter-cli) CLI — it must be on the host's `$PATH`.

```bash
# pick one
uv tool install twitter-cli
pipx install twitter-cli
```

Authentication: the CLI uses Twitter web-session cookies. You need the `auth_token` and `ct0` cookies from a logged-in browser session.

1. Log in to <https://x.com> in a browser.
2. Open DevTools → Application → Cookies → `https://x.com`.
3. Copy the values of `auth_token` and `ct0`.

Configure in **Settings → Twitter:**
- **Auth token** — the `auth_token` cookie value
- **CT0** — the `ct0` cookie value
- **Proxy** (optional) — `http://user:pass@host:port` or `socks5://host:port`. Helpful if your IP gets challenged by Twitter.
- **Result limit** — 1–100

**Usage:**
1. Go to **Twitter Tracker**.
2. Add a keyword, pick a tab (Latest is the default and usually what you want).
3. Search — results page through with the `cursor` returned by the CLI.

Cookie sessions expire; if searches start failing, refresh the cookies in the same browser and paste new values into Settings.

---

## 5. Exa People Search

Find people on the internet for a natural-language query, powered by [Exa](https://exa.ai).

**Setup:** Get an API key from <https://dashboard.exa.ai>.

Configure in **Settings → Exa:**
- **API key** — your Exa key
- **Number of results** — 1–100 (default 10)

**Usage:**
1. Go to **Exa People**.
2. Add a query like `"founder of a YC-backed climate startup based in Berlin"`.
3. Click "Search" — Exa returns matching profiles with summary, highlights, and source URL.

Exa charges per request; check your dashboard for usage.

---

## 6. Information Signal

Schedule a recurring web search and have a Claude model decide whether the results are worth notifying you about, based on a natural-language condition you write.

**Setup:** Two API keys.

1. **Brave Search API key** — sign up at <https://brave.com/search/api/>. Free tier: 1 query/sec, 2,000/month.
2. **Anthropic API key** — get one at <https://console.anthropic.com>. Default model is `claude-haiku-4-5-20251001` (cheap and fast).

Configure both in **Settings → Information Signal API keys**.

**Usage:**
1. Go to **Information Signal**.
2. Create a signal with:
   - **Search query** — what to ask Brave (e.g. `latest news on Federal Reserve interest rate decision`)
   - **Notify condition** — natural-language criterion the model evaluates (e.g. `notify me only if the Fed announced a rate change or hinted at one in the next FOMC`)
   - **Frequency** — `30m`, `1h`, `6h`, `12h`, `1d`, or `1w`
3. Each tick: Gideon hits Brave with your query, passes the results + your condition to Claude Haiku, and only sends a Telegram message if the model decides the condition is met.

**Run history:** Information Signal → Runs. Each run shows the search results, the model's decision (yes/no), its reasoning, and whether a Telegram message was sent.

---

## Security notes

- **Single-user only.** There is no user model — the linked Telegram chat is the operator. Don't deploy this for a team or share the bot.
- The Telegram → Claude Code relay runs `claude --permission-mode bypassPermissions`. **Treat your linked Telegram chat as having root on the host.** Don't share the chat. Use a private bot.
- API keys (Anthropic, Brave, Exa, Twitter cookies, proxy creds) are stored **plaintext** in `data/dashboard.db`. Don't commit `data/` and don't back it up to anywhere untrusted.
- There is **no built-in authentication** on the dashboard HTTP server. Bind it to localhost, or put it behind a reverse proxy with auth (Tailscale/Cloudflare Access/HTTP basic auth/etc.).
- The Reddit tracker stores your proxy URL (with embedded credentials) in plaintext in the DB — same caveats as above.

## License

MIT — see [LICENSE](LICENSE).
