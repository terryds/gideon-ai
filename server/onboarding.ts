import { getSetting, setSetting, db } from './db.ts';
import { onIncomingHandlerChanged } from './tg-listener.ts';

export type ClaudeCheckResult =
  | { ok: true; version: string }
  | { ok: false; error: string };

export async function checkClaudeCli(): Promise<ClaudeCheckResult> {
  let proc;
  try {
    proc = Bun.spawn(['claude', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (err) {
    return {
      ok: false,
      error: `Could not spawn 'claude': ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    return {
      ok: false,
      error: stderr.trim() || stdout.trim() || `claude exited with code ${exitCode}`,
    };
  }
  return { ok: true, version: stdout.trim() || 'unknown' };
}

export function isOnboarded(): boolean {
  return getSetting('onboarding_completed') === '1';
}

export async function markOnboarded(): Promise<void> {
  setSetting('onboarding_completed', '1');
  // Enable the Telegram → Claude Code relay by default. Users can disable
  // it later in Settings if they don't want messages relayed to claude.
  if (getSetting('incoming_handler') !== 'claude') {
    setSetting('incoming_handler', 'claude');
    await onIncomingHandlerChanged('claude');
  }
}

export function resetOnboarding(): void {
  db.prepare("DELETE FROM settings WHERE key = 'onboarding_completed'").run();
}
