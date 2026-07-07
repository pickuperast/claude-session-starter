import { Codex } from '@openai/codex-sdk';

export async function runCodexCommand({
  prompt,
  model,
  codexHomePath,
  cwd = process.cwd(),
  timeoutMs = Number(process.env.CODEX_EXEC_TIMEOUT_MS || 300000),
  env = process.env
}) {
  const startedAt = Date.now();
  const codex = new Codex(buildCodexClientOptions({ codexHomePath, env }));
  const thread = codex.startThread(buildThreadOptions({ model, cwd }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const turn = await thread.run(prompt, { signal: controller.signal });
    const output = turn.finalResponse?.trim() || '';

    return {
      code: 0,
      signal: null,
      stdout: '',
      stderr: '',
      output,
      durationMs: Date.now() - startedAt,
      success: true,
      errorCode: null
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = getErrorMessage(error);
    const errorCode = controller.signal.aborted ? 'timeout' : classifyCodexError(errorMessage);
    const result = {
      code: errorCode === 'timeout' ? 124 : 1,
      signal: null,
      stdout: '',
      stderr: errorMessage,
      output: '',
      durationMs,
      success: false,
      errorCode
    };

    const wrappedError = new Error(`codex exec failed: ${errorMessage}`);
    wrappedError.result = result;
    throw wrappedError;
  } finally {
    clearTimeout(timeout);
  }
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

export function buildCodexClientOptions({
  codexHomePath,
  env = process.env
} = {}) {
  const nextEnv = {
    ...env
  };

  if (codexHomePath) {
    nextEnv.CODEX_HOME = codexHomePath;
  }

  return {
    env: nextEnv
  };
}

export function buildThreadOptions({ model, cwd = process.cwd() } = {}) {
  return {
    model,
    workingDirectory: cwd,
    skipGitRepoCheck: true
  };
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown Codex error';
}
