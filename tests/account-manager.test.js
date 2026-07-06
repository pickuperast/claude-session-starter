import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { AccountManager } from '../lib/accounts/account-manager.js';
import { loadAccountStorage } from '../lib/accounts/storage.js';
import { selectAccountsForRun } from '../lib/codex/select-account.js';

test('imports a new account and updates an existing matching account', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-accounts-test-'));
  const storagePath = path.join(tempRoot, 'accounts.json');
  const codexHomePath = path.join(tempRoot, 'codex-home');
  const authPath = path.join(codexHomePath, 'auth.json');

  await fs.mkdir(codexHomePath, { recursive: true });
  await fs.writeFile(
    authPath,
    JSON.stringify({
      email: 'user@example.com',
      tokens: {
        account_id: 'acct-1',
        access_token: 'access-1',
        refresh_token: 'refresh-1'
      }
    }),
    'utf8'
  );

  const accountManager = new AccountManager({ storagePath, codexHomePath });
  const firstImport = await accountManager.importFromCodexHome({ label: 'main' });

  assert.equal(firstImport.index, 0);
  assert.equal(firstImport.account.label, 'main');

  await fs.writeFile(
    authPath,
    JSON.stringify({
      email: 'user@example.com',
      tokens: {
        account_id: 'acct-1',
        access_token: 'access-2',
        refresh_token: 'refresh-1'
      }
    }),
    'utf8'
  );

  const secondImport = await accountManager.importFromCodexHome({ label: 'renamed' });

  assert.equal(secondImport.index, 0);
  assert.equal(secondImport.account.label, 'renamed');
  assert.equal(secondImport.account.accessToken, 'access-2');

  const storage = await loadAccountStorage(storagePath);
  assert.equal(storage.accounts.length, 1);
});

test('selectAccountsForRun respects active, pinned and cooldown state', () => {
  const now = new Date('2026-07-06T12:00:00.000Z');
  const storage = {
    activeIndex: 1,
    pinnedAccountIndex: 2,
    accounts: [
      { id: 'a0', label: 'first', email: 'a0@example.com', enabled: true, cooldownUntil: '2026-07-06T12:10:00.000Z' },
      { id: 'a1', label: 'second', email: 'a1@example.com', enabled: true, cooldownUntil: null },
      { id: 'a2', label: 'third', email: 'a2@example.com', enabled: true, cooldownUntil: null },
      { id: 'a3', label: 'disabled', email: 'a3@example.com', enabled: false, cooldownUntil: null }
    ]
  };

  assert.deepEqual(
    selectAccountsForRun(storage, 'all', now).map((account) => account.id),
    ['a1', 'a2']
  );
  assert.deepEqual(
    selectAccountsForRun(storage, 'active', now).map((account) => account.id),
    ['a1']
  );
  assert.deepEqual(
    selectAccountsForRun(storage, 'pinned', now).map((account) => account.id),
    ['a2']
  );
});

test('switchAccount syncs the selected auth payload into CODEX_HOME', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-switch-test-'));
  const storagePath = path.join(tempRoot, 'accounts.json');
  const codexHomePath = path.join(tempRoot, 'codex-home');
  const accountManager = new AccountManager({ storagePath, codexHomePath });

  await accountManager.saveStorage({
    version: 1,
    provider: 'codex',
    activeIndex: 0,
    pinnedAccountIndex: 0,
    accounts: [
      {
        id: 'acct-1',
        email: 'user@example.com',
        label: 'main',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: null,
        enabled: true,
        lastUsed: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        cooldownUntil: null,
        source: 'test',
        createdAt: null,
        updatedAt: null,
        auth: {
          email: 'user@example.com',
          tokens: {
            account_id: 'acct-1',
            access_token: 'access-1',
            refresh_token: 'refresh-1'
          }
        }
      }
    ]
  });

  await accountManager.switchAccount('main');

  const authRaw = await fs.readFile(path.join(codexHomePath, 'auth.json'), 'utf8');
  const auth = JSON.parse(authRaw);
  assert.equal(auth.tokens.account_id, 'acct-1');
});

test('can pin, disable, and clear cooldown for a stored account', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-state-mutation-test-'));
  const storagePath = path.join(tempRoot, 'accounts.json');
  const codexHomePath = path.join(tempRoot, 'codex-home');
  const accountManager = new AccountManager({ storagePath, codexHomePath });

  await accountManager.saveStorage({
    version: 1,
    provider: 'codex',
    activeIndex: 0,
    pinnedAccountIndex: 0,
    accounts: [
      {
        id: 'acct-1',
        email: 'first@example.com',
        label: 'first',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: null,
        enabled: true,
        lastUsed: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        cooldownUntil: null,
        source: 'test',
        createdAt: null,
        updatedAt: null,
        auth: {}
      },
      {
        id: 'acct-2',
        email: 'second@example.com',
        label: 'second',
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        expiresAt: null,
        enabled: true,
        lastUsed: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastErrorCode: 'rate_limit',
        cooldownUntil: '2026-07-06T13:00:00.000Z',
        source: 'test',
        createdAt: null,
        updatedAt: null,
        auth: {}
      }
    ]
  });

  await accountManager.pinAccount('second');
  await accountManager.setAccountEnabled('second', false);
  await accountManager.clearAccountCooldown('second');

  const storage = await loadAccountStorage(storagePath);
  assert.equal(storage.pinnedAccountIndex, 1);
  assert.equal(storage.accounts[1].enabled, false);
  assert.equal(storage.accounts[1].cooldownUntil, null);
  assert.equal(storage.accounts[1].lastErrorCode, null);
});

test('successful result clears an existing cooldown', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-mark-success-test-'));
  const storagePath = path.join(tempRoot, 'accounts.json');
  const codexHomePath = path.join(tempRoot, 'codex-home');
  const accountManager = new AccountManager({ storagePath, codexHomePath });

  await accountManager.saveStorage({
    version: 1,
    provider: 'codex',
    activeIndex: 0,
    pinnedAccountIndex: 0,
    accounts: [
      {
        id: 'acct-1',
        email: 'user@example.com',
        label: 'main',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: null,
        enabled: true,
        lastUsed: null,
        lastSuccessAt: null,
        lastErrorAt: '2026-07-06T12:00:00.000Z',
        lastErrorCode: 'rate_limit',
        cooldownUntil: '2026-07-06T13:00:00.000Z',
        source: 'test',
        createdAt: null,
        updatedAt: null,
        auth: {}
      }
    ]
  });

  await accountManager.markAccountResult('acct-1', {
    success: true,
    errorCode: null,
    cooldownUntil: null
  });

  const storage = await loadAccountStorage(storagePath);
  assert.equal(storage.accounts[0].cooldownUntil, null);
  assert.equal(storage.accounts[0].lastErrorCode, null);
  assert.ok(storage.accounts[0].lastSuccessAt);
});

test('storage loader accepts UTF-8 BOM files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-bom-test-'));
  const storagePath = path.join(tempRoot, 'accounts.json');
  const withBom = `\uFEFF${JSON.stringify({
    version: 1,
    provider: 'codex',
    activeIndex: 0,
    pinnedAccountIndex: 0,
    accounts: []
  })}`;

  await fs.writeFile(storagePath, withBom, 'utf8');

  const storage = await loadAccountStorage(storagePath);
  assert.equal(storage.version, 1);
  assert.deepEqual(storage.accounts, []);
});
