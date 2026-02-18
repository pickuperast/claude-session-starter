import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import cron from 'node-cron';

// Schedule configuration
const SCHEDULE_TIMES = process.env.SCHEDULE_TIMES || '07:01,12:01,17:01';
const TIMEZONE = process.env.TIMEZONE || 'Asia/Karachi';

// Model configuration
const MODEL = process.env.MODEL || 'claude-haiku-4-5-20251001';

// Message configuration
const MESSAGE_PROMPT = process.env.MESSAGE_PROMPT || null;

// Validate required configuration
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.error('❌ ERROR: Authentication credentials not found!');
  console.error('Please set CLAUDE_CODE_OAUTH_TOKEN in .env file');
  console.error('\nTo get OAuth Token:');
  console.error('  1. Run: claude setup-token');
  console.error('  2. Copy the generated token');
  console.error('  3. Add to .env file: CLAUDE_CODE_OAUTH_TOKEN=your_token_here');
  process.exit(1);
}

/**
 * Generate a message with random math problem
 */
function generateMessage() {
  if (MESSAGE_PROMPT) {
    return MESSAGE_PROMPT;
  }
  
  // Generate random numbers between 0-100
  const num1 = Math.floor(Math.random() * 101);
  const num2 = Math.floor(Math.random() * 101);
  return `${num1}+${num2}`;
}

/**
 * Send a message to Claude using the Agent SDK
 */
async function sendMessage() {
  const timestamp = new Date().toLocaleString('en-US', { 
    timeZone: TIMEZONE,
    hour12: false 
  });
  
  try {
    const prompt = generateMessage();
    console.log(`[${timestamp}] Sending message to Claude...`);
    console.log(`[${timestamp}] Prompt: "${prompt}"`);
    
    let resultText = '';
    
    // Use query function with automatic OAuth handling
    for await (const msg of query({
      prompt: prompt,
      options: {
        model: MODEL,
        maxTurns: 1  // Single turn conversation
      }
    })) {
      if (msg.type === 'result') {
        resultText = msg.result;
      }
    }
    
    console.log(`[${timestamp}] ✓ Message sent successfully`);
    console.log(`[${timestamp}] Response: ${resultText}`);
    
    return resultText;
    
  } catch (error) {
    console.error(`[${timestamp}] ✗ Error sending message:`, error.message);
    
    // Provide helpful error messages
    if (error.message.includes('authentication') || 
        error.message.includes('Invalid API key')) {
      console.error('\n💡 Authentication failed. Please check:');
      console.error('1. CLAUDE_CODE_OAUTH_TOKEN is valid (run: claude setup-token)');
    }
    
    throw error;
  }
}

/**
 * Parse schedule times from environment and create cron jobs
 */
function setupScheduledJobs() {
  const times = SCHEDULE_TIMES.split(',').map(t => t.trim());
  
  if (times.length === 0) {
    throw new Error('No schedule times configured. Please set SCHEDULE_TIMES in .env');
  }

  console.log('🚀 Claude Agent SDK Scheduler started');
  console.log(`⏰ Timezone: ${TIMEZONE}`);
  console.log(`🤖 Model: ${MODEL}`);
  console.log('🔑 Authentication: Claude Agent SDK (auto-managed)');
  console.log('📅 Scheduled times:');

  times.forEach((time, index) => {
    // Parse time in HH:MM format
    const [hour, minute] = time.split(':').map(t => parseInt(t.trim(), 10));
    
    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      console.error(`❌ Invalid time format: ${time}. Expected HH:MM (e.g., 07:01)`);
      return;
    }

    // Create cron expression: minute hour * * *
    const cronExpression = `${minute} ${hour} * * *`;
    
    cron.schedule(cronExpression, () => {
      console.log(`\n=== Scheduled Task ${index + 1}: ${time} ${TIMEZONE} ===`);
      sendMessage().catch(err => console.error('Task failed:', err.message));
    }, {
      timezone: TIMEZONE
    });

    console.log(`  ${index + 1}. ${time} (${hour}:${minute.toString().padStart(2, '0')})`);
  });

  console.log('\n✅ All jobs scheduled. Waiting for scheduled times...\n');
}

// Export for testing
export { sendMessage, generateMessage };

// Only run scheduler if this is the main module
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1])) {
  // Initialize scheduled jobs
  try {
    setupScheduledJobs();
  } catch (error) {
    console.error('❌ Failed to initialize scheduler:', error.message);
    process.exit(1);
  }

  // Keep the script running
  process.on('SIGINT', () => {
    console.log('\n\n👋 Scheduler stopped');
    process.exit(0);
  });
}
