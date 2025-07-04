import { ipcMain, BrowserWindow, screen } from 'electron';
import path from 'path';
import { getLogger } from '../utils/logger';
import ArenaDraftDetector, { DraftState, CardData } from '../services/logReader/ArenaDraftDetector';
import CardDataService, { Card } from '../services/cardData/CardDataService';
import CardMatcher from '../services/cardData/CardMatcher';
import OverlayManager from '../services/overlay/OverlayManager';
import ScreenCaptureService from '../services/capture/ScreenCaptureService';
import OCRService from '../services/ocr/OCRService';
import VisualDraftDetector from '../services/logReader/VisualDraftDetector';
import { RegionSelector } from '../services/config/RegionSelector';
import { ImageMatcher } from '../services/capture/ImageMatcher';
import { TemplateMatcher } from '../services/capture/TemplateMatcher';
import RegionSelectionController from '../controllers/RegionSelectionController';

/**
 * HearthGemApp
 * Core application class that coordinates all services
 * @module HearthGemApp
 */
export class HearthGemApp {
  private screenCapture: ScreenCaptureService;
  private ocrService: OCRService;
  private cardMatcher: CardMatcher;
  private imageMatcher: ImageMatcher | null = null;
  private templateMatcher: TemplateMatcher | null = null;
  private visualDetector: VisualDraftDetector | null = null;
  private draftDetector: ArenaDraftDetector;
  private cardDataService: CardDataService;
  private overlayManager: OverlayManager;
  private currentPickNumber: number = 0;
  private totalPicks: number = 30; // Standard arena draft has 30 picks
  private detectedCards: Set<string> = new Set(); // Track unique card IDs
  private useVisualDetection: boolean = true; // Enable visual detection by default
  private useImageMatching: boolean = true; // Enable image matching by default
  private regionSelector: RegionSelector;
  private regionSelectionController: RegionSelectionController | null = null;
  private overlayWindow: BrowserWindow | null = null;
  
  // Create a Winston logger instance for this module
  private log = getLogger('core/HearthGemApp');
  
  /**
   * Creates a new HearthGemApp instance
   */
  constructor() {
    this.log.info('Starting HearthGem Arena Assistant');
    
    // Initialize services
    this.screenCapture = ScreenCaptureService.getInstance();
    // Initialize screen capture (registers IPC handlers like captureRegions, detectCardRegions)
    this.screenCapture.initialize();
    this.ocrService = new OCRService();
    this.cardMatcher = new CardMatcher();
    this.templateMatcher = new TemplateMatcher();
    
    // Initialize visual detector - will be properly initialized in start() method
    this.visualDetector = null;
    
    // ImageMatcher will be initialized after CardDataService is loaded
    this.draftDetector = new ArenaDraftDetector(
      undefined, // logWatcher - will create a new one
      undefined, // Will set visualDetector after initialization
      this.useVisualDetection
    );
    this.cardDataService = new CardDataService();
    this.overlayManager = new OverlayManager();
    this.regionSelector = new RegionSelector();
    this.regionSelectionController = new RegionSelectionController();
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Register IPC handlers for manual region selection
    if (this.regionSelectionController) {
      this.regionSelectionController.registerIpc();
    }
  }
  
