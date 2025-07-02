import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';
import sharp from 'sharp';

// Use require instead of import to avoid TypeScript errors
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');

/**
 * Interface for template match result
 */
export interface TemplateMatchResult {
  cardId: string;
  confidence: number;
}

/**
 * Interface for template data
 */
interface TemplateData {
  cardId: string;
  manaTemplate?: Buffer;
  rarityTemplate?: Buffer;
}

/**
 * TemplateMatcherService
 * Matches card templates (mana crystals, rarity gems) to identify cards
 */
export class TemplateMatcherService {
  private static readonly TEMPLATES_DIR = 'data/hashes/templates';
  private static readonly MANA_DIR = 'mana';
  private static readonly RARITY_DIR = 'rarity';
  private static readonly MATCH_THRESHOLD = 0.7; // Minimum confidence for a match
  
  private templates: Map<string, TemplateData> = new Map();
  private templatesLoaded = false;
  
  /**
   * Creates a new TemplateMatcherService instance
   */
  constructor() {
    this.ensureDirectories();
    this.loadTemplates();
  }
  
  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    const templatesDir = path.join(process.cwd(), TemplateMatcherService.TEMPLATES_DIR);
    const manaDir = path.join(templatesDir, TemplateMatcherService.MANA_DIR);
    const rarityDir = path.join(templatesDir, TemplateMatcherService.RARITY_DIR);
    
    try {
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
        logger.info('Created templates directory', { path: templatesDir });
      }
      
      if (!fs.existsSync(manaDir)) {
        fs.mkdirSync(manaDir, { recursive: true });
        logger.info('Created mana templates directory', { path: manaDir });
      }
      
