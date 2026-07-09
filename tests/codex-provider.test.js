import test from 'node:test';
import assert from 'node:assert/strict';

import { sendCodexMessage } from '../lib/providers/codex.js';

test('sendCodexMessage runs /status after each successful Codex response and logs it', async () => {
  const calls = [];
  const logs = [];
  const account = {
    id: 'acc-1',
    email: 'main@example.com',
    label: 'main'
  };
  const accountManager = {
    codexHomePath: '/tmp/codex-home',
    async selectRunnableAccounts() {
      return { accounts: [account] };
    },
    async syncAccountToCodexHome() {},
    async importFromCodexHome() {},
    async markAccountResult() {}
  };
  const logger = {
    async info(message, details) {
      logs.push({ level: 'info', message, details });
    },
    async error(message, details) {
      logs.push({ level: 'error', message, details });
    }
  };
  const runCodex = async (options) => {
    calls.push(options);

    if (options.prompt === '/status') {
      return {
        output: 'status output',
        durationMs: 50,
        usage: { input_tokens: 10, output_tokens: 5 },
        hasReasoning: false,
        reasoningItemCount: 0
      };
    }

    return {
      output: 'final answer',
      durationMs: 100,
      usage: { input_tokens: 100, output_tokens: 25 },
      hasReasoning: true,
      reasoningItemCount: 1
    };
  };

  const results = await sendCodexMessage({
    prompt: 'solve this task',
    model: 'gpt-5.4-mini',
    logger,
    accountManager,
    runCodex
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].prompt, 'solve this task');
  assert.equal(calls[1].prompt, '/status');
  assert.equal(calls[1].promptMode, 'raw');
  assert.equal(calls[1].taskMode, 'simple');
  assert.equal(results[0].response, 'final answer');
  assert.equal(results[0].statusResponse, 'status output');

  const statusLog = logs.find((entry) => entry.message === 'Codex status received');
  assert.ok(statusLog);
  assert.equal(statusLog.details.response, 'status output');
});
