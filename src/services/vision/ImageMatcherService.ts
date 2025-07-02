import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';
import sharp from 'sharp';
import { promisify } from 'util';

// Use require instead of import to avoid TypeScript errors
const imageHash = require('image-hash').imageHash;
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');

// Promisify the imageHash function
const imageHashAsync = promisify(imageHash);

/**
 * Interface for image match result
 */
export interface ImageMatchResult {
  cardId: string;
  confidence: number;
}

/**
 * Interface for card hash data
 */
interface CardHashData {
  cardId: string;
  hash: string;
  imageUrl?: string;
}

/**
 * ImageMatcherService
 * Matches card images using perceptual hashing
 */
export class ImageMatcherService {
  private static readonly HASH_DIR = 'data/hashes';
  private static readonly HASH_FILE = 'card_hashes.json';
  private static readonly CARD_IMAGES_DIR = 'data/images/cards';
  private static readonly HASH_BITS = 16; // Higher values = more detail
  private static readonly MATCH_THRESHOLD = 0.8; // Minimum confidence for a match
  
  private cardHashes: CardHashData[] = [];
  private hashesLoaded = false;
  
  /**
   * Creates a new ImageMatcherService instance
   */
  constructor() {
    this.ensureDirectories();
    this.loadHashes();
  }
  
  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    const hashDir = path.join(process.cwd(), ImageMatcherService.HASH_DIR);
    const cardImagesDir = path.join(process.cwd(), ImageMatcherService.CARD_IMAGES_DIR);
    