      if (!fs.existsSync(rarityDir)) {
        fs.mkdirSync(rarityDir, { recursive: true });
        logger.info('Created rarity templates directory', { path: rarityDir });
      }
    } catch (error) {
      logger.error('Error creating directories', { error });
    }
  }
  
  /**
   * Load templates from files
   */
  private async loadTemplates(): Promise<void> {
    try {
      const templatesDir = path.join(process.cwd(), TemplateMatcherService.TEMPLATES_DIR);
      const manaDir = path.join(templatesDir, TemplateMatcherService.MANA_DIR);
      const rarityDir = path.join(templatesDir, TemplateMatcherService.RARITY_DIR);
      
      // Check if directories exist
      if (!fs.existsSync(manaDir) || !fs.existsSync(rarityDir)) {
        logger.warn('Template directories not found');
        return;
      }
      
      // Load mana templates
      const manaFiles = await fs.promises.readdir(manaDir);
      const manaTemplates = manaFiles.filter(file => 
        file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
      );
      
      // Load rarity templates
      const rarityFiles = await fs.promises.readdir(rarityDir);
      const rarityTemplates = rarityFiles.filter(file => 
        file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
      );
      
      if (manaTemplates.length === 0 && rarityTemplates.length === 0) {
        logger.warn('No templates found');
        return;
      }
      
      // Process mana templates
      for (const file of manaTemplates) {
        const cardId = path.parse(file).name; // Use filename without extension as card ID
        const filePath = path.join(manaDir, file);
        
        try {
          const buffer = await fs.promises.readFile(filePath);
          
          if (!this.templates.has(cardId)) {
            this.templates.set(cardId, { cardId, manaTemplate: buffer });
          } else {
            const template = this.templates.get(cardId)!;
            template.manaTemplate = buffer;
          }
        } catch (error) {
          logger.error('Error loading mana template', { cardId, error });
        }
      }
      
      // Process rarity templates
      for (const file of rarityTemplates) {
        const cardId = path.parse(file).name; // Use filename without extension as card ID
        const filePath = path.join(rarityDir, file);
        
        try {
          const buffer = await fs.promises.readFile(filePath);
          
          if (!this.templates.has(cardId)) {
            this.templates.set(cardId, { cardId, rarityTemplate: buffer });
          } else {
            const template = this.templates.get(cardId)!;
            template.rarityTemplate = buffer;
          }
        } catch (error) {
          logger.error('Error loading rarity template', { cardId, error });
        }
      }
      
      this.templatesLoaded = true;
      logger.info('Loaded templates', { 
        manaCount: manaTemplates.length,
        rarityCount: rarityTemplates.length,
        totalCards: this.templates.size
      });
    } catch (error) {
      logger.error('Error loading templates', { error });
    }
  }
  
  /**
   * Add a mana template
   * @param imageData Image data URL or buffer
   * @param cardId Card ID
   * @returns Promise resolving to true if successful
   */
  public async addManaTemplate(imageData: string | Buffer, cardId: string): Promise<boolean> {
    try {
      const manaDir = path.join(
        process.cwd(),
        TemplateMatcherService.TEMPLATES_DIR,
        TemplateMatcherService.MANA_DIR
      );
      
      // Ensure directory exists
      if (!fs.existsSync(manaDir)) {
        fs.mkdirSync(manaDir, { recursive: true });
      }
      
      // Save image to file
      const imagePath = path.join(manaDir, `${cardId}.png`);
      
      let buffer: Buffer;
      if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
        // Convert data URL to buffer
        const base64Data = imageData.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else if (Buffer.isBuffer(imageData)) {
        buffer = imageData;
      } else {
        throw new Error('Invalid image data format');
      }
      
      // Normalize image
      const normalizedBuffer = await sharp(buffer)
        .resize(32, 32, { fit: 'contain' })
        .png()
        .toBuffer();
      
      await fs.promises.writeFile(imagePath, normalizedBuffer);
      
      // Add to templates
      if (!this.templates.has(cardId)) {
        this.templates.set(cardId, { cardId, manaTemplate: normalizedBuffer });
      } else {
        const template = this.templates.get(cardId)!;
        template.manaTemplate = normalizedBuffer;
      }
      
      logger.info('Added mana template', { cardId, path: imagePath });
      return true;
    } catch (error) {
      logger.error('Error adding mana template', { cardId, error });
      return false;
    }
  }
  
  /**
   * Add a rarity template
   * @param imageData Image data URL or buffer
   * @param cardId Card ID
   * @returns Promise resolving to true if successful
   */
  public async addRarityTemplate(imageData: string | Buffer, cardId: string): Promise<boolean> {
    try {
      const rarityDir = path.join(
        process.cwd(),
        TemplateMatcherService.TEMPLATES_DIR,
        TemplateMatcherService.RARITY_DIR
      );
      
      // Ensure directory exists
      if (!fs.existsSync(rarityDir)) {
        fs.mkdirSync(rarityDir, { recursive: true });
      }
      
      // Save image to file
      const imagePath = path.join(rarityDir, `${cardId}.png`);
      
      let buffer: Buffer;
      if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
        // Convert data URL to buffer
        const base64Data = imageData.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else if (Buffer.isBuffer(imageData)) {
        buffer = imageData;
      } else {
        throw new Error('Invalid image data format');
      }
      
      // Normalize image
      const normalizedBuffer = await sharp(buffer)
        .resize(16, 16, { fit: 'contain' })
        .png()
        .toBuffer();
      
      await fs.promises.writeFile(imagePath, normalizedBuffer);
      
      // Add to templates
      if (!this.templates.has(cardId)) {
        this.templates.set(cardId, { cardId, rarityTemplate: normalizedBuffer });
      } else {
        const template = this.templates.get(cardId)!;
        template.rarityTemplate = normalizedBuffer;
      }
      
      logger.info('Added rarity template', { cardId, path: imagePath });
      return true;
    } catch (error) {
      logger.error('Error adding rarity template', { cardId, error });
      return false;
    }
  }
  
  /**
   * Match a mana template
   * @param imageData Image data URL or buffer
   * @returns Promise resolving to match result
   */
  public async matchManaTemplate(imageData: string | Buffer): Promise<TemplateMatchResult> {
    try {
      // Make sure templates are loaded
      if (!this.templatesLoaded) {
        await this.loadTemplates();
        
        if (this.templates.size === 0) {
          logger.warn('No templates available for matching');
          return { cardId: '', confidence: 0 };
        }
      }
      
      // Normalize input image
      let buffer: Buffer;
      if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
        // Convert data URL to buffer
        const base64Data = imageData.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else if (Buffer.isBuffer(imageData)) {
        buffer = imageData;
      } else {
        throw new Error('Invalid image data format');
      }
      
      const normalizedInput = await sharp(buffer)
        .resize(32, 32, { fit: 'contain' })
        .png()
        .toBuffer();
      
      // Find best match
      let bestMatch: { cardId: string; confidence: number } = { cardId: '', confidence: 0 };
      
      for (const [cardId, template] of this.templates.entries()) {
        if (!template.manaTemplate) {
          continue;
        }
        
        try {
          const similarity = await this.compareImages(normalizedInput, template.manaTemplate);
          
          if (similarity > bestMatch.confidence) {
            bestMatch = {
              cardId,
              confidence: similarity
            };
          }
        } catch (error) {
          logger.error('Error comparing mana templates', { cardId, error });
        }
      }
      
      // Only return match if confidence is above threshold
      if (bestMatch.confidence >= TemplateMatcherService.MATCH_THRESHOLD) {
        logger.debug('Found mana template match', { 
          cardId: bestMatch.cardId, 
          confidence: bestMatch.confidence 
        });
        return bestMatch;
      } else {
        logger.debug('No confident mana template match found', { 
          bestConfidence: bestMatch.confidence,
          threshold: TemplateMatcherService.MATCH_THRESHOLD
        });
        return { cardId: '', confidence: 0 };
      }
    } catch (error) {
      logger.error('Error matching mana template', { error });
      return { cardId: '', confidence: 0 };
    }
  }
  
  /**
   * Match a rarity template
   * @param imageData Image data URL or buffer
   * @returns Promise resolving to match result
   */
  public async matchRarityTemplate(imageData: string | Buffer): Promise<TemplateMatchResult> {
    try {
      // Make sure templates are loaded
      if (!this.templatesLoaded) {
        await this.loadTemplates();
        
        if (this.templates.size === 0) {
          logger.warn('No templates available for matching');
          return { cardId: '', confidence: 0 };
        }
      }
      
      // Normalize input image
      let buffer: Buffer;
      if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
        // Convert data URL to buffer
        const base64Data = imageData.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else if (Buffer.isBuffer(imageData)) {
        buffer = imageData;
      } else {
        throw new Error('Invalid image data format');
      }
      
      const normalizedInput = await sharp(buffer)
        .resize(16, 16, { fit: 'contain' })
        .png()
        .toBuffer();
      
      // Find best match
      let bestMatch: { cardId: string; confidence: number } = { cardId: '', confidence: 0 };
      
      for (const [cardId, template] of this.templates.entries()) {
        if (!template.rarityTemplate) {
          continue;
        }
        
        try {
          const similarity = await this.compareImages(normalizedInput, template.rarityTemplate);
          
          if (similarity > bestMatch.confidence) {
            bestMatch = {
              cardId,
              confidence: similarity
            };
          }
        } catch (error) {
          logger.error('Error comparing rarity templates', { cardId, error });
        }
      }
      
      // Only return match if confidence is above threshold
      if (bestMatch.confidence >= TemplateMatcherService.MATCH_THRESHOLD) {
        logger.debug('Found rarity template match', { 
          cardId: bestMatch.cardId, 
          confidence: bestMatch.confidence 
        });
        return bestMatch;
      } else {
        logger.debug('No confident rarity template match found', { 
          bestConfidence: bestMatch.confidence,
          threshold: TemplateMatcherService.MATCH_THRESHOLD
        });
        return { cardId: '', confidence: 0 };
      }
    } catch (error) {
      logger.error('Error matching rarity template', { error });
      return { cardId: '', confidence: 0 };
    }
  }
  
  /**
   * Compare two images pixel by pixel
   * @param image1 First image buffer
   * @param image2 Second image buffer
   * @returns Promise resolving to similarity score (0-1)
   */
  private async compareImages(image1: Buffer, image2: Buffer): Promise<number> {
    try {
      // Parse PNGs
      const png1 = PNG.sync.read(image1);
      const png2 = PNG.sync.read(image2);
      
      // Make sure dimensions match
      if (png1.width !== png2.width || png1.height !== png2.height) {
        // Resize to match
        const resized = await sharp(image2)
          .resize(png1.width, png1.height, { fit: 'contain' })
          .png()
          .toBuffer();
        
        return this.compareImages(image1, resized);
      }
      
      // Compare images
      const { width, height } = png1;
      const diff = new PNG({ width, height });
      
      const numDiffPixels = pixelmatch(
        png1.data,
        png2.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 }
      );
      
      // Calculate similarity (0-1)
      const similarity = 1 - (numDiffPixels / (width * height));
      
      return similarity;
    } catch (error) {
      logger.error('Error comparing images', { error });
      return 0;
    }
  }
}

export default TemplateMatcherService;