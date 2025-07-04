import { app, BrowserWindow } from 'electron';
import { HearthGemApp } from './core/HearthGemApp';
import { getLogger } from './utils/logger';

// Create a Winston logger instance for this module
const log = getLogger('main');

// Optional: disable hardware acceleration if needed for testing
// app.disableHardwareAcceleration();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error(`Uncaught exception: ${error.message}`, { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error(`Unhandled promise rejection: ${reason}`);
});

// Reference to the app instance
let hearthGemApp: HearthGemApp;

// Start the app
app.whenReady().then(async () => {
  log.info('Electron app ready');
  
  // Create and initialize HearthGemApp after app is ready
  hearthGemApp = new HearthGemApp();
  
  // Initialize and start HearthGemApp
  try {
    await hearthGemApp.start();
    log.info('HearthGem app started successfully');
  } catch (error) {
    log.error(`Error starting HearthGem app: ${error}`);
  }
}).catch((error) => {
  log.error(`Error during app initialization: ${error}`);
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  log.info('All windows closed');
  if (process.platform !== 'darwin') {
      app.quit();
    }
});

app.on('activate', () => {
  log.info('App activated');
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
      if (hearthGemApp) {
      hearthGemApp.start().catch((error) => {
        log.error(`Error restarting HearthGem app: ${error}`);
      });
    }
  }
});

// Capture handler will be initialized by HearthGemApp
log.info('Application initialization complete');