    try {
      if (!fs.existsSync(hashDir)) {
        fs.mkdirSync(hashDir, { recursive: true });
        logger.info('Created hash directory', { path: hashDir });
      }
      
      if (!fs.existsSync(cardImagesDir)) {
        fs.mkdirSync(cardImagesDir, { recursive: true });
        logger.info('Created card images directory', { path: cardImagesDir });
      }
    } catch (error) {
      logger.error('Error creating directories', { error });
    }
  }
  
  /**
   * Load card hashes from file
   */
  private async loadHashes(): Promise<void> {
    try {
      const hashFilePath = path.join(
        process.cwd(),
        ImageMatcherService.HASH_DIR,
        ImageMatcherService.HASH_FILE
      );
      
      if (fs.existsSync(hashFilePath)) {
        const hashData = await fs.promises.readFile(hashFilePath, 'utf8');
        this.cardHashes = JSON.parse(hashData);
        this.hashesLoaded = true;
        
        logger.info('Loaded card hashes', { count: this.cardHashes.length });
      } else {
        logger.warn('No card hash file found, will need to generate hashes');
      }
    } catch (error) {
      logger.error('Error loading card hashes', { error });
    }
  }
  
  /**
   * Save card hashes to file
   */
  private async saveHashes(): Promise<void> {
    try {
      const hashFilePath = path.join(
        process.cwd(),
        ImageMatcherService.HASH_DIR,
        ImageMatcherService.HASH_FILE
      );
      
      await fs.promises.writeFile(
        hashFilePath,
        JSON.stringify(this.cardHashes, null, 2)
      );
      
      logger.info('Saved card hashes', { count: this.cardHashes.length });
    } catch (error) {
      logger.error('Error saving card hashes', { error });
    }
  }
  
  /**
   * Generate hash for a card image
   * @param imageUrl URL or path to the image
   * @param cardId Card ID
   * @returns Promise resolving to hash string
   */
  public async generateHash(imageUrl: string, cardId: string): Promise<string> {
    try {
      // Generate perceptual hash
      const hash = await imageHashAsync(
        imageUrl,
        ImageMatcherService.HASH_BITS,
        true
      );
      
      // Add to card hashes
      this.cardHashes.push({
        cardId,
        hash,
        imageUrl
      });
      
      // Save updated hashes
      await this.saveHashes();
      
      return hash;
    } catch (error) {
      logger.error('Error generating hash', { cardId, error });
      throw error;
    }
  }
  
  /**
   * Generate hashes for all card images in the cards directory
   * @returns Promise resolving when all hashes are generated
   */
  public async generateAllHashes(): Promise<void> {
    try {
      const cardImagesDir = path.join(process.cwd(), ImageMatcherService.CARD_IMAGES_DIR);
      
      if (!fs.existsSync(cardImagesDir)) {
        logger.warn('Card images directory does not exist', { path: cardImagesDir });
        return;
      }
      
      // Get all image files
      const files = await fs.promises.readdir(cardImagesDir);
      const imageFiles = files.filter(file => 
        file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
      );
      
      if (imageFiles.length === 0) {
        logger.warn('No card images found in directory', { path: cardImagesDir });
        return;
      }
      
      logger.info('Generating hashes for card images', { count: imageFiles.length });
      
      // Clear existing hashes
      this.cardHashes = [];
      
      // Generate hash for each image
      for (const file of imageFiles) {
        const filePath = path.join(cardImagesDir, file);
        const cardId = path.parse(file).name; // Use filename without extension as card ID
        
        try {
          const hash = await this.generateHash(filePath, cardId);
          logger.debug('Generated hash for card', { cardId, hash });
        } catch (error) {
          logger.error('Error generating hash for card', { cardId, error });
        }
      }
      
      // Save all hashes
      await this.saveHashes();
      this.hashesLoaded = true;
      
      logger.info('Finished generating hashes', { count: this.cardHashes.length });
    } catch (error) {
      logger.error('Error generating all hashes', { error });
    }
  }
  
  /**
   * Match a card image against known hashes
   * @param imageData Image data URL or buffer
   * @returns Promise resolving to match result
   */
  public async matchCardImage(imageData: string | Buffer): Promise<ImageMatchResult> {
    try {
      // Make sure hashes are loaded
      if (!this.hashesLoaded) {
        await this.loadHashes();
        
        if (this.cardHashes.length === 0) {
          logger.warn('No card hashes available for matching');
          return { cardId: '', confidence: 0 };
        }
      }
      
      // Generate hash for the input image
      let inputHash: string;
      
      if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
        // Convert data URL to buffer
        const base64Data = imageData.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Save to temporary file
        const tempFilePath = path.join(
          process.cwd(),
          ImageMatcherService.HASH_DIR,
          'temp_card.png'
        );
        
        await fs.promises.writeFile(tempFilePath, buffer);
        
        // Generate hash
        inputHash = await imageHashAsync(
          tempFilePath,
          ImageMatcherService.HASH_BITS,
          true
        );
        
        // Clean up temp file
        try {
          await fs.promises.unlink(tempFilePath);
        } catch (error) {
          logger.warn('Error cleaning up temporary file', { error });
        }
      } else if (Buffer.isBuffer(imageData)) {
        // Save buffer to temporary file
        const tempFilePath = path.join(
          process.cwd(),
          ImageMatcherService.HASH_DIR,
          'temp_card.png'
        );
        
        await fs.promises.writeFile(tempFilePath, imageData);
        
        // Generate hash
        inputHash = await imageHashAsync(
          tempFilePath,
          ImageMatcherService.HASH_BITS,
          true
        );
        
        // Clean up temp file
        try {
          await fs.promises.unlink(tempFilePath);
        } catch (error) {
          logger.warn('Error cleaning up temporary file', { error });
        }
      } else {
        throw new Error('Invalid image data format');
      }
      
      // Find best match
      let bestMatch: { cardId: string; confidence: number } = { cardId: '', confidence: 0 };
      
      for (const cardHash of this.cardHashes) {
        const similarity = this.calculateHashSimilarity(inputHash, cardHash.hash);
        
        if (similarity > bestMatch.confidence) {
          bestMatch = {
            cardId: cardHash.cardId,
            confidence: similarity
          };
        }
      }
      
      // Only return match if confidence is above threshold
      if (bestMatch.confidence >= ImageMatcherService.MATCH_THRESHOLD) {
        logger.debug('Found card match', { 
          cardId: bestMatch.cardId, 
          confidence: bestMatch.confidence 
        });
        return bestMatch;
      } else {
        logger.debug('No confident card match found', { 
          bestConfidence: bestMatch.confidence,
          threshold: ImageMatcherService.MATCH_THRESHOLD
        });
        return { cardId: '', confidence: 0 };
      }
    } catch (error) {
      logger.error('Error matching card image', { error });
      return { cardId: '', confidence: 0 };
    }
  }
  
  /**
   * Calculate similarity between two hashes
   * @param hash1 First hash
   * @param hash2 Second hash
   * @returns Similarity score (0-1)
   */
  private calculateHashSimilarity(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return 0;
    }
    
    let matchingBits = 0;
    
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) {
        matchingBits++;
      }
    }
    
    return matchingBits / hash1.length;
  }
  
  /**
   * Add a card image to the database
   * @param imageData Image data URL or buffer
   * @param cardId Card ID
   * @returns Promise resolving to true if successful
   */
  public async addCardImage(imageData: string | Buffer, cardId: string): Promise<boolean> {
    try {
      const cardImagesDir = path.join(process.cwd(), ImageMatcherService.CARD_IMAGES_DIR);
      
      // Ensure directory exists
      if (!fs.existsSync(cardImagesDir)) {
        fs.mkdirSync(cardImagesDir, { recursive: true });
      }
      
      // Save image to file
      const imagePath = path.join(cardImagesDir, `${cardId}.png`);
      
      if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
        // Convert data URL to buffer
        const base64Data = imageData.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        await fs.promises.writeFile(imagePath, buffer);
      } else if (Buffer.isBuffer(imageData)) {
        await fs.promises.writeFile(imagePath, imageData);
      } else {
        throw new Error('Invalid image data format');
      }
      
      // Generate hash
      await this.generateHash(imagePath, cardId);
      
      logger.info('Added card image', { cardId, path: imagePath });
      return true;
    } catch (error) {
      logger.error('Error adding card image', { cardId, error });
      return false;
    }
  }
  
  /**
   * Compare two images pixel by pixel
   * @param image1 First image data
   * @param image2 Second image data
   * @returns Promise resolving to similarity score (0-1)
   */
  public async compareImages(image1: string | Buffer, image2: string | Buffer): Promise<number> {
    try {
      // Convert images to PNG format with same dimensions
      const img1 = await this.normalizeImage(image1);
      const img2 = await this.normalizeImage(image2);
      
      // Parse PNGs
      const png1 = PNG.sync.read(img1);
      const png2 = PNG.sync.read(img2);
      
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
  
  /**
   * Normalize an image to a standard format and size
   * @param imageData Image data URL or buffer
   * @returns Promise resolving to normalized image buffer
   */
  private async normalizeImage(imageData: string | Buffer): Promise<Buffer> {
    try {
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
      return await sharp(buffer)
        .resize(256, 256, { fit: 'contain' })
        .png()
        .toBuffer();
    } catch (error) {
      logger.error('Error normalizing image', { error });
      throw error;
    }
  }
  
  /**
   * Check if card hashes are available
   * @returns Promise resolving to true if hashes are available
   */
  public async hasHashes(): Promise<boolean> {
    try {
      if (this.hashesLoaded && this.cardHashes.length > 0) {
        return true;
      }
      
      const hashFilePath = path.join(
        process.cwd(),
        ImageMatcherService.HASH_DIR,
        ImageMatcherService.HASH_FILE
      );
      
      if (!fs.existsSync(hashFilePath)) {
        return false;
      }
      
      const hashData = await fs.promises.readFile(hashFilePath, 'utf8');
      const hashes = JSON.parse(hashData) as CardHashData[];
      
      return hashes.length > 0;
    } catch (error) {
      logger.error('Error checking for card hashes', { error });
      return false;
    }
  }
}

export default ImageMatcherService;