import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AccountManager } from '../lib/accounts/account-manager.js';
import { importCodexAccounts } from '../scripts/import-codex-accounts.js';

test('multi-auth import maps credentials, preserves accounts, and rejects invalid input without writes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-import-test-'));
  const sourcePath = path.join(root, 'source.json');
  const storagePath = path.join(root, 'accounts', 'codex-accounts.json');
  const claudePath = path.join(root, 'credentials.json');
  const source = {
    activeIndex: 1,
    accounts: [
      { accountId: 'old-id', accountLabel: 'main', email: 'test@example.com', accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: 2000000000000, addedAt: 1700000000000, lastUsed: 1800000000000, coolingDownUntil: 1900000000000, workspaces: [{ id: 'workspace-1' }], currentWorkspaceIndex: 0 },
      { accountId: 'account-2', accountLabel: 'work', accessToken: 'access-2', refreshToken: 'refresh-2', enabled: false }
    ]
  };
  try {
    await fs.writeFile(sourcePath, `\uFEFF${JSON.stringify(source)}`);
    await fs.writeFile(claudePath, JSON.stringify({ claudeAiOauth: { accessToken: 'claude-access', refreshToken: 'claude-refresh', expiresAt: 2000000000000, scopes: ['user:inference'] }, mcpOAuth: { secret: 'must-not-copy' } }));
    const original = await fs.readFile(sourcePath, 'utf8');
    assert.equal(await importCodexAccounts(sourcePath, storagePath, claudePath), 3);
    const storage = JSON.parse(await fs.readFile(storagePath, 'utf8'));
    assert.equal(storage.activeIndex, 1);
    assert.equal(storage.pinnedAccountIndex, 1);
    assert.equal(storage.provider, 'mixed');
    assert.equal(storage.accounts[0].provider, 'codex');
    assert.equal(storage.accounts[2].provider, 'claude');
    assert.equal(storage.accounts[2].accessToken, 'claude-access');
    assert.equal(storage.accounts[2].auth.mcpOAuth, undefined);
    assert.equal(storage.accounts[2].expiresAt, new Date(2000000000000).toISOString());
    const [account] = storage.accounts;
    assert.equal(account.id, 'workspace-1');
    assert.equal(account.email, 'test@example.com');
    assert.equal(account.accessToken, 'access-1');
    assert.equal(account.refreshToken, 'refresh-1');
    assert.deepEqual(account.auth.tokens, { account_id: 'workspace-1', access_token: 'access-1', refresh_token: 'refresh-1', id_token: '' });
    assert.equal(account.expiresAt, new Date(2000000000000).toISOString());
    assert.equal(account.createdAt, new Date(1700000000000).toISOString());
    assert.equal(account.lastUsed, new Date(1800000000000).toISOString());
    assert.equal(account.cooldownUntil, new Date(1900000000000).toISOString());
    assert.equal(storage.accounts[1].enabled, false);
    assert.equal(await fs.readFile(sourcePath, 'utf8'), original);
    storage.accounts[0].label = 'local label';
    storage.accounts[0].enabled = false;
    storage.accounts.push({ ...account, id: 'unrelated' });
    await fs.writeFile(storagePath, JSON.stringify(storage));
    source.accounts[0].accessToken = 'updated-access';
    await fs.writeFile(sourcePath, JSON.stringify(source));
    await importCodexAccounts(sourcePath, storagePath, claudePath);
    const updated = JSON.parse(await fs.readFile(storagePath, 'utf8'));
    assert.equal(updated.accounts.length, 4);
    assert.equal(updated.accounts[0].accessToken, 'updated-access');
    assert.equal(updated.accounts[0].auth.tokens.access_token, 'updated-access');
    assert.equal(updated.accounts[0].label, 'local label');
    assert.equal(updated.accounts[0].enabled, false);
    assert.deepEqual(updated.accounts[3], storage.accounts[3]);
    const manager = new AccountManager({ storagePath, codexHomePath: path.join(root, 'codex-home') });
    await manager.switchAccount('claude-local');
    await assert.rejects(fs.access(path.join(root, 'codex-home', 'auth.json')));
    await assert.rejects(manager.syncAccountToCodexHome(updated.accounts[2]), /Only Codex/);
    const before = await fs.readFile(storagePath, 'utf8');
    await fs.writeFile(claudePath, JSON.stringify({ mcpOAuth: {} }));
    await assert.rejects(importCodexAccounts(sourcePath, storagePath, claudePath), /Claude credentials require/);
    assert.equal(await fs.readFile(storagePath, 'utf8'), before);
    delete source.accounts[1].refreshToken;
    await fs.writeFile(sourcePath, JSON.stringify(source));
    await assert.rejects(importCodexAccounts(sourcePath, storagePath), /requires an account ID/);
    assert.equal(await fs.readFile(storagePath, 'utf8'), before);
    await assert.rejects(importCodexAccounts(sourcePath, sourcePath), /different files/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
