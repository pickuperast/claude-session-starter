#!/usr/bin/env node
import 'dotenv/config';

import { getRuntimeConfig } from './lib/config.js';
import { runOnce } from './scheduler.js';

const config = getRuntimeConfig();

console.log('Scheduler smoke test');
console.log('='.repeat(50));
console.log(`Providers: ${config.enabledProviders.join(', ') || 'none'}`);
console.log(`Timezone: ${config.timezone}`);
console.log(`Claude model: ${config.claudeModel}`);
console.log(`Codex model: ${config.codexModel}`);
console.log('');

try {
  const { prompt, results } = await runOnce(config);
  const failedResults = results.filter((result) => !result.success);

  console.log('');
  console.log(`Prompt: "${prompt}"`);
  console.log(`Completed results: ${results.length}`);

  if (failedResults.length > 0) {
    console.log('Smoke test failed.');
    for (const result of failedResults) {
      console.log(
        `- ${result.provider}:${result.accountId} success=${result.success} errorCode=${result.errorCode || 'none'}`
      );
    }
    process.exit(1);
  }

  console.log('Smoke test passed.');
  process.exit(0);
} catch (error) {
  console.error(`Smoke test failed: ${error.message}`);
  process.exit(1);
}
