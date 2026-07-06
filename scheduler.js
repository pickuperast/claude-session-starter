import 'dotenv/config';
import cron from 'node-cron';

import { getRuntimeConfig } from './lib/config.js';
import { createLogger } from './lib/logger.js';
import { sendClaudeMessage } from './lib/providers/claude.js';
import { sendCodexMessage } from './lib/providers/codex.js';

function generateMessage(promptFromEnv = getRuntimeConfig().messagePrompt) {
  if (promptFromEnv) {
    return promptFromEnv;
  }

  const first = Math.floor(Math.random() * 101);
  const second = Math.floor(Math.random() * 101);
  return `${first}+${second}`;
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
  const prompt = generateMessage(config.messagePrompt);

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
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1])) {
  try {
    setupScheduledJobs();
  } catch (error) {
    console.error(`Failed to initialize scheduler: ${error.message}`);
    process.exit(1);
  }

  process.on('SIGINT', () => {
    console.log('\nScheduler stopped');
    process.exit(0);
  });
}

export { generateMessage, sendMessage };
