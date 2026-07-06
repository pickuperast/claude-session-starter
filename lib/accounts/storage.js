import fs from 'node:fs/promises';
import path from 'node:path';

import { createEmptyStorage, STORAGE_PROVIDER, STORAGE_VERSION } from './types.js';

export const DEFAULT_CODEX_HOME = './state/codex-home';
export const DEFAULT_ACCOUNT_STORAGE_PATH = './state/accounts/codex-accounts.json';

export function resolveRuntimePath(targetPath, fallbackPath) {
  const value = targetPath || fallbackPath;
  return path.resolve(process.cwd(), value);
}

export function getCodexHomePath(customPath = process.env.CODEX_HOME) {
  return resolveRuntimePath(customPath, DEFAULT_CODEX_HOME);
}

export function getAccountStoragePath(customPath = process.env.ACCOUNT_STORAGE_PATH) {
  return resolveRuntimePath(customPath, DEFAULT_ACCOUNT_STORAGE_PATH);
}

export async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function ensureCodexHome(codexHomePath = getCodexHomePath()) {
  await fs.mkdir(codexHomePath, { recursive: true });
  return codexHomePath;
}

export function normalizeStorage(rawValue) {
  const defaults = createEmptyStorage();
  const accounts = Array.isArray(rawValue?.accounts) ? rawValue.accounts : [];

  return {
    version: typeof rawValue?.version === 'number' ? rawValue.version : STORAGE_VERSION,
    provider: rawValue?.provider || STORAGE_PROVIDER,
    activeIndex: clampIndex(rawValue?.activeIndex, accounts.length),
    pinnedAccountIndex: clampIndex(rawValue?.pinnedAccountIndex, accounts.length),
    accounts: accounts.map((account) => normalizeAccount(account))
  };
}

export function normalizeAccount(account) {
  return {
    id: account?.id || '',
    email: account?.email ?? null,
    label: account?.label || 'account',
    accessToken: account?.accessToken ?? null,
    refreshToken: account?.refreshToken ?? null,
    expiresAt: account?.expiresAt ?? null,
    enabled: account?.enabled !== false,
    lastUsed: account?.lastUsed ?? null,
    lastSuccessAt: account?.lastSuccessAt ?? null,
    lastErrorAt: account?.lastErrorAt ?? null,
    lastErrorCode: account?.lastErrorCode ?? null,
    cooldownUntil: account?.cooldownUntil ?? null,
    source: account?.source ?? null,
    createdAt: account?.createdAt ?? null,
    updatedAt: account?.updatedAt ?? null,
    auth: isPlainObject(account?.auth) ? account.auth : {}
  };
}

function clampIndex(value, accountCount) {
  if (accountCount <= 0) {
    return 0;
  }

  if (Number.isInteger(value) && value >= 0 && value < accountCount) {
    return value;
  }

  return 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function loadAccountStorage(storagePath = getAccountStoragePath()) {
  try {
    const raw = await fs.readFile(storagePath, 'utf8');
    return normalizeStorage(JSON.parse(stripBom(raw)));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createEmptyStorage();
    }

    throw new Error(`Failed to read account storage "${storagePath}": ${error.message}`);
  }
}

export async function saveAccountStorage(storage, storagePath = getAccountStoragePath()) {
  const normalized = normalizeStorage(storage);
  await ensureParentDirectory(storagePath);
  await fs.writeFile(storagePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(stripBom(raw));
}

export async function writeJsonFile(filePath, value) {
  await ensureParentDirectory(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
