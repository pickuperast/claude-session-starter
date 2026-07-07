export function readBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function getEnabledProviders() {
  const hasExplicitFlags =
    process.env.PING_PROVIDER_CODEX !== undefined || process.env.PING_PROVIDER_CLAUDE !== undefined;

  if (!hasExplicitFlags) {
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      return ['claude'];
    }

    return ['codex'];
  }

  const providers = [];

  if (readBoolean(process.env.PING_PROVIDER_CODEX, false)) {
    providers.push('codex');
  }

  if (readBoolean(process.env.PING_PROVIDER_CLAUDE, false)) {
    providers.push('claude');
  }

  return providers;
}

export function getRuntimeConfig() {
  return {
    scheduleTimes: process.env.SCHEDULE_TIMES || '07:01',
    timezone: process.env.TIMEZONE || 'Asia/Almaty',
    claudeModel: process.env.MODEL || 'claude-haiku-4-5-20251001',
    codexModel: process.env.CODEX_MODEL || 'gpt-5.4-mini',
    messagePrompt: process.env.MESSAGE_PROMPT || null,
    enabledProviders: getEnabledProviders()
  };
}
