import { desktopCapturer, screen, Rectangle } from 'electron';
import logger from '../../utils/logger';
import { EventEmitter } from 'events';
import { RegionConfigService, CardRegion } from '../config/RegionConfigService';
import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D, ImageData } from 'canvas';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
// -------- Super-resolution (UpscalerJS) ------------
// We lazily create a single Upscaler instance (ESRGAN-Slim 3×) the first time it is needed.
// Use `any` typing to avoid TypeScript module resolution issues when type declarations are missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let upscalerInstance: any | null = null;
async function getUpscaler(): Promise<any> {
  if (upscalerInstance) {
    return upscalerInstance;
  }
  // Dynamic import keeps initial startup lightweight – heavy tfjs libs are loaded only when required.
  // Using "require" here because Electron main process can load CJS modules easily.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Upscaler = require('upscaler/node');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const x3 = require('@upscalerjs/esrgan-slim/3x');
  upscalerInstance = new Upscaler({ model: x3 });
  return upscalerInstance as any;
}

/**
 * Interface for capture region
 */
export interface CaptureRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
  grayscale: boolean;
  threshold: number;
  extractNameBanner: boolean;
}

/**
 * Maximum number of debug images to keep per region
 */
const MAX_DEBUG_IMAGES_PER_REGION = 15;

/**
 * Total maximum number of debug images across all regions
 */
const MAX_TOTAL_DEBUG_IMAGES = 50;

/**
 * ScreenCaptureService
 * Handles capturing screenshots of the Hearthstone window
 * @module ScreenCaptureService
 */
export class ScreenCaptureService extends EventEmitter {
  private static readonly HEARTHSTONE_WINDOW_TITLE = 'Hearthstone';
  private hearthstoneWindowId: string | null = null;
  private lastWindowBounds: Rectangle | null = null;
  private cardNameRegions: CaptureRegion[] = [];
  private defaultPreprocessingOptions: PreprocessingOptions = {
    enhanceContrast: true,
    sharpen: true,
    binarize: true,
    scaleUp: true,
    scaleUpFactor: 3,
    grayscale: true,
    threshold: 128,
    extractNameBanner: true
  };
  private regionConfigService: RegionConfigService;
  private manualRegions: CardRegion[] | null = null;
  private screenSize: { width: number; height: number } | null = null;
  private debugCaptureDir: string = '';
  private debugImageCounter: Map<string, number> = new Map();
  
