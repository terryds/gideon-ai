import { getSetting, setSetting, db } from './db.ts';
import {
  getTelegramConfig,
  getUpdatesRaw,
  sendTelegram,
  sendTelegramPlain,
  sendChatAction,
  setMyCommands,
  getFile,
  downloadTelegramFile,
  type TelegramUpdate,
  type TelegramMessage,
} from './telegram.ts';
import { runClaudeHeadless } from './claude-runner.ts';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const INCOMING_HANDLER_KEY = 'incoming_handler';
const INCOMING_IMAGES_KEY = 'incoming_images_enabled';
const TG_OFFSET_KEY = 'telegram_update_offset';
const CLAUDE_SESSION_KEY = 'claude_session_id';
const INBOX_DIR = resolve('./data/tg-inbox');
const INBOX_KEEP = 50;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']);

export type IncomingHandler = 'none' | 'claude';

export function getIncomingHandler(): IncomingHandler {
  const v = getSetting(INCOMING_HANDLER_KEY);
  return v === 'claude' ? 'claude' : 'none';
}

export function getIncomingImagesEnabled(): boolean {
  const v = getSetting(INCOMING_IMAGES_KEY);
  return v !== 'off';
}

function setOffset(id: number): void {
  setSetting(TG_OFFSET_KEY, String(id));
}

function getOffset(): number {
  return Number(getSetting(TG_OFFSET_KEY) || '0') || 0;
}

let listenerLoopRunning = false;

