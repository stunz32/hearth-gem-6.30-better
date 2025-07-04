import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { getLogger } from '../../utils/logger';

// Create logger instance for this module
const logger = getLogger('services/overlay/OverlayManager');
import { Card } from '../cardData/CardDataService';

/**
 * Interface for overlay position
 * @interface
 */
export interface OverlayPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * OverlayManager
 * Manages the transparent overlay window for displaying card information
 * @module OverlayManager
 */
export class OverlayManager {
  private overlayWindow: BrowserWindow | null = null;
  private isVisible: boolean = false;
  private position: OverlayPosition = { x: 0, y: 0, width: 800, height: 600 };
  private pendingCards: Card[] | null = null;
  private windowReady: boolean = false;
  
  /**
   * Creates a new OverlayManager instance
   */
  constructor() {
    logger.info('OverlayManager initialized');
  }
  
  /**
   * Create the overlay window
   */
  public createOverlay(): void {
    if (this.overlayWindow) {
      logger.info('Overlay window already exists');
      return;
    }

    const display = screen.getPrimaryDisplay();
    this.position = {
      x: Math.floor(display.bounds.width / 2 - 400),
      y: Math.floor(display.bounds.height / 2 - 300),
      width: 800,
      height: 600
    };

      this.overlayWindow = new BrowserWindow({
      ...this.position,
      frame: true,
      title: 'HearthGem Arena Assistant',
      backgroundColor: '#2d2d2d',
      show: true,
        alwaysOnTop: true,
        skipTaskbar: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '../../../src/preload.js')
        }
      });
      
    const indexPath = path.join(process.cwd(), 'index.html');
    this.overlayWindow.loadFile(indexPath);
    
    // Ensure the window is visible
    this.overlayWindow.show();
    this.isVisible = true;

    this.overlayWindow.once('ready-to-show', () => {
      logger.info('Overlay window ready to show');
      this.windowReady = true;
      if (this.overlayWindow) {
        // Make sure window is visible and focused
        this.overlayWindow.show();
        this.overlayWindow.focus();
        this.isVisible = true;
      
        if (this.pendingCards) {
          this.displayCards(this.pendingCards);
          this.pendingCards = null;
        }
      }
    });

      this.overlayWindow.on('closed', () => {
        logger.info('Overlay window closed');
        this.overlayWindow = null;
      this.windowReady = false;
      });
      
    logger.info('Overlay window created');
  }
  
  /**
   * Show the overlay window
   */
  public show(): void {
    if (this.overlayWindow) {
      this.overlayWindow.show();
      this.isVisible = true;
      logger.info('Overlay window shown');
    }
  }
  
  /**
   * Hide the overlay window
   */
  public hide(): void {
    if (this.overlayWindow) {
      this.overlayWindow.hide();
      this.isVisible = false;
      logger.info('Overlay window hidden');
    }
  }
  
  /**
   * Check if the overlay is currently visible
   * @returns Boolean indicating if overlay is visible
   */
  public isOverlayVisible(): boolean {
    return this.isVisible;
  }
  
  /**
   * Update the overlay position
   * @param position New position for the overlay
   */
  public updatePosition(position: Partial<OverlayPosition>): void {
    // Update stored position
    this.position = {
      ...this.position,
      ...position
    };
    
    if (this.overlayWindow) {
      logger.debug('Updating overlay position', { position: this.position });
      this.overlayWindow.setBounds(this.position);
    }
  }
  
  /**
   * Display cards in the overlay
   * @param cards Array of cards to display
   */
  public displayCards(cards: Card[]): void {
    if (!this.overlayWindow || !this.windowReady) {
      logger.info('Window not ready, queueing cards for display');
      this.pendingCards = cards;
      return;
    }
    
    logger.info('Displaying cards:', { count: cards.length });
    this.overlayWindow.webContents.send('update-cards', cards);
      this.show();
  }
  
  /**
   * Attempt to find the Hearthstone window and position the overlay accordingly
   */
  public positionOverHearthstone(): void {
    if (!this.overlayWindow) return;
    
    const display = screen.getPrimaryDisplay();
    this.position = {
      x: Math.floor(display.bounds.width / 2 - 400),
      y: Math.floor(display.bounds.height / 2 - 300),
      width: 800,
      height: 600
    };
    
    this.overlayWindow.setBounds(this.position);
    logger.info('Overlay positioned', this.position);
  }
  
  /**
   * Get the overlay window instance
   * @returns BrowserWindow instance or null
   */
  public getOverlayWindow(): BrowserWindow | null {
    return this.overlayWindow;
  }

  /**
   * Send data to the renderer process
   * @param channel Channel name
   * @param data Data to send
   */
  public sendToRenderer(channel: string, data: any): void {
    if (!this.overlayWindow || !this.windowReady) {
      logger.warn(`Cannot send to renderer on channel ${channel}, window not ready`);
      return;
    }

    logger.debug(`Sending data to renderer on channel ${channel}`);
    this.overlayWindow.webContents.send(channel, data);
  }

  /**
   * Destroy the overlay window
   */
  public destroy(): void {
    if (this.overlayWindow) {
      logger.info('Destroying overlay window');
      this.overlayWindow.destroy();
      this.overlayWindow = null;
      this.isVisible = false;
    }
  }
}

export default OverlayManager;