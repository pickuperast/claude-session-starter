import path from 'node:path';

import {
  ensureCodexHome,
  getAccountStoragePath,
  getCodexHomePath,
  loadAccountStorage,
  normalizeAccount,
  saveAccountStorage
} from './storage.js';
import { createImportedAccount, loadCurrentCodexAuth } from '../codex/login-import.js';
import { selectAccountsForRun } from '../codex/select-account.js';
import { syncAccountToCodexHome } from '../codex/sync-active-account.js';

export class AccountManager {
  constructor(options = {}) {
    this.storagePath = getAccountStoragePath(options.storagePath);
    this.codexHomePath = getCodexHomePath(options.codexHomePath);
  }

  async loadStorage() {
    return loadAccountStorage(this.storagePath);
  }

  async saveStorage(storage) {
    return saveAccountStorage(storage, this.storagePath);
  }

  async importFromCodexHome({ label, source = 'codex-login-import' } = {}) {
    await ensureCodexHome(this.codexHomePath);

    const auth = await loadCurrentCodexAuth(this.codexHomePath);
    const importedAccount = createImportedAccount({ auth, label, source });

    let storage = await this.loadStorage();
    const matchIndex = findMatchingAccountIndex(storage.accounts, importedAccount);
    const now = new Date().toISOString();

    if (matchIndex >= 0) {
      const existingAccount = normalizeAccount(storage.accounts[matchIndex]);
      const updatedAccount = {
        ...existingAccount,
        ...importedAccount,
        label: label || existingAccount.label || importedAccount.label,
        createdAt: existingAccount.createdAt || now,
        updatedAt: now,
        enabled: existingAccount.enabled,
        lastUsed: existingAccount.lastUsed,
        lastSuccessAt: existingAccount.lastSuccessAt,
        lastErrorAt: existingAccount.lastErrorAt,
        lastErrorCode: existingAccount.lastErrorCode,
        cooldownUntil: existingAccount.cooldownUntil
      };

      storage.accounts[matchIndex] = updatedAccount;
      storage = repairIndexes(storage, matchIndex);
      const savedStorage = await this.saveStorage(storage);

      return {
        index: matchIndex,
        account: savedStorage.accounts[matchIndex],
        storage: savedStorage
      };
    }

    const newAccount = {
      ...importedAccount,
      createdAt: now,
      updatedAt: now
    };

    storage.accounts.push(newAccount);
    const index = storage.accounts.length - 1;
    storage = repairIndexes(storage, index);
    const savedStorage = await this.saveStorage(storage);

    return {
      index,
      account: savedStorage.accounts[index],
      storage: savedStorage
    };
  }

  async listAccounts() {
    const storage = await this.loadStorage();
    return storage.accounts.map((account, index) => ({
      index,
      isActive: index === storage.activeIndex,
      isPinned: index === storage.pinnedAccountIndex,
      ...account
    }));
  }

  async getStatus() {
    const storage = await this.loadStorage();
    return {
      storagePath: this.storagePath,
      codexHomePath: this.codexHomePath,
      authPath: path.join(this.codexHomePath, 'auth.json'),
      storage
    };
  }

  async switchAccount(identifier) {
    const storage = await this.loadStorage();
    const index = resolveAccountIndex(storage.accounts, identifier);

    if (index < 0) {
      throw new Error(`Account "${identifier}" not found.`);
    }

    storage.activeIndex = index;
    const savedStorage = await this.saveStorage(storage);
    await syncAccountToCodexHome({
      codexHomePath: this.codexHomePath,
      account: savedStorage.accounts[index]
    });

    return {
      index,
      account: savedStorage.accounts[index],
      storage: savedStorage
    };
  }

  async selectRunnableAccounts(selection = process.env.CODEX_ACCOUNT_SELECTION || 'all') {
    const storage = await this.loadStorage();
    return {
      storage,
      accounts: selectAccountsForRun(storage, selection)
    };
  }

  async syncAccountToCodexHome(account) {
    await syncAccountToCodexHome({
      codexHomePath: this.codexHomePath,
      account
    });
  }

