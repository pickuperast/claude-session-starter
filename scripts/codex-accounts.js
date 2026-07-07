#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

import { AccountManager } from '../lib/accounts/account-manager.js';
import { ensureCodexHome, getAccountStoragePath, getCodexHomePath } from '../lib/accounts/storage.js';

const accountManager = new AccountManager();
const require = createRequire(import.meta.url);
const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case 'login':
      await handleLogin(args);
      break;
    case 'list':
      await handleList();
      break;
    case 'switch':
      await handleSwitch(args[0]);
      break;
    case 'status':
      await handleStatus();
      break;
    case 'pin':
      await handlePin(args[0]);
      break;
    case 'enable':
      await handleEnabled(args[0], true);
      break;
    case 'disable':
      await handleEnabled(args[0], false);
      break;
    case 'cooldown-clear':
      await handleCooldownClear(args[0]);
      break;
    default:
      printUsage();
      process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function handleLogin(argumentsList) {
  const label = readFlag(argumentsList, '--label');
  const codexHomePath = getCodexHomePath();

  await ensureCodexHome(codexHomePath);

  console.log(`Using CODEX_HOME=${codexHomePath}`);
  console.log(`Current shell export: ${formatCodexHomeExport(codexHomePath)}`);

  if (!argumentsList.includes('--import-only')) {
    await runCodexLogin(codexHomePath);
  }

  const { account, index } = await accountManager.importFromCodexHome({ label });
  console.log(`Imported account #${index}: ${account.label} (${account.email || account.id})`);
}

async function handleList() {
  const accounts = await accountManager.listAccounts();

  if (accounts.length === 0) {
    console.log('No accounts stored.');
    return;
  }

  for (const account of accounts) {
    const flags = [
      account.isActive ? 'active' : null,
      account.isPinned ? 'pinned' : null,
      account.enabled ? 'enabled' : 'disabled',
      account.cooldownUntil ? `cooldown-until=${account.cooldownUntil}` : null
    ]
      .filter(Boolean)
      .join(', ');

    console.log(
      `#${account.index} ${account.label} email=${account.email || '-'} id=${account.id} lastUsed=${account.lastUsed || '-'} [${flags}]`
    );
  }
}

async function handleSwitch(identifier) {
  if (!identifier) {
    throw new Error('Usage: node scripts/codex-accounts.js switch <index|label|email|id>');
  }

  const { account, index } = await accountManager.switchAccount(identifier);
  console.log(`Switched active account to #${index}: ${account.label} (${account.email || account.id})`);
}

async function handleStatus() {
  const status = await accountManager.getStatus();
  const activeAccount = status.storage.accounts[status.storage.activeIndex] || null;
  const pinnedAccount = status.storage.accounts[status.storage.pinnedAccountIndex] || null;
  console.log(`Storage: ${getAccountStoragePath()}`);
  console.log(`CODEX_HOME: ${status.codexHomePath}`);
  console.log(`Auth file: ${status.authPath}`);
  console.log(`Accounts stored: ${status.storage.accounts.length}`);
  console.log(`Active index: ${status.storage.activeIndex}`);
  console.log(`Pinned index: ${status.storage.pinnedAccountIndex}`);
  console.log(`Active account: ${activeAccount ? `${activeAccount.label} (${activeAccount.email || activeAccount.id})` : '-'}`);
  console.log(`Pinned account: ${pinnedAccount ? `${pinnedAccount.label} (${pinnedAccount.email || pinnedAccount.id})` : '-'}`);
}

async function handlePin(identifier) {
  if (!identifier) {
    throw new Error('Usage: node scripts/codex-accounts.js pin <index|label|email|id>');
  }

  const { account, index } = await accountManager.pinAccount(identifier);
  console.log(`Pinned account #${index}: ${account.label} (${account.email || account.id})`);
}

async function handleEnabled(identifier, enabled) {
  if (!identifier) {
    throw new Error(`Usage: node scripts/codex-accounts.js ${enabled ? 'enable' : 'disable'} <index|label|email|id>`);
  }

  const { account, index } = await accountManager.setAccountEnabled(identifier, enabled);
  console.log(`${enabled ? 'Enabled' : 'Disabled'} account #${index}: ${account.label} (${account.email || account.id})`);
}

async function handleCooldownClear(identifier) {
  if (!identifier) {
    throw new Error('Usage: node scripts/codex-accounts.js cooldown-clear <index|label|email|id>');
  }

  const { account, index } = await accountManager.clearAccountCooldown(identifier);
  console.log(`Cleared cooldown for account #${index}: ${account.label} (${account.email || account.id})`);
}

function readFlag(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  if (index < 0) {
    return null;
  }

  return argumentsList[index + 1] || null;
}

function formatCodexHomeExport(codexHomePath) {
  if (process.platform === 'win32') {
    return `$env:CODEX_HOME='${codexHomePath}'`;
  }

  return `export CODEX_HOME='${codexHomePath}'`;
}

function printUsage() {
  console.log('Usage: node scripts/codex-accounts.js <command>');
  console.log('');
  console.log('Commands:');
  console.log('  login [--label <name>] [--import-only]');
  console.log('  list');
  console.log('  switch <index|label|email|id>');
  console.log('  status');
  console.log('  pin <index|label|email|id>');
  console.log('  enable <index|label|email|id>');
  console.log('  disable <index|label|email|id>');
  console.log('  cooldown-clear <index|label|email|id>');
}

function runCodexLogin(codexHomePath) {
  return new Promise((resolve, reject) => {
    const codexCliPath = getCodexCliScriptPath();
    const child = spawn(process.execPath, [codexCliPath, 'login'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        CODEX_HOME: codexHomePath
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start "codex login": ${error.message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`"codex login" exited with code ${code}.`));
    });
  });
}

function getCodexCliScriptPath() {
  const packageJsonPath = require.resolve('@openai/codex/package.json');
  const packageRoot = path.dirname(packageJsonPath);
  return path.join(packageRoot, 'bin', 'codex.js');
}
