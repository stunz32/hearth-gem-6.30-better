/**
 * RegionSelectionController
 * 
 * Provides a clean interface for manual card region selection.
 * Uses existing RegionSelector and ScreenCaptureService infrastructure
 * without modifying any existing code to avoid linter errors and conflicts.
 */
import { ipcMain } from 'electron';
import { RegionSelector, RegionSelectionResult } from '../services/config/RegionSelector';
import ScreenCaptureService, { CaptureRegion } from '../services/capture/ScreenCaptureService';
import { getLogger } from '../utils/logger';
import type { CardRegion } from '../services/config/RegionConfigService';

// Create logger instance for this module
const logger = getLogger('controllers/RegionSelectionController');

/**
 * Controller for managing manual region selection workflow
 * Coordinates between UI, RegionSelector, and ScreenCaptureService
 */
export default class RegionSelectionController {
  private selector: RegionSelector | null = null;
  private isSelecting: boolean = false;
  
  constructor() {
    logger.info('RegionSelectionController initialized');
  }
  
  /**
   * Register IPC handlers for manual region selection
   */
  public registerIpc(): void {
    logger.info('Registering manual region selection IPC handlers');
    
    // Register IPC handler for opening the region selector
    ipcMain.handle('open-region-selector', async () => {
      return this.openRegionSelector();
    });
    
    // Register IPC handler for checking if manual regions exist
    ipcMain.handle('check-manual-regions', async () => {
      const hasRegions = await ScreenCaptureService.getInstance().hasValidManualRegions();
      return { hasRegions };
    });
    
    logger.info('Manual region selection IPC handlers registered');
  }
  
  /**
   * Open the region selector window and handle the selection process
   * @returns Promise resolving to the selected regions or null if cancelled
   */
  private async openRegionSelector(): Promise<{ regions: CardRegion[], cancelled: boolean } | null> {
    if (this.isSelecting) {
      logger.warn('Region selection already in progress');
      return { regions: [], cancelled: true };
    }
    
    try {
      this.isSelecting = true;
      logger.info('Opening manual region selector');
      
      // Create a new RegionSelector instance
      this.selector = new RegionSelector();
      
      // Open the selector window and wait for regions
      const result: RegionSelectionResult = await this.selector.selectRegions();
      
      // Check if selection was cancelled
      if (result.cancelled || !result.regions || result.regions.length === 0) {
        logger.info('Region selection cancelled or no regions selected');
        return { regions: [], cancelled: true };
      }
      
      // Use existing infrastructure to save regions
      await ScreenCaptureService.getInstance().updateManualRegions(result.regions);
      
      logger.info('Regions persisted successfully', { 
        regionCount: result.regions.length 
      });
      
      return { regions: result.regions, cancelled: false };
    } catch (error) {
      logger.error('Error during manual region selection', { error });
      return { regions: [], cancelled: true };
    } finally {
      // Clean up
      if (this.selector) {
        this.selector.dispose();
        this.selector = null;
      }
      this.isSelecting = false;
    }
  }
  
  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.selector) {
      this.selector.dispose();
      this.selector = null;
    }
    
    // Remove IPC handlers
    ipcMain.removeHandler('open-region-selector');
    ipcMain.removeHandler('check-manual-regions');
    
    logger.info('RegionSelectionController disposed');
  }
} 