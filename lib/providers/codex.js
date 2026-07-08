import { AccountManager } from '../accounts/account-manager.js';
import { runCodexCommand } from '../codex/run-codex-command.js';

export async function sendCodexMessage({
  prompt,
  model,
  logger,
  accountSelection = process.env.CODEX_ACCOUNT_SELECTION || 'all',
  codexEnableAutoFallback = readBoolean(process.env.CODEX_ENABLE_AUTO_FALLBACK, true),
  codexFailureCooldownMinutes = Number(process.env.CODEX_FAILURE_COOLDOWN_MINUTES || 60)
}) {
  const accountManager = new AccountManager();
  const { accounts } = await accountManager.selectRunnableAccounts(accountSelection);

  if (accounts.length === 0) {
    throw new Error(
      'No runnable Codex accounts found. Import at least one account with "node scripts/codex-accounts.js login".'
    );
  }

  const results = [];

  for (const account of accounts) {
    const startedAt = Date.now();

    try {
      await logger?.info('Sending Codex prompt', {
        provider: 'codex',
        accountId: account.id,
        accountEmail: account.email,
        label: account.label,
        model,
        prompt
      });
      await accountManager.syncAccountToCodexHome(account);
      const runResult = await runCodexCommand({
        prompt,
        model,
        codexHomePath: accountManager.codexHomePath
      });

      await accountManager.importFromCodexHome({
        label: account.label,
        source: 'codex-exec-sync'
      });

      await accountManager.markAccountResult(account.id, {
        success: true,
        errorCode: null,
        cooldownUntil: null
      });

      results.push({
        provider: 'codex',
        accountId: account.id,
        accountEmail: account.email,
        model: model || null,
        durationMs: runResult.durationMs,
        success: true,
        errorCode: null,
        response: runResult.output,
        usage: runResult.usage,
        reasoning: {
          hasReasoning: runResult.hasReasoning,
          reasoningItemCount: runResult.reasoningItemCount
        }
      });

      await logger?.info('Codex response received', {
        provider: 'codex',
        accountId: account.id,
        accountEmail: account.email,
        response: runResult.output,
        durationMs: runResult.durationMs,
        usage: runResult.usage,
        reasoning: {
          hasReasoning: runResult.hasReasoning,
          reasoningItemCount: runResult.reasoningItemCount
        }
      });
    } catch (error) {
      const result = error.result || {};
      const errorCode = result.errorCode || 'process_error';
      const cooldownUntil = shouldCooldown(errorCode, codexEnableAutoFallback)
        ? new Date(Date.now() + codexFailureCooldownMinutes * 60 * 1000).toISOString()
        : null;

      await accountManager.markAccountResult(account.id, {
        success: false,
        errorCode,
        cooldownUntil
      });

      results.push({
        provider: 'codex',
        accountId: account.id,
        accountEmail: account.email,
        model: model || null,
        durationMs: result.durationMs ?? Date.now() - startedAt,
        success: false,
        errorCode,
        response: result.output || result.stderr || result.stdout || error.message,
        usage: result.usage || null,
        reasoning: {
          hasReasoning: false,
          reasoningItemCount: 0
        }
      });

      await logger?.error('Codex account failed', {
        provider: 'codex',
        accountId: account.id,
        accountEmail: account.email,
        errorCode,
        cooldownUntil,
        error: result.stderr || result.stdout || error.message,
        usage: result.usage || null
      });
    }
  }

  return results;
}

function shouldCooldown(errorCode, enabled) {
  if (!enabled) {
    return false;
  }

  return ['authentication_failed', 'rate_limit', 'network_error', 'server_error', 'timeout'].includes(errorCode);
}

function readBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}
