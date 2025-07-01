/**
 * Setup Script for HearthGem Arena Assistant
 * 
 * This script installs dependencies and builds the project
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

/**
 * Run a command and log the output
 * @param {string} command Command to run
 * @param {string} errorMessage Error message if command fails
 */
function runCommand(command, errorMessage) {
  try {
    console.log(`Running: ${command}`);
    execSync(command, { 
      cwd: PROJECT_ROOT, 
      stdio: 'inherit' 
    });
  } catch (error) {
    console.error(`${errorMessage}: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
function main() {
  console.log('HearthGem Arena Assistant Setup');
  console.log('===============================');
  
  // Check if dist directory exists and create if needed
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  
  // Install dependencies
  console.log('Installing dependencies...');
  runCommand('npm install', 'Failed to install dependencies');
  
  // Build the project
  console.log('Building the project...');
  runCommand('npm run build', 'Failed to build the project');
  
  console.log('Setup completed successfully!');
  console.log('');
  console.log('You can now run the application using:');
  console.log('  npm start');
  console.log('');
  console.log('Or test with simulated logs:');
  console.log('  node scripts/test-log-generator.js');
  console.log('  node scripts/run-with-test-logs.js');
}

// Run the script
main();