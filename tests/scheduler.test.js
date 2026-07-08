import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

import { generateMessage, isDirectExecution } from '../scheduler.js';

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

test('generateMessage reads the static prompt file', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scheduler-prompt-'));
  const promptFile = path.join(tempDir, 'message-prompt.txt');
  await fs.writeFile(promptFile, '  write a stable prompt from file  ', 'utf8');

  const prompt = await generateMessage(
    {
      messagePromptFile: promptFile,
      messagePrompt: null
    },
    tempDir
  );

  assert.equal(prompt, 'write a stable prompt from file');
});

test('generateMessage fails when the prompt file is missing', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scheduler-prompt-missing-'));
  const promptFile = path.join(tempDir, 'message-prompt.txt');

  await assert.rejects(
    () =>
      generateMessage(
        {
          messagePromptFile: promptFile
        },
        tempDir
      ),
    /Prompt file not found/
  );
});
