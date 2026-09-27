import path from 'node:path';

import { ensureCodexHome, writeJsonFile } from '../accounts/storage.js';

export async function syncAccountToCodexHome({ codexHomePath, account }) {
  if ((account?.provider ?? 'codex') !== 'codex') {
    throw new Error('Only Codex accounts can be synchronized to CODEX_HOME.');
  }
  if (!account?.auth || typeof account.auth !== 'object') {
    throw new Error(`Account "${account?.id || 'unknown'}" does not contain Codex auth payload.`);
  }

  await ensureCodexHome(codexHomePath);
  const authPath = path.join(codexHomePath, 'auth.json');
  await writeJsonFile(authPath, account.auth);
  return authPath;
}
