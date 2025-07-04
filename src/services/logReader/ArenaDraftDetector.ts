import { EventEmitter } from 'events';
import { getLogger } from '../../utils/logger';

// Create logger instance for this module
const logger = getLogger('src/services/logReader/ArenaDraftDetector');
import LogWatcher from './LogWatcher';
import VisualDraftDetector, { VisualDetectionResult } from './VisualDraftDetector';
import { Card } from '../cardData/CardDataService';

/**
 * State of the Arena draft process
 * @enum
 */
export enum DraftState {
  INACTIVE = 'inactive',
  STARTED = 'started',
  HERO_SELECTION = 'hero_selection',
  CARD_SELECTION = 'card_selection',
  COMPLETED = 'completed'
}

/**
 * Interface for card data
 * @interface
 */
export interface CardData {
  id: string;
  timestamp?: number;
}

/**
 * Interface for draft pick data
 * @interface
 */
export interface DraftPick {
  pickNumber: number;
  options: CardData[];
  selected?: CardData;
}

/**
 * ArenaDraftDetector service
 * Monitors Hearthstone logs to detect and track Arena draft sessions
 * Integrates visual detection as a fallback
 * @module ArenaDraftDetector
 */
export class ArenaDraftDetector extends EventEmitter {
  private logWatcher: LogWatcher;
  private visualDetector: VisualDraftDetector | null = null;
  private currentState: DraftState = DraftState.INACTIVE;
  private currentPick: number = 0;
  private currentOptions: CardData[] = [];
  private draftPicks: DraftPick[] = [];
  private selectedHero: string | null = null;
  private lastCardTimestamp: number = 0;
  private useVisualDetection: boolean = false;
  private cardData: Card[] = [];
  private readonly CARD_GROUP_THRESHOLD_MS = 2000; // 2 seconds threshold for grouping cards
  
  /**
   * Creates a new ArenaDraftDetector instance
   * @param logWatcher Optional existing LogWatcher instance
   * @param visualDetector Optional existing VisualDraftDetector instance
   * @param useVisualDetection Whether to use visual detection (default: false)
   */
  constructor(
    logWatcher?: LogWatcher,
    visualDetector?: VisualDraftDetector,
    useVisualDetection: boolean = false
  ) {
    super();
    
    // Use provided LogWatcher or create a new one
    this.logWatcher = logWatcher || new LogWatcher();
    
    // Use provided VisualDraftDetector or create a new one if visual detection is enabled
    if (useVisualDetection) {
      this.visualDetector = visualDetector || new VisualDraftDetector();
      this.useVisualDetection = true;
    }
    
    // Register event listeners
    this.registerEventListeners();
    
    logger.info('ArenaDraftDetector initialized', { useVisualDetection: this.useVisualDetection });
  }
  
  /**
   * Start monitoring for Arena drafts
   */
  public async start(): Promise<void> {
    logger.info('Starting Arena draft detection');
    
    // Start log watcher
    this.logWatcher.start();
    
    // Start visual detector if enabled and we have card data
    if (this.useVisualDetection && this.visualDetector && this.cardData.length > 0) {
      try {
        await this.visualDetector.start(this.cardData);
        logger.info('Visual draft detection started');
      } catch (error) {
        logger.error('Failed to start visual draft detection', { error });
        this.useVisualDetection = false;
      }
    }
  }
  
  /**
   * Stop monitoring for Arena drafts
   */
  public stop(): void {
    logger.info('Stopping Arena draft detection');
    
    // Stop log watcher
    this.logWatcher.stop();
    
    // Stop visual detector if enabled
    if (this.useVisualDetection && this.visualDetector) {
      this.visualDetector.stop();
      logger.info('Visual draft detection stopped');
    }
  }
  
