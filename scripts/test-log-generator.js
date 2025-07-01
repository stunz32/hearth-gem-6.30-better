/**
 * Test Log Generator
 * 
 * This script generates sample Hearthstone log files for testing the HearthGem Arena Assistant
 * without needing to run the actual game.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const TEST_LOGS_DIR = path.join(__dirname, '../test-logs');
const ARENA_LOG_PATH = path.join(TEST_LOGS_DIR, 'Arena.log');
const POWER_LOG_PATH = path.join(TEST_LOGS_DIR, 'Power.log');
const LOADING_SCREEN_LOG_PATH = path.join(TEST_LOGS_DIR, 'LoadingScreen.log');

// Sample card IDs for testing
const HERO_IDS = ['HERO_01', 'HERO_02', 'HERO_03'];
const CARD_IDS = ['EX1_001', 'EX1_002', 'EX1_003', 'EX1_004', 'EX1_005'];

/**
 * Create test directory and log files
 */
function setupTestDirectory() {
  console.log('Setting up test directory...');
  
  if (!fs.existsSync(TEST_LOGS_DIR)) {
    fs.mkdirSync(TEST_LOGS_DIR, { recursive: true });
  }
  
  // Create empty log files
  fs.writeFileSync(ARENA_LOG_PATH, '');
  fs.writeFileSync(POWER_LOG_PATH, '');
  fs.writeFileSync(LOADING_SCREEN_LOG_PATH, '');
  
  console.log(`Test logs directory created at: ${TEST_LOGS_DIR}`);
}

/**
 * Append a line to a log file with a timestamp
 * @param {string} filePath Path to the log file
 * @param {string} content Content to append
 */
function appendLogLine(filePath, content) {
  const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
  const logLine = `${timestamp} ${content}\n`;
  fs.appendFileSync(filePath, logLine);
}

/**
 * Simulate an Arena draft
 */
function simulateArenaDraft() {
  console.log('Simulating Arena draft...');
  
  // Start the draft
  appendLogLine(LOADING_SCREEN_LOG_PATH, 'Gameplay.Start GameType=GT_ARENA');
  appendLogLine(ARENA_LOG_PATH, 'Draft.OnBegin()');
  
  // Wait a moment before showing hero options
  setTimeout(() => {
    console.log('Showing hero options...');
    
    // Show hero options
    HERO_IDS.forEach(heroId => {
      appendLogLine(POWER_LOG_PATH, `SHOW_ENTITY - ZONE=HAND cardId=${heroId}`);
    });
    
    // Wait for hero selection
    setTimeout(() => {
      console.log('Hero selected...');
      const selectedHero = HERO_IDS[Math.floor(Math.random() * HERO_IDS.length)];
      appendLogLine(ARENA_LOG_PATH, `Draft.OnChosen(): id=${selectedHero}`);
      
      // Start card selections
      simulateCardSelections();
    }, 2000);
  }, 2000);
}

/**
 * Simulate card selections for the draft
 */
function simulateCardSelections() {
  let pickNumber = 0;
  const totalPicks = 3; // Reduced for testing, actual Arena has 30
  
  function showNextCardOptions() {
    if (pickNumber >= totalPicks) {
      // Draft complete
      appendLogLine(ARENA_LOG_PATH, 'Draft.OnComplete()');
      console.log('Draft completed!');
      return;
    }
    
    console.log(`Showing card options for pick ${pickNumber + 1}...`);
    
    // Shuffle the card IDs and pick 3
    const shuffled = [...CARD_IDS].sort(() => 0.5 - Math.random());
    const options = shuffled.slice(0, 3);
    
    // Show the card options
    options.forEach(cardId => {
      appendLogLine(POWER_LOG_PATH, `SHOW_ENTITY - ZONE=HAND cardId=${cardId}`);
    });
    
    // Wait for card selection
    setTimeout(() => {
      const selectedCard = options[Math.floor(Math.random() * options.length)];
      console.log(`Card selected for pick ${pickNumber + 1}: ${selectedCard}`);
      appendLogLine(ARENA_LOG_PATH, `Draft.OnChosen(): id=${selectedCard}`);
      
      pickNumber++;
      
      // Wait before showing next options
      setTimeout(showNextCardOptions, 2000);
    }, 3000);
  }
  
  // Start the card selection process
  showNextCardOptions();
}

/**
 * Main function
 */
function main() {
  console.log('HearthGem Test Log Generator');
  console.log('===========================');
  
  setupTestDirectory();
  
  console.log('Starting Arena draft simulation automatically...');
  simulateArenaDraft();
}

// Run the script
main();