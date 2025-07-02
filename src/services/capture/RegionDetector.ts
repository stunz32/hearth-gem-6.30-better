import { desktopCapturer, screen, Rectangle } from 'electron';
import logger from '../../utils/logger';
import { EventEmitter } from 'events';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// Use require instead of import to avoid TypeScript errors
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');

/**
 * Interface for template match result
 */
export interface TemplateMatchResult {
  found: boolean;
  points: Array<{x: number, y: number}>;
  confidence: number;
}

/**
 * Interface for screen detection result
 */
export interface ScreenDetection {
  screenIndex: number;
  screenScale: {x: number, y: number};
  screenHeight: number;
  cardRegions: Array<Rectangle>;
  manaRegions: Array<Rectangle>;
  rarityRegions: Array<Rectangle>;
}

/**
 * RegionDetector
 * Handles detecting card regions in the Hearthstone window using template matching
 */
export class RegionDetector extends EventEmitter {
  private static readonly TEMPLATES_DIR = 'data/templates';
  private static readonly SETTINGS_FILE = 'data/config/screen_detection.json';
  private static readonly HEARTHSTONE_WINDOW_TITLE = 'Hearthstone';
  
  /**
   * Creates a new RegionDetector instance
   */
  constructor() {
    super();
    this.ensureDirectories();
    logger.info('RegionDetector initialized');
  }
  
  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    const templatesDir = path.join(process.cwd(), RegionDetector.TEMPLATES_DIR);
    const configDir = path.dirname(path.join(process.cwd(), RegionDetector.SETTINGS_FILE));
    