  /**
   * Start the application
   * @returns Promise that resolves when startup is complete
   */
  public async start(): Promise<void> {
    this.log.info('Starting HearthGem Arena Assistant');
    
    try {
      // Load card data first
      await this.cardDataService.loadCardData();
      this.log.info('Card data loaded successfully');
      
      // Initialize card matcher with loaded cards
      const allCards = Array.from(this.cardDataService.getAllCards());
      this.cardMatcher.setCards(allCards);
      
      // Initialize image matcher with card data service
      this.imageMatcher = new ImageMatcher(this.cardDataService);
      this.log.info('Image matcher initialized');
      
      // Initialize visual detector with all services
      this.visualDetector = new VisualDraftDetector(
        this.screenCapture,
        this.ocrService,
        this.cardMatcher,
        this.imageMatcher,
        this.templateMatcher || undefined
      );
      
      // Update draft detector with visual detector and card data
      this.draftDetector.setVisualDetection(true);
      this.draftDetector.setCardData(allCards);
      
      // Create and show overlay
      this.overlayManager.createOverlay();
      this.overlayManager.positionOverHearthstone();
      
      // Ensure the overlay is visible
      this.overlayManager.show();
      
      // Open DevTools in detached mode
      this.overlayWindow = this.overlayManager.getOverlayWindow();
      if (this.overlayWindow) {
        this.overlayWindow.webContents.openDevTools({ mode: 'detach' });
      }
      
      // Start visual detector so manual card detection requests succeed
      try {
        await this.visualDetector.start(allCards, this.cardDataService);
        this.log.info('Visual detector started and active');
      } catch (err) {
        this.log.error('Failed to start visual detector at app startup', { error: err });
      }
      
      // Get some sample cards to display
      const sampleCards = await this.cardDataService.getSampleCards(3);
      if (sampleCards.length > 0) {
        this.log.info('Displaying sample cards:', { cards: sampleCards.map(c => c.name) });
      this.overlayManager.displayCards(sampleCards);
      } else {
        this.log.warn('No sample cards available to display');
      }
      
      // Start watching for log changes and visual detection
      await this.draftDetector.start();
      this.log.info('Draft detection started');
      
      // Show a welcome message
      this.updateLogStatus('📂 HearthGem Arena Assistant started', 'active');
      this.updateDraftStatus('⏳ Waiting for Arena draft activity...', 'normal');
      
      // Initialize draft info
      this.updateDraftInfo(0, this.totalPicks);
      
    } catch (error) {
      this.log.error('Failed to start HearthGem', { error });
      throw error;
    }
  }
  
  /**
   * Stop the application
   */
  public async stop(): Promise<void> {
    this.log.info('Stopping HearthGem Arena Assistant');
    
    try {
      if (this.draftDetector) {
        this.draftDetector.stop();
      }

      // LogWatcher is now managed by ArenaDraftDetector

      if (this.visualDetector) {
        this.visualDetector.stop();
      }

      if (this.regionSelector) {
        this.regionSelector.dispose();
      }
      
      if (this.regionSelectionController) {
        this.regionSelectionController.dispose();
      }

      this.ocrService.destroy().catch(error => {
        this.log.error('Error destroying OCR service', { error });
      });
      this.overlayManager.destroy();
    
      this.log.info('HearthGem Arena Assistant stopped');
    } catch (error) {
      this.log.error('Error stopping application', { error });
    }
  }
  
  /**
   * Test the visual detection with different settings
   * @param options Test options
   * @returns Promise resolving to test results
   */
  public async testVisualDetection(options?: {
    confidenceThreshold?: number;
    preprocessingOptions?: Partial<import('../services/capture/ScreenCaptureService').PreprocessingOptions>;
  }): Promise<any> {
    this.log.info('Testing visual detection', { options });
    
    try {
      // Run test detection
      const result = await this.visualDetector?.testDetection(options);
      
      // Send results to UI
      this.overlayManager.sendToRenderer('visual-detection-test-results', result);
      
      return result;
    } catch (error) {
      this.log.error('Error testing visual detection', { error });
      throw error;
    }
  }
  
