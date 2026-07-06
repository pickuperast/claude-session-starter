import fs from 'node:fs/promises';

import { ensureParentDirectory, resolveRuntimePath } from './accounts/storage.js';

const DEFAULT_LOG_PATH = './state/logs/scheduler.log';

export function getSchedulerLogPath(customPath = process.env.SCHEDULER_LOG_PATH) {
  return resolveRuntimePath(customPath, DEFAULT_LOG_PATH);
}

export function createLogger({ timezone, filePath = getSchedulerLogPath() }) {
  return new SchedulerLogger({ timezone, filePath });
}

class SchedulerLogger {
  constructor({ timezone, filePath }) {
    this.timezone = timezone;
    this.filePath = filePath;
    this.pendingWrite = Promise.resolve();
  }

  async info(message, details) {
    return this.write('INFO', message, details);
  }

  async error(message, details) {
    return this.write('ERROR', message, details);
  }

  async write(level, message, details) {
    const line = this.formatLine(level, message, details);
    if (level === 'ERROR') {
      console.error(line);
    } else {
      console.log(line);
    }

    this.pendingWrite = this.pendingWrite.then(async () => {
      await ensureParentDirectory(this.filePath);
      await fs.appendFile(this.filePath, `${line}\n`, 'utf8');
    });

    return this.pendingWrite;
  }

  formatLine(level, message, details) {
    const timestamp = new Intl.DateTimeFormat('sv-SE', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).format(new Date());
    const suffix = details ? ` ${JSON.stringify(details)}` : '';
    return `[${timestamp} ${this.timezone}] ${level} ${message}${suffix}`;
  }
}
