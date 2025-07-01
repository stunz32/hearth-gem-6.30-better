import { EventEmitter } from 'events';
import logger from '../../utils/logger';
import ScreenCaptureService from '../capture/ScreenCaptureService';
import OCRService from '../ocr/OCRService';
import CardMatcher from '../cardData/CardMatcher';
import { Card } from '../cardData/CardDataService';
import { DraftState, CardData } from './ArenaDraftDetector';

/**
 * Interface for visual detection test results
 */
export interface TestResults {
  allMatches: Array<{
    cardId: string;
    matchedName: string;
    originalText: string;
    confidence: number;
    success: boolean;
    region: string;
  }>;
  captureRegions: string[];
  confidenceThreshold: number;
  preprocessingOptions?: any;
}

/**
 * Interface for visual detection result
 */
export interface VisualDetectionResult {
  cards: CardData[];
  timestamp: number;
  success: boolean;
  error?: string;
  testResults?: TestResults;
}

/**
 * VisualDraftDetector service
 * Detects Arena draft cards using screen capture and OCR
 * @module VisualDraftDetector
 */
export class VisualDraftDetector extends EventEmitter {
  private screenCapture: ScreenCaptureService;
  private ocrService: OCRService;
  private cardMatcher: CardMatcher;
  private isActive: boolean = false;
  private detectionInterval: NodeJS.Timeout | null = null;
  private lastDetectionResult: VisualDetectionResult | null = null;
  private consecutiveFailures: number = 0;
  private readonly DETECTION_INTERVAL_MS = 1000; // Check every second when active
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.65; // Slightly lower threshold for more matches
  private readonly MIN_CARDS_DETECTED = 2; // Minimum number of cards to consider a valid detection
  private readonly MAX_CONSECUTIVE_FAILURES = 5; // Maximum consecutive failures before adjusting
  // CONSECUTIVE_MATCH_REQUIRED removed as it was unused
  
  /**
   * Creates a new VisualDraftDetector instance
   * @param screenCapture Optional existing ScreenCaptureService
   * @param ocrService Optional existing OCRService
   * @param cardMatcher Optional existing CardMatcher
   */
  constructor(
    screenCapture?: ScreenCaptureService,
    ocrService?: OCRService,
    cardMatcher?: CardMatcher
  ) {
    super();
    
    // Use provided services or create new ones
    this.screenCapture = screenCapture || new ScreenCaptureService();
    this.ocrService = ocrService || new OCRService();
    this.cardMatcher = cardMatcher || new CardMatcher();
    
    logger.info('VisualDraftDetector initialized');
  }
  
  /**
   * Start visual detection
   * @param cards Card data to use for matching
   */
  public async start(cards: Card[]): Promise<void> {
    if (this.isActive) return;
    
    logger.info('Starting visual draft detection');
    
    try {
      // Update card matcher with current card data
      this.cardMatcher.setCards(cards);
      
      // Initialize OCR service
      await this.ocrService.initialize();
      
      this.isActive = true;
      
      // Emit started event
      this.emit('started');
      
      logger.info('Visual draft detection started successfully');
    } catch (error) {
      logger.error('Failed to start visual draft detection', { error });
      throw new Error(`Failed to start visual draft detection: ${error}`);
    }
  }
  
  /**
   * Stop visual detection
   */
  public stop(): void {
    if (!this.isActive) return;
    
    logger.info('Stopping visual draft detection');
    
    // Clear detection interval if active
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    
    this.isActive = false;
    
    // Emit stopped event
    this.emit('stopped');
    
    logger.info('Visual draft detection stopped');
  }
  
