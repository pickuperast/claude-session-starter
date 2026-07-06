import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadCurrentCodexAuth(codexHomePath) {
  const authPath = path.join(codexHomePath, 'auth.json');

  try {
    const raw = await fs.readFile(authPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Codex auth state not found at "${authPath}". Run "codex login" with CODEX_HOME="${codexHomePath}" first.`
      );
    }

    throw new Error(`Failed to read Codex auth state "${authPath}": ${error.message}`);
  }
}

export function createImportedAccount({ auth, label, source = 'codex-login-import' }) {
  const accountId = auth?.tokens?.account_id || auth?.email || label;
  const email = auth?.email ?? null;
  const accessToken = auth?.tokens?.access_token ?? null;
  const refreshToken = auth?.tokens?.refresh_token ?? null;
  const expiresAt = getTokenExpiryIso(auth?.tokens?.id_token) || getTokenExpiryIso(accessToken);

  if (!accountId) {
    throw new Error('Unable to determine account identity from Codex auth state.');
  }

  return {
    id: accountId,
    email,
    label: label || email || accountId,
    accessToken,
    refreshToken,
    expiresAt,
    enabled: true,
    lastUsed: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
    cooldownUntil: null,
    source,
    auth
  };
}

function getTokenExpiryIso(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (typeof payload.exp !== 'number') {
      return null;
    }

    return new Date(payload.exp * 1000).toISOString();
  } catch {
    return null;
  }
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}
