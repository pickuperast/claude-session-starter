#!/usr/bin/env node
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAccountStoragePath, loadAccountStorage, readJsonFile, saveAccountStorage } from '../lib/accounts/storage.js';
import { createImportedAccount } from '../lib/codex/login-import.js';

export async function importCodexAccounts(sourcePath, storagePath = getAccountStoragePath(), claudePath) {
  if ([sourcePath, claudePath].filter(Boolean).some(file => path.resolve(file) === path.resolve(storagePath))) {
    throw new Error('Source and destination must be different files.');
  }
  const source = await readJsonFile(sourcePath);
  if (!Array.isArray(source?.accounts) || source.accounts.length === 0) {
    throw new Error('Source must contain a non-empty accounts array.');
  }
  const now = new Date().toISOString();
  const accounts = source.accounts.map((item, index) => {
    const accountId = item?.workspaces?.[item.currentWorkspaceIndex]?.id || item?.accountId;
    for (const value of [accountId, item?.accessToken, item?.refreshToken]) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Source account #${index} requires an account ID, access token and refresh token.`);
      }
    }
    const account = createImportedAccount({
      label: item.accountLabel,
      source: 'codex-multi-auth-import',
      auth: {
        auth_mode: 'chatgpt',
        OPENAI_API_KEY: null,
        email: item.email ?? null,
        tokens: {
          account_id: accountId,
          access_token: item.accessToken,
          refresh_token: item.refreshToken,
          id_token: item.idToken || ''
        }
      }
    });
    return {
      ...account,
      expiresAt: dateFromMilliseconds(item.expiresAt) || account.expiresAt,
      createdAt: dateFromMilliseconds(item.addedAt) || now,
      updatedAt: now,
      lastUsed: dateFromMilliseconds(item.lastUsed),
      cooldownUntil: dateFromMilliseconds(item.coolingDownUntil),
      enabled: item.enabled !== false
    };
  });
  if (claudePath) {
    const credentials = await readJsonFile(claudePath);
    const oauth = credentials?.claudeAiOauth;
    if (typeof oauth?.accessToken !== 'string' || !oauth.accessToken.trim() ||
        typeof oauth.refreshToken !== 'string' || !oauth.refreshToken.trim() ||
        !dateFromMilliseconds(oauth.expiresAt) || !Array.isArray(oauth.scopes)) {
      throw new Error('Claude credentials require claudeAiOauth accessToken, refreshToken, expiresAt and scopes.');
    }
    accounts.push({
      provider: 'claude',
      id: 'claude-local',
      label: 'Claude',
      email: null,
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: dateFromMilliseconds(oauth.expiresAt),
      enabled: true,
      createdAt: now,
      updatedAt: now,
      source: 'claude-credentials-import',
      auth: { claudeAiOauth: oauth }
    });
  }
  const storage = await loadAccountStorage(storagePath);
  const wasEmpty = storage.accounts.length === 0;
  const importedIndexes = accounts.map((account) => {
    const index = storage.accounts.findIndex(existing => existing.id === account.id && existing.provider === account.provider);
    if (index < 0) {
      storage.accounts.push(account);
      return storage.accounts.length - 1;
    }
    const existing = storage.accounts[index];
    storage.accounts[index] = {
      ...existing,
      ...account,
      label: existing.label,
      enabled: existing.enabled,
      createdAt: existing.createdAt || account.createdAt,
      lastSuccessAt: existing.lastSuccessAt,
      lastErrorAt: existing.lastErrorAt,
      lastErrorCode: existing.lastErrorCode
    };
    return index;
  });
  if (wasEmpty) {
    storage.activeIndex = importedIndexes[source.activeIndex] ?? 0;
    storage.pinnedAccountIndex = storage.activeIndex;
  }
  await saveAccountStorage(storage, storagePath);
  return accounts.length;
}

function dateFromMilliseconds(value) {
  if (value === undefined || value === null || value === 0) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) {
    throw new Error('Source timestamps must be milliseconds since the Unix epoch.');
  }
  return new Date(value).toISOString();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const sourcePath = process.argv[2] || path.join(os.homedir(), '.codex', 'multi-auth', 'openai-codex-accounts.json');
  try {
    const claudePath = process.argv[3] || path.join(os.homedir(), '.claude', '.credentials.json');
    const count = await importCodexAccounts(sourcePath, getAccountStoragePath(), claudePath);
    console.log(`Imported ${count} accounts into ${getAccountStoragePath()}`);
  } catch (error) {
    // JSON parser errors can contain credential fragments.
    console.error(error instanceof SyntaxError || error.message.startsWith('Failed to read account storage')
      ? 'Unable to read account JSON. Check the destination and source files.'
      : error.message);
    process.exitCode = 1;
  }
}
