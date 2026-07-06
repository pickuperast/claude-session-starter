export const STORAGE_VERSION = 1;
export const STORAGE_PROVIDER = 'codex';

/**
 * @typedef {object} CodexAccountRecord
 * @property {string} id
 * @property {string | null} email
 * @property {string} label
 * @property {string | null} accessToken
 * @property {string | null} refreshToken
 * @property {string | null} expiresAt
 * @property {boolean} enabled
 * @property {string | null} lastUsed
 * @property {string | null} lastSuccessAt
 * @property {string | null} lastErrorAt
 * @property {string | null} lastErrorCode
 * @property {string | null} cooldownUntil
 * @property {string | null} source
 * @property {string | null} createdAt
 * @property {string | null} updatedAt
 * @property {Record<string, unknown>} auth
 */

export function createEmptyStorage() {
  return {
    version: STORAGE_VERSION,
    provider: STORAGE_PROVIDER,
    activeIndex: 0,
    pinnedAccountIndex: 0,
    accounts: []
  };
}
