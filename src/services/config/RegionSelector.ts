import { BrowserWindow, screen, ipcMain } from 'electron';
import { logger } from '../../utils/logger';
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

    this.selectorWindow = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      fullscreen: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    // Load the region selector HTML
    this.selectorWindow.loadFile('src/region-selector.html');

    this.selectorWindow.on('closed', () => {
      this.selectorWindow = null;
      if (this.resolveSelection) {
        this.resolveSelection({ regions: [], cancelled: true });
        this.resolveSelection = null;
      }
    });

    // Send screen dimensions to the renderer
    this.selectorWindow.webContents.once('dom-ready', () => {
      this.selectorWindow?.webContents.send('screen-dimensions', {
        width: primaryDisplay.size.width,
        height: primaryDisplay.size.height
      });
    });
  }

  private setupIpcHandlers(): void {
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