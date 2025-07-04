import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { EventEmitter } from 'events';
import { getLogger } from '../../utils/logger';

// Create logger instance for this module
const logger = getLogger('src/services/capture/TemplateMatcher');
import { CaptureResult } from './ScreenCaptureService';

// Use require instead of import to avoid TypeScript errors
const pixelmatch = require('pixelmatch');

/**
 * Interface for a template match result
 */
export interface TemplateMatchResult {
  matched: boolean;
  value: number | string;
  confidence: number;
}

/**
 * TemplateMatcher Service
 * Handles matching small templates (like mana costs and rarity gems) in captured images
 */
export class TemplateMatcher extends EventEmitter {
  private manaTemplates: Map<number, Buffer> = new Map();
  private rarityTemplates: Map<string, Buffer> = new Map();
  private templatesLoaded: boolean = false;
  
  // Constants for template matching
  private readonly MANA_TEMPLATE_SIZE = { width: 30, height: 30 };
  private readonly RARITY_TEMPLATE_SIZE = { width: 30, height: 30 };
  private readonly DIFF_THRESHOLD = 0.2; // Maximum allowed difference (lower = stricter)
  
  /**
   * Creates a new TemplateMatcher instance
   */
  constructor() {
    super();
    this.loadTemplates();
  }
  
  /**
   * Load mana cost and rarity templates
   */
  private async loadTemplates(): Promise<void> {
    try {
      // Load mana cost templates (0-10)
      const manaDir = path.join(__dirname, '../../../data/hashes/templates/mana');
      if (fs.existsSync(manaDir)) {
        for (let i = 0; i <= 10; i++) {
          const templatePath = path.join(manaDir, `mana${i}.png`);
          if (fs.existsSync(templatePath)) {
            const buffer = await this.loadAndResizeTemplate(templatePath, this.MANA_TEMPLATE_SIZE);
            this.manaTemplates.set(i, buffer);
          }
        }
        
        logger.info('Mana templates loaded', { count: this.manaTemplates.size });
      } else {
        logger.warn('Mana templates directory not found', { path: manaDir });
      }
      
      // Load rarity templates (common, rare, epic, legendary)
      const rarityDir = path.join(__dirname, '../../../data/hashes/templates/rarity');
      if (fs.existsSync(rarityDir)) {
        const rarities = ['common', 'rare', 'epic', 'legendary'];
        for (const rarity of rarities) {
          const templatePath = path.join(rarityDir, `${rarity}.png`);
          if (fs.existsSync(templatePath)) {
            const buffer = await this.loadAndResizeTemplate(templatePath, this.RARITY_TEMPLATE_SIZE);
            this.rarityTemplates.set(rarity, buffer);
          }
        }
        
        logger.info('Rarity templates loaded', { count: this.rarityTemplates.size });
      } else {
        logger.warn('Rarity templates directory not found', { path: rarityDir });
      }
      
      this.templatesLoaded = this.manaTemplates.size > 0 || this.rarityTemplates.size > 0;
      
      if (!this.templatesLoaded) {
        logger.info('No templates loaded. Run "npm run build:hashes" to generate templates');
      }
    } catch (error) {
      logger.error('Error loading templates', { error });
      this.templatesLoaded = false;
    }
  }
  
  /**
   * Load and resize a template image
   */
  private async loadAndResizeTemplate(templatePath: string, size: { width: number, height: number }): Promise<Buffer> {
    return await sharp(templatePath)
      .resize(size.width, size.height, { fit: 'fill' })
      .raw()
      .toBuffer();
  }
  
  /**
   * Check if templates are loaded
   */
  public isReady(): boolean {
    return this.templatesLoaded;
  }
  
  /**
   * Match mana cost in a captured image
   */
  public async matchManaCost(captureResult: CaptureResult): Promise<TemplateMatchResult> {
    if (!this.templatesLoaded || this.manaTemplates.size === 0 || !captureResult.success) {
      return { matched: false, value: 0, confidence: 0 };
    }
    
    try {
      // Convert data URL to raw pixel data
      const imageBuffer = await this.captureToRawBuffer(captureResult, this.MANA_TEMPLATE_SIZE);
      
      // Find best match
      let bestMatch = 0;
      let bestDiff = Number.MAX_VALUE;
      
      for (const [mana, templateBuffer] of this.manaTemplates.entries()) {
        // Compare images using pixelmatch
        const diff = pixelmatch(
          imageBuffer,
          templateBuffer,
          null,
          this.MANA_TEMPLATE_SIZE.width,
          this.MANA_TEMPLATE_SIZE.height,
          { threshold: this.DIFF_THRESHOLD }
        );
        
        // Lower diff means better match
        if (diff < bestDiff) {
          bestDiff = diff;
          bestMatch = mana;
        }
      }
      
      // Calculate confidence (0-1)
      // Max possible diff is width*height (every pixel different)
      const maxDiff = this.MANA_TEMPLATE_SIZE.width * this.MANA_TEMPLATE_SIZE.height;
      const confidence = 1 - (bestDiff / maxDiff);
      
      // Return match if confidence is high enough
      if (confidence >= 0.7) {
        return {
          matched: true,
          value: bestMatch,
          confidence
        };
      } else {
        return {
          matched: false,
          value: 0,
          confidence
        };
      }
    } catch (error) {
      logger.error('Error matching mana cost', { error });
      return { matched: false, value: 0, confidence: 0 };
    }
  }
  
  /**
   * Match rarity gem in a captured image
   */
  public async matchRarityGem(captureResult: CaptureResult): Promise<TemplateMatchResult> {
    if (!this.templatesLoaded || this.rarityTemplates.size === 0 || !captureResult.success) {
      return { matched: false, value: '', confidence: 0 };
    }
    
    try {
      // Convert data URL to raw pixel data
      const imageBuffer = await this.captureToRawBuffer(captureResult, this.RARITY_TEMPLATE_SIZE);
      
      // Find best match
      let bestMatch = '';
      let bestDiff = Number.MAX_VALUE;
      
      for (const [rarity, templateBuffer] of this.rarityTemplates.entries()) {
        // Compare images using pixelmatch
        const diff = pixelmatch(
          imageBuffer,
          templateBuffer,
          null,
          this.RARITY_TEMPLATE_SIZE.width,
          this.RARITY_TEMPLATE_SIZE.height,
          { threshold: this.DIFF_THRESHOLD }
        );
        
        // Lower diff means better match
        if (diff < bestDiff) {
          bestDiff = diff;
          bestMatch = rarity;
        }
      }
      
      // Calculate confidence (0-1)
      // Max possible diff is width*height (every pixel different)
      const maxDiff = this.RARITY_TEMPLATE_SIZE.width * this.RARITY_TEMPLATE_SIZE.height;
      const confidence = 1 - (bestDiff / maxDiff);
      
      // Return match if confidence is high enough
      if (confidence >= 0.7) {
        return {
          matched: true,
          value: bestMatch,
          confidence
        };
      } else {
        return {
          matched: false,
          value: '',
          confidence
        };
      }
    } catch (error) {
      logger.error('Error matching rarity gem', { error });
      return { matched: false, value: '', confidence: 0 };
    }
  }
  
  /**
   * Convert capture result to raw pixel buffer
   */
  private async captureToRawBuffer(captureResult: CaptureResult, size: { width: number, height: number }): Promise<Buffer> {
    const base64Data = captureResult.dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Resize to match template size
    return await sharp(imageBuffer)
      .resize(size.width, size.height, { fit: 'fill' })
      .raw()
      .toBuffer();
  }
} 
