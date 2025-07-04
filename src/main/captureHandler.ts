import { ipcMain, screen } from 'electron';
import { ScreenCaptureService } from '../services/capture/ScreenCaptureService';
import { ICaptureRegionArgs } from '../types/capture';
import logger from '../utils/logger';

// Use the winston logger from utils
const log = logger;

/**
 * Initialize the capture handler
 * Sets up IPC handlers for screen capture
 */
export function initializeCaptureHandler(): void {
  log.info('Capture handler disabled - using ScreenCaptureService instead');
  
  // IPC handler registration disabled - using ScreenCaptureService instead
  /*
  ipcMain.handle('CAPTURE_REGION', async (_, args: ICaptureRegionArgs) => {
    try {
      const { x, y, width, height } = args;
      
      // Get display information
      const primaryDisplay = screen.getPrimaryDisplay();
      const displayWidth = primaryDisplay.bounds.width;
      const displayHeight = primaryDisplay.bounds.height;
      const scaleFactor = primaryDisplay.scaleFactor;
      
      // Calculate safe thumbnail size (physical resolution ÷ DPI scale)
      const thumbWidth = Math.round(displayWidth / scaleFactor);
      const thumbHeight = Math.round(displayHeight / scaleFactor);
      
      log.debug({
        thumbWidth,
        thumbHeight,
        args
      }, 'Requested capture');
      
      // If the region is outside the primary display, find the correct display
      let targetDisplay = primaryDisplay;
      if (screen.getAllDisplays().length > 1) {
        const point = { x: x + (width / 2), y: y + (height / 2) };
        const nearestDisplay = screen.getDisplayNearestPoint(point);
        if (nearestDisplay.id !== primaryDisplay.id) {
          targetDisplay = nearestDisplay;
          log.debug({
            displayId: targetDisplay.id,
            bounds: targetDisplay.bounds
          }, 'Using non-primary display for capture');
        }
      }
      
      // Use the screen capture service to capture the region
      const captureService = ScreenCaptureService.getInstance();
      const pngBuffer = await captureService.captureRegion(args);
      
      log.debug({
        bytes: pngBuffer.length
      }, 'Capture completed');
      
      return pngBuffer;
    } catch (error) {
      log.error({
        error
      }, 'Error in CAPTURE_REGION handler');
      throw error;
    }
  });
  */
  
  log.info('Capture handler initialization complete (disabled)');
}

export default initializeCaptureHandler; 