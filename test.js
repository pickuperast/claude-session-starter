#!/usr/bin/env node
import 'dotenv/config';
import { sendMessage, generateMessage } from './scheduler.js';

console.log('🧪 Claude Agent SDK Test');
console.log('='.repeat(50));
console.log('');

// Check authentication
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.error('❌ ERROR: No authentication credentials found!');
  console.error('Please set CLAUDE_CODE_OAUTH_TOKEN in .env');
  console.error('\nSetup:');
  console.error('  1. Run: claude setup-token');
  console.error('  2. Copy token to .env file');
  process.exit(1);
}

console.log('✅ Authentication: Configured');
console.log(`🤖 Model: ${process.env.MODEL || 'claude-haiku-4-5-20251001'}`);
console.log('');

// Test message generation
console.log('📝 Testing message generation...');
const testMessage = generateMessage();
console.log(`Generated prompt: "${testMessage}"`);
console.log('');

// Test API call
console.log('🚀 Testing API connection...');
console.log('Sending message to Claude...');
console.log('');

try {
  const result = await sendMessage();
  
  console.log('');
  console.log('='.repeat(50));
  console.log('✅ TEST PASSED!');
  console.log('='.repeat(50));
  console.log('');
  console.log('The scheduler is working correctly.');
  console.log('You can now run: npm start');
  console.log('');
  
  process.exit(0);
} catch (error) {
  console.log('');
  console.log('='.repeat(50));
  console.log('❌ TEST FAILED!');
  console.log('='.repeat(50));
  console.log('');
  console.error('Error:', error.message);
  console.log('');
  
  if (error.message.includes('authentication') || error.message.includes('Invalid')) {
    console.error('💡 Troubleshooting:');
    console.error('  1. Verify your token: claude setup-token');
    console.error('  2. Check .env file has CLAUDE_CODE_OAUTH_TOKEN set');
  }
  
  console.log('');
  process.exit(1);
}
