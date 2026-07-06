import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyCodexError } from '../lib/codex/run-codex-command.js';

test('classifyCodexError detects authentication failures', () => {
  assert.equal(classifyCodexError('invalid ID token format at line 5 column 25'), 'authentication_failed');
  assert.equal(classifyCodexError('Unauthorized request'), 'authentication_failed');
});

test('classifyCodexError detects server and network failures without false positives', () => {
  assert.equal(classifyCodexError('HTTP 503 server error'), 'server_error');
  assert.equal(classifyCodexError('network ECONNRESET'), 'network_error');
  assert.equal(classifyCodexError('line 5 column 25'), 'process_error');
});
