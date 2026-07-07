import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isDirectExecution } from '../scheduler.js';

test('isDirectExecution matches the current script path', () => {
  const moduleUrl = pathToFileURL(fileURLToPath(import.meta.url)).href;
  const argv1 = fileURLToPath(import.meta.url);

  assert.equal(isDirectExecution(moduleUrl, argv1), true);
});

test('isDirectExecution returns false for a different script path', () => {
  const moduleUrl = pathToFileURL(fileURLToPath(import.meta.url)).href;
  const argv1 = path.join(path.dirname(fileURLToPath(import.meta.url)), 'other.js');

  assert.equal(isDirectExecution(moduleUrl, argv1), false);
});
