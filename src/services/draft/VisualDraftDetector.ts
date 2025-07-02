import { EventEmitter } from 'events';
import logger from '../../utils/logger';
import ScreenCaptureService, { CaptureRegion, CaptureResult } from '../capture/ScreenCaptureService';
import ImageMatcherService from '../vision/ImageMatcherService';
import TemplateMatcherService from '../vision/TemplateMatcherService';

/**
 * Interface for a detected card
 */
export interface DetectedCard {
  cardIndex: number;
  cardId: string;
  confidence: number;
  imageUrl?: string;
}

/**
 * Interface for draft detection result
 */
export interface DraftDetectionResult {
  cards: DetectedCard[];
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * VisualDraftDetector
 * Detects cards in the Hearthstone draft using computer vision
 */
export class VisualDraftDetector extends EventEmitter {
  private screenCaptureService: ScreenCaptureService;
  private imageMatcherService: ImageMatcherService;
  private templateMatcherService: TemplateMatcherService;
  private detectionInterval: NodeJS.Timeout | null = null;
  private detectionInProgress = false;
  private lastDetectionResult: DraftDetectionResult | null = null;
  private detectionIntervalMs = 2000; // Default to 2 seconds
  private confidenceThreshold = 0.7; // Minimum confidence for a valid detection
  
  /**
   * Creates a new VisualDraftDetector instance
   * @param screenCaptureService Screen capture service
   * @param imageMatcherService Image matcher service
   * @param templateMatcherService Template matcher service
   */
  constructor(
    screenCaptureService: ScreenCaptureService,
    imageMatcherService: ImageMatcherService,
    templateMatcherService: TemplateMatcherService
  ) {
    super();
    this.screenCaptureService = screenCaptureService;
    this.imageMatcherService = imageMatcherService;
    this.templateMatcherService = templateMatcherService;
    
    logger.info('VisualDraftDetector initialized');
  }
  
  /**
   * Start detecting cards
   * @param intervalMs Optional interval in milliseconds
   */
  public startDetection(intervalMs?: number): void {
    if (this.detectionInterval) {
      this.stopDetection();
    }
    
    if (intervalMs) {
      this.detectionIntervalMs = intervalMs;
    }
    
    logger.info('Starting visual draft detection', { intervalMs: this.detectionIntervalMs });
    
    // Run detection immediately
    this.detectCards();
    
    // Then set up interval
    this.detectionInterval = setInterval(() => {
      this.detectCards();
    }, this.detectionIntervalMs);
  }
  
  /**
   * Stop detecting cards
   */
  public stopDetection(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
      logger.info('Stopped visual draft detection');
    }
  }
  
