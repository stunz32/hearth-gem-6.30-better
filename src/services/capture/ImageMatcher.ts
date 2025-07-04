import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { getLogger } from '../../utils/logger';

// Create logger instance for this module
const logger = getLogger('src/services/capture/ImageMatcher');
import { CaptureRegion, CaptureResult } from './ScreenCaptureService';
import { CardDataService } from '../cardData/CardDataService';

// We'll need to use require for image-hash since it doesn't have proper TypeScript types
const imageHash = require('image-hash');

// Promisify the callback-based imageHash.imageHash function
const generateHash = promisify(imageHash.imageHash);

/**
 * Interface for a card hash entry
 */
interface CardHash {
  id: string;
  dbfId: number;
  name: string;
  hash: string;
  mana: number;
  rarity: string;
}

/**
 * Interface for a template match result
 */
interface TemplateMatchResult {
  matched: boolean;
  value: number | string;
  confidence: number;
}

/**
 * Interface for a card match result
 */
export interface CardMatchResult {
  region: CaptureRegion;
  cardId: string | null;
  dbfId: number | null;
  name: string | null;
  confidence: number;
  mana: number | null;
  rarity: string | null;
  matchMethod: 'hash' | 'ocr' | 'combined' | 'none';
  timestamp: number;
}

/**
 * ImageMatcher Service
 * Handles matching card images using perceptual hashing and template matching
 */
export class ImageMatcher extends EventEmitter {
  private cardHashes: CardHash[] = [];
  private cardDataService: CardDataService;
  private hashesLoaded: boolean = false;
  // Threshold raised from emergency 0.15 back to reasonable level with advanced preprocessing
  private HASH_MATCH_THRESHOLD = 0.2; // Lowered based on test results showing 17% confidence
  private readonly MANA_MATCH_THRESHOLD = 0.9; // Minimum similarity for a mana cost match
  private readonly RARITY_MATCH_THRESHOLD = 0.9; // Minimum similarity for a rarity gem match
  
  /**
   * Creates a new ImageMatcher instance
   */
  constructor(cardDataService: CardDataService) {
    super();
    this.cardDataService = cardDataService;
    this.loadCardHashes();
  }
  
