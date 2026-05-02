export type ClaudeResult =
  | { ok: true; text: string; session_id: string | null }
  | { ok: false; error: string };

export async function runClaudeHeadless(
  prompt: string,
  sessionId: string | null
): Promise<ClaudeResult> {
  const args = [
    '-p',
    prompt,
    '--permission-mode',
    'bypassPermissions',
    '--output-format',
    'json',
  ];
  if (sessionId) args.push('--resume', sessionId);

  let proc;
  try {
    proc = Bun.spawn(['claude', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (err) {
    return {
      ok: false,
      error: `Failed to spawn claude CLI: ${err instanceof Error ? err.message : String(err)}. Is it installed and on PATH?`,
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
      error: `claude exited with code ${exitCode}: ${stderr.trim() || stdout.trim() || 'no output'}`,
    };
  }

  try {
    const parsed = JSON.parse(stdout) as {
      result?: string;
      session_id?: string;
      is_error?: boolean;
    };
    if (parsed.is_error) {
      return { ok: false, error: parsed.result || 'claude reported an error' };
    }
    return {
      ok: true,
      text: (parsed.result ?? '').trim(),
      session_id: parsed.session_id ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to parse claude JSON output: ${err instanceof Error ? err.message : String(err)}. Raw: ${stdout.slice(0, 300)}`,
    };
  }
}
