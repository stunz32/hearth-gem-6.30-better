import { ipcMain } from 'electron';
import logger from '../utils/logger';
import LogWatcher from '../services/logReader/LogWatcher';
import ArenaDraftDetector, { DraftState, CardData } from '../services/logReader/ArenaDraftDetector';
import CardDataService, { Card } from '../services/cardData/CardDataService';
import OverlayManager from '../services/overlay/OverlayManager';

/**
 * HearthGemApp
 * Core application class that coordinates all services
 * @module HearthGemApp
 */
export class HearthGemApp {
  private logWatcher: LogWatcher;
  private draftDetector: ArenaDraftDetector;
  private cardDataService: CardDataService;
  private overlayManager: OverlayManager;
  private currentPickNumber: number = 0;
  private totalPicks: number = 30; // Standard arena draft has 30 picks
  private detectedCards: Set<string> = new Set(); // Track unique card IDs
  
  /**
   * Creates a new HearthGemApp instance
   */
  constructor() {
    logger.info('Starting HearthGem Arena Assistant');
    
    // Initialize services
    this.logWatcher = new LogWatcher();
    this.draftDetector = new ArenaDraftDetector(this.logWatcher);
    this.cardDataService = new CardDataService();
    this.overlayManager = new OverlayManager();
    
    // Set up event handlers
    this.setupEventHandlers();
  }
  
  /**
   * Start the application
   * @returns Promise that resolves when startup is complete
   */
  public async start(): Promise<void> {
    logger.info('Starting HearthGem Arena Assistant');
    
    try {
      // Load card data first
      await this.cardDataService.loadCardData();
      logger.info('Card data loaded successfully');
      
      // Create and show overlay
      this.overlayManager.createOverlay();
      this.overlayManager.positionOverHearthstone();
      
      // Ensure the overlay is visible
      this.overlayManager.show();
      
      // Open DevTools in detached mode
      const window = this.overlayManager.getOverlayWindow();
      if (window) {
        window.webContents.openDevTools({ mode: 'detach' });
      }
      
      // Get some sample cards to display
      const sampleCards = await this.cardDataService.getSampleCards(3);
      if (sampleCards.length > 0) {
        logger.info('Displaying sample cards:', { cards: sampleCards.map(c => c.name) });
        this.overlayManager.displayCards(sampleCards);
      } else {
        logger.warn('No sample cards available to display');
      }
      
      // Start watching for log changes
      await this.logWatcher.start();
      logger.info('Log watcher started');
      
      // Show a welcome message
      this.updateLogStatus('📂 HearthGem Arena Assistant started', 'active');
      this.updateDraftStatus('⏳ Waiting for Arena draft activity...', 'normal');
      
      // Initialize draft info
      this.updateDraftInfo(0, this.totalPicks);
      
    } catch (error) {
      logger.error('Failed to start HearthGem', { error });
      throw error;
    }
  }
  
  /**
   * Stop the application
   */
  public stop(): void {
    logger.info('Stopping HearthGem Arena Assistant');
    
    // Stop services
    this.draftDetector.stop();
    this.overlayManager.destroy();
    
    logger.info('HearthGem Arena Assistant stopped');
  }
  
