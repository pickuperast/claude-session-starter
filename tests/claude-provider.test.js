import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AccountManager } from '../lib/accounts/account-manager.js';
import { sendClaudeMessage } from '../lib/providers/claude.js';
import { getEnabledProviders } from '../lib/config.js';

test('Claude uses stored credentials, filters providers, records failures and continues', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-provider-test-'));
  const manager = new AccountManager({ storagePath: path.join(root, 'accounts.json') });
  const oldToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'ignored-environment-token';
  try {
    const auth = { claudeAiOauth: { scopes: ['user:inference'] } };
    const expiresAt = new Date(2000000000000).toISOString();
    await manager.saveStorage({ accounts: [
      { provider: 'codex', id: 'shared', accessToken: 'codex-token' },
      { provider: 'claude', id: 'shared', accessToken: 'stored-failure', refreshToken: 'refresh-secret', expiresAt, auth },
      { provider: 'claude', id: 'success', accessToken: 'stored-success', refreshToken: 'refresh-success', expiresAt, auth },
      { provider: 'claude', id: 'missing-result', accessToken: 'stored-empty', refreshToken: 'refresh-empty', expiresAt, auth },
      { provider: 'claude', id: 'disabled', accessToken: 'disabled-token', enabled: false },
      { provider: 'claude', id: 'cooldown', accessToken: 'cooldown-token', cooldownUntil: '2099-01-01T00:00:00Z' }
    ] });
    const calls = [];
    const results = await sendClaudeMessage({ prompt: 'Reply OK', model: 'test-model', accountManager: manager,
      runQuery: async function* ({ options }) {
        calls.push(options);
        const credentialsPath = path.join(options.env.CLAUDE_CONFIG_DIR, '.credentials.json');
        const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
        const token = credentials.claudeAiOauth.accessToken;
        assert.ok(credentials.claudeAiOauth.refreshToken);
        credentials.claudeAiOauth.accessToken = 'rotated-' + token;
        credentials.claudeAiOauth.refreshToken = 'rotated-refresh-' + token;
        credentials.claudeAiOauth.expiresAt = 2100000000000;
        await fs.writeFile(credentialsPath, JSON.stringify(credentials));
        if (token === 'stored-failure') {
          yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['stored-failure refresh-secret'] };
        } else if (token === 'stored-success') {
          yield { type: 'result', subtype: 'success', is_error: false, result: 'OK' };
        }
      }
    });
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
      await assert.rejects(fs.access(call.env.CLAUDE_CONFIG_DIR));
    }
    assert.equal(calls[0].env.ANTHROPIC_API_KEY, undefined);
    assert.equal(process.env.CLAUDE_CODE_OAUTH_TOKEN, 'ignored-environment-token');
    assert.deepEqual(results.map(result => result.success), [false, true, false]);
    assert.equal(results[0].response, '[redacted] [redacted]');
    const storage = await manager.loadStorage();
    assert.equal(storage.accounts[0].lastUsed, null);
    assert.equal(storage.accounts[1].lastErrorCode, 'claude_error');
    assert.ok(storage.accounts[2].lastSuccessAt);
    assert.equal(storage.accounts[1].refreshToken, 'rotated-refresh-stored-failure');
    assert.equal(storage.accounts[2].accessToken, 'rotated-stored-success');
    assert.equal(storage.accounts[2].refreshToken, 'rotated-refresh-stored-success');
    assert.equal(storage.accounts[2].auth.claudeAiOauth.accessToken, 'rotated-stored-success');
    assert.equal(storage.accounts[2].expiresAt, new Date(2100000000000).toISOString());
    let recoveryDir;
    manager.saveClaudeCredentials = async () => { throw new Error('Simulated disk failure'); };
    await assert.rejects(sendClaudeMessage({
      prompt: 'Reply OK', model: 'test-model', accountManager: manager,
      runQuery: async function* ({ options }) {
        recoveryDir = options.env.CLAUDE_CONFIG_DIR;
        yield { type: 'result', subtype: 'success', result: 'OK' };
      }
    }), /Recovery copy kept/);
    assert.ok(JSON.parse(await fs.readFile(path.join(recoveryDir, '.credentials.json'), 'utf8')).claudeAiOauth.refreshToken);
  } finally {
    if (oldToken === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = oldToken;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('provider defaults do not depend on an environment token', () => {
  const names = ['PING_PROVIDER_CODEX', 'PING_PROVIDER_CLAUDE', 'CLAUDE_CODE_OAUTH_TOKEN'];
  const previous = names.map(name => process.env[name]);
  try {
    names.forEach(name => delete process.env[name]);
    assert.deepEqual(getEnabledProviders(), ['codex', 'claude']);
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'ignored';
    assert.deepEqual(getEnabledProviders(), ['codex', 'claude']);
    process.env.PING_PROVIDER_CODEX = 'true';
    process.env.PING_PROVIDER_CLAUDE = 'false';
    assert.deepEqual(getEnabledProviders(), ['codex']);
  } finally {
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    });
  }
});