  private setupEventHandlers(): void {
    // Handle log directory found
    this.draftDetector.on('logDirectoryFound', (data) => {
      this.log.info('Log directory found', { directory: data.directory });
      this.updateLogStatus('📂 Log directory found!', 'active');
    });
    
    // Handle log file activity
    this.draftDetector.on('logFileActivity', (data) => {
      this.log.info('Log file activity detected', { file: data.file });
      this.updateLogStatus('📖 Reading logs...', 'active');
    });
    
    // Add IPC handlers for startDetection and stopDetection
    ipcMain.handle('startDetection', async (_, intervalMs: number) => {
      this.log.info('startDetection IPC invoked', { intervalMs });
      try {
        if (this.visualDetector) {
          // Start continuous detection with the current draft state
          await this.visualDetector.startContinuousDetection(this.draftDetector.getState());
          return true;
        } else {
          this.log.warn('startDetection called but visualDetector is not initialized');
          return false;
        }
      } catch (error) {
        this.log.error('Error in startDetection handler', { error });
        throw error;
      }
    });
    
    ipcMain.handle('stopDetection', async () => {
      this.log.info('stopDetection IPC invoked');
      try {
        if (this.visualDetector) {
          this.visualDetector.stopContinuousDetection();
          return true;
        } else {
          this.log.warn('stopDetection called but visualDetector is not initialized');
          return false;
        }
      } catch (error) {
        this.log.error('Error in stopDetection handler', { error });
        throw error;
      }
    });
    
    // Handle one-shot card detection request from renderer
    try {
      ipcMain.removeHandler('detectCards');
    } catch (_) {/* ignore */}

    ipcMain.handle('detectCards', async () => {
      this.log.info('detectCards IPC invoked');
      try {
        if (!this.visualDetector) {
          this.log.warn('detectCards called but visualDetector is not initialised');
          return { success: false, error: 'visual detector not initialised' };
        }

        const result = await this.visualDetector.detectCards();
        this.log.info('detectCards result', { success: result.success, cardCount: result.cards?.length ?? 0 });

        // re-emit to any overlays/listeners
        if (result.success) {
          this.overlayManager.sendToRenderer('cardsDetected', result);
        }
        return result;
      } catch (error) {
        this.log.error('Error in detectCards handler', { error });
        throw error;
      }
    });
    
    // Handle draft state changes
    this.draftDetector.on('stateChanged', (state: DraftState) => {
      this.log.info('Draft state changed', { state });
      
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
      this.log.info('Hero options detected', { heroes });
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
      this.log.info('Card options detected', { pickNumber: this.currentPickNumber });
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
      this.log.info('Hero selected', { heroId });
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
      this.log.info('Card picked', { pickNumber: pick.pickNumber, selectedCardId: pick.selected?.id });
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
      this.log.info('Card detected in draft deck', { cardId });
      
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
      this.log.info('Toggle overlay requested');
      // Always show the overlay instead of toggling
      this.overlayManager.show();
    });
    
    // Handle toggle visual detection
    ipcMain.on('toggle-visual-detection', (_, enabled) => {
      this.useVisualDetection = enabled;
      this.draftDetector.setVisualDetection(enabled);
      this.log.info('Visual detection toggled', { enabled });
      this.updateLogStatus(`🔍 Visual detection ${enabled ? 'enabled' : 'disabled'}`, 'active');
    });
    
    // Handle toggle image matching
    ipcMain.on('toggle-image-matching', (_, enabled) => {
      this.useImageMatching = enabled;
      if (this.visualDetector) {
        // Pass the setting to the test method
        this.visualDetector.testDetection({ useImageMatching: enabled });
      }
      this.log.info('Image matching toggled', { enabled });
      this.updateLogStatus(`🖼️ Image matching ${enabled ? 'enabled' : 'disabled'}`, 'active');
    });
    
    // Handle test visual detection
    ipcMain.on('test-visual-detection', async (_, options) => {
      this.log.info('Testing visual detection', { options });
      this.updateLogStatus('🔍 Testing visual detection...', 'active');
      
      try {
        // Use the new test method with options
        const result = await this.testVisualDetection(options);
        
        if (result.success && result.cards && result.cards.length > 0) {
          this.updateLogStatus(`✅ Matched ${result.cards.length} cards`, 'active');
          
          // Get full card data for matched cards
          const matchedCards = result.cards.map((card: CardData) => 
            this.cardDataService.getCard(card.id) || {
              id: card.id,
              name: 'Unknown Card',
              cost: 0,
              type: 'UNKNOWN',
              rarity: 'COMMON',
              set: 'UNKNOWN'
            }
          );
          
          // Display matched cards
          this.overlayManager.displayCards(matchedCards);
          
          // Send detailed test results to renderer
          this.overlayManager.sendToRenderer('visual-detection-test-results', result);
      } else {
          this.updateLogStatus('❌ No cards matched', 'error');
          
          // Send empty results to renderer
          this.overlayManager.sendToRenderer('visual-detection-test-results', {
            success: false,
            cards: [],
            timestamp: Date.now(),
            error: 'No cards matched',
            testResults: result.testResults
          });
      }
      } catch (error) {
        this.log.error('Error testing visual detection', { error });
        this.updateLogStatus(`❌ Visual detection error: ${error}`, 'error');
    
        // Send error to renderer
        this.overlayManager.sendToRenderer('visual-detection-test-results', {
          success: false,
          cards: [],
          timestamp: Date.now(),
          error: `Test failed: ${error}`
        });
      }
    });
    
    // Global shortcut to make overlay more visible for debugging
    const { globalShortcut } = require('electron');
    globalShortcut.register('F12', () => {
      this.log.info('F12 pressed - Making overlay more visible');
      this.overlayManager.show();
      // Move to center of screen for better visibility
      this.overlayManager.updatePosition({ x: 100, y: 100 });
    });
    
    // Handle test display cards message
    ipcMain.on('test-display-cards', () => {
      this.log.info('Received test-display-cards message');
      // Get some sample cards from the card data service
      const sampleCards = this.cardDataService.getSampleCards(3);
      // Display these cards in the overlay
      this.overlayManager.displayCards(sampleCards);
    });

    // Region configuration handlers
    ipcMain.handle('configure-regions', async () => {
      try {
        this.log.info('Starting region configuration');
        
        // Minimize main overlay during region selection
        if (this.overlayWindow) {
          this.overlayWindow.minimize();
        }
        
        const result = await this.regionSelector.selectRegions();
        
        if (!result.cancelled && result.regions.length === 3) {
          // Save the regions to the screen capture service
          await this.screenCapture.updateManualRegions(result.regions);
          
          // Notify the overlay of successful configuration
          if (this.overlayWindow) {
            this.overlayWindow.webContents.send('regions-configured', {
              success: true,
              regionCount: result.regions.length
            });
          }
          
          this.log.info('Regions configured successfully', { regionCount: result.regions.length });
          return { success: true, regionCount: result.regions.length };
        } else {
          this.log.info('Region configuration cancelled or incomplete');
          return { success: false, cancelled: result.cancelled };
        }
      } catch (error) {
        this.log.error('Error configuring regions', { error });
        return { success: false, error: String(error) };
      } finally {
        // Restore main overlay
        if (this.overlayWindow) {
          this.overlayWindow.restore();
          this.overlayWindow.focus();
        }
      }
    });

    // Check if regions are configured
    ipcMain.handle('check-regions-configured', async () => {
      try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const hasRegions = await this.screenCapture.hasValidManualRegions();
        
        return {
          configured: hasRegions,
          screenSize: primaryDisplay.size
        };
      } catch (error) {
        this.log.error('Error checking region configuration', { error });
        return { configured: false };
      }
    });