  /**
   * Set up event handlers for inter-service communication
   * @private
   */
  private setupEventHandlers(): void {
    // Handle log directory found
    this.draftDetector.on('logDirectoryFound', (data) => {
      logger.info('Log directory found', { directory: data.directory });
      this.updateLogStatus('📂 Log directory found!', 'active');
    });
    
    // Handle log file activity
    this.draftDetector.on('logFileActivity', (data) => {
      logger.info('Log file activity detected', { file: data.file });
      this.updateLogStatus('📖 Reading logs...', 'active');
    });
    
    // Handle draft state changes
    this.draftDetector.on('stateChanged', (state: DraftState) => {
      logger.info('Draft state changed', { state });
      
      // Update draft status in UI
      switch (state) {
        case DraftState.STARTED:
          this.updateDraftStatus('🎯 Arena draft started!', 'active');
          // Reset draft tracking
          this.currentPickNumber = 0;
          this.detectedCards.clear();
          this.updateDraftInfo(0, this.totalPicks);
          break;
        case DraftState.HERO_SELECTION:
          this.updateDraftStatus('🦸 Selecting hero...', 'active');
          break;
        case DraftState.CARD_SELECTION:
          this.updateDraftStatus('🃏 Picking cards...', 'active');
          break;
        case DraftState.COMPLETED:
          this.updateDraftStatus('✅ Draft completed!', 'normal');
          break;
        default:
          this.updateDraftStatus('⏳ Waiting for Arena draft...', 'normal');
      }
      
      // Always keep the overlay visible regardless of state
      if (!this.overlayManager.isOverlayVisible()) {
        this.overlayManager.show();
      }
    });
    
    // Handle hero options
    this.draftDetector.on('heroOptions', (heroes: CardData[]) => {
      logger.info('Hero options detected', { heroes });
      this.updateLogStatus('📖 Hero options detected!', 'active');
      this.updateDraftStatus('🦸 Choose your hero!', 'active');
      
      // Get full hero data
      const heroData = this.cardDataService.getCards(heroes.map((hero: CardData) => hero.id));
      
      // Display heroes in overlay
      this.overlayManager.displayCards(heroData);
    });
    
    // Handle card options
    this.draftDetector.on('cardOptions', (pick) => {
      this.currentPickNumber = pick.pickNumber;
      logger.info('Card options detected', { pickNumber: this.currentPickNumber });
      this.updateLogStatus('📖 Card options detected!', 'active');
      this.updateDraftStatus(`🃏 Pick ${this.currentPickNumber}/${this.totalPicks}`, 'active');
      this.updateDraftInfo(this.currentPickNumber, this.totalPicks);
      
      // Get full card data
      const cardData = this.cardDataService.getCards(pick.options.map((card: CardData) => card.id));
      
      // Display cards in overlay
      this.overlayManager.displayCards(cardData);
    });
    
    // Handle hero selected
    this.draftDetector.on('heroSelected', (heroId: string) => {
      logger.info('Hero selected', { heroId });
      this.updateLogStatus('📖 Hero selected!', 'active');
      
      // Get hero data
      const heroData = this.cardDataService.getCard(heroId);
      let heroName = heroData?.name || heroId;
      
      // Map common hero IDs to class names
      const heroClassMap: { [key: string]: string } = {
        'HERO_01': 'Warrior (Garrosh)',
        'HERO_02': 'Shaman (Thrall)',
        'HERO_03': 'Rogue (Valeera)',
        'HERO_04': 'Paladin (Uther)',
        'HERO_05': 'Hunter (Rexxar)',
        'HERO_06': 'Druid (Malfurion)',
        'HERO_07': 'Warlock (Gul\'dan)',
        'HERO_08': 'Mage (Jaina)',
        'HERO_09': 'Priest (Anduin)',
        'HERO_09y': 'Priest (Anduin)',
        'HERO_09f': 'Priest (Anduin)',
        'HERO_10': 'Death Knight'
      };
      
      if (heroClassMap[heroId]) {
        heroName = heroClassMap[heroId];
      }
      
      this.updateDraftStatus(`🦸 Playing as ${heroName}`, 'active');
      
      // Send hero information to UI
      if (heroData) {
        this.sendHeroSelected(heroData);
      } else {
        // Create a basic hero card if not found in database
        const basicHero: Card = {
          id: heroId,
          name: heroClassMap[heroId] || heroId,
          cost: 0,
          type: 'HERO',
          rarity: 'FREE',
          set: 'CORE'
        };
        this.sendHeroSelected(basicHero);
      }
    });
    
    // Handle card picked
    this.draftDetector.on('cardPicked', (pick) => {
      logger.info('Card picked', { pickNumber: pick.pickNumber, selectedCardId: pick.selected?.id });
      this.updateLogStatus('✅ Card picked!', 'active');
      this.updateDraftStatus(`✅ Picked card ${pick.pickNumber}/${this.totalPicks}`, 'active');
      this.updateDraftInfo(pick.pickNumber, this.totalPicks);
      
      // If the selected card is available and not already tracked, add it
      if (pick.selected?.id && !this.detectedCards.has(pick.selected.id)) {
        const cardData = this.cardDataService.getCard(pick.selected.id);
        if (cardData) {
          this.sendDraftCardDetected(cardData);
          this.detectedCards.add(pick.selected.id);
        }
      }
    });
    
    // Handle draft card detected
    this.draftDetector.on('draftCardDetected', (cardId: string) => {
      logger.info('Card detected in draft deck', { cardId });
      
      // Skip if we've already seen this card
      if (this.detectedCards.has(cardId)) {
        return;
      }
      
      // Get card data
      const cardData = this.cardDataService.getCard(cardId);
      if (cardData) {
        this.updateLogStatus(`📖 Detected card: ${cardData.name}`, 'active');
        this.sendDraftCardDetected(cardData);
      } else {
        this.updateLogStatus(`📖 Detected card: ${cardId}`, 'active');
        // Create a basic card if not found in database
        const basicCard: Card = {
          id: cardId,
          name: cardId,
          cost: 0,
          type: 'UNKNOWN',
          rarity: 'COMMON',
          set: 'UNKNOWN'
        };
        this.sendDraftCardDetected(basicCard);
      }
      
      // Add to tracked cards
      this.detectedCards.add(cardId);
      
      // Show the overlay if it's not already visible
      if (!this.overlayManager.isOverlayVisible()) {
        this.overlayManager.show();
      }
    });
    
    // Handle IPC messages from renderer
    ipcMain.on('toggle-overlay', () => {
      // Always show overlay when toggle is requested
      // Instead of hiding, we'll just make it visible again
      this.overlayManager.show();
      
      // If it wasn't visible before, also reposition it
      if (!this.overlayManager.isOverlayVisible()) {
        this.overlayManager.positionOverHearthstone();
      }
    });
    
    // Global shortcut to make overlay more visible for debugging
    const { globalShortcut } = require('electron');
    globalShortcut.register('F12', () => {
      logger.info('F12 pressed - Making overlay more visible');
      this.overlayManager.show();
      // Move to center of screen for better visibility
      this.overlayManager.updatePosition({ x: 100, y: 100 });
    });
    
    // Handle test display cards message
    ipcMain.on('test-display-cards', () => {
      logger.info('Received test-display-cards message');
      // Get some sample cards from the card data service
      const sampleCards = this.cardDataService.getSampleCards(3);
      // Display these cards in the overlay
      this.overlayManager.displayCards(sampleCards);
    });
  }
  
