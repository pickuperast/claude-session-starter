import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export async function runCodexCommand({
  prompt,
  model,
  codexHomePath,
  cwd = process.cwd(),
  timeoutMs = Number(process.env.CODEX_EXEC_TIMEOUT_MS || 300000)
}) {
  const outputPath = path.join(os.tmpdir(), `codex-last-message-${Date.now()}-${Math.random()}.txt`);
  const args = ['exec', '--skip-git-repo-check', '--color', 'never', '-o', outputPath];

  if (model) {
    args.push('-m', model);
  }

  args.push(prompt);

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn('codex', args, {
      cwd,
      env: {
        ...process.env,
        CODEX_HOME: codexHomePath
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn codex CLI: ${error.message}`));
    });

    child.on('close', async (code, signal) => {
      clearTimeout(timeout);

      let output = '';
      try {
        output = await fs.readFile(outputPath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          stderr += `\nFailed to read output file: ${error.message}`;
        }
      }

      await fs.rm(outputPath, { force: true }).catch(() => {});

      const durationMs = Date.now() - startedAt;
      const combinedOutput = `${stdout}\n${stderr}\n${output}`.trim();
      const errorCode = timedOut ? 'timeout' : classifyCodexError(combinedOutput);

      const result = {
        code: code ?? (timedOut ? 124 : 1),
        signal: signal ?? null,
        stdout,
        stderr,
        output: output.trim(),
        durationMs,
        success: !timedOut && code === 0,
        errorCode
      };

      if (result.success) {
        resolve(result);
        return;
      }

      const error = new Error(
        `codex exec failed with code ${result.code}${result.signal ? ` (${result.signal})` : ''}.`
      );

      error.result = result;
      reject(error);
    });
  });
}

export function classifyCodexError(output) {
  const text = String(output || '').toLowerCase();

  if (!text) {
    return 'process_error';
  }

  if (text.includes('rate limit') || text.includes('too many requests')) {
    return 'rate_limit';
  }

  if (
    text.includes('login') ||
    text.includes('authentication') ||
    text.includes('invalid token') ||
    text.includes('invalid id token') ||
    text.includes('unauthorized') ||
    text.includes('access token')
  ) {
    return 'authentication_failed';
  }

  if (text.includes('timed out') || text.includes('timeout')) {
    return 'timeout';
  }

  if (text.includes('network') || text.includes('econnreset') || text.includes('enotfound')) {
    return 'network_error';
  }

  if (/\b5\d{2}\b/.test(text) || text.includes('server error')) {
    return 'server_error';
  }

  return 'process_error';
}
