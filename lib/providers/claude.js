import { query } from '@anthropic-ai/claude-agent-sdk';

export async function sendClaudeMessage({ prompt, model, logger }) {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    throw new Error('CLAUDE_CODE_OAUTH_TOKEN is required when the Claude provider is enabled.');
  }

  const startedAt = Date.now();
  let resultText = '';

  await logger?.info('Sending Claude prompt', {
    provider: 'claude',
    model,
    prompt
  });

  for await (const message of query({
    prompt,
    options: {
      model,
      maxTurns: 1
    }
  })) {
    if (message.type === 'result') {
      resultText = message.result;
    }
  }

  const result = [
    {
      provider: 'claude',
      accountId: 'claude-legacy',
      accountEmail: null,
      model,
      durationMs: Date.now() - startedAt,
      success: true,
      errorCode: null,
      response: resultText
    }
  ];

  await logger?.info('Claude response received', {
    provider: 'claude',
    model,
    response: resultText
  });

  return result;
}
