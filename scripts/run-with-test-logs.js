/**
 * Run HearthGem with Test Logs
 * 
 * This script starts the HearthGem application with the TEST_LOGS_DIR as the log directory
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const TEST_LOGS_DIR = path.join(__dirname, '../test-logs');

// Check if test logs directory exists
if (!fs.existsSync(TEST_LOGS_DIR)) {
  console.error(`Test logs directory not found: ${TEST_LOGS_DIR}`);
  console.error('Please run test-log-generator.js first to create test logs.');
  process.exit(1);
}

console.log('Starting HearthGem with test logs...');
console.log(`Log directory: ${TEST_LOGS_DIR}`);

// Set environment variable for the log directory
process.env.HEARTHGEM_LOG_DIR = TEST_LOGS_DIR;

// Start the Electron application using the specific electron executable
const appPath = path.join(__dirname, '..');
const electronPath = path.join(appPath, 'node_modules', 'electron', 'dist', 'electron.exe');

console.log('Using electron at:', electronPath);
console.log('Running app from:', appPath);

// Quote the paths to handle spaces
const quotedElectronPath = `"${electronPath}"`;
const quotedAppPath = `"${appPath}"`;

const electronProcess = spawn(quotedElectronPath, [quotedAppPath], {
  stdio: 'inherit',
  env: process.env,
  shell: true
});

electronProcess.on('close', (code) => {
  console.log(`HearthGem exited with code ${code}`);
});

console.log('HearthGem started. Press Ctrl+C to exit.');