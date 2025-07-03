import { desktopCapturer, screen, ipcMain } from 'electron';
import { ICaptureRegionArgs, CaptureRegionResult, IScreenCaptureService } from '../../types/capture';
import sharp from 'sharp';
import pino from 'pino';

// Create a logger instance
const log = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

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
    this.registerIpcHandlers();
    log.info('Safe capture service initialized');
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
    ipcMain.handle('CAPTURE_REGION', async (_, args: ICaptureRegionArgs) => {
      return this.captureRegion(args);
    });

    log.debug('IPC handlers registered for safe screen capture');
  }

  /**
   * Captures a specific region of the screen
   * Uses a safe thumbnail size to avoid Skia bitmap allocation crashes
   * 
   * @param args Region coordinates and dimensions
   * @returns Promise resolving to raw PNG bytes
   */
  public async captureRegion(args: ICaptureRegionArgs): Promise<CaptureRegionResult> {
    try {
      // Get the primary display information
      const primaryDisplay = screen.getPrimaryDisplay();
      const displayWidth = primaryDisplay.bounds.width;
      const displayHeight = primaryDisplay.bounds.height;
      const scaleFactor = primaryDisplay.scaleFactor;
      
      // Calculate safe thumbnail size (physical resolution ÷ DPI scale)
      const thumbWidth = Math.round(displayWidth / scaleFactor);
      const thumbHeight = Math.round(displayHeight / scaleFactor);
      
      log.debug({
        displayWidth,
        displayHeight,
        scaleFactor,
        thumbWidth,
        thumbHeight,
        args
      }, 'Requested capture');
      
      // If the region is outside the primary display, find the correct display
      let targetDisplay = primaryDisplay;
      if (screen.getAllDisplays().length > 1) {
        const point = { x: args.x + (args.width / 2), y: args.y + (args.height / 2) };
        const nearestDisplay = screen.getDisplayNearestPoint(point);
        if (nearestDisplay.id !== primaryDisplay.id) {
          targetDisplay = nearestDisplay;
          log.debug({
            displayId: targetDisplay.id,
            bounds: targetDisplay.bounds
          }, 'Using non-primary display for capture');
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
        throw new Error('No screen sources available for capture');
      }

      // Get the primary screen source
      const source = sources[0];
      
      // Get the thumbnail as NativeImage
      const thumbnail = source.thumbnail;
      
      if (!thumbnail) {
        throw new Error('Failed to capture screen thumbnail');
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
      
      log.debug({
        scaleX,
        scaleY,
        scaledRegion
      }, 'Scaling capture region to thumbnail size');

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
      
      log.debug({
        bytes: croppedBuffer.length
      }, 'Capture completed');
      
      return new Uint8Array(croppedBuffer);
    } catch (error) {
      log.error({
        error
      }, 'Error in captureRegion');
      throw error;
    }
  }
}

export default SafeCaptureService; 