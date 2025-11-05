/**
 * Debug script to check environment variable loading
 */

require('dotenv').config();

console.log('🔍 Debugging Environment Variables...\n');

// List all environment variables that should be loaded
const requiredVars = [
  'LINEAR_CLIENT_ID',
  'LINEAR_CLIENT_SECRET',
  'LINEAR_WEBHOOK_SECRET',
  'LINEAR_API_KEY',
  'OPENCODE_API_KEY',
  'LINEAR_AGENT_PUBLIC_URL',
  'LINEAR_WEBHOOK_PORT',
  'NODE_ENV'
];

console.log('📋 Checking process.env (after dotenv.config()):');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✅' : '❌';
  const displayValue = value ? `${value.substring(0, 10)}${value.length > 10 ? '...' : ''}` : 'undefined';
  console.log(`  ${status} ${varName}: ${displayValue}`);
});

console.log('\n📁 Checking .env file:');
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log(`✅ .env file found at: ${envPath}`);
  console.log(`📄 File size: ${envContent.length} characters`);
  
  // Show first few lines (without secrets)
  const lines = envContent.split('\n').slice(0, 10);
  console.log('\n📝 First 10 lines of .env:');
  lines.forEach((line, index) => {
    if (line.includes('SECRET') || line.includes('KEY')) {
      console.log(`  ${index + 1}: ${line.split('=')[0]}=***HIDDEN***`);
    } else {
      console.log(`  ${index + 1}: ${line}`);
    }
  });
  
} catch (error) {
  console.log(`❌ .env file not found or not readable: ${error.message}`);
}

console.log('\n🧪 Testing OAuth config validation:');
try {
  const { validateOAuthConfig, LINEAR_OAUTH_CONFIG } = require('../src/oauth/linear-oauth-config');
  console.log('📋 LINEAR_OAUTH_CONFIG values:');
  console.log(`  clientId: ${LINEAR_OAUTH_CONFIG.clientId ? 'SET' : 'MISSING'}`);
  console.log(`  clientSecret: ${LINEAR_OAUTH_CONFIG.clientSecret ? 'SET' : 'MISSING'}`);
  console.log(`  webhookSecret: ${LINEAR_OAUTH_CONFIG.webhookSecret ? 'SET' : 'MISSING'}`);
  console.log(`  publicUrl: ${LINEAR_OAUTH_CONFIG.publicUrl}`);
  
  const isValid = validateOAuthConfig();
  console.log(`\n✅ Validation result: ${isValid ? 'VALID' : 'INVALID'}`);
  
} catch (error) {
  console.log(`❌ Error testing OAuth config: ${error.message}`);
}

console.log('\n🔧 Recommendations:');
console.log('1. Make sure .env file is in the project root directory');
console.log('2. Check that variables have no extra spaces or special characters');
console.log('3. Ensure no quotes around values in .env file');
console.log('4. Try restarting your terminal/command prompt');