export function startListener(): void {
  if (listenerLoopRunning) return;
  listenerLoopRunning = true;
  console.log('[tg-listener] loop started');
  loop().catch((err) => {
    console.error('[tg-listener] loop crashed:', err);
    listenerLoopRunning = false;
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTyping<T>(fn: () => Promise<T>): Promise<T> {
  await sendChatAction('typing');
  // Telegram's typing indicator lasts ~5s; refresh every 4s while the task runs.
  const interval = setInterval(() => {
    sendChatAction('typing').catch(() => {});
  }, 4000);
  try {
    return await fn();
  } finally {
    clearInterval(interval);
  }
}

async function loop(): Promise<void> {
  while (listenerLoopRunning) {
    if (getIncomingHandler() !== 'claude') {
      await sleep(5000);
      continue;
    }
    const { botToken, chatId } = getTelegramConfig();
    if (!botToken || !chatId) {
      await sleep(10_000);
      continue;
    }

    const r = await getUpdatesRaw(getOffset(), 25);
    if (!r.ok) {
      console.error(`[tg-listener] getUpdates failed: ${r.error}`);
      await sleep(5000);
      continue;
    }
    if (r.updates.length === 0) continue;

    for (const upd of r.updates) {
      try {
        await processUpdate(upd, chatId);
      } catch (err) {
        console.error('[tg-listener] process error:', err);
      }
    }

    const maxId = r.updates.reduce((m, u) => Math.max(m, u.update_id), 0);
    setOffset(maxId + 1);
  }
}

type ImageAttachment = { file_id: string; hint_ext: string; size: number };

function extractImage(msg: TelegramMessage): ImageAttachment | null {
  if (msg.photo && msg.photo.length > 0) {
    const largest = [...msg.photo].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
    return { file_id: largest.file_id, hint_ext: '.jpg', size: largest.file_size ?? 0 };
  }
  if (msg.document && msg.document.mime_type && IMAGE_MIMES.has(msg.document.mime_type)) {
    const ext = msg.document.file_name ? extname(msg.document.file_name) : '';
    return {
      file_id: msg.document.file_id,
      hint_ext: ext || mimeToExt(msg.document.mime_type),
      size: msg.document.file_size ?? 0,
    };
  }
  return null;
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/heic': return '.heic';
    default: return '.bin';
  }
}

function trimInbox(): void {
  try {
    const files = readdirSync(INBOX_DIR)
      .map((name) => {
        const p = join(INBOX_DIR, name);
        try {
          return { p, mtime: statSync(p).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((x): x is { p: string; mtime: number } => x !== null)
      .sort((a, b) => b.mtime - a.mtime);
    for (const f of files.slice(INBOX_KEEP)) {
      try { unlinkSync(f.p); } catch { /* ignore */ }
    }
  } catch { /* dir may not exist yet */ }
}

async function handleImageMessage(
  msg: TelegramMessage,
  image: ImageAttachment,
  caption: string,
  updateId: number
): Promise<void> {
  const info = await getFile(image.file_id);
  if (!info.ok) {
    await sendTelegram(`⚠️ <b>Couldn't fetch image from Telegram</b>\n${escapeHtml(info.error)}`);
    return;
  }

  const telegramExt = extname(info.path) || image.hint_ext || '.bin';
  mkdirSync(INBOX_DIR, { recursive: true });
  const destPath = join(INBOX_DIR, `${updateId}-${msg.message_id}${telegramExt}`);
  const dl = await downloadTelegramFile(info.path, destPath);
  if (!dl.ok) {
    await sendTelegram(`⚠️ <b>Couldn't download image</b>\n${escapeHtml(dl.error || '')}`);
    return;
  }
  trimInbox();

  const userText = caption || '(no caption)';
  const prompt = [
    `The user sent an image via Telegram.`,
    `Image saved at: ${destPath}`,
    `Caption: ${userText}`,
    ``,
    `Please Read the image file and respond to the user.`,
  ].join('\n');

  const sessionId = getSetting(CLAUDE_SESSION_KEY);
  console.log(
    `[tg-listener] → claude (${sessionId ? 'resume ' + sessionId.slice(0, 8) : 'new session'}) [image ${destPath}] caption: ${userText.slice(0, 60)}`
  );
  const result = await withTyping(() => runClaudeHeadless(prompt, sessionId));

  if (result.ok) {
    if (result.session_id) setSetting(CLAUDE_SESSION_KEY, result.session_id);
    const body = result.text || '(Claude returned an empty response)';
    const r = await sendTelegramPlain(body);
    if (!r.ok) console.error(`[tg-listener] send failed: ${r.error}`);
  } else {
    await sendTelegram(`⚠️ <b>Claude error</b>\n${escapeHtml(result.error)}`);
  }
}

async function processUpdate(upd: TelegramUpdate, expectedChatId: string): Promise<void> {
  const msg = upd.message;
  if (!msg) return;
  if (String(msg.chat.id) !== expectedChatId) {
    console.log(`[tg-listener] ignored message from unauthorized chat ${msg.chat.id}`);
    return;
  }

  const text = (msg.text ?? '').trim();
  const image = extractImage(msg);

  if (image) {
    if (!getIncomingImagesEnabled()) {
      await sendTelegram(
        '📷 Image received, but image handling is off. Enable it in Settings → Incoming messages.'
      );
      return;
    }
    await handleImageMessage(msg, image, (msg.caption ?? '').trim(), upd.update_id);
    return;
  }

  if (!text) return;

  if (text === '/new_session' || text.startsWith('/new_session ')) {
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(CLAUDE_SESSION_KEY);
    await sendTelegram(
      '🔄 <b>New conversation started.</b>\nThe next message will begin a fresh Claude session.'
    );
    return;
  }

  if (text === '/start' || text === '/help') {
    await sendTelegram(
      [
        '<b>Gideon AI Dashboard — Claude relay</b>',
        '',
        'Send me any message and I\'ll relay it to Claude Code running on the host.',
        'Photos and image documents are read by Claude too.',
        '',
        'Commands:',
        '  /new_session — start a fresh Claude conversation',
        '  /help — show this message',
      ].join('\n')
    );
    return;
  }

  const sessionId = getSetting(CLAUDE_SESSION_KEY);
  console.log(`[tg-listener] → claude (${sessionId ? 'resume ' + sessionId.slice(0, 8) : 'new session'}): ${text.slice(0, 80)}`);
  const result = await withTyping(() => runClaudeHeadless(text, sessionId));

  if (result.ok) {
    if (result.session_id) setSetting(CLAUDE_SESSION_KEY, result.session_id);
    const body = result.text || '(Claude returned an empty response)';
    const r = await sendTelegramPlain(body);
    if (!r.ok) console.error(`[tg-listener] send failed: ${r.error}`);
  } else {
    await sendTelegram(`⚠️ <b>Claude error</b>\n${escapeHtml(result.error)}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function onIncomingHandlerChanged(newMode: IncomingHandler): Promise<void> {
  if (newMode === 'claude') {
    // Skip any backlog so we don't spam Claude with old messages
    const r = await getUpdatesRaw(0, 0);
    if (r.ok) {
      const maxId = r.updates.reduce((m, u) => Math.max(m, u.update_id), 0);
      setOffset(Math.max(maxId + 1, getOffset()));
    }
    await setMyCommands([
      { command: 'new_session', description: 'Start a new Claude conversation' },
      { command: 'help', description: 'Show usage' },
    ]);
  } else {
    await setMyCommands([]);
  }
}