  /**
   * Detect cards in the current screen
   * @returns Promise resolving to detection result
   */
  public async detectCards(): Promise<VisualDetectionResult> {
    if (!this.isActive) {
      return {
        cards: [],
        timestamp: Date.now(),
        success: false,
        error: 'Visual detection is not active'
      };
    }
    
    try {
      logger.debug('Starting visual card detection');
      
      // Capture card name regions
      const captureResults = await this.screenCapture.captureCardNameRegions();
      if (captureResults.length === 0) {
        this.handleDetectionFailure('Failed to capture card regions');
        return {
          cards: [],
          timestamp: Date.now(),
          success: false,
          error: 'Failed to capture card regions'
        };
      }
      
      // Process captured images with OCR
      const ocrResults = await this.ocrService.processImages(captureResults);
      
      // Match OCR results to card names
      const matchResults = this.cardMatcher.matchCards(ocrResults);
      
      // Filter results by confidence threshold
      let confidenceThreshold = this.MIN_CONFIDENCE_THRESHOLD;
      
      // Adjust threshold if we've had consecutive failures
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        // Lower threshold slightly after multiple failures to improve chances of detection
        confidenceThreshold = Math.max(0.5, confidenceThreshold - 0.05);
        logger.debug('Adjusting confidence threshold due to consecutive failures', {
          originalThreshold: this.MIN_CONFIDENCE_THRESHOLD,
          adjustedThreshold: confidenceThreshold,
          consecutiveFailures: this.consecutiveFailures
        });
      }
      
      const validMatches = matchResults.filter(
        match => match.success && match.confidence >= confidenceThreshold
      );
      
      // Check if we have enough valid matches
      if (validMatches.length < this.MIN_CARDS_DETECTED) {
        this.handleDetectionFailure('Not enough confident card matches detected');
        
        logger.debug('Not enough confident card matches detected', { 
          validMatchCount: validMatches.length,
          threshold: this.MIN_CARDS_DETECTED,
          confidenceThreshold
        });
        
        return {
          cards: [],
          timestamp: Date.now(),
          success: false,
          error: 'Not enough confident card matches detected'
        };
      }
      
      // Convert match results to card data
      const detectedCards: CardData[] = validMatches.map(match => ({
        id: match.cardId,
        timestamp: match.timestamp
      }));
      
      // Check for consistency with previous detection if available
      if (this.lastDetectionResult && this.lastDetectionResult.success) {
        const previousCards = this.lastDetectionResult.cards.map(card => card.id).sort();
        const currentCards = detectedCards.map(card => card.id).sort();
        
        // If cards are different, require consecutive matches for validation
        if (!this.areCardArraysEqual(previousCards, currentCards)) {
          // Store this result for next comparison but don't emit it yet
          this.lastDetectionResult = {
            cards: detectedCards,
            timestamp: Date.now(),
            success: true
          };
          
          logger.debug('New card set detected, waiting for confirmation', {
            previousCards,
            currentCards
          });
          
          return {
            cards: [],
            timestamp: Date.now(),
            success: false,
            error: 'Waiting for detection confirmation'
          };
        }
      }
      
      // Reset failure counter on successful detection
      this.consecutiveFailures = 0;
      
      // Store this result for future comparisons
      this.lastDetectionResult = {
        cards: detectedCards,
        timestamp: Date.now(),
        success: true
      };
      
      logger.info('Cards detected visually', { 
        count: detectedCards.length,
        cards: detectedCards.map(card => card.id)
      });
      
      return {
        cards: detectedCards,
        timestamp: Date.now(),
        success: true
      };
    } catch (error) {
      this.handleDetectionFailure(`Detection failed: ${error}`);
      logger.error('Error during visual card detection', { error });
      
      return {
        cards: [],
        timestamp: Date.now(),
        success: false,
        error: `Detection failed: ${error}`
      };
    }
  }
  
  /**
   * Handle detection failure by incrementing counter
   * @param reason Failure reason
   * @private
   */
  private handleDetectionFailure(reason: string): void {
    this.consecutiveFailures++;
    logger.debug('Visual detection failure', {
      reason,
      consecutiveFailures: this.consecutiveFailures
    });
  }
  
  /**
   * Compare two card ID arrays for equality
   * @param arr1 First array of card IDs
   * @param arr2 Second array of card IDs
   * @returns True if arrays contain the same elements
   * @private
   */
  private areCardArraysEqual(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) return false;
    
    // Arrays are already sorted, so we can compare directly
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    
    return true;
  }
  
  /**
   * Start continuous detection
   * @param draftState Current draft state
   * @returns Promise resolving when detection is started
   */
  public async startContinuousDetection(draftState: DraftState): Promise<void> {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    
    // Only start continuous detection if we're in a relevant draft state
    if (draftState !== DraftState.HERO_SELECTION && draftState !== DraftState.CARD_SELECTION) {
      logger.debug('Not starting continuous detection - not in relevant draft state', { state: draftState });
      return;
    }
    
    logger.info('Starting continuous visual detection', { state: draftState });
    
    // Run initial detection
    const initialResult = await this.detectCards();
    if (initialResult.success && initialResult.cards.length > 0) {
      this.emit('cardsDetected', initialResult);
    }
    
    // Set up interval for continuous detection
    this.detectionInterval = setInterval(async () => {
      const result = await this.detectCards();
      if (result.success && result.cards.length > 0) {
        this.emit('cardsDetected', result);
      }
    }, this.DETECTION_INTERVAL_MS);
  }
  
  /**
   * Stop continuous detection
   */
  public stopContinuousDetection(): void {
    if (this.detectionInterval) {
      logger.info('Stopping continuous visual detection');
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }
  
  /**
   * Update the card matcher with new card data
   * @param cards Updated card data
   */
  public updateCardData(cards: Card[]): void {
    this.cardMatcher.setCards(cards);
    logger.info('Card data updated in visual detector', { cardCount: cards.length });
  }
  
  /**
   * Test detection with different settings
   * This is useful for debugging and fine-tuning the detection
   * @param options Test options
   * @returns Promise resolving to detection result
   */
  public async testDetection(options?: {
    confidenceThreshold?: number;
    preprocessingOptions?: Partial<import('../capture/ScreenCaptureService').PreprocessingOptions>;
  }): Promise<VisualDetectionResult> {
    // Save current state
    const wasActive = this.isActive;
    // No need to save the original threshold as we're not modifying it
    
    try {
      // Temporarily activate if not already active
      if (!wasActive) {
        this.isActive = true;
      }
      
      logger.info('Starting visual detection test', { options });
      
      // Capture card name regions with custom preprocessing if provided
      const captureResults = await this.screenCapture.captureCardNameRegions(options?.preprocessingOptions);
      if (captureResults.length === 0) {
        return {
          cards: [],
          timestamp: Date.now(),
          success: false,
          error: 'Failed to capture card regions'
        };
      }
      
      // Process captured images with OCR
      const ocrResults = await this.ocrService.processImages(captureResults);
      
      // Match OCR results to card names
      const matchResults = this.cardMatcher.matchCards(ocrResults);
      
      // Use provided threshold or default
      const confidenceThreshold = options?.confidenceThreshold || this.MIN_CONFIDENCE_THRESHOLD;
      
      // Filter results by confidence threshold
      const validMatches = matchResults.filter(
        match => match.success && match.confidence >= confidenceThreshold
      );
      
      // Include all matches in the result for analysis
      const allMatches = matchResults.map(match => ({
        cardId: match.cardId,
        matchedName: match.matchedName,
        originalText: match.originalText,
        confidence: match.confidence,
        success: match.success,
        region: match.region
      }));
      
      // Convert valid matches to card data
      const detectedCards: CardData[] = validMatches.map(match => ({
        id: match.cardId,
        timestamp: match.timestamp
      }));
      
      logger.info('Test detection results', { 
        validMatchCount: validMatches.length,
        totalMatchCount: matchResults.length,
        confidenceThreshold,
        detectedCards: detectedCards.map(card => card.id)
      });
      
      return {
        cards: detectedCards,
        timestamp: Date.now(),
        success: true,
        testResults: {
          allMatches,
          captureRegions: captureResults.map(r => r.region.name),
          confidenceThreshold,
          preprocessingOptions: options?.preprocessingOptions
        }
      };
    } catch (error) {
      logger.error('Error during visual detection test', { error });
      
      return {
        cards: [],
        timestamp: Date.now(),
        success: false,
        error: `Test detection failed: ${error}`
      };
    } finally {
      // Restore original state
      this.isActive = wasActive;
    }
  }
}

export default VisualDraftDetector;