  /**
   * Detect cards in the current screen
   * @returns Promise resolving to detection result
   */
  public async detectCards(): Promise<DraftDetectionResult> {
    // Skip if detection is already in progress
    if (this.detectionInProgress) {
      logger.debug('Card detection already in progress, skipping');
      return {
        cards: [],
        timestamp: Date.now(),
        success: false,
        error: 'Detection already in progress'
      };
    }
    
    this.detectionInProgress = true;
    
    try {
      // Attempt to detect regions dynamically if not already done
      await this.ensureRegionsDetected();
      
      // Get capture regions
      const regions = await this.screenCaptureService.getCaptureRegions();
      
      if (regions.length === 0) {
        logger.warn('No capture regions available for card detection');
        this.detectionInProgress = false;
        return {
          cards: [],
          timestamp: Date.now(),
          success: false,
          error: 'No capture regions available'
        };
      }
      
      // Capture all regions
      const captureResults = await Promise.all(
        regions.map(region => this.screenCaptureService.captureRegion(region))
      );
      
      // Check if any captures failed
      const failedCaptures = captureResults.filter(result => !result.success);
      if (failedCaptures.length > 0) {
        logger.warn('Some regions failed to capture', { failedCount: failedCaptures.length });
        
        // If all captures failed, return error
        if (failedCaptures.length === regions.length) {
          this.detectionInProgress = false;
          return {
            cards: [],
            timestamp: Date.now(),
            success: false,
            error: 'All captures failed'
          };
        }
      }
      
      // Get mana regions for additional verification
      const manaRegions = this.screenCaptureService.getManaRegions();
      const manaResults = await Promise.all(
        manaRegions.map(region => this.screenCaptureService.captureRegion(region))
      );
      
      // Get rarity regions for additional verification
      const rarityRegions = this.screenCaptureService.getRarityRegions();
      const rarityResults = await Promise.all(
        rarityRegions.map(region => this.screenCaptureService.captureRegion(region))
      );
      
      // Process each captured image to detect cards
      const detectedCards: DetectedCard[] = [];
      
      for (let i = 0; i < captureResults.length; i++) {
        const result = captureResults[i];
        
        if (!result.success || !result.dataUrl) {
          continue;
        }
        
        try {
          // Extract card index from region name
          const cardIndexMatch = result.region.name.match(/card(\d+)/);
          const cardIndex = cardIndexMatch ? parseInt(cardIndexMatch[1]) : i + 1;
          
          // Use fast-hash image matching as primary detection method
          const imageMatch = await this.imageMatcherService.matchCardImage(result.dataUrl);
          
          // Additional verification with mana cost and rarity if available
          const manaMatch = i < manaResults.length && manaResults[i].success && manaResults[i].dataUrl
            ? await this.templateMatcherService.matchManaTemplate(manaResults[i].dataUrl)
            : { cardId: '', confidence: 0 };
            
          const rarityMatch = i < rarityResults.length && rarityResults[i].success && rarityResults[i].dataUrl
            ? await this.templateMatcherService.matchRarityTemplate(rarityResults[i].dataUrl)
            : { cardId: '', confidence: 0 };
          
          // Weighted combination of all matching methods
          const finalCardId = this.combineMatchResults(imageMatch, manaMatch, rarityMatch);
          
          if (finalCardId.cardId && finalCardId.confidence >= this.confidenceThreshold) {
            detectedCards.push({
              cardIndex,
              cardId: finalCardId.cardId,
              confidence: finalCardId.confidence,
              imageUrl: result.dataUrl
            });
            
            logger.debug('Detected card', {
              cardIndex,
              cardId: finalCardId.cardId,
              confidence: finalCardId.confidence.toFixed(2),
              imageMatch: imageMatch.confidence.toFixed(2),
              manaMatch: manaMatch.confidence.toFixed(2),
              rarityMatch: rarityMatch.confidence.toFixed(2)
            });
          } else {
            logger.debug('Failed to detect card with sufficient confidence', {
              cardIndex,
              bestMatch: finalCardId.cardId,
              confidence: finalCardId.confidence.toFixed(2)
            });
          }
        } catch (error) {
          logger.error('Error processing capture result', { 
            regionName: result.region.name,
            error
          });
        }
      }
      
      // Create detection result
      const detectionResult: DraftDetectionResult = {
        cards: detectedCards,
        timestamp: Date.now(),
        success: detectedCards.length > 0
      };
      
      // Check if the result is different from the last one
      const isDifferent = this.isResultDifferent(detectionResult);
      
      if (isDifferent) {
        logger.info('Detected cards changed', { 
          cardCount: detectedCards.length,
          cards: detectedCards.map(card => `${card.cardIndex}: ${card.cardId} (${card.confidence.toFixed(2)})`)
        });
        
        // Save as last result
        this.lastDetectionResult = detectionResult;
        
        // Emit event
        this.emit('cardsDetected', detectionResult);
      }
      
      this.detectionInProgress = false;
      return detectionResult;
    } catch (error) {
      logger.error('Error detecting cards', { error });
      
      this.detectionInProgress = false;
      return {
        cards: [],
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Combine results from different matching methods
   * @param imageMatch Image matching result
   * @param manaMatch Mana template matching result
   * @param rarityMatch Rarity template matching result
   * @returns Combined match result
   */
  private combineMatchResults(
    imageMatch: { cardId: string; confidence: number },
    manaMatch: { cardId: string; confidence: number },
    rarityMatch: { cardId: string; confidence: number }
  ): { cardId: string; confidence: number } {
    // If all methods agree on the same card, return that with high confidence
    if (imageMatch.cardId && 
        imageMatch.cardId === manaMatch.cardId && 
        imageMatch.cardId === rarityMatch.cardId) {
      return {
        cardId: imageMatch.cardId,
        confidence: Math.max(0.95, (imageMatch.confidence + manaMatch.confidence + rarityMatch.confidence) / 3)
      };
    }
    
    // If image match has high confidence, trust it
    if (imageMatch.confidence > 0.85) {
      return imageMatch;
    }
    
    // If mana and rarity agree but differ from image, check confidence
    if (manaMatch.cardId && 
        manaMatch.cardId === rarityMatch.cardId && 
        manaMatch.cardId !== imageMatch.cardId) {
      const manaRarityConfidence = (manaMatch.confidence + rarityMatch.confidence) / 2;
      
      if (manaRarityConfidence > imageMatch.confidence + 0.15) {
        return {
          cardId: manaMatch.cardId,
          confidence: manaRarityConfidence
        };
      }
    }
    
    // Create a map to count occurrences and aggregate confidence
    const cardCounts: Map<string, { count: number; totalConfidence: number }> = new Map();
    
    // Add each match to the map
    [imageMatch, manaMatch, rarityMatch].forEach(match => {
      if (match.cardId && match.confidence > 0.5) {
        const current = cardCounts.get(match.cardId) || { count: 0, totalConfidence: 0 };
        current.count++;
        current.totalConfidence += match.confidence;
        cardCounts.set(match.cardId, current);
      }
    });
    
    // Find the card with the highest count, breaking ties with confidence
    let bestCardId = '';
    let bestCount = 0;
    let bestConfidence = 0;
    
    cardCounts.forEach((value, cardId) => {
      const avgConfidence = value.totalConfidence / value.count;
      
      if (value.count > bestCount || 
          (value.count === bestCount && avgConfidence > bestConfidence)) {
        bestCardId = cardId;
        bestCount = value.count;
        bestConfidence = avgConfidence;
      }
    });
    
    // If we found a best match
    if (bestCardId) {
      return {
        cardId: bestCardId,
        confidence: bestConfidence
      };
    }
    
    // Default to the image match if nothing else worked
    return imageMatch;
  }
  
  /**
   * Check if detection result is different from the last one
   * @param result Current detection result
   * @returns True if different, false otherwise
   */
  private isResultDifferent(result: DraftDetectionResult): boolean {
    if (!this.lastDetectionResult) {
      return true;
    }
    
    if (result.cards.length !== this.lastDetectionResult.cards.length) {
      return true;
    }
    
    for (let i = 0; i < result.cards.length; i++) {
      const current = result.cards[i];
      const previous = this.lastDetectionResult.cards.find(c => c.cardIndex === current.cardIndex);
      
      if (!previous || previous.cardId !== current.cardId) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Ensure regions are detected
   */
  private async ensureRegionsDetected(): Promise<void> {
    try {
      const hasRegions = await this.screenCaptureService.hasValidManualRegions();
      
      if (!hasRegions) {
        logger.info('No valid manual regions, attempting to detect card regions');
        await this.screenCaptureService.detectCardRegions();
      }
    } catch (error) {
      logger.error('Error ensuring regions detected', { error });
    }
  }
  
  /**
   * Get the last detection result
   * @returns Last detection result or null if none
   */
  public getLastDetectionResult(): DraftDetectionResult | null {
    return this.lastDetectionResult;
  }
  
  /**
   * Trigger manual detection
   * @returns Promise resolving to detection result
   */
  public async triggerManualDetection(): Promise<DraftDetectionResult> {
    return this.detectCards();
  }
}

export default VisualDraftDetector;