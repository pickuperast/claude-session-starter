# Multi-Account Codex and Claude Scheduler

This service sends a scheduled prompt through saved Codex and Claude accounts. It keeps the runtime auth state inside the repository under `./state`, while leaving `./state/**` untracked by Git. The runtime uses the local `@openai/codex-sdk` dependency, so the scheduler does not need a global Codex install after bootstrap. Claude accounts use the same account storage and run through the Claude Agent SDK.

## What changed

- `codex` is now the primary provider.
- Multiple Codex accounts are stored in `./state/accounts/codex-accounts.json`.
- The active Codex auth payload is synchronized into `./state/codex-home/auth.json` before each run.
- Scheduler jobs iterate through all enabled Codex accounts sequentially.
- A failure for one Codex account does not stop the rest of the batch.

## Requirements

- Node.js 20+
- `npm install` pulls in `@openai/codex-sdk` and the Codex CLI runtime locally
- Local Claude credentials in `~/.claude/.credentials.json` for the combined import
- The scheduled prompt lives in `./prompts/message-prompt.txt`

## Environment

Copy `.env.example` to `.env` and adjust values:

```bash
PING_PROVIDER_CODEX=true
PING_PROVIDER_CLAUDE=true
CODEX_HOME=./state/codex-home
ACCOUNT_STORAGE_PATH=./state/accounts/codex-accounts.json
CODEX_MODEL=gpt-6-luna
CODEX_ACCOUNT_SELECTION=all
CODEX_ENABLE_AUTO_FALLBACK=true
CODEX_FAILURE_COOLDOWN_MINUTES=60
SCHEDULER_LOG_PATH=./state/logs/scheduler.log
MESSAGE_PROMPT_FILE=./prompts/message-prompt.txt
SCHEDULE_TIMES=07:00,12:05,17:10
TIMEZONE=Asia/Almaty
```

Claude accounts are enabled with:

```bash
PING_PROVIDER_CLAUDE=true
MODEL=claude-haiku-4-5-20251001
```

## Sign in before migrating accounts

Complete these steps on the machine holding your local logins, before starting the scheduler or Docker.

