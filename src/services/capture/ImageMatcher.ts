import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
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
  // Minimum similarity for a hash match. 0.85 proved a bit too strict for
  // the quality of screenshots we obtain from the screen-capture pipeline.
  // Lowering slightly increases recall while still avoiding most false
  // positives.  Tune further once we gather real-world stats via logging.
  private readonly HASH_MATCH_THRESHOLD = 0.8;
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
      
      // Generate hash for the captured image
      const capturedHash = await generateHash(imageBuffer, 16, true);
      
      // Find best match by comparing hashes
      let bestMatch: CardHash | null = null;
      let bestSimilarity = 0;
      
      for (const cardHash of this.cardHashes) {
        const similarity = this.calculateHashSimilarity(capturedHash, cardHash.hash);
        
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = cardHash;
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
   * Calculate similarity between two perceptual hashes
   * Returns a value between 0 (completely different) and 1 (identical)
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
