# Repository Guidelines

## Project Structure & Module Organization

This repository is a small Node.js scheduler for automated Claude Agent SDK messages.

- `scheduler.js` contains configuration, cron scheduling, message generation, and SDK calls.
- `test.js` is a smoke test that imports `scheduler.js` exports and sends one real Claude request.
- `docs/` contains setup and OAuth token notes.
- `.github/workflows/deploy.yml` defines deployment automation; `.github/CODEOWNERS` defines ownership.
- `Dockerfile` and `docker-compose.yml` support containerized operation.
- `.env.example` documents environment variables. Keep local secrets in `.env`.

## Build, Test, and Development Commands

- `npm install` installs dependencies from `package-lock.json`.
- `npm start` runs `node scheduler.js` and starts cron jobs from `.env`.
- `npm test` runs `node test.js`; it validates `CLAUDE_CODE_OAUTH_TOKEN` and sends a live prompt.
- `docker-compose up -d` builds and starts the scheduler container.
- `docker-compose logs -f scheduler` tails container logs.

Before running tests or the scheduler, copy `.env.example` to `.env` and set `CLAUDE_CODE_OAUTH_TOKEN`.

## Coding Style & Naming Conventions

Use JavaScript ES modules (`import`/`export`) because `package.json` sets `"type": "module"`. Match the existing style: two-space indentation, semicolons, `const` by default, `let` only for reassignment, and camelCase function names such as `generateMessage` and `sendMessage`.

Environment variables are uppercase with underscores, for example `SCHEDULE_TIMES`, `TIMEZONE`, and `MESSAGE_PROMPT`. Keep configuration parsing near the top of `scheduler.js`.

## Testing Guidelines

There is no unit test framework yet. `npm test` is an integration smoke test and requires a valid Claude OAuth token, so do not assume it is offline. When changing scheduling, authentication, or SDK behavior, run `npm test` with a safe `MESSAGE_PROMPT`.

If adding unit tests later, keep pure helpers exported from `scheduler.js` or move them into focused modules. Use a `*.test.js` naming pattern.

## Commit & Pull Request Guidelines

The current history uses short, imperative subjects with optional prefixes, such as `security: tighten deploy/auth config and docs (#1)`. Prefer that style, for example `docs: update token setup steps`.

Pull requests should describe the change, list verification commands, and call out configuration or deployment impact. Link related issues when available. For changes affecting logs, scheduling, Docker, or GitHub Actions, include relevant output or screenshots.

## Security & Configuration Tips

Never commit `.env`, OAuth tokens, private keys, server IPs, or deployment credentials. Update `.env.example` and README documentation when adding configuration. Treat `CLAUDE_CODE_OAUTH_TOKEN` as a secret in local shells, Docker Compose, and GitHub Actions.
