import { query } from '@anthropic-ai/claude-agent-sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AccountManager } from '../accounts/account-manager.js';

export async function sendClaudeMessage({ prompt, model, logger, accountManager = new AccountManager(), runQuery = query }) {
  const selected = await accountManager.selectRunnableAccounts('all');
  const accounts = selected.accounts.filter(account => account.provider === 'claude');
  if (accounts.length === 0) {
    throw new Error('No runnable Claude accounts found. Run npm run codex:import first.');
  }
  const results = [];
  for (const account of accounts) {
    const startedAt = Date.now();
    const result = {
      provider: 'claude', accountId: account.id, accountEmail: account.email,
      model, success: false, errorCode: null, response: ''
    };
    const secrets = [account.accessToken, account.refreshToken];
    let configDir;
    let credentialsWritten = false;
    try {
      const oauth = {
        ...account.auth?.claudeAiOauth,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresAt: Date.parse(account.expiresAt)
      };
      if (!oauth.accessToken || !oauth.refreshToken || !Number.isFinite(oauth.expiresAt) || !Array.isArray(oauth.scopes)) {
        throw new Error('Claude account requires accessToken, refreshToken, expiry and OAuth scopes. Run npm run codex:import.');
      }
      configDir = await fs.mkdtemp(path.join(path.dirname(accountManager.storagePath), 'claude-runtime-'));
      await fs.writeFile(path.join(configDir, '.credentials.json'), JSON.stringify({ claudeAiOauth: oauth }), { mode: 0o600 });
      credentialsWritten = true;
      await logger?.info('Sending Claude prompt', { provider: 'claude', accountId: account.id, model, prompt });
      let finalMessage;
      for await (const message of runQuery({
        prompt,
        options: {
          model,
          maxTurns: 1,
          persistSession: false,
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: undefined,
            ANTHROPIC_AUTH_TOKEN: undefined,
            CLAUDE_CODE_OAUTH_TOKEN: undefined,
            CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR: undefined,
            CLAUDE_CONFIG_DIR: configDir
          }
        }
      })) {
        if (message.type === 'result') finalMessage = message;
      }
      if (!finalMessage) throw new Error('Claude returned no final result.');
      if (finalMessage.is_error || finalMessage.subtype !== 'success') {
        throw new Error(finalMessage.errors?.join('; ') || finalMessage.result || 'Claude request failed.');
      }
      result.success = true;
      result.response = finalMessage.result;
    } catch (error) {
      result.errorCode = 'claude_error';
      result.response = error.message;
    } finally {
      if (credentialsWritten) {
        try {
          const credentials = JSON.parse(await fs.readFile(path.join(configDir, '.credentials.json'), 'utf8'));
          secrets.push(credentials.claudeAiOauth?.accessToken, credentials.claudeAiOauth?.refreshToken);
          await accountManager.saveClaudeCredentials(account.id, credentials.claudeAiOauth);
        } catch {
          // Keep refreshed credentials on disk if saving the canonical store fails.
          throw new Error(`Could not save Claude credentials. Recovery copy kept in ${configDir}`);
        }
      }
      if (configDir) await fs.rm(configDir, { recursive: true, force: true });
    }
    result.response = String(result.response ?? '');
    for (const token of secrets) {
      if (typeof token === 'string' && token) result.response = result.response.replaceAll(token, '[redacted]');
    }
    result.durationMs = Date.now() - startedAt;
    await accountManager.markAccountResult(account.id, {
      success: result.success,
      errorCode: result.errorCode,
      ...(result.success ? { cooldownUntil: null } : {})
    }, 'claude');
    await logger?.info('Claude request completed', result);
    results.push(result);
  }
  return results;
}