  /**
   * Set card data for visual detection
   * @param cards Card data to use for matching
   */
  public setCardData(cards: Card[]): void {
    this.cardData = cards;
    
    // Update visual detector if available
    if (this.visualDetector) {
      this.visualDetector.updateCardData(cards);
    }
    
    logger.info('Card data updated in draft detector', { cardCount: cards.length });
  }
  
  /**
   * Enable or disable visual detection
   * @param enabled Whether visual detection should be enabled
   */
  public setVisualDetection(enabled: boolean): void {
    if (enabled === this.useVisualDetection) return;
    
    this.useVisualDetection = enabled;
    
    if (enabled) {
      if (!this.visualDetector) {
        this.visualDetector = new VisualDraftDetector();
        this.registerVisualDetectorEvents();
      }
      
      // Start visual detector if we're already running
      if (this.cardData.length > 0) {
        this.visualDetector.start(this.cardData).catch(error => {
          logger.error('Failed to start visual detector', { error });
        });
      }
      
      logger.info('Visual detection enabled');
    } else if (this.visualDetector) {
      this.visualDetector.stop();
      logger.info('Visual detection disabled');
    }
  }
  
  /**
   * Get the current state of the draft
   * @returns Current draft state
   */
  public getState(): DraftState {
    return this.currentState;
  }
  
  /**
   * Get the current draft picks
   * @returns Array of draft picks
   */
  public getDraftPicks(): DraftPick[] {
    return [...this.draftPicks];
  }
  
  /**
   * Get the selected hero
   * @returns Selected hero card ID or null
   */
  public getSelectedHero(): string | null {
    return this.selectedHero;
  }
  
  /**
   * Register event listeners with the LogWatcher
   * @private
   */
  private registerEventListeners(): void {
    // Listen for log directory found event
    this.logWatcher.on('logDirectoryFound', (data) => {
      logger.info('Log directory found', { directory: data.directory });
      this.emit('logDirectoryFound', data);
    });
    
    // Listen for log file events
    this.logWatcher.on('logFileActivity', (data) => {
      logger.info('Log file activity detected', { file: data.file });
      this.emit('logFileActivity', data);
    });
    
    this.logWatcher.on('draftStarted', this.handleDraftStarted.bind(this));
    this.logWatcher.on('draftCompleted', this.handleDraftCompleted.bind(this));
    this.logWatcher.on('draftCardChosen', this.handleDraftCardChosen.bind(this));
    this.logWatcher.on('cardShown', this.handleCardShown.bind(this));
    this.logWatcher.on('arenaGameStarted', this.handleArenaGameStarted.bind(this));
    this.logWatcher.on('heroSelected', this.handleHeroSelected.bind(this));
    this.logWatcher.on('draftCardDetected', this.handleDraftCardDetected.bind(this));
    
    // Register visual detector events if available
    if (this.visualDetector) {
      this.registerVisualDetectorEvents();
    }
  }
  
  /**
   * Register event listeners with the VisualDraftDetector
   * @private
   */
  private registerVisualDetectorEvents(): void {
    if (!this.visualDetector) return;
    
    this.visualDetector.on('cardsDetected', this.handleVisualCardsDetected.bind(this));
    
    this.visualDetector.on('started', () => {
      logger.info('Visual detector started');
    });
    
    this.visualDetector.on('stopped', () => {
      logger.info('Visual detector stopped');
    });
  }
  
  /**
   * Handle draft started event
   * @private
   */
  private handleDraftStarted(): void {
    logger.info('Arena draft started');
    this.currentState = DraftState.STARTED;
    this.currentPick = 0;
    this.currentOptions = [];
    this.draftPicks = [];
    this.selectedHero = null;
    this.lastCardTimestamp = 0;
    
    this.emit('stateChanged', this.currentState);
    this.emit('draftStarted');
    
    // Start visual detection if enabled
    if (this.useVisualDetection && this.visualDetector) {
      this.visualDetector.startContinuousDetection(this.currentState).catch(error => {
        logger.error('Failed to start continuous visual detection', { error });
      });
    }
  }
  