  async markAccountResult(accountId, result) {
    const storage = await this.loadStorage();
    const index = storage.accounts.findIndex((account) => account.id === accountId);

    if (index < 0) {
      throw new Error(`Account "${accountId}" not found in storage.`);
    }

    const now = new Date().toISOString();
    const account = normalizeAccount(storage.accounts[index]);

    storage.accounts[index] = {
      ...account,
      lastUsed: now,
      lastSuccessAt: result.success ? now : account.lastSuccessAt,
      lastErrorAt: result.success ? account.lastErrorAt : now,
      lastErrorCode: result.success ? null : result.errorCode || 'unknown_error',
      cooldownUntil: result.cooldownUntil === undefined ? account.cooldownUntil : result.cooldownUntil,
      updatedAt: now
    };

    return this.saveStorage(storage);
  }

  async setAccountEnabled(identifier, enabled) {
    const storage = await this.loadStorage();
    const index = resolveAccountIndex(storage.accounts, identifier);

    if (index < 0) {
      throw new Error(`Account "${identifier}" not found.`);
    }

    storage.accounts[index] = {
      ...normalizeAccount(storage.accounts[index]),
      enabled: Boolean(enabled),
      updatedAt: new Date().toISOString()
    };

    const savedStorage = await this.saveStorage(storage);
    return {
      index,
      account: savedStorage.accounts[index]
    };
  }

  async pinAccount(identifier) {
    const storage = await this.loadStorage();
    const index = resolveAccountIndex(storage.accounts, identifier);

    if (index < 0) {
      throw new Error(`Account "${identifier}" not found.`);
    }

    storage.pinnedAccountIndex = index;
    const savedStorage = await this.saveStorage(storage);
    return {
      index,
      account: savedStorage.accounts[index]
    };
  }

  async clearAccountCooldown(identifier) {
    const storage = await this.loadStorage();
    const index = resolveAccountIndex(storage.accounts, identifier);

    if (index < 0) {
      throw new Error(`Account "${identifier}" not found.`);
    }

    storage.accounts[index] = {
      ...normalizeAccount(storage.accounts[index]),
      cooldownUntil: null,
      lastErrorCode: null,
      updatedAt: new Date().toISOString()
    };

    const savedStorage = await this.saveStorage(storage);
    return {
      index,
      account: savedStorage.accounts[index]
    };
  }
}

function findMatchingAccountIndex(accounts, importedAccount) {
  return accounts.findIndex((account) =>
    matchesById(account, importedAccount) ||
    matchesByEmail(account, importedAccount) ||
    matchesByRefreshToken(account, importedAccount)
  );
}

function matchesById(existingAccount, importedAccount) {
  return Boolean(existingAccount?.id && importedAccount?.id && existingAccount.id === importedAccount.id);
}

function matchesByEmail(existingAccount, importedAccount) {
  return Boolean(existingAccount?.email && importedAccount?.email && existingAccount.email === importedAccount.email);
}

function matchesByRefreshToken(existingAccount, importedAccount) {
  return Boolean(
    existingAccount?.refreshToken &&
    importedAccount?.refreshToken &&
    existingAccount.refreshToken === importedAccount.refreshToken
  );
}

function repairIndexes(storage, fallbackIndex) {
  const accountCount = storage.accounts.length;
  const safeFallbackIndex = accountCount > 0 ? fallbackIndex : 0;

  return {
    ...storage,
    activeIndex:
      Number.isInteger(storage.activeIndex) && storage.activeIndex >= 0 && storage.activeIndex < accountCount
        ? storage.activeIndex
        : safeFallbackIndex,
    pinnedAccountIndex:
      Number.isInteger(storage.pinnedAccountIndex) &&
      storage.pinnedAccountIndex >= 0 &&
      storage.pinnedAccountIndex < accountCount
        ? storage.pinnedAccountIndex
        : safeFallbackIndex
  };
}

function resolveAccountIndex(accounts, identifier) {
  if (identifier === undefined || identifier === null || identifier === '') {
    return -1;
  }

  const numericIndex = Number(identifier);
  if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < accounts.length) {
    return numericIndex;
  }

  return accounts.findIndex((account) => {
    return account.id === identifier || account.label === identifier || account.email === identifier;
  });
}
