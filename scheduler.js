import 'dotenv/config';
import fs from 'node:fs/promises';
import cron from 'node-cron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRuntimeConfig } from './lib/config.js';
import { createLogger } from './lib/logger.js';
import { createSchedulerHttpServer } from './lib/http-server.js';
import { sendClaudeMessage } from './lib/providers/claude.js';
import { sendCodexMessage } from './lib/providers/codex.js';

export async function generateMessage(config = getRuntimeConfig(), cwd = process.cwd()) {
  const promptFile = config.messagePromptFile ? path.resolve(cwd, config.messagePromptFile) : null;

  if (promptFile) {
    return readPromptFile(promptFile);
  }

  throw new Error('Prompt file must be configured.');
}

async function sendMessage({ provider, prompt, config = getRuntimeConfig(), logger }) {
  if (provider === 'claude') {
    return sendClaudeMessage({
      prompt,
      model: config.claudeModel,
      logger
    });
  }

  if (provider === 'codex') {
    return sendCodexMessage({
      prompt,
      model: config.codexModel,
      logger
    });
  }

  throw new Error(`Unsupported provider "${provider}".`);
}

export async function runOnce(config = getRuntimeConfig()) {
  validateConfig(config);
  const logger = createLogger({ timezone: config.timezone });
  const prompt = await generateMessage(config);

  await logger.info('Dispatch prompt', {
    prompt,
    providers: config.enabledProviders
  });

  const results = [];
  for (const provider of config.enabledProviders) {
    await logger.info('Starting provider', { provider });
    let providerResults;

    try {
      providerResults = await sendMessage({ provider, prompt, config, logger });
    } catch (error) {
      providerResults = [
        {
          provider,
          accountId: provider === 'claude' ? 'claude-legacy' : 'codex-provider',
          accountEmail: null,
          model: provider === 'claude' ? config.claudeModel : config.codexModel,
          durationMs: 0,
          success: false,
          errorCode: 'provider_error',
          response: error.message
        }
      ];
    }

    for (const result of providerResults) {
      await logStructuredResult(result, logger);
    }

    results.push(...providerResults);
  }

  return {
    prompt,
    results
  };
}

async function logStructuredResult(result, logger) {
  const payload = {
    provider: result.provider,
    accountId: result.accountId,
    accountEmail: result.accountEmail,
    model: result.model,
    durationMs: result.durationMs,
    success: result.success,
    errorCode: result.errorCode
  };

  await logger.info('Provider result', payload);
  await logger.info('Provider response', {
    provider: result.provider,
    accountId: result.accountId,
    response: result.response || null
  });
}

function validateConfig(config) {
  if (!config.enabledProviders.length) {
    throw new Error('No providers enabled. Set PING_PROVIDER_CODEX=true and/or PING_PROVIDER_CLAUDE=true.');
  }
}

export function setupScheduledJobs(config = getRuntimeConfig()) {
  validateConfig(config);
  const logger = createLogger({ timezone: config.timezone });

  const times = config.scheduleTimes
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (times.length === 0) {
    throw new Error('No schedule times configured. Set SCHEDULE_TIMES in .env.');
  }

  logger.info('Scheduler started', {
    timezone: config.timezone,
    providers: config.enabledProviders,
    claudeModel: config.claudeModel,
    codexModel: config.codexModel
  });

  for (const [index, time] of times.entries()) {
    const [hour, minute] = time.split(':').map((value) => Number.parseInt(value, 10));
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error(`Invalid schedule time "${time}". Expected HH:MM.`);
    }

    const cronExpression = `${minute} ${hour} * * *`;
    cron.schedule(
      cronExpression,
      () => {
        logger.info('Scheduled run triggered', {
          slot: index + 1,
          time,
          timezone: config.timezone
        });
        runOnce(config).catch((error) => {
          logger.error('Scheduled run failed', { error: error.message });
        });
      },
      {
        timezone: config.timezone
      }
    );

    logger.info('Scheduled slot registered', { slot: index + 1, time });
  }

  logger.info('All jobs scheduled');

  return {
    logger
  };
}

export async function startSchedulerRuntime(config = getRuntimeConfig()) {
  const { logger } = setupScheduledJobs(config);
  const enableHttpServer = readBoolean(process.env.ENABLE_HTTP_SERVER, true);

  if (!enableHttpServer) {
    return {
      logger,
      httpServer: null
    };
  }

  const httpServer = createSchedulerHttpServer({
    config,
    logger,
    triggerRun: () => runOnce(config)
  });

  await httpServer.listen();
  await logger.info('HTTP control server started', {
    host: httpServer.host,
    port: httpServer.port
  });

  return {
    logger,
    httpServer
  };
}

function readBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function isDirectExecution(moduleUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) {
    return false;
  }

  return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(argv1);
}

if (isDirectExecution()) {
  try {
    await startSchedulerRuntime();
  } catch (error) {
    console.error(`Failed to initialize scheduler: ${error.message}`);
    process.exit(1);
  }

  process.on('SIGINT', () => {
    console.log('\nScheduler stopped');
    process.exit(0);
  });
}

export { sendMessage };

async function readPromptFile(promptFile) {
  try {
    const raw = await fs.readFile(promptFile, 'utf8');
    const trimmed = raw.trim();

    if (!trimmed) {
      throw new Error(`Prompt file "${promptFile}" is empty.`);
    }

    return trimmed;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Prompt file not found: "${promptFile}".`);
    }

    throw new Error(`Failed to read prompt file "${promptFile}": ${error.message}`);
  }
}
