import { app } from 'electron';
import logger from './utils/logger';
import HearthGemApp from './core/HearthGemApp';

/**
 * Main entry point for HearthGem Arena Assistant
 * @module Main
 */

let hearthGemApp: HearthGemApp | null = null;

/**
 * Initialize the application
 */
async function initializeApp() {
  try {
    hearthGemApp = new HearthGemApp();
    await hearthGemApp.start();
  } catch (error) {
    logger.error('Failed to initialize application', { error });
    app.quit();
  }
}

// Handle application ready event
app.on('ready', () => {
  logger.info('Application ready, initializing HearthGem');
  initializeApp();
});

// Handle application quit event
app.on('quit', () => {
  logger.info('Application quitting');
  if (hearthGemApp) {
    hearthGemApp.stop();
  }
});

// Handle all windows closed
app.on('window-all-closed', () => {
  logger.info('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
});