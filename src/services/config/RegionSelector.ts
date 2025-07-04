import { BrowserWindow, screen, ipcMain, app } from 'electron';
import path from 'path';
import { getLogger } from '../../utils/logger';

// Create logger instance for this module
const logger = getLogger('src/services/config/RegionSelector');
import { CardRegion } from './RegionConfigService';

export interface RegionSelectionResult {
  regions: CardRegion[];
  cancelled: boolean;
}

/**
 * Full-screen overlay for manually selecting card regions
 * Allows users to draw rectangles to define where cards appear
 */
export class RegionSelector {
  private selectorWindow: BrowserWindow | null = null;
  private resolveSelection: ((result: RegionSelectionResult) => void) | null = null;

  constructor() {
    this.setupIpcHandlers();
  }

  /**
   * Show the region selector and wait for user to define regions
   */
  async selectRegions(): Promise<RegionSelectionResult> {
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
      this.createSelectorWindow();
    });
  }

  private createSelectorWindow(): void {
    if (this.selectorWindow) {
      this.selectorWindow.focus();
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    logger.info('Creating region selector window', { width, height });
    logger.info('Using transparent: true + manual bounds to emulate fullscreen overlay');

    this.selectorWindow = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      frame: false,
      transparent: true,               // True so the underlying game is visible
      fullscreen: false,               // Avoid Electron fullscreen + transparency bug
      fullscreenable: false,
      backgroundColor: '#00000000',    // Fully transparent
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(app.getAppPath(), 'dist', 'preload.js')
      }
    });

    // Manually position & size to cover the full display (emulates fullscreen)
    this.selectorWindow.setBounds({ x: 0, y: 0, width, height });

    // Use absolute path based on the app root to avoid path resolution issues when running from the compiled dist folder
    const selectorHtmlPath = app.isPackaged
      ? path.join(process.resourcesPath, 'region-selector.html') // Production: bundled into resources root
      : path.join(app.getAppPath(), 'src', 'region-selector.html'); // Development: located under src/

    // Extra safety – emit a warning if the file does not exist
    try {
      // Lazy load fs to avoid unnecessary require in production
      const fs = require('fs');
      if (!fs.existsSync(selectorHtmlPath)) {
        logger.warn('region-selector.html not found at resolved path', { selectorHtmlPath });
      }
    } catch (err) {
      logger.error('Failed to verify existence of region-selector.html', { error: err });
    }

    logger.info('Loading region selector HTML from: ' + selectorHtmlPath);
    this.selectorWindow.loadFile(selectorHtmlPath);

    // Add error handling for failed loading
    this.selectorWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
      logger.error('Region selector failed to load', { errorCode, errorDescription });
    });

    // Optional debugging: open DevTools only if explicitly requested
    if (process.env.REGION_SELECTOR_DEBUG === 'true') {
      this.selectorWindow.webContents.once('dom-ready', () =>
        this.selectorWindow!.webContents.openDevTools({ mode: 'detach' }));
    }

    this.selectorWindow.on('closed', () => {
      logger.info('Selector window closed by user action');
      this.selectorWindow = null;
      if (this.resolveSelection) {
        this.resolveSelection({ regions: [], cancelled: true });
        this.resolveSelection = null;
      }
    });

    // Send screen dimensions to the renderer
    this.selectorWindow.webContents.once('dom-ready', () => {
      logger.info('DOM ready, sending screen dimensions to renderer');
      this.selectorWindow?.webContents.send('screen-dimensions', {
        width: primaryDisplay.size.width,
        height: primaryDisplay.size.height
      });
    });
  }

  private setupIpcHandlers(): void {
    // Ensure we don't double-register handlers if a previous RegionSelector instance
    // did not dispose correctly (e.g. due to an exception).
    try {
      ipcMain.removeHandler('region-selection-complete');
      ipcMain.removeHandler('region-selection-cancel');
    } catch (err) {
      // removeHandler throws if channel was never registered on some Electron versions
      logger.warn('Safe ignore: removeHandler threw (likely not previously registered)', { error: err });
    }

    // Handle region selection completion
    ipcMain.handle('region-selection-complete', (_, regions: CardRegion[]) => {
      logger.info('Region selection completed', { regionCount: regions.length });
      
      if (this.resolveSelection) {
        this.resolveSelection({ regions, cancelled: false });
        this.resolveSelection = null;
      }
      
      this.closeSelectorWindow();
      return true;
    });

    // Handle region selection cancellation
    ipcMain.handle('region-selection-cancel', () => {
      logger.info('Region selection cancelled');
      
      if (this.resolveSelection) {
        this.resolveSelection({ regions: [], cancelled: true });
        this.resolveSelection = null;
      }
      
      this.closeSelectorWindow();
      return true;
    });
  }

  private closeSelectorWindow(): void {
    if (this.selectorWindow) {
      this.selectorWindow.close();
      this.selectorWindow = null;
    }
  }

  /**
   * Clean up IPC handlers
   */
  dispose(): void {
    this.closeSelectorWindow();
    ipcMain.removeHandler('region-selection-complete');
    ipcMain.removeHandler('region-selection-cancel');
  }
} 
