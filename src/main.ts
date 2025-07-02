import { app } from 'electron';
import HearthGemApp from './HearthGemApp';
import logger from './utils/logger';

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason });
});

// Create app instance
const hearthGemApp = new HearthGemApp();

// Start the app
app.whenReady().then(() => {
  logger.info('Electron app ready');
}).catch((error) => {
  logger.error('Error starting app', { error });
});