  /**
   * Handle draft completed event
   * @private
   */
  private handleDraftCompleted(): void {
    logger.info('Arena draft completed');
    this.currentState = DraftState.COMPLETED;
    
    // Stop visual detection
    if (this.useVisualDetection && this.visualDetector) {
      this.visualDetector.stopContinuousDetection();
    }
    
    this.emit('stateChanged', this.currentState);
    this.emit('draftCompleted', this.draftPicks);
  }
  
  /**
   * Handle card chosen in draft
   * @param data Card data
   * @private
   */
  private handleDraftCardChosen(data: { cardId: string }): void {
    if (this.currentState === DraftState.CARD_SELECTION) {
      logger.info('Draft card chosen', { cardId: data.cardId, pickNumber: this.currentPick });
      
      // Create a new draft pick record
      const pick: DraftPick = {
        pickNumber: this.currentPick,
        options: [...this.currentOptions],
        selected: { id: data.cardId }
      };
      
      // Add to picks history
      this.draftPicks.push(pick);
      
      // Increment pick counter for next selection
      this.currentPick++;
      
      // Clear current options for next selection
      this.currentOptions = [];
      this.lastCardTimestamp = 0;
      
      // Emit event
      this.emit('cardPicked', pick);
    }
  }
  
  /**
   * Handle card shown event
   * @param data Card data with timestamp
   * @private
   */
  private handleCardShown(data: { cardId: string, timestamp: number }): void {
    if (this.currentState === DraftState.STARTED || 
        this.currentState === DraftState.HERO_SELECTION || 
        this.currentState === DraftState.CARD_SELECTION) {
      
      const now = data.timestamp || Date.now();
      const timeSinceLastCard = now - this.lastCardTimestamp;
      
      // If it's been too long since last card or we already have 3 cards,
      // reset current options (this is likely a new pick)
      if (this.lastCardTimestamp > 0 && 
          (timeSinceLastCard > this.CARD_GROUP_THRESHOLD_MS || this.currentOptions.length >= 3)) {
        logger.debug('Starting new card options group', { 
          timeSinceLastCard,
          currentOptionsCount: this.currentOptions.length 
        });
        this.currentOptions = [];
      }
      
      // Update last card timestamp
      this.lastCardTimestamp = now;
      
      // Create card data with timestamp
      const card: CardData = { 
        id: data.cardId,
        timestamp: now
      };
      
      // If we don't have 3 options yet, add this card
      if (this.currentOptions.length < 3) {
        this.currentOptions.push(card);
        logger.debug('Draft card option detected', { 
          cardId: data.cardId, 
          position: this.currentOptions.length,
          timestamp: now
        });
        
        // If we now have 3 options, emit the event
        if (this.currentOptions.length === 3) {
          if (this.currentState === DraftState.STARTED) {
            // First set of 3 cards is hero selection
            this.currentState = DraftState.HERO_SELECTION;
            this.emit('stateChanged', this.currentState);
            this.emit('heroOptions', this.currentOptions);
            
            // Start visual detection for hero selection
            if (this.useVisualDetection && this.visualDetector) {
              this.visualDetector.startContinuousDetection(this.currentState).catch(error => {
                logger.error('Failed to start continuous visual detection for hero selection', { error });
              });
            }
          } else {
            // Regular card selection
            this.currentState = DraftState.CARD_SELECTION;
            this.emit('stateChanged', this.currentState);
            this.emit('cardOptions', {
              pickNumber: this.currentPick,
              options: this.currentOptions
            });
            
            // Start visual detection for card selection
            if (this.useVisualDetection && this.visualDetector) {
              this.visualDetector.startContinuousDetection(this.currentState).catch(error => {
                logger.error('Failed to start continuous visual detection for card selection', { error });
              });
            }
          }
        }
      }
    }
  }
  