    try {
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
        logger.info('Created templates directory', { path: templatesDir });
      }
      
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        logger.info('Created config directory', { path: configDir });
      }
    } catch (error) {
      logger.error('Error creating directories', { error });
    }
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
        thumbnailSize: { width: 150, height: 150 } // Small thumbnail to get dimensions
      });
      
      // Log all available windows for debugging
      logger.debug('Available windows:', sources.map(s => s.name));
      
      // Find Hearthstone window by name
      const hearthstoneSource = sources.find(source => 
        source.name.includes(RegionDetector.HEARTHSTONE_WINDOW_TITLE)
      );
      
      if (hearthstoneSource) {
        logger.info('Hearthstone window found', { 
          id: hearthstoneSource.id,
          name: hearthstoneSource.name
        });
        
        return true;
      } else {
        // If Hearthstone window not found, log all available windows
        logger.warn('Hearthstone window not found. Available windows:', 
          sources.map(s => s.name).join(', '));
        
        // If testing/development, use any available window
        if (process.env.NODE_ENV === 'development' && sources.length > 0) {
          logger.info('Development mode: Using first available window as fallback');
          return true;
        }
        
        return false;
      }
    } catch (error) {
      logger.error('Error finding Hearthstone window', { error });
      return false;
    }
  }
  
  /**
   * Find screen regions
   * @returns Promise resolving to screen detection result
   */
  public async findScreenRegions(): Promise<ScreenDetection | null> {
    try {
      logger.info('Finding screen regions');
      
      // First try to load saved settings
      const savedSettings = await this.loadTemplateSettings();
      if (savedSettings) {
        logger.info('Using saved screen detection settings');
        return savedSettings;
      }
      
      // Get all displays
      const displays = screen.getAllDisplays();
      
      if (displays.length === 0) {
        logger.error('No displays found');
        return null;
      }
      
      // For now, we'll use the primary display
      // In a real implementation, we'd check all displays
      const primaryDisplay = screen.getPrimaryDisplay();
      const displayIndex = displays.findIndex(d => d.id === primaryDisplay.id);
      
      // Capture the entire screen
      const screenshot = await this.captureScreen(primaryDisplay.id);
      
      if (!screenshot) {
        logger.error('Failed to capture screen');
        return null;
      }
      
      // Load template images for matching
      const cardTemplateBuffer = await this.loadTemplate('card_template.png');
      const manaTemplateBuffer = await this.loadTemplate('mana_template.png');
      const rarityTemplateBuffer = await this.loadTemplate('rarity_template.png');
      
      if (!cardTemplateBuffer) {
        logger.warn('Card template not found, using fallback detection method');
        return this.fallbackRegionDetection(primaryDisplay, displayIndex);
      }
      
      // Find card regions using template matching
      const cardMatches = await this.findTemplateMatches(screenshot, cardTemplateBuffer);
      
      if (cardMatches.length < 3) {
        logger.warn(`Only found ${cardMatches.length} card regions, using fallback detection method`);
        return this.fallbackRegionDetection(primaryDisplay, displayIndex);
      }
      
      // Sort card matches from left to right
      cardMatches.sort((a, b) => a.x - b.x);
      
      // Take the first 3 matches (in case we found more)
      const cardRegions: Rectangle[] = cardMatches.slice(0, 3).map(match => ({
        x: match.x,
        y: match.y,
        width: match.width,
        height: match.height
      }));
      
      // Calculate mana and rarity regions based on card regions
      const manaRegions: Rectangle[] = [];
      const rarityRegions: Rectangle[] = [];
      
      for (const card of cardRegions) {
        // Mana region (top-left of card)
        manaRegions.push({
          x: card.x,
          y: card.y,
          width: Math.round(card.width * 0.2),
          height: Math.round(card.height * 0.1)
        });
        
        // Rarity region (middle-bottom of card)
        rarityRegions.push({
          x: card.x + Math.round(card.width * 0.4),
          y: card.y + Math.round(card.height * 0.8),
          width: Math.round(card.width * 0.2),
          height: Math.round(card.height * 0.1)
        });
      }
      
      const detection: ScreenDetection = {
        screenIndex: displayIndex,
        screenScale: { x: 1, y: 1 }, // Adjust if needed
        screenHeight: primaryDisplay.bounds.height,
        cardRegions,
        manaRegions,
        rarityRegions
      };
      
      // Save the detection for future use
      await this.saveTemplateSettings(detection);
      
      logger.info('Screen regions detected', { 
        screenIndex: displayIndex,
        cardRegions: cardRegions.length
      });
      
      return detection;
    } catch (error) {
      logger.error('Error finding screen regions', { error });
      return null;
    }
  }
  
  /**
   * Fallback method for region detection when template matching fails
   */
  private fallbackRegionDetection(
    display: Electron.Display, 
    displayIndex: number
  ): ScreenDetection {
    // Calculate regions based on screen dimensions
    const screenWidth = display.bounds.width;
    const screenHeight = display.bounds.height;
    
    // Calculate regions based on screen dimensions
    const cardWidth = Math.round(screenWidth * 0.15);
    const cardHeight = Math.round(screenHeight * 0.3);
    const cardSpacing = Math.round(screenWidth * 0.05);
    const cardTop = Math.round(screenHeight * 0.35);
    const cardStartX = Math.round((screenWidth - (3 * cardWidth + 2 * cardSpacing)) / 2);
    
    const cardRegions: Rectangle[] = [];
    const manaRegions: Rectangle[] = [];
    const rarityRegions: Rectangle[] = [];
    
    for (let i = 0; i < 3; i++) {
      const x = cardStartX + i * (cardWidth + cardSpacing);
      
      // Card region
      cardRegions.push({
        x,
        y: cardTop,
        width: cardWidth,
        height: cardHeight
      });
      
      // Mana region (top-left of card)
      manaRegions.push({
        x,
        y: cardTop,
        width: Math.round(cardWidth * 0.2),
        height: Math.round(cardHeight * 0.1)
      });
      
      // Rarity region (middle-bottom of card)
      rarityRegions.push({
        x: x + Math.round(cardWidth * 0.4),
        y: cardTop + Math.round(cardHeight * 0.8),
        width: Math.round(cardWidth * 0.2),
        height: Math.round(cardHeight * 0.1)
      });
    }
    
    return {
      screenIndex: displayIndex,
      screenScale: { x: 1, y: 1 },
      screenHeight,
      cardRegions,
      manaRegions,
      rarityRegions
    };
  }
  
  /**
   * Load a template image
   */
  private async loadTemplate(templateName: string): Promise<Buffer | null> {
    try {
      const templatePath = path.join(
        process.cwd(), 
        RegionDetector.TEMPLATES_DIR, 
        templateName
      );
      
      if (!fs.existsSync(templatePath)) {
        logger.warn('Template file not found', { path: templatePath });
        return null;
      }
      
      return await fs.promises.readFile(templatePath);
    } catch (error) {
      logger.error('Error loading template', { error });
      return null;
    }
  }
  
  /**
   * Find template matches in an image
   */
  private async findTemplateMatches(
    image: Buffer, 
    template: Buffer
  ): Promise<Array<Rectangle & {confidence: number}>> {
    try {
      // Process image and template with sharp
      const imageMetadata = await sharp(image).metadata();
      const templateMetadata = await sharp(template).metadata();
      
      if (!imageMetadata.width || !imageMetadata.height || 
          !templateMetadata.width || !templateMetadata.height) {
        throw new Error('Failed to get image dimensions');
      }
      
      // Convert to raw pixel data
      const imageData = await sharp(image)
        .raw()
        .toBuffer();
      
      const templateData = await sharp(template)
        .raw()
        .toBuffer();
      
      // Perform template matching
      const matches: Array<Rectangle & {confidence: number}> = [];
      const threshold = 0.7; // Minimum confidence for a match
      
      // Simple sliding window template matching
      // In a real implementation, we'd use a more sophisticated algorithm
      // like normalized cross-correlation or feature matching
      for (let y = 0; y <= imageMetadata.height - templateMetadata.height; y += 10) {
        for (let x = 0; x <= imageMetadata.width - templateMetadata.width; x += 10) {
          const confidence = this.calculateMatchConfidence(
            imageData,
            templateData,
            imageMetadata.width,
            imageMetadata.height,
            templateMetadata.width,
            templateMetadata.height,
            x,
            y
          );
          
          if (confidence > threshold) {
            matches.push({
              x,
              y,
              width: templateMetadata.width,
              height: templateMetadata.height,
              confidence
            });
          }
        }
      }
      
      // Non-maximum suppression to remove overlapping matches
      return this.nonMaximumSuppression(matches);
    } catch (error) {
      logger.error('Error finding template matches', { error });
      return [];
    }
  }
  
  /**
   * Calculate match confidence between image region and template
   */
  private calculateMatchConfidence(
    imageData: Buffer,
    templateData: Buffer,
    imageWidth: number,
    imageHeight: number,
    templateWidth: number,
    templateHeight: number,
    offsetX: number,
    offsetY: number
  ): number {
    let totalPixels = templateWidth * templateHeight;
    let matchingPixels = 0;
    
    // For each pixel in the template
    for (let y = 0; y < templateHeight; y++) {
      for (let x = 0; x < templateWidth; x++) {
        // Calculate positions in buffers
        const templatePos = (y * templateWidth + x) * 3; // RGB
        const imagePos = ((offsetY + y) * imageWidth + (offsetX + x)) * 3; // RGB
        
        // Compare RGB values with some tolerance
        const templateR = templateData[templatePos];
        const templateG = templateData[templatePos + 1];
        const templateB = templateData[templatePos + 2];
        
        const imageR = imageData[imagePos];
        const imageG = imageData[imagePos + 1];
        const imageB = imageData[imagePos + 2];
        
        // Calculate color distance (simple Euclidean distance)
        const distance = Math.sqrt(
          Math.pow(templateR - imageR, 2) +
          Math.pow(templateG - imageG, 2) +
          Math.pow(templateB - imageB, 2)
        );
        
        // Consider a match if distance is below threshold
        if (distance < 50) { // Adjust threshold as needed
          matchingPixels++;
        }
      }
    }
    
    return matchingPixels / totalPixels;
  }
  
  /**
   * Non-maximum suppression to remove overlapping matches
   */
  private nonMaximumSuppression(
    matches: Array<Rectangle & {confidence: number}>
  ): Array<Rectangle & {confidence: number}> {
    // Sort by confidence (descending)
    matches.sort((a, b) => b.confidence - a.confidence);
    
    const result: Array<Rectangle & {confidence: number}> = [];
    const used = new Set<number>();
    
    for (let i = 0; i < matches.length; i++) {
      if (used.has(i)) continue;
      
      result.push(matches[i]);
      used.add(i);
      
      // Mark overlapping matches as used
      for (let j = i + 1; j < matches.length; j++) {
        if (this.calculateIoU(matches[i], matches[j]) > 0.5) {
          used.add(j);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Calculate Intersection over Union (IoU) between two rectangles
   */
  private calculateIoU(rect1: Rectangle, rect2: Rectangle): number {
    // Calculate intersection area
    const xOverlap = Math.max(0,
      Math.min(rect1.x + rect1.width, rect2.x + rect2.width) -
      Math.max(rect1.x, rect2.x)
    );
    
    const yOverlap = Math.max(0,
      Math.min(rect1.y + rect1.height, rect2.y + rect2.height) -
      Math.max(rect1.y, rect2.y)
    );
    
    const intersectionArea = xOverlap * yOverlap;
    
    // Calculate union area
    const rect1Area = rect1.width * rect1.height;
    const rect2Area = rect2.width * rect2.height;
    const unionArea = rect1Area + rect2Area - intersectionArea;
    
    return intersectionArea / unionArea;
  }
  
  /**
   * Capture the screen
   * @param displayId ID of the display to capture
   * @returns Promise resolving to the screen capture buffer or null
   * @private
   */
  private async captureScreen(displayId: number): Promise<Buffer | null> {
    try {
      // Get all display sources
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 } // No thumbnails needed
      });
      
      // Find the matching display source
      const source = sources.find(s => s.display_id === String(displayId));
      
      if (!source || !source.thumbnail) {
        logger.error('Screen source not found', { displayId });
        return null;
      }
      
      // Convert NativeImage to Buffer
      return source.thumbnail.toPNG();
    } catch (error) {
      logger.error('Error capturing screen', { error });
      return null;
    }
  }
  
  /**
   * Save template settings to file
   * @param detection Screen detection to save
   */
  public async saveTemplateSettings(detection: ScreenDetection): Promise<void> {
    try {
      const settingsPath = path.join(process.cwd(), RegionDetector.SETTINGS_FILE);
      await fs.promises.writeFile(settingsPath, JSON.stringify(detection, null, 2));
      logger.info('Saved screen detection settings', { path: settingsPath });
    } catch (error) {
      logger.error('Error saving template settings', { error });
    }
  }
  
  /**
   * Load template settings from file
   * @returns Promise resolving to screen detection or null if not found
   */
  public async loadTemplateSettings(): Promise<ScreenDetection | null> {
    try {
      const settingsPath = path.join(process.cwd(), RegionDetector.SETTINGS_FILE);
      
      if (!fs.existsSync(settingsPath)) {
        logger.info('No screen detection settings found', { path: settingsPath });
        return null;
      }
      
      const settingsData = await fs.promises.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(settingsData) as ScreenDetection;
      
      logger.info('Loaded screen detection settings', { 
        path: settingsPath,
        screenIndex: settings.screenIndex,
        cardRegions: settings.cardRegions.length
      });
      
      return settings;
    } catch (error) {
      logger.error('Error loading template settings', { error });
      return null;
    }
  }
  
  /**
   * Clear template settings
   */
  public async clearTemplateSettings(): Promise<void> {
    try {
      const settingsPath = path.join(process.cwd(), RegionDetector.SETTINGS_FILE);
      
      if (fs.existsSync(settingsPath)) {
        await fs.promises.unlink(settingsPath);
        logger.info('Cleared screen detection settings', { path: settingsPath });
      }
    } catch (error) {
      logger.error('Error clearing template settings', { error });
    }
  }
}

export default RegionDetector;