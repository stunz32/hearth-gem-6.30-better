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

      // Capture and persist high-quality reference images for each newly
      // defined manual region.  These are saved **once** right after the user
      // finishes the Configure-Cards workflow so that the hash matcher can be
      // trained / debugged offline without storing every automatic capture.
      try {
        const captureResults = await this.captureCardNameRegions({
          enhanceContrast: false,
          sharpen: false,
          binarize: false,
          scaleUp: false
        });
        const outDir = path.join(process.cwd(), 'data', 'manual_captured');
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
        await Promise.all(
          captureResults.map(async (cap) => {
            const pngBuffer = Buffer.from(cap.dataUrl.split(',')[1], 'base64');
            const fileName = `${cap.region.name}_${Date.now()}.png`;
            const filePath = path.join(outDir, fileName);
            await fs.promises.writeFile(filePath, pngBuffer);
            logger.info('Saved manual reference capture', { filePath });
          })
        );
      } catch (capErr) {
        logger.warn('Failed to capture & save manual region images', {
          error: (capErr as any)?.message ?? 'unknown'
        });
      }

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
      
      // Capture at the display's *native* resolution instead of a down-scaled
      // thumbnail. Down-scaling was causing the cropped card images to be
      // roughly ~180px wide, which significantly hurt OCR accuracy and
      // template-matching confidence.  Modern GPUs can easily handle the
      // full-resolution thumbnail buffer (≈ 3–8 MB), and we crop a small
      // region immediately afterwards, so the memory overhead is minimal.
      //
      // NOTE: We still keep captureSafeRegion for crash-safe fallback when
      // extremely high resolutions (> 8k) are in use, but for normal 1080p-4k
      // screens this native capture path gives dramatically better results.
      const thumbWidth = displayWidth;
      const thumbHeight = displayHeight;
      
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

      // (Debug capture to disk removed – we now capture only during manual
      // Configure-Regions workflow to avoid cluttering the filesystem.)

      return captureResult as unknown as CaptureRegionResult;
    } catch (error) {
      logger.error(`Error capturing screen region: ${error}`);
      throw error;
    }
  }
  
  /**
   * Preprocess an image to improve hash matching accuracy using Sharp
   * @param dataUrl Image data URL to process
   * @param options Preprocessing options
   * @returns Promise resolving to processed image data URL
   * @private
   */
  private async preprocessImage(dataUrl: string, options: PreprocessingOptions = this.defaultPreprocessingOptions): Promise<string> {
    try {
      // Convert data URL to buffer
      const base64Data = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
      const inputBuffer = Buffer.from(base64Data, 'base64');
      
      // Create sharp instance for high-performance processing
      let sharpInstance = sharp(inputBuffer);
      
      // Get image metadata for intelligent processing
      const metadata = await sharpInstance.metadata();
      const { width = 0, height = 0 } = metadata;
      
      logger.debug('Preprocessing image', { 
        originalSize: `${width}x${height}`,
        options 
      });
      
      // Step 1: Smart scaling for better feature detection
      if (options.scaleUp && (width < 200 || height < 200)) {
        const scaleFactor = Math.max(options.scaleUpFactor, 2);
        sharpInstance = sharpInstance.resize(
          Math.round(width * scaleFactor), 
          Math.round(height * scaleFactor),
          { 
            kernel: sharp.kernel.lanczos3,  // High-quality resampling
            withoutEnlargement: false 
          }
        );
        logger.debug(`Upscaled image by ${scaleFactor}x for better feature detection`);
      }
      
      // Step 2: Advanced noise reduction and edge preservation
      sharpInstance = sharpInstance.median(3); // Remove noise while preserving edges
      
      // Step 3: Intelligent contrast enhancement
      if (options.enhanceContrast) {
        // Normalize to improve dynamic range
        sharpInstance = sharpInstance.normalize();
        
        // Apply gamma correction for better midtone contrast
        sharpInstance = sharpInstance.gamma(1.2);
        
        // Enhance local contrast
        sharpInstance = sharpInstance.clahe({
          width: Math.max(8, Math.floor(width / 16)),
          height: Math.max(8, Math.floor(height / 16)),
          maxSlope: 3
        });
      }
      
      // Step 4: Smart sharpening for hash matching
      if (options.sharpen) {
        // Use unsharp mask for controlled sharpening
        sharpInstance = sharpInstance.sharpen({
          sigma: 1.0,      // Controls blur radius
          m1: 1.0,         // Flat areas threshold
          m2: 2.0,         // Jagged areas threshold  
          x1: 2.0,         // Flat areas gain
          y2: 10.0,        // Jagged areas gain
          y3: 20.0         // Maximum gain
        });
      }
      
      // Step 5: Convert to grayscale for better hash consistency
      sharpInstance = sharpInstance.grayscale();
      
      // Step 6: Apply histogram equalization for consistent lighting
      sharpInstance = sharpInstance.linear(1.1, -10); // Slight contrast boost
      
      // Step 7: Optional binarization for extreme cases
      if (options.binarize) {
        sharpInstance = sharpInstance.threshold(128, { grayscale: false });
      }
      
      // Process the image
      const processedBuffer = await sharpInstance
        .png({ quality: 100, compressionLevel: 0 }) // Lossless for hash matching
        .toBuffer();
      
      // Convert back to data URL
      const processedDataUrl = `data:image/png;base64,${processedBuffer.toString('base64')}`;
      
      logger.debug('Image preprocessed successfully with Sharp', {
        inputSize: inputBuffer.length,
        outputSize: processedBuffer.length,
        processingSteps: [
          options.scaleUp && 'upscaling',
          'noise_reduction',
          options.enhanceContrast && 'contrast_enhancement', 
          options.sharpen && 'sharpening',
          'grayscale_conversion',
          'histogram_equalization',
          options.binarize && 'binarization'
        ].filter(Boolean)
      });
      
      return processedDataUrl;
      
    } catch (error: any) {
      logger.error('Error preprocessing image with Sharp', { 
        message: error?.message, 
        stack: error?.stack 
      });
      // Return original on error to maintain functionality
      return dataUrl;
    }
  }
  
  /**
   * Advanced preprocessing specifically optimized for hash matching
   * @param dataUrl Image data URL to process  
   * @returns Promise resolving to optimized image data URL
   * @private
   */
  private async preprocessForHashMatching(dataUrl: string): Promise<string> {
    try {
      const base64Data = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
      const inputBuffer = Buffer.from(base64Data, 'base64');
      
      const metadata = await sharp(inputBuffer).metadata();
      const { width = 0, height = 0 } = metadata;
      
      // Multi-pass optimization for maximum hash matching accuracy
      const processedBuffer = await sharp(inputBuffer)
        // Pass 1: Intelligent upscaling if image is too small
        .resize(
          width < 150 ? width * 3 : width,
          height < 150 ? height * 3 : height, 
          { 
            kernel: sharp.kernel.lanczos3,
            withoutEnlargement: false
          }
        )
        // Pass 2: Aggressive noise reduction
        .median(5)
        .blur(0.3)
        .sharpen({ sigma: 1.5, m1: 0.5, m2: 3.0, x1: 3.0, y2: 15.0, y3: 25.0 })
        // Pass 3: Extreme contrast optimization  
        .normalize()
        .gamma(1.3)
        .linear(1.2, -15)
        // Pass 4: Convert to grayscale for consistent hashing
        .grayscale()
        // Pass 5: Final histogram equalization
        .clahe({ width: 8, height: 8, maxSlope: 4 })
        // Export as high-quality PNG
        .png({ quality: 100, compressionLevel: 0 })
        .toBuffer();
      
      const optimizedDataUrl = `data:image/png;base64,${processedBuffer.toString('base64')}`;
      
      logger.debug('Advanced hash matching preprocessing completed', {
        originalSize: `${width}x${height}`,
        finalSize: processedBuffer.length,
        optimization: 'maximum_hash_accuracy'
      });
      
      return optimizedDataUrl;
      
    } catch (error: any) {
      logger.error('Error in advanced hash preprocessing', { 
        message: error?.message 
      });
      return dataUrl;
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
            // Apply image preprocessing. This step can fail in headless/main-process
            // environments where browser DOM APIs (e.g. Image) are not available.
            // If preprocessing fails, we fall back to the original captured image so
            // that the UI still has something to render instead of showing the
            // "No images were successfully processed" warning.
            try {
              result.dataUrl = await this.preprocessImage(result.dataUrl, preprocessingOptions);
              logger.info(`After preprocessing - dataUrlLength: ${result.dataUrl ? result.dataUrl.length : 0}`);
            } catch (prepErr) {
              logger.warn('Image preprocessing failed – using original capture', { error: prepErr });
            }
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
      
      // Capture at the display's *native* resolution instead of a down-scaled
      // thumbnail. Down-scaling was causing the cropped card images to be
      // roughly ~180px wide, which significantly hurt OCR accuracy and
      // template-matching confidence.  Modern GPUs can easily handle the
      // full-resolution thumbnail buffer (≈ 3–8 MB), and we crop a small
      // region immediately afterwards, so the memory overhead is minimal.
      //
      // NOTE: We still keep captureSafeRegion for crash-safe fallback when
      // extremely high resolutions (> 8k) are in use, but for normal 1080p-4k
      // screens this native capture path gives dramatically better results.
      const thumbWidth = displayWidth;
      const thumbHeight = displayHeight;
      
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
