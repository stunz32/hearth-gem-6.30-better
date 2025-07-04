import { desktopCapturer, screen, ipcMain } from 'electron';
import { ICaptureRegionArgs, CaptureRegionResult, IScreenCaptureService, CaptureRegion, CaptureResult } from '../../types/capture';
import sharp from 'sharp';
import logger from '../../utils/logger';

// Use the winston logger from utils
const log = logger;

/**
 * Service for capturing screen regions safely
 * Implements strategies to avoid Skia bitmap allocation crashes
 */
export class SafeCaptureService implements IScreenCaptureService {
  private static instance: SafeCaptureService;

  /**
   * Get the singleton instance of the safe capture service
   */
  public static getInstance(): SafeCaptureService {
    if (!SafeCaptureService.instance) {
      SafeCaptureService.instance = new SafeCaptureService();
    }
    return SafeCaptureService.instance;
  }

  constructor() {
    // IPC handlers disabled - using ScreenCaptureService instead
    // this.registerIpcHandlers();
    log.info('Safe capture service initialized (IPC handlers disabled)');
  }

  /**
   * Initialize the safe capture service
   */
  public initialize(): void {
    log.info('Safe capture service initialized');
  }

  /**
   * Register IPC handlers for screen capture
   */
  private registerIpcHandlers(): void {
    ipcMain.handle('CAPTURE_REGION', async (_, args: ICaptureRegionArgs | CaptureRegion) => {
      return this.captureRegion(args);
    });

    log.debug('IPC handlers registered for safe screen capture');
  }

  /**
   * Captures a specific region of the screen
   * Uses a safe thumbnail size to avoid Skia bitmap allocation crashes
   * 
   * @param args Region coordinates and dimensions
   * @returns Promise resolving to raw PNG bytes with compatibility properties
   */
  public async captureRegion(args: ICaptureRegionArgs | CaptureRegion): Promise<CaptureRegionResult> {
    try {
      // Get the primary display information
      const primaryDisplay = screen.getPrimaryDisplay();
      const displayWidth = primaryDisplay.bounds.width;
      const displayHeight = primaryDisplay.bounds.height;
      const scaleFactor = primaryDisplay.scaleFactor;
      
      // Calculate safe thumbnail size (physical resolution ÷ DPI scale)
      const thumbWidth = Math.round(displayWidth / scaleFactor);
      const thumbHeight = Math.round(displayHeight / scaleFactor);
      
      log.debug('Requested capture', {
        displayWidth,
        displayHeight,
        scaleFactor,
        thumbWidth,
        thumbHeight,
        args
      });
      
      // If the region is outside the primary display, find the correct display
      let targetDisplay = primaryDisplay;
      if (screen.getAllDisplays().length > 1) {
        const point = { x: args.x + (args.width / 2), y: args.y + (args.height / 2) };
        const nearestDisplay = screen.getDisplayNearestPoint(point);
        if (nearestDisplay.id !== primaryDisplay.id) {
          targetDisplay = nearestDisplay;
          log.debug('Using non-primary display for capture', {
            displayId: targetDisplay.id,
            bounds: targetDisplay.bounds
          });
        }
      }

      // Capture the screen at the safe thumbnail size
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: thumbWidth,
          height: thumbHeight
        }
      });

      if (sources.length === 0) {
        const error = 'No screen sources available for capture';
        log.error(error);
        
        // Return a compatible error result
        const errorResult = new Uint8Array(0) as CaptureRegionResult;
        errorResult.success = false;
        errorResult.error = error;
        errorResult.timestamp = Date.now();
        if ('name' in args) {
          errorResult.region = args as CaptureRegion;
        }
        return errorResult;
      }

      // Get the primary screen source
      const source = sources[0];
      
      // Get the thumbnail as NativeImage
      const thumbnail = source.thumbnail;
      
      if (!thumbnail) {
        const error = 'Failed to capture screen thumbnail';
        log.error(error);
        
        // Return a compatible error result
        const errorResult = new Uint8Array(0) as CaptureRegionResult;
        errorResult.success = false;
        errorResult.error = error;
        errorResult.timestamp = Date.now();
        if ('name' in args) {
          errorResult.region = args as CaptureRegion;
        }
        return errorResult;
      }

      // Convert thumbnail to buffer for processing with sharp
      const thumbnailBuffer = thumbnail.toPNG();
      
      // Calculate the scaling ratio between the thumbnail and actual display
      const scaleX = thumbWidth / displayWidth;
      const scaleY = thumbHeight / displayHeight;
      
      // Scale the requested region coordinates to match the thumbnail scale
      const scaledRegion = {
        left: Math.round(args.x * scaleX),
        top: Math.round(args.y * scaleY),
        width: Math.round(args.width * scaleX),
        height: Math.round(args.height * scaleY)
      };
      
      log.debug('Scaling capture region to thumbnail size', {
        scaleX,
        scaleY,
        scaledRegion
      });

      // Use sharp to extract the region from the thumbnail
      const croppedBuffer = await sharp(thumbnailBuffer)
        .extract({
          left: scaledRegion.left,
          top: scaledRegion.top,
          width: scaledRegion.width,
          height: scaledRegion.height
        })
        .png()
        .toBuffer();
      
      // Create a Uint8Array from the buffer
      const pngBytes = new Uint8Array(croppedBuffer);
      
      // Add compatibility properties
      const result = pngBytes as CaptureRegionResult;
      result.success = true;
      result.timestamp = Date.now();
      
      // Add dataUrl for compatibility with existing code
      result.dataUrl = 'data:image/png;base64,' + croppedBuffer.toString('base64');
      
      // Add region info if available
      if ('name' in args) {
        result.region = args as CaptureRegion;
      }
      
      log.debug('Capture completed', {
        bytes: croppedBuffer.length
      });
      
      return result;
    } catch (error) {
      log.error('Error in captureRegion', {
        error
      });
      
      // Return a compatible error result
      const errorResult = new Uint8Array(0) as CaptureRegionResult;
      errorResult.success = false;
      errorResult.error = error instanceof Error ? error.message : String(error);
      errorResult.timestamp = Date.now();
      if ('name' in args) {
        errorResult.region = args as CaptureRegion;
      }
      return errorResult;
    }
  }
}

export default SafeCaptureService; 