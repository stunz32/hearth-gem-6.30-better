import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import logger from '../../utils/logger';

/**
 * Interface for card data
 * @interface
 */
export interface Card {
  id: string;
  name: string;
  cost: number;
  attack?: number;
  health?: number;
  type: string;
  rarity: string;
  set: string;
  text?: string;
  imageUrl?: string;
  score?: number;
}

/**
 * CardDataService
 * Manages card data and provides lookup functionality
 * @module CardDataService
 */
export class CardDataService {
  private cards: Map<string, Card> = new Map();
  private dataDirectory: string;
  private isLoaded: boolean = false;
  
  /**
   * Creates a new CardDataService instance
   * @param dataDirectory Optional custom data directory path
   */
  constructor(dataDirectory?: string) {
    // Use provided directory, environment variable, or default path
    this.dataDirectory = dataDirectory || 
      process.env.HEARTHGEM_DATA_DIR || 
      path.join(app.getPath('userData'), 'data');
      
    logger.info('CardDataService initialized', { dataDirectory: this.dataDirectory });
  }
  
  /**
   * Load card data from files
   * @returns Promise that resolves when data is loaded
   */
  public async loadCardData(): Promise<void> {
    logger.info('Loading card data');
    
    try {
      // First, try to load from the root directory (highest priority)
      const rootDataPath = path.join(app.getAppPath(), 'cards.json');
      
      // Then try the default data directory
      let cardDataPath = path.join(this.dataDirectory, 'cards.json');
      
      // Check if the root file exists (highest priority)
      if (fs.existsSync(rootDataPath)) {
        logger.info('Using root directory card database', { path: rootDataPath });
        cardDataPath = rootDataPath;
      }
      // If not in root, check the default data directory
      else if (!fs.existsSync(cardDataPath)) {
        const sampleDataPath = path.join(app.getAppPath(), 'data', 'cards.json');
        
        if (fs.existsSync(sampleDataPath)) {
          logger.info('Using sample card data', { path: sampleDataPath });
          cardDataPath = sampleDataPath;
        } else {
          // Create empty card data file if it doesn't exist
          fs.mkdirSync(this.dataDirectory, { recursive: true });
          fs.writeFileSync(cardDataPath, JSON.stringify([], null, 2));
          logger.warn('Card data file not found, created empty file', { path: cardDataPath });
        }
      }
      
      // Load the card data
      if (fs.existsSync(cardDataPath)) {
        const rawData = fs.readFileSync(cardDataPath, 'utf8');
        const cardArray: Card[] = JSON.parse(rawData);
        
        // Populate the cards map
        cardArray.forEach(card => {
          this.cards.set(card.id, card);
        });
        
        this.isLoaded = true;
        logger.info('Card data loaded successfully', { cardCount: cardArray.length });
      }
    } catch (error) {
      logger.error('Failed to load card data', { error });
      throw new Error(`Failed to load card data: ${error}`);
    }
  }
  
  /**
   * Get card data by ID
   * @param cardId Card ID to look up
   * @returns Card data or undefined if not found
   */
  public getCard(cardId: string): Card | undefined {
    if (!this.isLoaded) {
      logger.warn('Attempted to get card before data was loaded');
    }
    return this.cards.get(cardId);
  }
  
  /**
   * Get multiple cards by their IDs
   * @param cardIds Array of card IDs to look up
   * @returns Array of found cards (missing cards are omitted)
   */
  public getCards(cardIds: string[]): Card[] {
    if (!this.isLoaded) {
      logger.warn('Attempted to get cards before data was loaded');
    }
    
    return cardIds
      .map(id => this.cards.get(id))
      .filter((card): card is Card => card !== undefined);
  }
  
  /**
   * Get a specified number of sample cards
   * @param count Number of sample cards to return
   * @returns Array of sample cards
   */
  public getSampleCards(count: number = 3): Card[] {
    if (!this.isLoaded) {
      logger.warn('Attempted to get sample cards before data was loaded');
    }
    
    // If we don't have any cards loaded, create some sample cards
    if (this.cards.size === 0) {
      const sampleCards: Card[] = [
        {
          id: 'SAMPLE001',
          name: 'Sample Minion',
          cost: 3,
          attack: 3,
          health: 4,
          type: 'MINION',
          rarity: 'COMMON',
          set: 'CORE',
          text: 'Sample card text for testing.',
          imageUrl: 'https://art.hearthstonejson.com/v1/render/latest/enUS/512x/SAMPLE001.png',
          score: 85
        },
        {
          id: 'SAMPLE002',
          name: 'Sample Spell',
          cost: 2,
          type: 'SPELL',
          rarity: 'RARE',
          set: 'CORE',
          text: 'Deal 3 damage to a minion.',
          imageUrl: 'https://art.hearthstonejson.com/v1/render/latest/enUS/512x/SAMPLE002.png',
          score: 70
        },
        {
          id: 'SAMPLE003',
          name: 'Sample Weapon',
          cost: 4,
          attack: 3,
          health: 2, // Durability for weapons
          type: 'WEAPON',
          rarity: 'EPIC',
          set: 'CORE',
          text: 'Whenever you attack, draw a card.',
          imageUrl: 'https://art.hearthstonejson.com/v1/render/latest/enUS/512x/SAMPLE003.png',
          score: 90
        }
      ];
      
      return sampleCards.slice(0, count);
    }
    
    // Otherwise, return a subset of the loaded cards
    return Array.from(this.cards.values()).slice(0, count);
  }
  
  /**
   * Add or update a card in the database
   * @param card Card data to add or update
   */
  public async addOrUpdateCard(card: Card): Promise<void> {
    logger.debug('Adding/updating card', { cardId: card.id });
    this.cards.set(card.id, card);
    await this.saveCardData();
  }
  
  /**
   * Save card data to file
   * @returns Promise that resolves when data is saved
   * @private
   */
  private async saveCardData(): Promise<void> {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(this.dataDirectory)) {
        fs.mkdirSync(this.dataDirectory, { recursive: true });
      }
      
      const cardDataPath = path.join(this.dataDirectory, 'cards.json');
      const cardArray = Array.from(this.cards.values());
      
      await fs.promises.writeFile(
        cardDataPath,
        JSON.stringify(cardArray, null, 2)
      );
      
      logger.debug('Card data saved successfully');
    } catch (error) {
      logger.error('Failed to save card data', { error });
      throw new Error(`Failed to save card data: ${error}`);
    }
  }
}

export default CardDataService;