import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { getLogger } from './utils/logger';
import ScreenCaptureService from './services/capture/ScreenCaptureService';
import ImageMatcherService from './services/vision/ImageMatcherService';
import TemplateMatcherService from './services/vision/TemplateMatcherService';
import VisualDraftDetector from './services/draft/VisualDraftDetector';
import RegionDetector from './services/capture/RegionDetector';
import { buildCardHashes } from './utils/build-card-hashes';

// Create logger instance for this module
const logger = getLogger('HearthGemApp');

/**
 * HearthGemApp
 * Main application class for HearthGem
 */
export class HearthGemApp {
  private mainWindow: BrowserWindow | null = null;
  private screenCaptureService: ScreenCaptureService;
  private imageMatcherService: ImageMatcherService;
  private templateMatcherService: TemplateMatcherService;
  private visualDraftDetector: VisualDraftDetector;
  private regionDetector: RegionDetector;
  
  /**
   * Creates a new HearthGemApp instance
   */
  constructor() {
    // Initialize services
    this.regionDetector = new RegionDetector();
    this.screenCaptureService = ScreenCaptureService.getInstance();
    this.imageMatcherService = new ImageMatcherService();
    this.templateMatcherService = new TemplateMatcherService();
    this.visualDraftDetector = new VisualDraftDetector(
      this.screenCaptureService,
      this.imageMatcherService,
      this.templateMatcherService
    );
    
    // Set up event listeners
    this.setupEventListeners();
    
    logger.info('HearthGemApp initialized with safe capture service');
  }
  
  /**
   * Create the main window
   */
  public createWindow(): void {
    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // Point to the original preload script in the src directory so it is always found
        preload: path.join(__dirname, '../src/preload.js')
      }
    });
    
    // Load the index.html of the app
    this.mainWindow.loadFile(path.join(__dirname, '../index.html'));
    
    // Open the DevTools in development mode
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools();
    }
    
    // Emitted when the window is closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
    
    logger.info('Main window created with contextIsolation enabled');
  }
  
  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for window-all-closed event
    app.on('window-all-closed', () => {
      // On macOS it is common for applications and their menu bar
      // to stay active until the user quits explicitly with Cmd + Q
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    
    // Listen for activate event
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open
      if (this.mainWindow === null) {
        this.createWindow();
      }
    });
    
    // Listen for ready event
    app.on('ready', () => {
      this.createWindow();
      this.initializeServices();
    });
    
    // Set up IPC event listeners
    this.setupIpcListeners();
  }
  
  /**
   * Set up IPC event listeners
   */
  private setupIpcListeners(): void {
    // Listen for findHearthstoneWindow event
    ipcMain.handle('findHearthstoneWindow', async () => {
      return await this.screenCaptureService.findHearthstoneWindow();
    });
    
    // The captureRegions handler is now implemented in ScreenCaptureService
    // Removing duplicate handler to avoid "handler already registered" warnings
    
    // Listen for detectCards event
    ipcMain.handle('detectCards', async () => {
      return await this.visualDraftDetector.triggerManualDetection();
    });
    
    // Listen for startDetection event
    ipcMain.handle('startDetection', async (event, intervalMs) => {
      this.visualDraftDetector.startDetection(intervalMs);
      return true;
    });
    
    // Listen for stopDetection event
    ipcMain.handle('stopDetection', async () => {
      this.visualDraftDetector.stopDetection();
      return true;
    });
    
    // Listen for saveManualRegions event
    ipcMain.handle('saveManualRegions', async (event, regions) => {
      return await this.screenCaptureService.updateManualRegions(regions);
    });
    
    // Listen for clearManualRegions event
    ipcMain.handle('clearManualRegions', async () => {
      await this.screenCaptureService.clearManualRegions();
      return true;
    });
    
    // Listen for generateHashes event
    ipcMain.handle('generateHashes', async () => {
      try {
        await buildCardHashes();
      await this.imageMatcherService.generateAllHashes();
      return true;
      } catch (error) {
        logger.error('Error generating hashes', { error });
        return false;
      }
    });
    
    // Listen for addCardImage event
    ipcMain.handle('addCardImage', async (event, imageData, cardId) => {
      return await this.imageMatcherService.addCardImage(imageData, cardId);
    });
    
    // Listen for addManaTemplate event
    ipcMain.handle('addManaTemplate', async (event, imageData, cardId) => {
      return await this.templateMatcherService.addManaTemplate(imageData, cardId);
    });
    
    // Listen for addRarityTemplate event
    ipcMain.handle('addRarityTemplate', async (event, imageData, cardId) => {
      return await this.templateMatcherService.addRarityTemplate(imageData, cardId);
    });
    
    // Listen for detectCardRegions event
    ipcMain.handle('detectCardRegions', async () => {
      const screenDetection = await this.regionDetector.findScreenRegions();
      if (screenDetection) {
        return {
          success: true,
          regions: screenDetection.cardRegions
        };
      } else {
        return {
          success: false,
          error: 'Failed to detect card regions'
        };
      }
    });
    
    // Listen for clearTemplateSettings event
    ipcMain.handle('clearTemplateSettings', async () => {
      await this.regionDetector.clearTemplateSettings();
      return true;
    });
    
    // Forward card detection events to the renderer
    this.visualDraftDetector.on('cardsDetected', (result) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('cardsDetected', result);
      }
    });
  }
  
  /**
   * Initialize services
   */
  private async initializeServices(): Promise<void> {
    // Initialize ScreenCaptureService to register IPC handlers
    this.screenCaptureService.initialize();
    
    try {
      // Find Hearthstone window
      const hearthstoneFound = await this.screenCaptureService.findHearthstoneWindow();
      
      if (hearthstoneFound) {
        logger.info('Hearthstone window found, initializing services with safe capture');
        
        // Check if we have card hashes
        const hasHashes = await this.imageMatcherService.hasHashes();
        if (!hasHashes) {
          logger.info('No card hashes found, generating...');
          try {
            await buildCardHashes();
            await this.imageMatcherService.generateAllHashes();
          } catch (error) {
            logger.error('Error generating card hashes', { error });
          }
        }
        
        // Start visual draft detection with safe capture
        logger.info('Visual detection enabled with safe capture method');
        this.visualDraftDetector.startDetection();
      } else {
        logger.warn('Hearthstone window not found, services will initialize when window is found');
      }
    } catch (error) {
      logger.error('Error initializing services', { error });
    }
  }
}

export default HearthGemApp;