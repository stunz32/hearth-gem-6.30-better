import { desktopCapturer, screen, Rectangle, BrowserWindow } from 'electron';
import logger from '../../utils/logger';
import { EventEmitter } from 'events';
import { RegionConfigService, CardRegion } from '../config/RegionConfigService';
import RegionDetector, { ScreenDetection } from './RegionDetector';

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
}

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
      return this.manualRegions.map(region => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        name: `card${region.cardIndex}`
      }));
    }
    
    // Try to use screen detection if available
    if (this.screenDetection && this.screenDetection.cardRegions.length === 3) {
      return this.screenDetection.cardRegions.map((region, index) => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        name: `card${index + 1}`
      }));
    }
    
    // Try to detect regions dynamically
    const newDetection = await this.regionDetector.findScreenRegions();
    if (newDetection && newDetection.cardRegions.length === 3) {
      this.screenDetection = newDetection;
      await this.regionDetector.saveTemplateSettings(newDetection);
      
      return newDetection.cardRegions.map((region, index) => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        name: `card${index + 1}`
      }));
    }

    // Fallback to automatic detection
    logger.warn('No regions available, using fallback automatic detection');
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
      
      // Capture the screen region
      const captureRect: Rectangle = {
        x: absoluteRegion.x,
        y: absoluteRegion.y,
        width: absoluteRegion.width,
        height: absoluteRegion.height
      };
      
      // Use desktopCapturer to get a screenshot
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: captureRect.width, height: captureRect.height }
      });
      
      if (sources.length === 0) {
        return {
          dataUrl: '',
          region,
          timestamp: Date.now(),
          success: false,
          error: 'No screen sources available'
        };
      }
      
      // Create a browser window to capture the specific region
      const captureWindow = new BrowserWindow({
        width: captureRect.width,
        height: captureRect.height,
        show: false,
        webPreferences: {
          offscreen: true
        }
      });
      
      // Load a blank page
      await captureWindow.loadURL('about:blank');
      
      // Capture the region
      const image = await captureWindow.webContents.capturePage(captureRect);
      
      // Convert to data URL
      const dataUrl = image.toDataURL();
      
      // Close the capture window
      captureWindow.close();
      
      logger.debug('Region captured successfully', { region: region.name });
      
      return {
        dataUrl,
        region,
        timestamp: Date.now(),
        success: true
      };
    } catch (error) {
      logger.error('Error capturing region', { region: region.name, error });
      
      return {
        dataUrl: '',
        region,
        timestamp: Date.now(),
        success: false,
        error: `Capture failed: ${error}`
      };
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
          logger.warn('Failed to find Hearthstone window for card name capture');
          return [];
        }
      }
      
      const results: CaptureResult[] = [];
      
      // Capture each defined region
      for (const region of this.cardNameRegions) {
        try {
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
      const detection = await this.regionDetector.findScreenRegions();
      if (detection && detection.cardRegions.length === 3) {
        this.screenDetection = detection;
        await this.regionDetector.saveTemplateSettings(detection);
        logger.info('Card regions detected dynamically');
        return true;
      } else {
        logger.warn('Failed to detect card regions dynamically');
        return false;
      }
    } catch (error) {
      logger.error('Error detecting card regions', { error });
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
}

export default ScreenCaptureService;