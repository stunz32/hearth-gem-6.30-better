import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { promisify } from 'util';
import { getLogger } from './logger';

// Create logger instance for this module
const logger = getLogger('utils/build-card-hashes');

// Use require instead of import to avoid TypeScript errors
const axios = require('axios');
const imageHash = require('image-hash').imageHash;

// Promisify the imageHash function
const imageHashAsync = promisify(imageHash);

// Configuration
const HASH_DIR = path.join(process.cwd(), 'data/hashes');
const HASH_FILE = path.join(HASH_DIR, 'card_hashes.json');
const CARD_IMAGES_DIR = path.join(process.cwd(), 'data/images/cards');
const HEARTHSTONE_API_URL = 'https://api.hearthstonejson.com/v1/latest/enUS/cards.json';
const HEARTHSTONE_IMAGE_BASE_URL = 'https://art.hearthstonejson.com/v1/render/latest/enUS/256x';
const HASH_BITS = 16; // Higher values = more detail

// Interface for card data
interface CardData {
  id: string;
  name: string;
  set: string;
  type: string;
  rarity?: string;
  cost?: number;
  collectible?: boolean;
}

// Interface for card hash data
interface CardHashData {
  cardId: string;
  hash: string;
  imageUrl?: string;
}

/**
 * Ensure required directories exist
 */
async function ensureDirectories(): Promise<void> {
  try {
    if (!fs.existsSync(HASH_DIR)) {
      fs.mkdirSync(HASH_DIR, { recursive: true });
      logger.info('Created hash directory', { path: HASH_DIR });
    }
    
    if (!fs.existsSync(CARD_IMAGES_DIR)) {
      fs.mkdirSync(CARD_IMAGES_DIR, { recursive: true });
      logger.info('Created card images directory', { path: CARD_IMAGES_DIR });
    }
  } catch (error) {
    logger.error('Error creating directories', { error });
    throw error;
  }
}

/**
 * Fetch card data from the Hearthstone API
 */
async function fetchCardData(): Promise<CardData[]> {
  try {
    logger.info('Fetching card data from Hearthstone API');
    const response = await axios.get(HEARTHSTONE_API_URL);
    const cards = response.data as CardData[];
    
    // Filter for collectible cards only
    const collectibleCards = cards.filter(card => card.collectible && card.id && card.type !== 'HERO');
    
    logger.info('Fetched card data', { 
      totalCards: cards.length,
      collectibleCards: collectibleCards.length
    });
    
    return collectibleCards;
  } catch (error) {
    logger.error('Error fetching card data', { error });
    throw error;
  }
}

/**
 * Download a card image
 * @param cardId Card ID
 * @returns Path to downloaded image
 */
async function downloadCardImage(cardId: string): Promise<string> {
  try {
    const imageUrl = `${HEARTHSTONE_IMAGE_BASE_URL}/${cardId}.png`;
    const imagePath = path.join(CARD_IMAGES_DIR, `${cardId}.png`);
    
    // Skip if image already exists
    if (fs.existsSync(imagePath)) {
      return imagePath;
    }
    
    // Download image
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    
    // Save image
    await fs.promises.writeFile(imagePath, buffer);
    
    return imagePath;
  } catch (error) {
    logger.error('Error downloading card image', { cardId, error });
    throw error;
  }
}

/**
 * Generate hash for a card image
 * @param imagePath Path to the image
 * @param cardId Card ID
 * @returns Hash string
 */
async function generateHash(imagePath: string, cardId: string): Promise<string> {
  try {
    // Generate perceptual hash
    const hash = await imageHashAsync(imagePath, HASH_BITS, true);
    
    return hash;
  } catch (error) {
    logger.error('Error generating hash', { cardId, error });
    throw error;
  }
}

/**
 * Process a card to download its image and generate a hash
 * @param card Card data
 * @returns Card hash data
 */
async function processCard(card: CardData): Promise<CardHashData | null> {
  try {
    // Download card image
    const imagePath = await downloadCardImage(card.id);
    
    // Generate hash
    const hash = await generateHash(imagePath, card.id);
    
    return {
      cardId: card.id,
      hash,
      imageUrl: `${HEARTHSTONE_IMAGE_BASE_URL}/${card.id}.png`
    };
  } catch (error) {
    logger.error('Error processing card', { cardId: card.id, error });
    return null;
  }
}

/**
 * Save card hashes to file
 * @param cardHashes Card hashes to save
 */
async function saveCardHashes(cardHashes: CardHashData[]): Promise<void> {
  try {
    await fs.promises.writeFile(
      HASH_FILE,
      JSON.stringify(cardHashes, null, 2)
    );
    
    logger.info('Saved card hashes', { count: cardHashes.length });
  } catch (error) {
    logger.error('Error saving card hashes', { error });
    throw error;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting card hash generation');
    
    // Ensure directories exist
    await ensureDirectories();
    
    // Fetch card data
    const cards = await fetchCardData();
    
    // Process cards in batches to avoid overwhelming the API
    const batchSize = 10;
    const cardHashes: CardHashData[] = [];
    
    for (let i = 0; i < cards.length; i += batchSize) {
      const batch = cards.slice(i, i + batchSize);
      
      logger.info(`Processing batch ${i / batchSize + 1} of ${Math.ceil(cards.length / batchSize)}`);
      
      // Process batch in parallel
      const batchResults = await Promise.all(batch.map(card => processCard(card)));
      
      // Filter out null results and add to card hashes
      const validResults = batchResults.filter((result): result is CardHashData => result !== null);
      cardHashes.push(...validResults);
      
      // Save progress after each batch
      await saveCardHashes(cardHashes);
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.info('Finished card hash generation', { 
      totalCards: cards.length,
      hashesGenerated: cardHashes.length
    });
  } catch (error) {
    logger.error('Error in main function', { error });
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main();
}

export { main as buildCardHashes }; 