  /**
   * Load card hashes from the data file
   */
  private async loadCardHashes(): Promise<void> {
    try {
      // Support both kebab-case (legacy) and snake_case (current) filenames so
      // existing deployments continue to work regardless of naming scheme.
      const legacyPath = path.join(__dirname, '../../../data/hashes/card-hashes.json');
      const snakePath  = path.join(__dirname, '../../../data/hashes/card_hashes.json');
      const cwdLegacy  = path.join(process.cwd(), 'data/hashes/card-hashes.json');
      const cwdSnake   = path.join(process.cwd(), 'data/hashes/card_hashes.json');

      const candidatePaths = [legacyPath, snakePath, cwdLegacy, cwdSnake];
      const hashesPath = candidatePaths.find(p => fs.existsSync(p));
      if (!hashesPath) {
        logger.warn('Card hashes file not found in any candidate path', { candidatePaths });
        this.hashesLoaded = false;
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const finalPath = hashesPath!;
      
      if (fs.existsSync(finalPath)) {
        this.cardHashes = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
        this.hashesLoaded = true;
        logger.info('Card hashes loaded successfully', { count: this.cardHashes.length, path: finalPath });
      } else {
        logger.warn('Card hashes file not found (after exists check)', { path: finalPath });
        logger.info('Run "npm run build:hashes" to generate card hashes');
        this.hashesLoaded = false;
      }
    } catch (error) {
      logger.error('Error loading card hashes', { error });
      this.hashesLoaded = false;
    }
  }
  
  /**
   * Check if hashes are loaded
   */
  public isReady(): boolean {
    return this.hashesLoaded;
  }

  /**
   * Dynamically adjust threshold based on recent performance
   * @param recentMatches Array of recent match confidences
   */
  public adjustThreshold(recentMatches: number[]): void {
    if (recentMatches.length < 5) return;
    
    const avgConfidence = recentMatches.reduce((a, b) => a + b, 0) / recentMatches.length;
    const maxConfidence = Math.max(...recentMatches);
    
    // If we're consistently getting low confidence, lower the threshold
    if (maxConfidence < 0.3 && avgConfidence < 0.15) {
      this.HASH_MATCH_THRESHOLD = Math.max(0.1, avgConfidence * 0.8);
      logger.info('Dynamically lowered hash threshold', { 
        newThreshold: this.HASH_MATCH_THRESHOLD,
        avgConfidence,
        maxConfidence 
      });
    } else if (avgConfidence > 0.5) {
      // If we're getting good matches, raise the threshold for quality
      this.HASH_MATCH_THRESHOLD = Math.min(0.6, avgConfidence * 0.8);
      logger.info('Dynamically raised hash threshold', { 
        newThreshold: this.HASH_MATCH_THRESHOLD,
        avgConfidence 
      });
    }
  }
  
  /**
   * Advanced preprocessing specifically for hash matching optimization
   * @param imageBuffer Raw image buffer
   * @returns Optimized image buffer for hash generation
   */
  private async preprocessForHashing(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const { width = 0, height = 0 } = metadata;
      
      logger.debug('Preprocessing image for hash matching', { 
        originalSize: `${width}x${height}` 
      });
      
      // Multi-stage optimization pipeline for maximum hash matching accuracy
      const processedBuffer = await sharp(imageBuffer)
        // Stage 1: Intelligent scaling - ensure optimal resolution for hashing
        .resize(
          width < 200 ? Math.floor(width * 2.5) : width,
          height < 200 ? Math.floor(height * 2.5) : height,
          { 
            kernel: sharp.kernel.lanczos3,
            withoutEnlargement: false
          }
        )
        // Stage 2: Advanced noise reduction while preserving card features
        .median(3)
        .blur(0.5)
        .sharpen({ 
          sigma: 1.2, 
          m1: 0.8, 
          m2: 3.0, 
          x1: 2.5, 
          y2: 12.0, 
          y3: 22.0 
        })
        // Stage 3: Extreme contrast and histogram optimization
        .normalize()
        .gamma(1.25)
        .linear(1.15, -8)
        // Stage 4: Convert to consistent grayscale for reliable hashing
        .grayscale()
        // Stage 5: Final histogram equalization for lighting consistency
        .clahe({ width: 16, height: 16, maxSlope: 3 })
        // Stage 6: Export as uncompressed PNG for hash consistency
        .png({ quality: 100, compressionLevel: 0, palette: false })
        .toBuffer();
      
      logger.debug('Hash preprocessing completed', {
        inputSize: imageBuffer.length,
        outputSize: processedBuffer.length,
        improvement: `${((processedBuffer.length / imageBuffer.length) * 100).toFixed(1)}% size`
      });
      
      return processedBuffer;
      
    } catch (error: any) {
      logger.error('Error in hash preprocessing', { message: error?.message });
      return imageBuffer; // Return original on error
    }
  }

  /**
   * Generate multiple hash variants for better matching accuracy
   * @param imageBuffer Preprocessed image buffer
   * @returns Array of hash variants
   */
  private async generateHashVariants(imageBuffer: Buffer): Promise<string[]> {
    try {
      const hashes: string[] = [];
      
      // Original hash at 16-bit precision
      const originalHash = await generateHash(imageBuffer, 16, true);
      hashes.push(originalHash);
      
      // Additional variants with different preprocessing for edge cases
      const variants = await Promise.all([
                 // Variant 1: Extra sharpened for low contrast cards
         sharp(imageBuffer)
           .sharpen({ sigma: 2.0, m1: 0.5, m2: 4.0, x1: 3.0, y2: 20.0, y3: 30.0 })
           .png({ quality: 100, compressionLevel: 0 })
           .toBuffer()
           .then((buf: Buffer) => generateHash(buf, 16, true)),
           
         // Variant 2: High contrast for bright/dark cards
         sharp(imageBuffer)
           .linear(1.3, -20)
           .png({ quality: 100, compressionLevel: 0 })
           .toBuffer()
           .then((buf: Buffer) => generateHash(buf, 16, true)),
          
        // Variant 3: Different bit depth for precision
        generateHash(imageBuffer, 12, true),
        
        // Variant 4: Alternative hash algorithm
        generateHash(imageBuffer, 20, false)
      ]);
      
      hashes.push(...variants);
      
      logger.debug('Generated hash variants', { 
        count: hashes.length,
        samples: hashes.slice(0, 2).map(h => h.substring(0, 8) + '...')
      });
      
      return hashes;
      
    } catch (error: any) {
      logger.error('Error generating hash variants', { message: error?.message });
      return [await generateHash(imageBuffer, 16, true)]; // Fallback to basic hash
    }
  }

