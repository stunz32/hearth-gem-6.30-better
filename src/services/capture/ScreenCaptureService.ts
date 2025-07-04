import { desktopCapturer, screen, Rectangle, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger';
import { EventEmitter } from 'events';
import { RegionConfigService, CardRegion } from '../config/RegionConfigService';
import RegionDetector, { ScreenDetection } from './RegionDetector';
import sharp from 'sharp';
import { ICaptureRegionArgs, CaptureRegionResult, IScreenCaptureService } from '../../types/capture';
import type { CapturedRegionResult } from '../../types/capture';

// Create a logger instance for this module
const logger = getLogger('services/capture/ScreenCaptureService');

/**
 * Interface for capture region
 */
export interface CaptureRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  relative?: boolean;
}

/**
 * Interface for capture result
 */
export interface CaptureResult {
  dataUrl: string;
  region: CaptureRegion;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Interface for image preprocessing options
 */
export interface PreprocessingOptions {
  enhanceContrast: boolean;
  sharpen: boolean;
  binarize: boolean;
  scaleUp: boolean;
  scaleUpFactor: number;
}

/**
 * ScreenCaptureService
 * Handles capturing screenshots of the Hearthstone window
 * @module ScreenCaptureService
 */
export class ScreenCaptureService extends EventEmitter implements IScreenCaptureService {
  // Static instance for singleton pattern
  private static instance: ScreenCaptureService | null = null;
  
  // Static method for getting the singleton instance
  static getInstance(): ScreenCaptureService {
    if (!ScreenCaptureService.instance) {
      ScreenCaptureService.instance = new ScreenCaptureService();
    }
    return ScreenCaptureService.instance;
  }
  
  private static readonly HEARTHSTONE_WINDOW_TITLE = 'Hearthstone';
  private hearthstoneWindowId: string | null = null;
  private lastWindowBounds: Rectangle | null = null;
  private cardNameRegions: CaptureRegion[] = [];
  private defaultPreprocessingOptions: PreprocessingOptions = {
    enhanceContrast: true,
    sharpen: true,
    binarize: true,
    scaleUp: true,
    scaleUpFactor: 2
  };
  private regionConfigService: RegionConfigService;
  private regionDetector: RegionDetector;
  private manualRegions: CardRegion[] | null = null;
  private screenSize: { width: number; height: number } | null = null;
  private screenDetection: ScreenDetection | null = null;
  
  /**
   * Creates a new ScreenCaptureService instance
   */
  constructor() {
    super();
    this.regionConfigService = new RegionConfigService();
    this.regionDetector = new RegionDetector();
    this.initializeRegions();
    logger.info('ScreenCaptureService initialized');
    
    // Define default card name regions (relative to Hearthstone window)
    // These will need to be adjusted based on actual Hearthstone UI
    this.defineCardNameRegions();
    
    // Try to load saved screen detection
    this.loadScreenDetection();
  }
  
  /**
   * Initialize regions from saved configuration
   */
  private async initializeRegions(): Promise<void> {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      this.screenSize = primaryDisplay.size;
      
      this.manualRegions = await this.regionConfigService.getCurrentRegions(this.screenSize);
      
      if (this.manualRegions) {
        logger.info('Loaded manual card regions', { 
          regionCount: this.manualRegions.length,
          screenSize: this.screenSize 
        });
      } else {
        logger.info('No manual regions configured, will use automatic detection');
      }
    } catch (error) {
      logger.error('Error initializing regions', { error });
    }
  }
  