1. Install the official Codex CLI and [codex-multi-auth](https://github.com/ndycode/codex-multi-auth/blob/main/docs/getting-started.md): `npm install -g @openai/codex codex-multi-auth`.
2. Run `codex-multi-auth login` and finish the browser login. Repeat this command for every Codex account you want to import. Run `codex-multi-auth list` to check that all accounts are saved.
3. Install [Claude Code](https://code.claude.com/docs/en/setup) if needed, then run `claude auth login` and complete the Claude account login. Do this before running the migration.
4. Check that both source files exist: `~/.codex/multi-auth/openai-codex-accounts.json` and `~/.claude/.credentials.json`. On Windows, `~` is your user directory, such as `C:\Users\YourName`. This importer requires the credentials JSON file; an OS keychain alone is not a supported input.
5. In this repository, run `npm install`, copy `.env.example` to `.env` if it does not exist, and set `PING_PROVIDER_CODEX=true` and `PING_PROVIDER_CLAUDE=true`.
6. Only after both login steps, run `npm run codex:import`. This migrates the Codex accounts and the Claude login together.
7. Verify the result with `npm run codex:accounts -- list`. Check the `provider` values and confirm `git status` does not show `state/`.
8. Start the scheduler with `npm start` or `docker compose up -d --build`.

Claude login commands are documented in the [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference). If the scheduler runs on another machine, securely transfer the resulting `state/accounts/codex-accounts.json` there before starting it.

Run `npm run codex:import` to import Codex accounts from `~/.codex/multi-auth/openai-codex-accounts.json` and the Claude login from `~/.claude/.credentials.json` into `ACCOUNT_STORAGE_PATH` (default `./state/accounts/codex-accounts.json`). To use other sources, run `npm run codex:import -- "C:/path/openai-codex-accounts.json" "C:/path/.credentials.json"`. Both source files must be valid; validation failures leave the destination unchanged. The importer maps tokens and the selected workspace ID into `auth.tokens`, converts timestamps to ISO dates, and preserves other stored accounts. Matching provider and account IDs are updated while keeping their existing labels and enabled flags. An empty destination inherits the source active account. The source files are unchanged. Missing ID tokens remain empty; the importer does not sign in or refresh tokens.

To import a single login from `CODEX_HOME/auth.json`, use `npm run codex:accounts -- login --import-only --label main`.

Each account has `provider: "codex"` or `provider: "claude"`; older entries without it are treated as Codex. The top-level provider is `mixed` when both are stored. Claude imports only `claudeAiOauth`, excluding MCP credentials, and updates the single `claude-local` entry on subsequent imports. Existing installations with `PING_PROVIDER_CLAUDE=false` must change it to `true` to run Claude accounts.

Claude requests load both `accessToken` and `refreshToken` from account storage into an isolated runtime credentials file. The bundled Claude CLI uses the refresh token when the access token expires. After the request, the scheduler saves the updated access token, refresh token and expiry back into account storage, including when the request fails after refreshing. It then removes the runtime copy. If saving fails, the runtime copy is kept for recovery and its path is reported. The scheduler does not use an OAuth token from `.env` or GitHub secrets.

## Credential renewal schedule

Use this maintenance schedule for this deployment:

| Provider | Renew the local login and reimport |
| --- | --- |
| Codex | Every 10 days, for every account in `codex-multi-auth` |
| Claude | Every 30 days, through `claude auth login` |

After renewing the local logins, run `npm run codex:import` again. Plan for Claude access tokens lasting about one day; automatic refresh uses `refreshToken` between manual renewals. These intervals are the deployment's maintenance policy, not guaranteed token lifetimes. The stored `expiresAt` controls automatic refresh, and revoked or expired refresh credentials require an earlier login and import.

Useful account commands:

```bash
npm run codex:accounts -- list
npm run codex:accounts -- switch 0
npm run codex:accounts -- switch main
npm run codex:accounts -- pin main
npm run codex:accounts -- disable main
npm run codex:accounts -- enable main
npm run codex:accounts -- cooldown-clear main
npm run codex:accounts -- status
```

## Running locally

Start the scheduler:

```bash
npm start
```

The local process also starts an HTTP control server by default on `127.0.0.1:3000`.

Check that the scheduler process is alive:

```bash
curl http://127.0.0.1:3000/health
```

Trigger one manual run without waiting for cron:

```bash
curl -X POST http://127.0.0.1:3000/trigger
```

Disable the HTTP server if needed:

```bash
ENABLE_HTTP_SERVER=false npm start
```

Run one smoke execution immediately:

```bash
npm run smoke
```

Run unit tests:

```bash
npm test
```

## Docker

The container mounts the local runtime state:

- `./state/accounts`
- `./state/codex-home`
- `./state/logs`

Start Docker only after the manual bootstrap has created and populated `./state/**`.

```bash
docker compose up -d --build
docker compose logs -f scheduler
```

## Storage layout

Runtime files are local only:

- `./state/accounts/codex-accounts.json`
- `./state/codex-home/auth.json`
- `./state/logs/scheduler.log`
- `./prompts/message-prompt.txt`

The scheduler reads `codex-accounts.json` as the canonical account list. Before each `codex exec`, it writes the selected account auth payload into `./state/codex-home/auth.json`, runs the command, then re-imports the updated auth payload back into storage.
The scheduled message prompt now comes from `./prompts/message-prompt.txt` on every run. Edit that file directly if you want to change the task.

## Scheduler behavior

- Provider selection is controlled through `.env`
- The message prompt is loaded from `./prompts/message-prompt.txt` each run
- Every prompt, response, result, and scheduler event is logged to container stdout and `./state/logs/scheduler.log`
- Codex accounts are processed sequentially
- Disabled accounts are skipped
- Accounts in cooldown are skipped until `cooldownUntil`
- Errors are recorded per account in storage
- When auto fallback is enabled, transient failures set a cooldown instead of stopping the batch
- Default timestamps are recorded in Almaty time (`GMT+5`), using `TIMEZONE=Asia/Almaty`

## Deployment notes

The GitHub Actions deploy workflow preserves `./state/**`. On a fresh server, import or securely transfer the account storage into the checked-out repository before starting the containerized scheduler.
