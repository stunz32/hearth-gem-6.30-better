import { EventEmitter } from 'events';
import logger from '../../utils/logger';
import LogWatcher from './LogWatcher';

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
  name?: string;
  score?: number;
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
 * @module ArenaDraftDetector
 */
export class ArenaDraftDetector extends EventEmitter {
  private logWatcher: LogWatcher;
  private currentState: DraftState = DraftState.INACTIVE;
  private currentPick: number = 0;
  private currentOptions: CardData[] = [];
  private draftPicks: DraftPick[] = [];
  private selectedHero: string | null = null;
  
  /**
   * Creates a new ArenaDraftDetector instance
   * @param logWatcher Optional existing LogWatcher instance
   */
  constructor(logWatcher?: LogWatcher) {
    super();
    
    // Use provided LogWatcher or create a new one
    this.logWatcher = logWatcher || new LogWatcher();
    
    // Register event listeners
    this.registerEventListeners();
    
    logger.info('ArenaDraftDetector initialized');
  }
  
  /**
   * Start monitoring for Arena drafts
   */
  public start(): void {
    logger.info('Starting Arena draft detection');
    this.logWatcher.start();
  }
  
  /**
   * Stop monitoring for Arena drafts
   */
  public stop(): void {
    logger.info('Stopping Arena draft detection');
    this.logWatcher.stop();
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
    
    this.emit('stateChanged', this.currentState);
    this.emit('draftStarted');
  }
  
  /**
   * Handle draft completed event
   * @private
   */
  private handleDraftCompleted(): void {
    logger.info('Arena draft completed');
    this.currentState = DraftState.COMPLETED;
    
    this.emit('stateChanged', this.currentState);
    this.emit('draftCompleted', this.draftPicks);
  }
  
  /**
   * Handle card chosen in draft
   * @param data Card data
   * @private
   */
  private handleDraftCardChosen(data: { cardId: string }): void {
    logger.info('Card chosen in draft', { cardId: data.cardId });
    
    if (this.currentState === DraftState.HERO_SELECTION) {
      // Hero selection
      this.selectedHero = data.cardId;
      this.currentState = DraftState.CARD_SELECTION;
      this.emit('heroSelected', data.cardId);
      this.emit('stateChanged', this.currentState);
    } else if (this.currentState === DraftState.CARD_SELECTION) {
      // Card selection
      const selected: CardData = { id: data.cardId };
      
      // Create draft pick record
      const pick: DraftPick = {
        pickNumber: this.currentPick,
        options: [...this.currentOptions],
        selected
      };
      
      this.draftPicks.push(pick);
      this.currentOptions = [];
      this.currentPick++;
      
      this.emit('cardPicked', pick);
    }
  }
  
  /**
   * Handle card shown event
   * @param data Card data
   * @private
   */
  private handleCardShown(data: { cardId: string }): void {
    if (this.currentState === DraftState.STARTED || 
        this.currentState === DraftState.HERO_SELECTION || 
        this.currentState === DraftState.CARD_SELECTION) {
      
      // Create card data
      const card: CardData = { id: data.cardId };
      
      // If we don't have 3 options yet, add this card
      if (this.currentOptions.length < 3) {
        this.currentOptions.push(card);
        logger.debug('Draft card option detected', { cardId: data.cardId, position: this.currentOptions.length });
        
        // If we now have 3 options, emit the event
        if (this.currentOptions.length === 3) {
          if (this.currentState === DraftState.STARTED) {
            // First set of 3 cards is hero selection
            this.currentState = DraftState.HERO_SELECTION;
            this.emit('stateChanged', this.currentState);
            this.emit('heroOptions', this.currentOptions);
          } else {
            // Regular card selection
            this.emit('cardOptions', {
              pickNumber: this.currentPick,
              options: this.currentOptions
            });
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
    }
  }

  /**
   * Handle arena game started event
   * @private
   */
  private handleArenaGameStarted(): void {
    logger.info('Arena game started');
    // Reset state if we were in a completed draft
    if (this.currentState === DraftState.COMPLETED) {
      this.currentState = DraftState.INACTIVE;
      this.emit('stateChanged', this.currentState);
    }
  }
}

export default ArenaDraftDetector;