  /**
   * Update manual regions configuration
   */
  async updateManualRegions(regions: CardRegion[]): Promise<void | boolean> {
    try {
      // First, update the regions in the RegionConfigService
      if (!this.screenSize) {
        const primaryDisplay = screen.getPrimaryDisplay();
        this.screenSize = primaryDisplay.size;
      }

      await this.regionConfigService.saveConfig(regions, this.screenSize);
      this.manualRegions = regions;
      
      // Also update the cardNameRegions for immediate use
      if (regions && regions.length === 3) {
        this.cardNameRegions = regions.map((region, index) => ({
          name: `card${index + 1}`,
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
          // Mark as relative if the values are between 0-1
          relative: region.x <= 1 && region.y <= 1 && region.width <= 1 && region.height <= 1
        }));
        
        // Save to config file if possible
        try {
          const configPath = path.join(process.cwd(), 'data', 'config', 'regions.json');
          fs.mkdirSync(path.dirname(configPath), { recursive: true });
          fs.writeFileSync(configPath, JSON.stringify(this.cardNameRegions, null, 2));
          logger.info('Saved manual regions to config file');
        } catch (saveError) {
          logger.warn('Could not save manual regions to config file', { saveError });
          // Continue even if save fails
        }
      }
      
      logger.info('Manual regions updated', { regionCount: regions.length });
      return true;
    } catch (error) {
      logger.error('Error updating manual regions', { error });
      return false;
    }
  }
  
  /**
   * Check if manual regions are available and valid
   */
  async hasValidManualRegions(): Promise<boolean> {
    if (!this.screenSize) {
      const primaryDisplay = screen.getPrimaryDisplay();
      this.screenSize = primaryDisplay.size;
    }

    return await this.regionConfigService.hasValidRegions(this.screenSize);
  }
  
  /**
   * Define regions for card names in the Hearthstone UI
   * @private
   */
  private defineCardNameRegions(): void {
    // These are regions for capturing the full card art in Arena draft
    // Based on the screenshot showing the "Choose a Legendary Group for your deck" UI
    
    // Card 1 (left - The Lich King)
    this.cardNameRegions.push({
      name: 'card1',
      x: 0.12, // 12% from left edge of window
      y: 0.4,  // 40% from top edge of window
      width: 0.22, // 22% of window width
      height: 0.4  // 40% of window height
    });
    
    // Card 2 (middle - Xyrella)
    this.cardNameRegions.push({
      name: 'card2',
      x: 0.41, // 41% from left edge of window
      y: 0.4,  // 40% from top edge of window
      width: 0.22, // 22% of window width
      height: 0.4  // 40% of window height
    });
    
    // Card 3 (right - Tyrande)
    this.cardNameRegions.push({
      name: 'card3',
      x: 0.7,  // 70% from left edge of window
      y: 0.4,  // 40% from top edge of window
      width: 0.22, // 22% of window width
      height: 0.4  // 40% of window height
    });
    
    logger.info('Card name regions defined', { regions: this.cardNameRegions });
  }
  
  /**
   * Find the Hearthstone window
   * @returns Promise resolving to true if window found, false otherwise
   */
  public async findHearthstoneWindow(): Promise<boolean> {
    try {
      // Use the RegionDetector to find the Hearthstone window
      const found = await this.regionDetector.findHearthstoneWindow();
      
      if (found) {
        // If we found the window, update our window ID
        this.hearthstoneWindowId = 'found'; // Just a placeholder, we don't need the actual ID
        
        // Try to get window bounds
        await this.updateWindowBounds();
        
        return true;
      } else {
        // If testing/development, use any available window
        if (process.env.NODE_ENV === 'development') {
          logger.info('Development mode: Using fallback window');
          this.hearthstoneWindowId = 'dev-fallback';
          await this.updateWindowBounds();
          return true;
        }
        
        this.hearthstoneWindowId = null;
        this.lastWindowBounds = null;
        return false;
      }
    } catch (error) {
      logger.error('Error finding Hearthstone window', { error });
      this.hearthstoneWindowId = null;
      this.lastWindowBounds = null;
      return false;
    }
  }
  
  /**
   * Update the stored Hearthstone window bounds
   * @private
   */
  private async updateWindowBounds(): Promise<void> {
    // In development mode, use a fallback window size
    if (process.env.NODE_ENV === 'development' && !this.lastWindowBounds) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const width = 1024;
      const height = 768;
      
      this.lastWindowBounds = {
        x: Math.round(primaryDisplay.workArea.x + (primaryDisplay.workArea.width - width) / 2),
        y: Math.round(primaryDisplay.workArea.y + (primaryDisplay.workArea.height - height) / 2),
        width,
        height
      };
      
      logger.info('Using fallback window bounds in development mode', { bounds: this.lastWindowBounds });
      return;
    }
    
