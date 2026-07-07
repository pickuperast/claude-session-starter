import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCodexClientOptions,
  buildThreadOptions,
  classifyCodexError,
} from '../lib/codex/run-codex-command.js';

test('classifyCodexError detects authentication failures', () => {
  assert.equal(classifyCodexError('invalid ID token format at line 5 column 25'), 'authentication_failed');
  assert.equal(classifyCodexError('Unauthorized request'), 'authentication_failed');
});

test('classifyCodexError detects server and network failures without false positives', () => {
  assert.equal(classifyCodexError('HTTP 503 server error'), 'server_error');
  assert.equal(classifyCodexError('network ECONNRESET'), 'network_error');
  assert.equal(classifyCodexError('line 5 column 25'), 'process_error');
});

test('buildCodexClientOptions injects CODEX_HOME without dropping env', () => {
  const options = buildCodexClientOptions({
    codexHomePath: 'C:/tmp/codex-home',
    env: { PATH: 'custom-path', EXTRA: 'value' }
  });

  assert.equal(options.env.CODEX_HOME, 'C:/tmp/codex-home');
  assert.equal(options.env.PATH, 'custom-path');
  assert.equal(options.env.EXTRA, 'value');
});

test('buildThreadOptions keeps the working directory and repo check override', () => {
  assert.deepEqual(buildThreadOptions({ model: 'gpt-5.4', cwd: '/repo' }), {
    model: 'gpt-5.4',
    workingDirectory: '/repo',
    skipGitRepoCheck: true
  });
});
