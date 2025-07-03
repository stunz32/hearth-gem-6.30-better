import { app } from 'electron';
import HearthGemApp from './HearthGemApp';
import logger from './utils/logger';
import initializeCaptureHandler from './main/captureHandler';
import SafeCaptureService from './services/capture/SafeCaptureService';
import pino from 'pino';

// Create a pino logger instance
const log = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Optional: disable hardware acceleration if needed for testing
// app.disableHardwareAcceleration();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error({ error }, 'Uncaught exception');
  logger.error('Uncaught exception', { error });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log.error({ reason }, 'Unhandled promise rejection');
  logger.error('Unhandled promise rejection', { reason });
});

// Create app instance
const hearthGemApp = new HearthGemApp();

// Start the app
app.whenReady().then(() => {
  log.info('Electron app ready');
  logger.info('Electron app ready');
  
  // Initialize the safe capture service
  const safeCaptureService = SafeCaptureService.getInstance();
  safeCaptureService.initialize();
  
  log.info('Safe capture service initialized');
}).catch((error) => {
  log.error({ error }, 'Error starting app');
  logger.error('Error starting app', { error });
});