    // If we have a screen detection, use those bounds
    if (this.screenDetection && this.screenDetection.screenIndex >= 0) {
      const display = screen.getAllDisplays()[this.screenDetection.screenIndex];
      
      if (display) {
        // Use the first card region as a reference for the window position
        const cardRegion = this.screenDetection.cardRegions[0];
        
        // Estimate window bounds based on card region position
        // This is a simplification - in a real implementation, we'd use more sophisticated logic
        const width = Math.max(1024, cardRegion.x * 2 + cardRegion.width);
        const height = Math.max(768, cardRegion.y * 2 + cardRegion.height);
        
        this.lastWindowBounds = {
          x: display.bounds.x,
          y: display.bounds.y,
          width,
          height
        };
        
        logger.info('Updated Hearthstone window bounds from screen detection', { bounds: this.lastWindowBounds });
        return;
      }
    }
    
    // Fallback to using the primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const width = 1024;
    const height = 768;
    
    this.lastWindowBounds = {
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width,
      height
    };
    
    logger.info('Using fallback window bounds', { bounds: this.lastWindowBounds });
  }
  
  /**
   * Calculate absolute region coordinates based on relative positions and window bounds
   * @param region Relative region definition
   * @returns Absolute region coordinates
   * @private
   */
  private calculateAbsoluteRegion(region: CaptureRegion): CaptureRegion {
    if (!this.lastWindowBounds) {
      throw new Error('Window bounds not available');
    }
    
    // Determine if the region is expressed as relative (0-1) or absolute pixels.
    const isRelative =
      region.x > 0 && region.x < 1 &&
      region.y > 0 && region.y < 1 &&
      region.width  > 0 && region.width  <= 1 &&
      region.height > 0 && region.height <= 1;

    let absoluteRegion: CaptureRegion;

    if (isRelative) {
      // Convert relative coordinates to absolute pixels
      absoluteRegion = {
      name: region.name,
        x: Math.round(this.lastWindowBounds.x + this.lastWindowBounds.width  * region.x),
      y: Math.round(this.lastWindowBounds.y + this.lastWindowBounds.height * region.y),
        width:  Math.round(this.lastWindowBounds.width  * region.width),
      height: Math.round(this.lastWindowBounds.height * region.height)
    };
    } else {
      // Already absolute; just offset by window origin
      absoluteRegion = {
        name: region.name,
        x: Math.round(this.lastWindowBounds.x + region.x),
        y: Math.round(this.lastWindowBounds.y + region.y),
        width:  Math.round(region.width),
        height: Math.round(region.height)
      };
    }
    
    return absoluteRegion;
  }
  
  /**
   * Get capture regions for card detection
   */
  async getCaptureRegions(): Promise<CaptureRegion[]> {
    // Prefer saved screen-detection results if available
    if (this.screenDetection && this.screenDetection.cardRegions.length === 3) {
      logger.info('Using saved screen regions – skipping automatic detection');
      return this.screenDetection.cardRegions.map((region, index) => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        name: `card${index + 1}`
      }));
    }
    
    // Fall back to built-in heuristic regions so the user can at least capture something.
    logger.warn('No saved screen detection available – falling back to heuristic regions');
    const fallback = this.getAutomaticCaptureRegions();
    // Attempt to persist these as the current manual regions for future runs
    try {
      await this.updateManualRegions(fallback.map((r, i) => ({
        cardIndex: i,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height
      })));
    } catch (err) {
      logger.error('Failed to save fallback regions', { err });
    }
    return fallback;
  }
  
  /**
   * Automatic region detection (fallback method)
   */
  private getAutomaticCaptureRegions(): CaptureRegion[] {
    if (!this.screenSize) {
      const primaryDisplay = screen.getPrimaryDisplay();
      this.screenSize = primaryDisplay.size;
    }

    const { width, height } = this.screenSize;
    
    // Default regions for 1920x1080 screens (scaled proportionally)
    const baseWidth = 1920;
    const baseHeight = 1080;
    
    const scaleX = width / baseWidth;
    const scaleY = height / baseHeight;
    
    const cardWidth = Math.floor(200 * scaleX);
    const cardHeight = Math.floor(300 * scaleY);
    
    // Assume cards are in the center area of the screen
    const centerX = width / 2;
    const centerY = height / 2;
    
    const spacing = Math.floor(220 * scaleX);
    
    return [
      {
        name: 'card1',
        x: Math.floor(centerX - spacing - cardWidth / 2),
        y: Math.floor(centerY - cardHeight / 2),
        width: cardWidth,
        height: cardHeight
      },
      {
        name: 'card2',
        x: Math.floor(centerX - cardWidth / 2),
        y: Math.floor(centerY - cardHeight / 2),
        width: cardWidth,
        height: cardHeight
      },
      {
        name: 'card3',
        x: Math.floor(centerX + spacing - cardWidth / 2),
        y: Math.floor(centerY - cardHeight / 2),
        width: cardWidth,
        height: cardHeight
      }
    ];
  }
  
  /**
   * Captures a specific region of the screen using the new safe method
   * Uses a safe thumbnail size to avoid Skia bitmap allocation crashes
   * 
   * @param args Region coordinates and dimensions
   * @returns Promise resolving to raw PNG bytes
   */
  public async captureRegion(args: ICaptureRegionArgs): Promise<CaptureRegionResult> {
    try {
      // Get the primary display information
      const primaryDisplay = screen.getPrimaryDisplay();
      const { bounds, scaleFactor } = primaryDisplay;
      const { width: displayWidth, height: displayHeight } = bounds;
      
      // Calculate safe thumbnail size (physical resolution ÷ DPI scale)
      const thumbWidth = Math.round(displayWidth / scaleFactor);
      const thumbHeight = Math.round(displayHeight / scaleFactor);
      
      logger.debug(`Requested screen capture - displayWidth: ${displayWidth}, displayHeight: ${displayHeight}, scaleFactor: ${scaleFactor}, thumbWidth: ${thumbWidth}, thumbHeight: ${thumbHeight}, captureArgs: ${JSON.stringify(args)}`);

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
      
      logger.debug(`Scaling capture region to thumbnail size - scaleX: ${scaleX}, scaleY: ${scaleY}, scaledRegion: ${JSON.stringify(scaledRegion)}`);

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
      
      logger.debug(`Capture completed successfully - originalSize: ${thumbnailBuffer.length}, croppedSize: ${croppedBuffer.length}`);
      
      // Build a full capture result that includes both raw bytes and metadata expected by callers
      const rawBytes = new Uint8Array(croppedBuffer);
      const dataUrl = `data:image/png;base64,${Buffer.from(croppedBuffer).toString('base64')}`;

      // Attach the extra properties to the Uint8Array instance so it satisfies CaptureRegionResult & CaptureResult
      const captureResult: any = rawBytes;
      captureResult.dataUrl = dataUrl;
      captureResult.region = args;
      captureResult.timestamp = Date.now();
      captureResult.success = true;

      return captureResult as unknown as CaptureRegionResult;
    } catch (error) {
      logger.error(`Error capturing screen region: ${error}`);
      throw error;
    }
  }
  
  /**
   * Preprocess an image to improve OCR accuracy
   * @param dataUrl Image data URL to process
   * @param options Preprocessing options
   * @returns Promise resolving to processed image data URL
   * @private
   */
  private async preprocessImage(dataUrl: string, options: PreprocessingOptions = this.defaultPreprocessingOptions): Promise<string> {
    try {
      // Create an image element to load the data URL
      const img = new Image();
      
      // Create a promise that resolves when the image loads
      const imageLoaded = new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = dataUrl;
      });
      
      // Wait for the image to load
      const loadedImg = await imageLoaded;
      
      // Create a canvas to process the image
      const canvas = document.createElement('canvas');
      
      // Scale up if requested (helps OCR with small text)
      let width = loadedImg.width;
      let height = loadedImg.height;
      
      if (options.scaleUp) {
        width *= options.scaleUpFactor;
        height *= options.scaleUpFactor;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      // Draw the image on the canvas with scaling if needed
      ctx.drawImage(loadedImg, 0, 0, width, height);
      
      // Get image data for processing
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      // Apply image processing
      if (options.enhanceContrast) {
        this.enhanceContrast(data);
      }
      
      if (options.sharpen) {
        this.sharpenImage(ctx, imageData);
      }
      
      if (options.binarize) {
        this.binarizeImage(data);
      }
      
      // Put the processed image data back on the canvas
      ctx.putImageData(imageData, 0, 0);
      
      // Convert the canvas back to a data URL
      const processedDataUrl = canvas.toDataURL('image/png');
      
      logger.debug('Image preprocessed successfully');
      return processedDataUrl;
    } catch (error) {
      logger.error('Error preprocessing image', { error });
      // Return original image if processing fails
      return dataUrl;
    }
  }
  
  /**
   * Enhance contrast in an image
   * @param data Image data array
   * @private
   */
  private enhanceContrast(data: Uint8ClampedArray): void {
    // Find min and max values for auto-contrast
    let min = 255;
    let max = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Convert to grayscale using luminance formula
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      if (gray < min) min = gray;
      if (gray > max) max = gray;
    }
    
    // Skip if there's no range to adjust
    if (min === max) return;
    
    // Apply contrast stretching
    const range = max - min;
    for (let i = 0; i < data.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        // Stretch each color channel
        data[i + j] = Math.min(255, Math.max(0, 
          Math.round(((data[i + j] - min) / range) * 255)
        ));
      }
    }
  }
  
  /**
   * Sharpen an image using a convolution kernel
   * @param ctx Canvas context
   * @param imageData Image data
   * @private
   */
  private sharpenImage(ctx: CanvasRenderingContext2D, imageData: ImageData): void {
    // Create a temporary canvas for the sharpening operation
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) {
      logger.error('Failed to get temporary canvas context for sharpening');
      return;
    }
    
    // Put the original image data on the temporary canvas
    tempCtx.putImageData(imageData, 0, 0);
    
    // Apply a sharpening filter using a convolution
    ctx.save();
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.globalAlpha = 0.5; // Adjust strength of sharpening
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
    
    // Get the sharpened image data
    const sharpenedData = ctx.getImageData(0, 0, imageData.width, imageData.height);
    
    // Copy the sharpened data back to the original imageData
    for (let i = 0; i < imageData.data.length; i++) {
      imageData.data[i] = sharpenedData.data[i];
    }
  }
  
  /**
   * Binarize an image (convert to black and white)
   * @param data Image data array
   * @private
   */
  private binarizeImage(data: Uint8ClampedArray): void {
    // Use Otsu's method to find optimal threshold
    const threshold = this.calculateOtsuThreshold(data);
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Convert to grayscale using luminance formula
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Apply threshold
      const value = gray < threshold ? 0 : 255;
      
      // Set RGB channels to the same value (black or white)
      data[i] = value;     // R
      data[i + 1] = value; // G
      data[i + 2] = value; // B
      // Alpha channel remains unchanged
    }
  }
  
  /**
   * Calculate optimal threshold using Otsu's method
   * @param data Image data array
   * @returns Optimal threshold value
   * @private
   */
  private calculateOtsuThreshold(data: Uint8ClampedArray): number {
    // Create histogram
    const histogram = new Array(256).fill(0);
    let pixelCount = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Convert to grayscale
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      histogram[gray]++;
      pixelCount++;
    }
    
    // Calculate sum and mean
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 0;
    
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      
      wF = pixelCount - wB;
      if (wF === 0) break;
      
      sumB += t * histogram[t];
      
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      
      // Calculate between-class variance
      const variance = wB * wF * (mB - mF) * (mB - mF);
      
      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }
    
    return threshold;
  }
  
  /**
   * Capture card name regions from the Hearthstone window
   * @param options Optional preprocessing options (partial or complete)
   * @returns Promise resolving to array of capture results
   */
  public async captureCardNameRegions(options?: Partial<PreprocessingOptions>): Promise<CaptureResult[]> {
    // Merge partial options with defaults if provided
    const preprocessingOptions = options ? { ...this.defaultPreprocessingOptions, ...options } : this.defaultPreprocessingOptions;
    try {
      // Find Hearthstone window if not already found
      if (!this.hearthstoneWindowId || !this.lastWindowBounds) {
        const found = await this.findHearthstoneWindow();
        if (!found) {
          logger.warn('Hearthstone window not found – falling back to primary display bounds');
          await this.updateWindowBounds();  // <-- generates a safe fallback
        }
      }
      
      // Log window bounds for debugging
      logger.info(`Window bounds for capture: ${JSON.stringify(this.lastWindowBounds)}`);
      
      const results: CaptureResult[] = [];
      
      // First, validate that we have regions to capture
      if (!this.cardNameRegions || this.cardNameRegions.length === 0) {
        logger.warn('No card name regions defined for capture');
        return results;
      }
      
      logger.info(`Starting capture of card name regions - count: ${this.cardNameRegions.length}`);
      
      // Convert each relative region → absolute pixels BEFORE capturing
      for (const region of this.cardNameRegions) {
        logger.info(`Processing region for capture: ${JSON.stringify(region)}`);
        
        try {
          const absRegion = this.calculateAbsoluteRegion(region);
          logger.info(`Calculated absolute region: ${JSON.stringify(absRegion)}`);
          
          const result = await this.captureRegion(absRegion);
          logger.info(`Capture result - success: ${result.success}, hasDataUrl: ${!!result.dataUrl}, dataUrlLength: ${result.dataUrl ? result.dataUrl.length : 0}`);
          
          if (result.success && result.dataUrl) {
            // Apply image preprocessing
            result.dataUrl = await this.preprocessImage(result.dataUrl, preprocessingOptions);
            logger.info(`After preprocessing - dataUrlLength: ${result.dataUrl ? result.dataUrl.length : 0}`);
          }
          
          // Explicitly construct a proper CaptureResult
          // Make sure dataUrl is properly formatted
          let formattedDataUrl = result.dataUrl || '';
          if (formattedDataUrl && !formattedDataUrl.startsWith('data:')) {
            formattedDataUrl = 'data:image/png;base64,' + formattedDataUrl;
          }
          
          const captureResult: CaptureResult = {
            dataUrl: formattedDataUrl,
            region: absRegion,
            timestamp: Date.now(),
            success: result.success || false
          };
          
          if (result.error) {
            captureResult.error = result.error;
          }
          
          results.push(captureResult);
        } catch (error) {
          logger.error(`Error capturing card name region ${region.name}: ${error}`);
          results.push({
            dataUrl: '',
            region: this.calculateAbsoluteRegion(region),
            timestamp: Date.now(),
            success: false,
            error: `Capture failed: ${error}`
          });
        }
      }
      
      return results;
    } catch (error) {
      logger.error(`Error capturing card name regions: ${error}`);
      return [];
    }
  }

  /**
   * Clear manual regions configuration
   */
  async clearManualRegions(): Promise<void | boolean> {
    try {
      // Clear the regions in the RegionConfigService
      await this.regionConfigService.clearConfig();
      this.manualRegions = null;
      
      // Also clear the cardNameRegions
      this.cardNameRegions = [];
      
      // Reset by using auto-detection
      const success = await this.detectCardRegions();
      
      // Clear any saved region config file
      try {
        const configPath = path.join(process.cwd(), 'data', 'config', 'regions.json');
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
          logger.info('Removed manual regions config file');
        }
      } catch (removeError) {
        logger.warn(`Could not remove manual regions config file: ${removeError}`);
      }
      
      logger.info(`Manual regions cleared - autoDetectionSuccess: ${success}`);
      return true;
    } catch (error) {
      logger.error(`Error clearing manual regions: ${error}`);
      return false;
    }
  }

  /**
   * Get region configuration service
   */
  getRegionConfigService(): RegionConfigService {
    return this.regionConfigService;
  }
  
  /**
   * Load saved screen detection
   */
  private async loadScreenDetection(): Promise<void> {
    try {
      const detection = await this.regionDetector.loadTemplateSettings();
      if (detection) {
        this.screenDetection = detection;
        logger.info('Loaded saved screen detection');
      } else {
        logger.info('No saved screen detection found');
      }
    } catch (error) {
      logger.error('Error loading screen detection', { error });
    }
  }
  
  /**
   * Detect card regions dynamically
   * This will attempt to find the card regions using template matching
   * @returns Promise resolving to true if regions were found, false otherwise
   */
  public async detectCardRegions(): Promise<boolean> {
    try {
      // Clear any saved screen detection settings to force new detection
      await this.regionDetector.clearTemplateSettings();
      
      // Clear the screen detection cache
      this.screenDetection = null;
      
      logger.info('Starting automatic card region detection');
      
      // Find the Hearthstone window first to make sure we're on the right display
      await this.findHearthstoneWindow();
      
      // Find screen regions - this will use image template matching if available
      // or fall back to heuristic detection
      this.screenDetection = await this.regionDetector.findScreenRegions();
      
      if (this.screenDetection && this.screenDetection.cardRegions.length === 3) {
        logger.info('Successfully detected card regions automatically', {
          cardRegions: this.screenDetection.cardRegions.length
        });
        
        // Convert detected regions to card name regions
        this.cardNameRegions = this.screenDetection.cardRegions.map((region, index) => ({
          name: `card${index + 1}`,
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
          relative: false
        }));
        
        return true;
      } else {
        // If automatic detection fails, fall back to default regions
        logger.warn('Automatic detection failed, falling back to default regions');
        this.defineCardNameRegions();
        return false;
      }
    } catch (error) {
      logger.error('Error during card region detection', { error });
      // Fall back to default regions in case of error
      this.defineCardNameRegions();
      return false;
    }
  }
  
  /**
   * Get mana crystal regions
   * @returns Array of mana crystal regions
   */
  public getManaRegions(): CaptureRegion[] {
    if (this.screenDetection && this.screenDetection.manaRegions.length === 3) {
      return this.screenDetection.manaRegions.map((region, index) => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        name: `mana${index + 1}`
      }));
    }
    
    return [];
  }
  
  /**
   * Get rarity gem regions
   * @returns Array of rarity gem regions
   */
  public getRarityRegions(): CaptureRegion[] {
    if (this.screenDetection && this.screenDetection.rarityRegions.length === 3) {
      return this.screenDetection.rarityRegions.map((region, index) => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        name: `rarity${index + 1}`
      }));
    }
    
    return [];
  }

  /**
   * Initialize the screen capture service and register IPC handlers
   */
  public initialize(): void {
    this.registerIpcHandlers();
    logger.info('Screen capture service initialized');
  }

  /**
   * Register IPC handlers for screen capture
   */
  private registerIpcHandlers(): void {
    ipcMain.handle('CAPTURE_REGION', async (_, args: ICaptureRegionArgs) => {
      try {
        // If args has x, y, width, height properties but no name, it's the new format
        if (args.x !== undefined && args.y !== undefined && 
            args.width !== undefined && args.height !== undefined && 
            args.name === undefined) {
          // Use the new safe capture method
          const pngBuffer = await this.captureSafeRegion(args);
          return pngBuffer;
        } else {
          // Use the original capture method for compatibility
          return await this.captureRegion(args);
        }
      } catch (error) {
        logger.error(`Error in CAPTURE_REGION handler: ${error}`);
        throw error;
      }
    });

    ipcMain.handle('captureRegions', async () => {
        logger.info('captureRegions IPC invoked');
        try {
            const results: CapturedRegionResult[] = await this.captureCardNameRegions();
            
            // Log detailed info about each result
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                logger.info(`Capture result details - index: ${i}, name: ${result.region?.name}, success: ${result.success}, hasDataUrl: ${!!result.dataUrl}, dataUrlLength: ${result.dataUrl ? result.dataUrl.length : 0}`);
            }
            
            logger.info(`captureRegions complete - count: ${results.length}`);
            return results;
        } catch (error) {
            logger.error(`Error in captureRegions handler: ${error}`);
            throw error;
        }
    });
    
    // Add handlers for manual region configuration
    ipcMain.handle('saveManualRegions', async (_, regions: CardRegion[]) => {
        logger.info(`saveManualRegions IPC invoked - regionCount: ${regions.length}`);
        try {
            await this.updateManualRegions(regions);
            return true;
        } catch (error) {
            logger.error(`Error in saveManualRegions handler: ${error}`);
            throw error;
        }
    });
    
    ipcMain.handle('clearManualRegions', async () => {
        logger.info('clearManualRegions IPC invoked');
        try {
            await this.clearManualRegions();
            return true;
        } catch (error) {
            logger.error(`Error in clearManualRegions handler: ${error}`);
            throw error;
        }
    });
    
    // Add handler for automatic region detection
    ipcMain.handle('detectCardRegions', async () => {
        logger.info('detectCardRegions IPC invoked');
        try {
            const result = await this.detectCardRegions();
            return result;
        } catch (error) {
            logger.error(`Error in detectCardRegions handler: ${error}`);
            throw error;
        }
    });
    
    ipcMain.handle('findHearthstoneWindow', async () => {
        logger.info('findHearthstoneWindow IPC invoked');
        try {
            const result = await this.findHearthstoneWindow();
            return result;
        } catch (error) {
            logger.error(`Error in findHearthstoneWindow handler: ${error}`);
            throw error;
        }
    });

    logger.debug('IPC handlers registered for screen capture');
  }

  /**
   * Captures a specific region of the screen using the new safe method
   * Uses a safe thumbnail size to avoid Skia bitmap allocation crashes
   * 
   * @param args Region coordinates and dimensions
   * @returns Promise resolving to raw PNG bytes
   */
  public async captureSafeRegion(args: { x: number; y: number; width: number; height: number }): Promise<Uint8Array> {
    try {
      // Get the primary display information
      const primaryDisplay = screen.getPrimaryDisplay();
      const { bounds, scaleFactor } = primaryDisplay;
      const { width: displayWidth, height: displayHeight } = bounds;
      
      // Calculate safe thumbnail size (physical resolution ÷ DPI scale)
      const thumbWidth = Math.round(displayWidth / scaleFactor);
      const thumbHeight = Math.round(displayHeight / scaleFactor);
      
      logger.debug(`Requested screen capture - displayWidth: ${displayWidth}, displayHeight: ${displayHeight}, scaleFactor: ${scaleFactor}, thumbWidth: ${thumbWidth}, thumbHeight: ${thumbHeight}, captureArgs: x=${args.x}, y=${args.y}, width=${args.width}, height=${args.height}`);

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
      
      logger.debug(`Scaling capture region to thumbnail size - scaleX: ${scaleX}, scaleY: ${scaleY}, scaledRegion: left=${scaledRegion.left}, top=${scaledRegion.top}, width=${scaledRegion.width}, height=${scaledRegion.height}`);

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
      
      logger.debug(`Capture completed successfully - originalSize: ${thumbnailBuffer.length}, croppedSize: ${croppedBuffer.length}`);
      
      return new Uint8Array(croppedBuffer);
    } catch (error) {
      logger.error(`Error capturing screen region: ${error}`);
      throw error;
    }
  }
}

// Create a singleton instance outside the class
let instance: ScreenCaptureService | null = null;

export default ScreenCaptureService;
