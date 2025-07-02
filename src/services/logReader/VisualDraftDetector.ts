import { EventEmitter } from 'events';
import logger from '../../utils/logger';
import { ScreenCaptureService } from '../capture/ScreenCaptureService';
import { OCRService } from '../ocr/OCRService';
import { CardMatcher } from '../cardData/CardMatcher';
import { Card } from '../cardData/CardDataService';
import { DraftState, CardData } from './ArenaDraftDetector';
import { ImageMatcher, CardMatchResult } from '../capture/ImageMatcher';
import { TemplateMatcher } from '../capture/TemplateMatcher';

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
    matchMethod?: 'hash' | 'ocr' | 'combined' | 'none';
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
  private imageMatcher: ImageMatcher | null = null;
  private templateMatcher: TemplateMatcher | null = null;
  private isActive: boolean = false;
  private detectionInterval: NodeJS.Timeout | null = null;
  private lastDetectionResult: VisualDetectionResult | null = null;
  private consecutiveFailures: number = 0;
  private readonly DETECTION_INTERVAL_MS = 1000; // Check every second when active
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.65; // Slightly lower threshold for more matches
  private readonly MIN_CARDS_DETECTED = 2; // Minimum number of cards to consider a valid detection
  private readonly MAX_CONSECUTIVE_FAILURES = 5; // Maximum consecutive failures before adjusting
  private useImageMatching: boolean = true; // Whether to use image matching
  
  /**
   * Creates a new VisualDraftDetector instance
   * @param screenCapture Optional existing ScreenCaptureService
   * @param ocrService Optional existing OCRService
   * @param cardMatcher Optional existing CardMatcher
   * @param imageMatcher Optional existing ImageMatcher
   * @param templateMatcher Optional existing TemplateMatcher
   */
  constructor(
    screenCapture?: ScreenCaptureService,
    ocrService?: OCRService,
    cardMatcher?: CardMatcher,
    imageMatcher?: ImageMatcher,
    templateMatcher?: TemplateMatcher
  ) {
    super();
    
    // Use provided services or create new ones
    this.screenCapture = screenCapture || new ScreenCaptureService();
    this.ocrService = ocrService || new OCRService();
    this.cardMatcher = cardMatcher || new CardMatcher();
    
    // Image matching services are initialized in start() to ensure CardDataService is available
    this.imageMatcher = imageMatcher || null;
    this.templateMatcher = templateMatcher || null;
    
    logger.info('VisualDraftDetector initialized');
  }
  
  /**
   * Start visual detection
   * @param cards Card data to use for matching
   * @param cardDataService CardDataService instance for image matching
   */
  public async start(cards: Card[], cardDataService?: any): Promise<void> {
    if (this.isActive) return;
    
    logger.info('Starting visual draft detection');
    
    try {
      // Update card matcher with current card data
      this.cardMatcher.setCards(cards);
      
      // Initialize OCR service
      await this.ocrService.initialize();
      
      // Initialize image matching services if not already provided
      if (!this.imageMatcher && cardDataService) {
        this.imageMatcher = new ImageMatcher(cardDataService);
        logger.info('ImageMatcher initialized');
      }
      
      if (!this.templateMatcher) {
        this.templateMatcher = new TemplateMatcher();
        logger.info('TemplateMatcher initialized');
      }
      
      // Check if image matching is available
      if (this.imageMatcher && this.imageMatcher.isReady()) {
        this.useImageMatching = true;
        logger.info('Image matching is available and will be used');
      } else {
        this.useImageMatching = false;
        logger.info('Image matching is not available, falling back to OCR only');
      }
      
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
      
      // Array to store all detection results
      const allDetectionResults: Array<CardData & { confidence: number; matchMethod: string }> = [];
      
      // Try image matching first if available
      if (this.useImageMatching && this.imageMatcher) {
        logger.debug('Attempting image matching');
        
        const imageMatchPromises = captureResults.map(capture => 
          this.imageMatcher!.matchCardImage(capture)
        );
        
        const imageMatchResults = await Promise.all(imageMatchPromises);
        
        // Filter successful matches
        const successfulImageMatches = imageMatchResults.filter(
          match => match.cardId !== null && match.confidence >= 0.85
        );
        
        // Add successful image matches to results
        for (const match of successfulImageMatches) {
          if (match.cardId && match.dbfId) {
            allDetectionResults.push({
              id: match.cardId,
              timestamp: match.timestamp,
              confidence: match.confidence,
              matchMethod: 'hash'
            });
          }
        }
        
        logger.debug('Image matching results', { 
          total: imageMatchResults.length,
          successful: successfulImageMatches.length 
        });
        
        // If we have enough matches from image matching, skip OCR
        if (successfulImageMatches.length >= this.MIN_CARDS_DETECTED) {
          logger.debug('Sufficient cards detected via image matching, skipping OCR');
          
          // Convert results to card data
          const detectedCards: CardData[] = successfulImageMatches.map(match => ({
            id: match.cardId!,
            timestamp: match.timestamp
          }));
          
          // Process the results as usual
          return this.processDetectionResults(detectedCards);
        }
      }
      
      // Fall back to OCR if image matching didn't find enough cards
      logger.debug('Falling back to OCR detection');
      
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
      
      // Add OCR matches to results
      for (const match of validMatches) {
        allDetectionResults.push({
          id: match.cardId,
          timestamp: match.timestamp,
          confidence: match.confidence,
          matchMethod: 'ocr'
        });
      }
      
      // Check if we have enough valid matches from all methods combined
      if (allDetectionResults.length < this.MIN_CARDS_DETECTED) {
        this.handleDetectionFailure('Not enough confident card matches detected');
        
        logger.debug('Not enough confident card matches detected', { 
          validMatchCount: allDetectionResults.length,
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
      const detectedCards: CardData[] = allDetectionResults.map(result => ({
        id: result.id,
        timestamp: result.timestamp
      }));
      
      return this.processDetectionResults(detectedCards);
      
    } catch (error) {
      logger.error('Error during visual card detection', { error });
      this.handleDetectionFailure(`Error: ${error}`);
      
      return {
        cards: [],
        timestamp: Date.now(),
        success: false,
        error: `Error during visual card detection: ${error}`
      };
    }
  }
  
  /**
   * Process detection results and handle consistency checks
   */
  private processDetectionResults(detectedCards: CardData[]): VisualDetectionResult {
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
  }
  
  /**
   * Handle detection failure
   */
  private handleDetectionFailure(reason: string): void {
    this.consecutiveFailures++;
    
    logger.debug('Visual detection failed', {
      reason,
      consecutiveFailures: this.consecutiveFailures
    });
    
    if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      logger.warn('Multiple consecutive visual detection failures', {
        count: this.consecutiveFailures,
        reason
      });
    }
  }
  
  /**
   * Compare two card ID arrays for equality
   */
  private areCardArraysEqual(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) {
      return false;
    }
    
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Start continuous detection
   */
  public async startContinuousDetection(draftState: DraftState): Promise<void> {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    
    logger.info('Starting continuous visual detection');
    
    // Initial detection
    const initialResult = await this.detectCards();
    if (initialResult.success && initialResult.cards.length > 0) {
      this.emit('cardsDetected', initialResult.cards);
    }
    
    // Set up interval for continuous detection
    this.detectionInterval = setInterval(async () => {
      try {
      const result = await this.detectCards();
        
      if (result.success && result.cards.length > 0) {
          this.emit('cardsDetected', result.cards);
        }
      } catch (error) {
        logger.error('Error in continuous visual detection', { error });
      }
    }, this.DETECTION_INTERVAL_MS);
    
    logger.info('Continuous visual detection started');
  }
  
  /**
   * Stop continuous detection
   */
  public stopContinuousDetection(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
      
      logger.info('Continuous visual detection stopped');
    }
  }
  
  /**
   * Update card data
   */
  public updateCardData(cards: Card[]): void {
    logger.info('Updating card data for visual detection', { count: cards.length });
    
    this.cardMatcher.setCards(cards);
    
    // Reset detection state
    this.lastDetectionResult = null;
    this.consecutiveFailures = 0;
  }
  
  /**
   * Test detection with various options
   */
  public async testDetection(options?: {
    confidenceThreshold?: number;
    preprocessingOptions?: Partial<import('../capture/ScreenCaptureService').PreprocessingOptions>;
    useImageMatching?: boolean;
  }): Promise<VisualDetectionResult> {
    logger.info('Running visual detection test', { options });
    
    // Override image matching setting if specified
    const originalImageMatchingSetting = this.useImageMatching;
    if (options?.useImageMatching !== undefined) {
      this.useImageMatching = options.useImageMatching;
    }
    
    try {
      // Capture card name regions with specified preprocessing options
      const captureResults = await this.screenCapture.captureCardNameRegions(
        options?.preprocessingOptions
      );
      
      if (captureResults.length === 0) {
        return {
          cards: [],
          timestamp: Date.now(),
          success: false,
          error: 'Failed to capture card regions'
        };
      }
      
      const allTestMatches: TestResults['allMatches'] = [];
      const detectedCards: CardData[] = [];
      
      // Try image matching if enabled
      if (this.useImageMatching && this.imageMatcher) {
        logger.debug('Testing image matching');
        
        const imageMatchPromises = captureResults.map(capture => 
          this.imageMatcher!.matchCardImage(capture)
        );
        
        const imageMatchResults = await Promise.all(imageMatchPromises);
        
        // Add image match results to test results
        for (const match of imageMatchResults) {
          if (match.cardId) {
            allTestMatches.push({
              cardId: match.cardId,
              matchedName: match.name || 'Unknown',
              originalText: `[Image hash match]`,
              confidence: match.confidence,
              success: match.confidence >= (options?.confidenceThreshold || 0.85),
              region: match.region.name,
              matchMethod: 'hash'
            });
            
            // Add to detected cards if confidence is high enough
            if (match.confidence >= (options?.confidenceThreshold || 0.85)) {
              detectedCards.push({
                id: match.cardId,
                timestamp: match.timestamp
              });
            }
          }
        }
      }
      
      // Process with OCR
      const ocrResults = await this.ocrService.processImages(captureResults);
      
      // Match OCR results to card names
      const confidenceThreshold = options?.confidenceThreshold || this.MIN_CONFIDENCE_THRESHOLD;
      const matchResults = this.cardMatcher.matchCards(ocrResults);
      
      // Add OCR match results to test results
      for (const match of matchResults) {
        allTestMatches.push({
          cardId: match.cardId,
          matchedName: match.matchedName,
          originalText: match.originalText,
          confidence: match.confidence,
          success: match.success && match.confidence >= confidenceThreshold,
          region: match.region,
          matchMethod: 'ocr'
        });
        
        // Add to detected cards if confidence is high enough and not already added
        if (match.success && match.confidence >= confidenceThreshold) {
          const alreadyDetected = detectedCards.some(card => card.id === match.cardId);
          if (!alreadyDetected) {
            detectedCards.push({
              id: match.cardId,
              timestamp: match.timestamp
            });
          }
        }
      }
      
      // Create test results
      const testResults: TestResults = {
        allMatches: allTestMatches,
        captureRegions: captureResults.map(capture => capture.region.name),
        confidenceThreshold: confidenceThreshold,
        preprocessingOptions: options?.preprocessingOptions
      };
      
      return {
        cards: detectedCards,
        timestamp: Date.now(),
        success: detectedCards.length >= this.MIN_CARDS_DETECTED,
        testResults
      };
    } catch (error) {
      logger.error('Error during visual detection test', { error });
      
      return {
        cards: [],
        timestamp: Date.now(),
        success: false,
        error: `Error during visual detection test: ${error}`
      };
    } finally {
      // Restore original image matching setting
      this.useImageMatching = originalImageMatchingSetting;
    }
  }
}

export default VisualDraftDetector;