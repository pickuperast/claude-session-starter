# Multi-Account Codex Scheduler

This service sends a scheduled prompt through one or more saved `codex` accounts. It keeps the runtime auth state inside the repository under `./state`, while leaving `./state/**` untracked by Git. A single-account Claude flow remains available as an optional legacy provider.

## What changed

- `codex` is now the primary provider.
- Multiple Codex accounts are stored in `./state/accounts/codex-accounts.json`.
- The active Codex auth payload is synchronized into `./state/codex-home/auth.json` before each run.
- Scheduler jobs iterate through all enabled Codex accounts sequentially.
- A failure for one Codex account does not stop the rest of the batch.

## Requirements

- Node.js 20+
- Installed `codex` CLI available on `PATH`
- Optional: Claude Code token only if you enable the legacy Claude provider

## Environment

Copy `.env.example` to `.env` and adjust values:

```bash
PING_PROVIDER_CODEX=true
PING_PROVIDER_CLAUDE=false
CODEX_HOME=./state/codex-home
ACCOUNT_STORAGE_PATH=./state/accounts/codex-accounts.json
CODEX_MODEL=gpt-5.4-mini
CODEX_ACCOUNT_SELECTION=all
CODEX_ENABLE_AUTO_FALLBACK=true
CODEX_FAILURE_COOLDOWN_MINUTES=60
SCHEDULER_LOG_PATH=./state/logs/scheduler.log
MESSAGE_PROMPT=tell me a joke about programmers
SCHEDULE_TIMES=07:01
TIMEZONE=Etc/GMT-5
```

Legacy Claude mode can still be enabled with:

```bash
PING_PROVIDER_CLAUDE=true
CLAUDE_CODE_OAUTH_TOKEN=...
MODEL=claude-haiku-4-5-20251001
```

## Manual bootstrap for Codex accounts

This bootstrap must happen before Docker is started.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`
3. Add the first account: `npm run codex:accounts -- login --label main`
4. Repeat for every additional account: `npm run codex:accounts -- login --label work`
5. Verify storage: `npm run codex:accounts -- list`
6. Confirm `git status` does not show `state/`
7. Only then start the scheduler

`login` runs `codex login` against the local repository `CODEX_HOME`, then imports the resulting auth payload into `./state/accounts/codex-accounts.json`.

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

The scheduler reads `codex-accounts.json` as the canonical account list. Before each `codex exec`, it writes the selected account auth payload into `./state/codex-home/auth.json`, runs the command, then re-imports the updated auth payload back into storage.

## Scheduler behavior

- Provider selection is controlled through `.env`
- Every prompt, response, result, and scheduler event is logged to container stdout and `./state/logs/scheduler.log`
- Codex accounts are processed sequentially
- Disabled accounts are skipped
- Accounts in cooldown are skipped until `cooldownUntil`
- Errors are recorded per account in storage
- When auto fallback is enabled, transient failures set a cooldown instead of stopping the batch
- Default timestamps are recorded in `GMT+5`, using `TIMEZONE=Etc/GMT-5`

## Deployment notes

The GitHub Actions deploy workflow preserves `./state/**`. On a fresh server you still need to do the first manual Codex bootstrap inside the checked-out repository before starting the containerized scheduler.
