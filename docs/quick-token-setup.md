# Importing account credentials

Run `npm run codex:import` from the repository root. It reads `~/.codex/multi-auth/openai-codex-accounts.json` and `~/.claude/.credentials.json`, then merges both providers into `state/accounts/codex-accounts.json` (or `ACCOUNT_STORAGE_PATH`). It does not change the source files.

Set `PING_PROVIDER_CLAUDE=true` in `.env` to run Claude accounts. The scheduler reads Claude tokens from account storage. No OAuth token is needed in `.env` or GitHub secrets.

The Claude source must contain `claudeAiOauth.accessToken`, `refreshToken`, `expiresAt` and `scopes`. MCP credentials are excluded. Repeated imports update the `claude-local` entry, preserving its enabled flag and label.

Renew Codex logins every 10 days and the Claude login every 30 days, then rerun the import. These are the deployment's maintenance intervals; actual expiry and revocation may require earlier renewal. Claude access tokens are short-lived, so the SDK receives the full OAuth credentials and can use `refreshToken`. Refreshed credentials are saved back to account storage after each request. Keep `state/` out of Git.