  /**
   * Update the log status in the UI
   * @param message Status message
   * @param type Status type for styling
   * @private
   */
  private updateLogStatus(message: string, type: 'active' | 'warning' | 'error' | 'normal'): void {
    if (this.overlayManager.getOverlayWindow()) {
      this.overlayManager.getOverlayWindow()!.webContents.send('log-status', { message, type });
    }
  }
  
  /**
   * Update the draft status in the UI
   * @param message Status message
   * @param type Status type for styling
   * @private
   */
  private updateDraftStatus(message: string, type: 'active' | 'warning' | 'error' | 'normal'): void {
    if (this.overlayManager.getOverlayWindow()) {
      this.overlayManager.getOverlayWindow()!.webContents.send('draft-status', { message, type });
    }
  }
  
  /**
   * Send hero selected information to the UI
   * @param hero Hero card data
   * @private
   */
  private sendHeroSelected(hero: Card): void {
    if (this.overlayManager.getOverlayWindow()) {
      this.overlayManager.getOverlayWindow()!.webContents.send('hero-selected', hero);
    }
  }
  
  /**
   * Send draft card detected to the UI
   * @param card Detected card data
   * @private
   */
  private sendDraftCardDetected(card: Card): void {
    if (this.overlayManager.getOverlayWindow()) {
      this.overlayManager.getOverlayWindow()!.webContents.send('draft-card-detected', card);
    }
  }
  
  /**
   * Update draft information in the UI
   * @param pickNumber Current pick number
   * @param totalPicks Total picks in draft
   * @private
   */
  private updateDraftInfo(pickNumber: number, totalPicks: number): void {
    if (this.overlayManager.getOverlayWindow()) {
      this.overlayManager.getOverlayWindow()!.webContents.send('draft-info', { 
        pickNumber, 
        totalPicks 
      });
    }
  }
}

export default HearthGemApp;