  /**
   * Creates a new ScreenCaptureService instance
   */
  constructor() {
    super();
    this.regionConfigService = new RegionConfigService();
    this.initializeRegions();
    logger.info('ScreenCaptureService initialized');
    
    // Define default card name regions (relative to Hearthstone window)
    // These will need to be adjusted based on actual Hearthstone UI
    this.defineCardNameRegions();
    this.initializeDebugDirectory();
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
  async updateManualRegions(regions: CardRegion[]): Promise<void> {
    try {
      if (!this.screenSize) {
        const primaryDisplay = screen.getPrimaryDisplay();
        this.screenSize = primaryDisplay.size;
      }

      await this.regionConfigService.saveConfig(regions, this.screenSize);
      this.manualRegions = regions;
      
      logger.info('Manual regions updated', { regionCount: regions.length });
    } catch (error) {
      logger.error('Error updating manual regions', { error });
      throw error;
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
    // These are approximate regions for the card names in Arena draft
    // They will need to be adjusted based on actual UI and resolution
    
    // Card 1 (left)
    this.cardNameRegions.push({
      name: 'card1',
      x: 0.25, // 25% from left edge of window
      y: 0.65, // 65% from top edge of window
      width: 0.15, // 15% of window width
      height: 0.05 // 5% of window height
    });
    
    // Card 2 (middle)
    this.cardNameRegions.push({
      name: 'card2',
      x: 0.5, // 50% from left edge of window
      y: 0.65, // 65% from top edge of window
      width: 0.15, // 15% of window width
      height: 0.05 // 5% of window height
    });
    
    // Card 3 (right)
    this.cardNameRegions.push({
      name: 'card3',
      x: 0.75, // 75% from left edge of window
      y: 0.65, // 65% from top edge of window
      width: 0.15, // 15% of window width
      height: 0.05 // 5% of window height
    });
    
    logger.info('Card name regions defined', { regions: this.cardNameRegions });
  }
  
  /**
   * Find the Hearthstone window
   * @returns Promise resolving to true if window found, false otherwise
   */
  public async findHearthstoneWindow(): Promise<boolean> {
    try {
      logger.info('Looking for Hearthstone window');
      
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 }
      });
      
      // Find Hearthstone window by name
      const hearthstoneSource = sources.find(source => 
        source.name.includes(ScreenCaptureService.HEARTHSTONE_WINDOW_TITLE)
      );
      
      if (hearthstoneSource) {
        this.hearthstoneWindowId = hearthstoneSource.id;
        logger.info('Hearthstone window found', { id: this.hearthstoneWindowId });
        
        // Try to get window bounds
        await this.updateWindowBounds();
        
        return true;
      } else {
        logger.warn('Hearthstone window not found');
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
    if (!this.hearthstoneWindowId) {
      logger.warn('Cannot update window bounds, no Hearthstone window ID');
      return;
    }
    
    try {
      // Get all windows
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 150, height: 150 } // Small thumbnail to get dimensions
      });
      
      // Find Hearthstone window
      const hearthstoneSource = sources.find(source => source.id === this.hearthstoneWindowId);
      
