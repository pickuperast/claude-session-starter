import test from 'node:test';
import assert from 'node:assert/strict';

import { createSchedulerHttpServer } from '../lib/http-server.js';

test('health endpoint returns scheduler status', async () => {
  const events = [];
  const server = createSchedulerHttpServer({
    config: {
      timezone: 'Etc/GMT-5',
      scheduleTimes: '07:01,19:30',
      enabledProviders: ['codex']
    },
    logger: {
      info: async (message, details) => {
        events.push({ message, details });
      },
      error: async () => {}
    },
    triggerRun: async () => ({
      prompt: 'hello',
      results: []
    }),
    port: 0
  });

  await server.listen();

  try {
    const address = server.server.address();
    const response = await fetch(`http://${address.address}:${address.port}/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.scheduler.timezone, 'Etc/GMT-5');
    assert.deepEqual(payload.scheduler.providers, ['codex']);
    assert.equal(payload.trigger.running, false);
    assert.equal(payload.trigger.lastRun, null);
  } finally {
    await new Promise((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('trigger endpoint runs the scheduler action and returns results', async () => {
  const server = createSchedulerHttpServer({
    config: {
      timezone: 'Etc/GMT-5',
      scheduleTimes: '07:01',
      enabledProviders: ['codex']
    },
    logger: {
      info: async () => {},
      error: async () => {}
    },
    triggerRun: async () => ({
      prompt: 'manual prompt',
      results: [
        {
          provider: 'codex',
          accountId: 'acct-1',
          success: true
        }
      ]
    }),
    port: 0
  });

  await server.listen();

  try {
    const address = server.server.address();
    const response = await fetch(`http://${address.address}:${address.port}/trigger`, {
      method: 'POST'
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.prompt, 'manual prompt');
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].accountId, 'acct-1');
  } finally {
    await new Promise((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});