  /**
   * Enhanced hash similarity calculation with multiple algorithms
   * @param hash1 First hash
   * @param hash2 Second hash  
   * @returns Similarity score (0-1)
   */
  private calculateEnhancedHashSimilarity(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return 0;
    }
    
    // Primary calculation: Hamming distance
    let hammingMatches = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) {
        hammingMatches++;
      }
    }
    const hammingSimilarity = hammingMatches / hash1.length;
    
    // Secondary calculation: Substring matching for partial matches
    let substringScore = 0;
    const chunkSize = Math.max(4, Math.floor(hash1.length / 8));
    for (let i = 0; i <= hash1.length - chunkSize; i += chunkSize) {
      const chunk1 = hash1.substring(i, i + chunkSize);
      const chunk2 = hash2.substring(i, i + chunkSize);
      if (chunk1 === chunk2) {
        substringScore += chunkSize;
      }
    }
    const substringSimilarity = substringScore / hash1.length;
    
    // Weighted combination
    const combinedSimilarity = (hammingSimilarity * 0.7) + (substringSimilarity * 0.3);
    
    return combinedSimilarity;
  }
  
  /**
   * Match a captured image to a card using perceptual hashing
   */
  public async matchCardImage(captureResult: CaptureResult): Promise<CardMatchResult> {
    const startTime = Date.now();
    
    // Default result with no match
    const noMatchResult: CardMatchResult = {
      region: captureResult.region,
      cardId: null,
      dbfId: null,
      name: null,
      confidence: 0,
      mana: null,
      rarity: null,
      matchMethod: 'none',
      timestamp: Date.now()
    };
    
    // If hashes aren't loaded or capture failed, return no match
    if (!this.hashesLoaded || !captureResult.success) {
      logger.debug('Cannot match card image', {
        hashesLoaded: this.hashesLoaded,
        captureSuccess: captureResult.success
      });
      return noMatchResult;
    }
    
    try {
      // Convert data URL to buffer
      const base64Data = captureResult.dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Preprocess image for hash matching
      const preprocessedBuffer = await this.preprocessForHashing(imageBuffer);
      
      // Generate multiple hash variants
      const hashVariants = await this.generateHashVariants(preprocessedBuffer);
      
      // Find best match by comparing hashes
      let bestMatch: CardHash | null = null;
      let bestSimilarity = 0;
      
      for (const cardHash of this.cardHashes) {
        for (const hashVariant of hashVariants) {
          const similarity = this.calculateEnhancedHashSimilarity(hashVariant, cardHash.hash);
          
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = cardHash;
          }
        }
      }
      
      // If we have a good match, return it
      if (bestMatch && bestSimilarity >= this.HASH_MATCH_THRESHOLD) {
        const matchDuration = Date.now() - startTime;
        
        logger.debug('Card matched by hash', {
          name: bestMatch.name,
          similarity: bestSimilarity,
          duration: matchDuration
        });
        
        return {
          region: captureResult.region,
          cardId: bestMatch.id,
          dbfId: bestMatch.dbfId,
          name: bestMatch.name,
          confidence: bestSimilarity,
          mana: bestMatch.mana,
          rarity: bestMatch.rarity,
          matchMethod: 'hash',
          timestamp: Date.now()
        };
      }
      
      // If no good match, return no match
      if (bestMatch) {
        logger.info('Hash match below threshold', {
          triedCard: bestMatch.name,
          bestSimilarity,
          threshold: this.HASH_MATCH_THRESHOLD,
          region: captureResult.region.name
        });
      } else {
        logger.debug('No hash match found – no card with any similarity', { region: captureResult.region.name });
      }
      return noMatchResult;
    } catch (error) {
      logger.error('Error matching card image', { error });
      return noMatchResult;
    }
  }
  
  /**
   * Match mana cost in a captured image
   * This is a placeholder implementation - in a real app, you would use
   * template matching with pixelmatch or similar
   */
  public async matchManaCost(captureResult: CaptureResult): Promise<TemplateMatchResult> {
    // Placeholder implementation
    return {
      matched: false,
      value: 0,
      confidence: 0
    };
  }
  
  /**
   * Match rarity gem in a captured image
   * This is a placeholder implementation - in a real app, you would use
   * template matching with pixelmatch or similar
   */
  public async matchRarityGem(captureResult: CaptureResult): Promise<TemplateMatchResult> {
    // Placeholder implementation
    return {
      matched: false,
      value: '',
      confidence: 0
    };
  }
} 