      if (hearthstoneSource && hearthstoneSource.thumbnail) {
        // Get window dimensions from thumbnail
        const { width, height } = hearthstoneSource.thumbnail.getSize();
        
        // Get primary display info to calculate position
        const primaryDisplay = screen.getPrimaryDisplay();
        
        // For now, assume Hearthstone is on the primary display
        // A more sophisticated approach would determine which display the window is on
        
        // Create rectangle for window bounds
        this.lastWindowBounds = {
          x: Math.round(primaryDisplay.workArea.x + (primaryDisplay.workArea.width - width) / 2),
          y: Math.round(primaryDisplay.workArea.y + (primaryDisplay.workArea.height - height) / 2),
          width,
          height
        };
        
        logger.info('Updated Hearthstone window bounds', { bounds: this.lastWindowBounds });
      } else {
        logger.warn('Failed to get Hearthstone window bounds');
      }
    } catch (error) {
      logger.error('Error updating window bounds', { error });
    }
  }
  
  /**
   * Determine if a region is using absolute screen coordinates
   * A region is absolute if any of its coordinates is > 1.0 (indicating pixels rather than ratios)
   * @param region Region to check
   * @returns True when coordinates are already absolute
   * @private
   */
  private isAbsoluteRegion(region: CaptureRegion): boolean {
    return region.x > 1.0 || region.y > 1.0 || region.width > 1.0 || region.height > 1.0;
  }
  
  /**
   * Calculate absolute region coordinates based on relative positions and window bounds
   * @param region Relative region definition
   * @returns Absolute region coordinates
   * @private
   */
  private calculateAbsoluteRegion(region: CaptureRegion): CaptureRegion {
    // If coordinates are already absolute (>1.0), return as-is
    if (this.isAbsoluteRegion(region)) {
      return {
        name: region.name,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height
      };
    }
    
    if (!this.lastWindowBounds) {
      throw new Error('Window bounds not available');
    }
    
    // Convert relative coordinates to absolute
    const absoluteRegion: CaptureRegion = {
      name: region.name,
      x: Math.round(this.lastWindowBounds.x + this.lastWindowBounds.width * region.x),
      y: Math.round(this.lastWindowBounds.y + this.lastWindowBounds.height * region.y),
      width: Math.round(this.lastWindowBounds.width * region.width),
      height: Math.round(this.lastWindowBounds.height * region.height)
    };
    
    return absoluteRegion;
  }
  
  /**
   * Get capture regions for card detection
   */
  async getCaptureRegions(): Promise<CaptureRegion[]> {
    // Try to use manual regions first
    if (this.manualRegions && this.manualRegions.length === 3) {
      logger.debug('Using manually configured regions (absolute coordinates)');
      return this.manualRegions.map(region => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        name: `card${region.cardIndex}`
      }));
    }

    // Refresh manual regions in case they were updated
    await this.initializeRegions();
    
    if (this.manualRegions && this.manualRegions.length === 3) {
      logger.debug('Using refreshed manually configured regions (absolute coordinates)');
      return this.manualRegions.map(region => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        name: `card${region.cardIndex}`
      }));
    }

    // Fallback to automatic detection
    logger.warn('No manual regions available, using automatic detection (absolute coordinates)');
    return this.getAutomaticCaptureRegions();
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
   * Initialize the debug capture directory
   */
  private initializeDebugDirectory(): void {
    try {
      const userDataPath = app.getPath('userData');
      this.debugCaptureDir = path.join(userDataPath, 'debug-captures');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(this.debugCaptureDir)) {
        fs.mkdirSync(this.debugCaptureDir, { recursive: true });
        logger.debug('Created debug capture directory', { path: this.debugCaptureDir });
      }
      
      // Clean up old debug captures on startup
      this.cleanupDebugCaptures();
    } catch (error) {
      logger.error('Failed to initialize debug directory', { error });
    }
  }

  /**
   * Clean up old debug captures, keeping only the most recent MAX_TOTAL_DEBUG_IMAGES
   */
  private cleanupDebugCaptures(): void {
    try {
      if (!fs.existsSync(this.debugCaptureDir)) {
        return;
      }
      
      const files = fs.readdirSync(this.debugCaptureDir)
        .filter(file => file.endsWith('.png'))
        .map(file => ({
          name: file,
          path: path.join(this.debugCaptureDir, file),
          time: fs.statSync(path.join(this.debugCaptureDir, file)).mtimeMs
        }));
      
      // Group by region (card1, card2, card3)
      const regionFiles: Record<string, typeof files> = {};
      
      for (const file of files) {
        // Extract region name (e.g., "card1" from "card1-123456.png")
        const regionMatch = file.name.match(/^([^-]+)-/);
        if (regionMatch) {
          const region = regionMatch[1];
          if (!regionFiles[region]) {
            regionFiles[region] = [];
          }
          regionFiles[region].push(file);
        }
      }
      
      // Clean up each region, keeping only MAX_DEBUG_IMAGES_PER_REGION most recent files
      for (const region in regionFiles) {
        const regionFileList = regionFiles[region]
          .sort((a, b) => b.time - a.time); // Sort by time descending
        
        // Delete old files for this region
        if (regionFileList.length > MAX_DEBUG_IMAGES_PER_REGION) {
          const filesToDelete = regionFileList.slice(MAX_DEBUG_IMAGES_PER_REGION);
          for (const file of filesToDelete) {
            fs.unlinkSync(file.path);
            logger.debug('Deleted old debug capture', { file: file.name });
          }
        }
      }
      
      // Check if we still have too many total images
      const remainingFiles = fs.readdirSync(this.debugCaptureDir)
        .filter(file => file.endsWith('.png'))
        .map(file => ({
          name: file,
          path: path.join(this.debugCaptureDir, file),
          time: fs.statSync(path.join(this.debugCaptureDir, file)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time); // Sort by time descending
      
      if (remainingFiles.length > MAX_TOTAL_DEBUG_IMAGES) {
        const filesToDelete = remainingFiles.slice(MAX_TOTAL_DEBUG_IMAGES);
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path);
          logger.debug('Deleted excess debug capture', { file: file.name });
        }
      }
      
      logger.info('Cleaned up debug captures', { 
        kept: Math.min(remainingFiles.length, MAX_TOTAL_DEBUG_IMAGES),
        deleted: Math.max(0, files.length - MAX_TOTAL_DEBUG_IMAGES)
      });
    } catch (error) {
      logger.error('Failed to cleanup debug captures', { error });
    }
  }

  /**
   * Save a debug capture image to disk
   * @param region The region that was captured
   * @param dataUrl The image data URL
   */
  private saveDebugCapture(region: CaptureRegion, dataUrl: string): void {
    if (!this.debugCaptureDir) {
      return;
    }
    
    try {
      // Increment counter for this region
      const regionName = region.name || 'unknown';
      const counter = (this.debugImageCounter.get(regionName) || 0) + 1;
      this.debugImageCounter.set(regionName, counter);
      
      // Only save every 5th image to reduce disk usage
      if (counter % 5 !== 0) {
        return;
      }
      
      const timestamp = Date.now();
      const fileName = `${regionName}-${timestamp}.png`;
      const filePath = path.join(this.debugCaptureDir, fileName);
      
      // Convert data URL to buffer
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Write file
      fs.writeFileSync(filePath, buffer);
      logger.debug('Saved debug capture', { file: fileName });
      
      // Clean up if we have too many files
      if (counter % 15 === 0) {
        this.cleanupDebugCaptures();
      }
    } catch (error) {
      logger.error('Failed to save debug capture', { error });
    }
  }
  
  /**
   * Crop a thumbnail to the specified rectangle
   * @param thumbnail The thumbnail to crop
   * @param rect The rectangle to crop from the thumbnail
   * @returns Data URL of the cropped thumbnail
   */
  private cropThumbnail(thumbnail: Electron.NativeImage, rect: Rectangle): string {
    try {
      // Crop the thumbnail
      const croppedImage = thumbnail.crop(rect);
      
      // Convert to data URL
      const dataUrl = croppedImage.toDataURL();
      
      return dataUrl;
    } catch (error) {
      logger.error('Error cropping thumbnail', { error, rect });
      throw error;
    }
  }
  
  /**
   * Capture a specific region of the screen
   * @param region Region to capture
   * @returns Promise resolving to capture result
   */
  public async captureRegion(region: CaptureRegion): Promise<CaptureResult> {
    try {
      // Find Hearthstone window if not already found
      if (!this.hearthstoneWindowId || !this.lastWindowBounds) {
        const found = await this.findHearthstoneWindow();
        if (!found) {
          return {
            dataUrl: '',
            region,
            timestamp: Date.now(),
            success: false,
            error: 'Hearthstone window not found'
          };
        }
      }
      
      // Calculate absolute region coordinates
      const absoluteRegion = this.calculateAbsoluteRegion(region);

      // Log region coordinates for debugging
      logger.debug('Capturing region', { 
        name: region.name,
        original: region,
        computed: absoluteRegion,
        isAbsoluteCoordinates: this.isAbsoluteRegion(region)
      });

      // Get desktop capture sources
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: screen.getPrimaryDisplay().workAreaSize.width,
          height: screen.getPrimaryDisplay().workAreaSize.height
        }
      });
      
      if (!sources || sources.length === 0) {
        logger.error('No screen sources available for capture');
        return {
          dataUrl: '',
          region,
          timestamp: Date.now(),
          success: false,
          error: 'No screen sources available'
        };
      }
      
      // Find primary display source
      const primarySource = sources.find(s => s.display_id?.toString() === screen.getPrimaryDisplay().id.toString()) || sources[0];
      
      if (!primarySource || !primarySource.thumbnail) {
        logger.error('Primary source or thumbnail not available');
        return {
          dataUrl: '',
          region,
          timestamp: Date.now(),
          success: false,
          error: 'Screen capture failed'
        };
      }
      
      // Get thumbnail as data URL
      const thumbnail = primarySource.thumbnail;
      const rect = {
        x: Math.floor(absoluteRegion.x),
        y: Math.floor(absoluteRegion.y),
        width: Math.floor(absoluteRegion.width),
        height: Math.floor(absoluteRegion.height)
      };
      
      // Crop the region from the thumbnail
      const croppedDataUrl = this.cropThumbnail(thumbnail, rect);
      
      // Save debug capture
      this.saveDebugCapture(region, croppedDataUrl);
      
      // Return the result
      return {
        dataUrl: croppedDataUrl,
        region,
        timestamp: Date.now(),
        success: true
      };
    } catch (error) {
      logger.error('Error capturing region', { error, region });
      return {
        dataUrl: '',
        region,
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Preprocesses a card image by extracting just the name banner region
   * This helps OCR focus only on the most relevant text area
   * @param dataUrl Source image data URL
   * @param options Preprocessing options
   * @returns Processed image data URL focusing on card name area
   * @private
   */
  private async preprocessCardNameBanner(dataUrl: string, options: PreprocessingOptions): Promise<string> {
    try {
      // Load image
      const image = await loadImage(dataUrl);
      
      // Calculate name banner region (approximately 12-29% from the top of card)
      const nameStartY = Math.round(image.height * 0.12);
      const nameHeight = Math.round(image.height * 0.17);
      
      // Create canvas and get context
      const canvas = createCanvas(image.width, nameHeight);
      const ctx = canvas.getContext('2d');
      
      // Draw just the name region to the canvas
      ctx.drawImage(image, 
        0, nameStartY, image.width, nameHeight, // source rectangle
        0, 0, image.width, nameHeight           // destination rectangle
      );
      
      // Apply additional preprocessing
      if (options.grayscale) {
        this.convertToGrayscale(ctx, canvas.width, canvas.height);
      }
      
      if (options.sharpen) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.sharpenImage(ctx, imageData);
      }
      
      if (options.threshold > 0) {
        this.applyThreshold(ctx, canvas.width, canvas.height, options.threshold);
      }
      
      // If scaleUp is requested, perform super-resolution before returning
      let processedDataUrl = canvas.toDataURL();

      if (options.scaleUp && image.width * options.scaleUpFactor < 600) {
        try {
          const upscaler = await getUpscaler();
          // Convert the current canvas PNG buffer into base64, then upscale
          const inputBuffer = Buffer.from(processedDataUrl.split(',')[1], 'base64');
          const upscaledBase64: string = await upscaler.upscale(inputBuffer, {
            output: 'base64'
          });
          processedDataUrl = `data:image/png;base64,${upscaledBase64}`;
          logger.debug('Applied super-resolution upscaling to name banner', {
            originalWidth: image.width,
            upscaledDataUrlLength: processedDataUrl.length
          });
        } catch (srError) {
          logger.warn('Super-resolution upscaling failed, falling back to original', { srError });
        }
      }
      
      logger.debug('Preprocessed card name banner', { 
        originalWidth: image.width,
        originalHeight: image.height,
        nameBannerHeight: nameHeight,
        nameBannerY: nameStartY
      });
      
      return processedDataUrl;
    } catch (error) {
      logger.error('Error preprocessing card name banner', error);
      return dataUrl; // Return original if processing fails
    }
  }

  /**
   * Preprocesses image for better OCR recognition
   * @param dataUrl Source image data URL
   * @param options Preprocessing options
   * @returns Processed image data URL
   * @private
   */
  private async preprocessImage(dataUrl: string, options: PreprocessingOptions = this.defaultPreprocessingOptions): Promise<string> {
    try {
      // Try optimized card name banner extraction for better OCR
      if (options.extractNameBanner) {
        return this.preprocessCardNameBanner(dataUrl, options);
      }
      
      // Original preprocessing pipeline if name banner extraction is disabled
      const image = await loadImage(dataUrl);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      
      // Draw image onto canvas
      ctx.drawImage(image, 0, 0);
      
      // Apply preprocessing steps
      if (options.grayscale) {
        this.convertToGrayscale(ctx, canvas.width, canvas.height);
      }
      
      if (options.sharpen) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.sharpenImage(ctx, imageData);
      }
      
      if (options.threshold > 0) {
        this.applyThreshold(ctx, canvas.width, canvas.height, options.threshold);
      }
      
      return canvas.toDataURL();
    } catch (error) {
      logger.error('Error preprocessing image', error);
      return dataUrl;
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
    const tempCanvas = createCanvas(imageData.width, imageData.height);
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) {
      logger.error('Failed to get temporary canvas context for sharpening');
      return;
    }
    
    // Put the original image data on the temporary canvas
    tempCtx.putImageData(imageData, 0, 0);
    
    // Apply a sharpening filter using a convolution
    ctx.save();
    ctx.drawImage(tempCanvas as unknown as Canvas, 0, 0);
    ctx.globalAlpha = 0.5; // Adjust strength of sharpening
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(tempCanvas as unknown as Canvas, 0, 0);
    ctx.restore();
    
    // Get the sharpened image data
    const sharpenedData = ctx.getImageData(0, 0, imageData.width, imageData.height);
    
    // Copy the sharpened data back to the original imageData
    for (let i = 0; i < imageData.data.length; i++) {
      imageData.data[i] = sharpenedData.data[i];
    }
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
          logger.warn('Failed to find Hearthstone window for card name capture');
          return [];
        }
      }
      
      const results: CaptureResult[] = [];
      
      // Get the appropriate regions based on current configuration (manual or automatic)
      const regions = await this.getCaptureRegions();
      logger.info(`Capturing ${regions.length} card regions`, {
        regionCount: regions.length,
        regionNames: regions.map(r => r.name)
      });
      
      // Capture each region
      for (const region of regions) {
        try {
          logger.debug(`Capturing region: ${region.name}`, {
            x: region.x, y: region.y, width: region.width, height: region.height,
            isAbsolute: this.isAbsoluteRegion(region)
          });
          
          const result = await this.captureRegion(region);
          
          if (result.success && result.dataUrl) {
            // Apply image preprocessing
            result.dataUrl = await this.preprocessImage(result.dataUrl, preprocessingOptions);
          }
          
          results.push(result);
        } catch (error) {
          logger.error('Error capturing card name region', { region: region.name, error });
          results.push({
            dataUrl: '',
            region,
            timestamp: Date.now(),
            success: false,
            error: `Capture failed: ${error}`
          });
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Error capturing card name regions', { error });
      return [];
    }
  }

  /**
   * Clear manual regions configuration
   */
  async clearManualRegions(): Promise<void> {
    await this.regionConfigService.clearConfig();
    this.manualRegions = null;
    logger.info('Manual regions cleared');
  }

  /**
   * Get region configuration service
   */
  getRegionConfigService(): RegionConfigService {
    return this.regionConfigService;
  }

  /**
   * Convert image to grayscale
   * @param ctx Canvas context
   * @param width Image width
   * @param height Image height
   * @private
   */
  private convertToGrayscale(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = avg;     // R
      data[i + 1] = avg; // G
      data[i + 2] = avg; // B
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Apply threshold to image (convert to black and white)
   * @param ctx Canvas context
   * @param width Image width
   * @param height Image height
   * @param threshold Threshold value (0-255)
   * @private
   */
  private applyThreshold(ctx: CanvasRenderingContext2D, width: number, height: number, threshold: number): void {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      // Convert to black or white based on threshold
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const val = avg < threshold ? 0 : 255;
      
      data[i] = val;     // R
      data[i + 1] = val; // G
      data[i + 2] = val; // B
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
}

export default ScreenCaptureService;