  /**
   * Handle hero selected event
   * @param heroId Hero card ID
   * @private
   */
  private handleHeroSelected(heroId: string): void {
    logger.info('Hero selected in draft', { heroId });
    this.selectedHero = heroId;
    this.emit('heroSelected', heroId);
    
    // If we're not already in CARD_SELECTION state, update it
    if (this.currentState !== DraftState.CARD_SELECTION) {
      this.currentState = DraftState.CARD_SELECTION;
      this.emit('stateChanged', this.currentState);
      
      // Update visual detection state
      if (this.useVisualDetection && this.visualDetector) {
        this.visualDetector.startContinuousDetection(this.currentState).catch(error => {
          logger.error('Failed to start continuous visual detection after hero selection', { error });
        });
      }
    }
  }
  
  /**
   * Handle draft card detected event
   * @param cardId Card ID detected in the draft deck
   * @private
   */
  private handleDraftCardDetected(cardId: string): void {
    logger.info('Card detected in draft deck', { cardId });
    
    // Emit event for UI to show the card
    this.emit('draftCardDetected', cardId);
    
    // Ensure we're in the correct state
    if (this.currentState === DraftState.INACTIVE || this.currentState === DraftState.STARTED) {
      this.currentState = DraftState.CARD_SELECTION;
      this.emit('stateChanged', this.currentState);
      
      // Update visual detection state
      if (this.useVisualDetection && this.visualDetector) {
        this.visualDetector.startContinuousDetection(this.currentState).catch(error => {
          logger.error('Failed to start continuous visual detection after card detected', { error });
        });
      }
    }
  }

  /**
   * Handle arena game started event
   * @private
   */
  private handleArenaGameStarted(): void {
    logger.info('Arena game started');
    
    // Stop visual detection
    if (this.useVisualDetection && this.visualDetector) {
      this.visualDetector.stopContinuousDetection();
    }
    
    // Reset state if we were in a completed draft
    if (this.currentState === DraftState.COMPLETED) {
      this.currentState = DraftState.INACTIVE;
      this.emit('stateChanged', this.currentState);
    }
  }
  
  /**
   * Handle visually detected cards
   * @param result Visual detection result
   * @private
   */
  private handleVisualCardsDetected(result: VisualDetectionResult): void {
    if (!result.success || result.cards.length === 0) return;
    
    logger.info('Cards detected visually', { 
      count: result.cards.length,
      cards: result.cards.map(card => card.id)
    });
    
    // If we're in HERO_SELECTION or CARD_SELECTION state, use the detected cards
    if (this.currentState === DraftState.HERO_SELECTION) {
      // We detected hero options
      if (this.currentOptions.length === 0) {
        this.currentOptions = [...result.cards];
        this.emit('heroOptions', this.currentOptions);
      }
    } else if (this.currentState === DraftState.CARD_SELECTION) {
      // We detected card options
      if (this.currentOptions.length === 0) {
        this.currentOptions = [...result.cards];
        this.emit('cardOptions', {
          pickNumber: this.currentPick,
          options: this.currentOptions
        });
      }
    } else if (this.currentState === DraftState.STARTED) {
      // If we're just started, assume these are hero options
      this.currentState = DraftState.HERO_SELECTION;
      this.currentOptions = [...result.cards];
      this.emit('stateChanged', this.currentState);
      this.emit('heroOptions', this.currentOptions);
    } else if (this.currentState === DraftState.INACTIVE) {
      // If we're inactive but detect cards, assume draft has started
      this.currentState = DraftState.STARTED;
      this.emit('stateChanged', this.currentState);
      this.emit('draftStarted');
      
      // Then assume these are hero options
      this.currentState = DraftState.HERO_SELECTION;
      this.currentOptions = [...result.cards];
      this.emit('stateChanged', this.currentState);
      this.emit('heroOptions', this.currentOptions);
    }
  }
}

export default ArenaDraftDetector;