    // Clear manual regions
    ipcMain.handle('clear-regions', async () => {
      try {
        await this.screenCapture.clearManualRegions();
        
        if (this.overlayWindow) {
          this.overlayWindow.webContents.send('regions-cleared');
        }
        
        this.log.info('Manual regions cleared');
        return { success: true };
      } catch (error) {
        this.log.error('Error clearing regions', { error });
        return { success: false, error: String(error) };
      }
    });

    // Test region detection
    ipcMain.handle('test-region-detection', async () => {
      try {
        this.log.info('Testing region detection');
        
        // Trigger a visual detection test
        if (this.visualDetector) {
          const result = await this.visualDetector.testDetection();
          
          if (this.overlayWindow) {
            this.overlayWindow.webContents.send('region-test-result', result);
          }
          
          return { success: true, result };
        } else {
          return { success: false, error: 'Visual detector not available' };
        }
      } catch (error) {
        this.log.error('Error testing region detection', { error });
        return { success: false, error: String(error) };
      }
    });
  }
  
  /**
   * Update the log status in the UI
   * @param message Status message
   * @param type Status type for styling
   * @private
   */
  private updateLogStatus(message: string, type: 'active' | 'warning' | 'error' | 'normal'): void {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('log-status', { message, type });
    }
  }
  
  /**
   * Update the draft status in the UI
   * @param message Status message
   * @param type Status type for styling
   * @private
   */
  private updateDraftStatus(message: string, type: 'active' | 'warning' | 'error' | 'normal'): void {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('draft-status', { message, type });
    }
  }
  
  /**
   * Send hero selected information to the UI
   * @param hero Hero card data
   * @private
   */
  private sendHeroSelected(hero: Card): void {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('hero-selected', hero);
    }
  }
  
  /**
   * Send draft card detected to the UI
   * @param card Detected card data
   * @private
   */
  private sendDraftCardDetected(card: Card): void {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('draft-card-detected', card);
    }
  }
  
  /**
   * Update draft information in the UI
   * @param pickNumber Current pick number
   * @param totalPicks Total picks in draft
   * @private
   */
  private updateDraftInfo(pickNumber: number, totalPicks: number): void {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('draft-info', { 
        pickNumber, 
        totalPicks 
      });
    }
  }
}

export default HearthGemApp;