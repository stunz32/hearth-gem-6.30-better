import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { imageHash } from 'image-hash';
import { promisify } from 'util';

// Promisify the imageHash function
const imageHashAsync = promisify(imageHash);

// Configuration
const HASH_BITS = 16; // Higher values = more detail
const CARD_IMAGES_DIR = path.join(process.cwd(), 'data/images/cards');
const HASH_DIR = path.join(process.cwd(), 'data/hashes');
const HASH_FILE = path.join(HASH_DIR, 'card_hashes.json');
const TEMPLATES_DIR = path.join(HASH_DIR, 'templates');
const MANA_DIR = path.join(TEMPLATES_DIR, 'mana');
const RARITY_DIR = path.join(TEMPLATES_DIR, 'rarity');

// Card hash data interface
interface CardHashData {
  cardId: string;
  hash: string;
  imageUrl?: string;
}

// Ensure directories exist
function ensureDirectories() {
  const dirs = [CARD_IMAGES_DIR, HASH_DIR, TEMPLATES_DIR, MANA_DIR, RARITY_DIR];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }
}

// Download card images from Hearthstone API
async function downloadCardImages() {
  try {
    console.log('Downloading card list from Hearthstone API...');
    
    // Get card data from Hearthstone API
    const response = await axios.get('https://api.hearthstonejson.com/v1/latest/enUS/cards.collectible.json');
    const cards = response.data;
    
    console.log(`Found ${cards.length} collectible cards`);
    
    // Create a map to track downloaded cards
    const downloadedCards = new Map<string, boolean>();
    
    // Check which cards we already have
    if (fs.existsSync(CARD_IMAGES_DIR)) {
      const files = fs.readdirSync(CARD_IMAGES_DIR);
      for (const file of files) {
        if (file.endsWith('.png') || file.endsWith('.jpg')) {
          const cardId = path.parse(file).name;
          downloadedCards.set(cardId, true);
        }
      }
      console.log(`Found ${downloadedCards.size} existing card images`);
    }
    
    // Download missing cards
    let downloaded = 0;
    let failed = 0;
    
    for (const card of cards) {
      const cardId = card.id;
      
      // Skip if we already have this card
      if (downloadedCards.has(cardId)) {
        continue;
      }
      
      try {
        // Construct image URL
        const imageUrl = `https://art.hearthstonejson.com/v1/render/latest/enUS/256x/${cardId}.png`;
        
        console.log(`Downloading ${cardId}...`);
        
        // Download image
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        
        // Save image
        const imagePath = path.join(CARD_IMAGES_DIR, `${cardId}.png`);
        fs.writeFileSync(imagePath, buffer);
        
        downloaded++;
      } catch (error) {
        console.error(`Failed to download ${cardId}: ${error}`);
        failed++;
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`Downloaded ${downloaded} new cards, ${failed} failed`);
  } catch (error) {
    console.error('Error downloading card images:', error);
  }
}

// Generate hashes for all card images
async function generateHashes() {
  try {
    console.log('Generating hashes for card images...');
    
    // Get all image files
    const files = fs.readdirSync(CARD_IMAGES_DIR);
    const imageFiles = files.filter(file => 
      file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
    );
    
    if (imageFiles.length === 0) {
      console.warn('No card images found in directory');
      return;
    }
    
    console.log(`Found ${imageFiles.length} card images`);
    
    // Generate hash for each image
    const cardHashes: CardHashData[] = [];
    
    for (const file of imageFiles) {
      const filePath = path.join(CARD_IMAGES_DIR, file);
      const cardId = path.parse(file).name;
      
      try {
        console.log(`Generating hash for ${cardId}...`);
        
        // Generate perceptual hash
        const hash = await imageHashAsync(filePath, HASH_BITS, true);
        
        cardHashes.push({
          cardId,
          hash,
          imageUrl: filePath
        });
      } catch (error) {
        console.error(`Error generating hash for ${cardId}:`, error);
      }
    }
    
    // Save hashes to file
    fs.writeFileSync(HASH_FILE, JSON.stringify(cardHashes, null, 2));
    
    console.log(`Generated and saved ${cardHashes.length} hashes`);
  } catch (error) {
    console.error('Error generating hashes:', error);
  }
}

// Extract mana cost and rarity templates from card images
async function extractTemplates() {
  try {
    console.log('Extracting mana cost and rarity templates...');
    
    // Get all image files
    const files = fs.readdirSync(CARD_IMAGES_DIR);
    const imageFiles = files.filter(file => 
      file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')
    );
    
    if (imageFiles.length === 0) {
      console.warn('No card images found in directory');
      return;
    }
    
    // Process a subset of cards for templates (to avoid duplicates)
    // We'll use cards with different mana costs and rarities
    const processedMana = new Set<number>();
    const processedRarity = new Set<string>();
    
    // Get card data from Hearthstone API to know mana costs and rarities
    const response = await axios.get('https://api.hearthstonejson.com/v1/latest/enUS/cards.collectible.json');
    const cards = response.data;
    
    // Create a map of card ID to card data
    const cardMap = new Map();
    for (const card of cards) {
      cardMap.set(card.id, card);
    }
    
    // Extract templates
    let manaCount = 0;
    let rarityCount = 0;
    
    for (const file of imageFiles) {
      const filePath = path.join(CARD_IMAGES_DIR, file);
      const cardId = path.parse(file).name;
      
      // Get card data
      const card = cardMap.get(cardId);
      if (!card) {
        continue;
      }
      
      const manaCost = card.cost;
      const rarity = card.rarity;
      
      try {
        // Extract mana template if we haven't processed this mana cost yet
        if (!processedMana.has(manaCost)) {
          console.log(`Extracting mana template for cost ${manaCost} from ${cardId}...`);
          
          // Load image
          const image = sharp(filePath);
          
          // Extract top-left corner (mana crystal)
          // Note: These coordinates are approximate and would need to be adjusted
          // based on the actual card image format
          await image
            .extract({ left: 0, top: 0, width: 32, height: 32 })
            .toFile(path.join(MANA_DIR, `${cardId}.png`));
          
          processedMana.add(manaCost);
          manaCount++;
        }
        
        // Extract rarity template if we haven't processed this rarity yet
        if (rarity && !processedRarity.has(rarity)) {
          console.log(`Extracting rarity template for ${rarity} from ${cardId}...`);
          
          // Load image
          const image = sharp(filePath);
          
          // Extract rarity gem (position would need to be adjusted)
          // Note: These coordinates are approximate and would need to be adjusted
          await image
            .extract({ left: 100, top: 400, width: 16, height: 16 })
            .toFile(path.join(RARITY_DIR, `${cardId}.png`));
          
          processedRarity.add(rarity);
          rarityCount++;
        }
      } catch (error) {
        console.error(`Error extracting templates for ${cardId}:`, error);
      }
    }
    
    console.log(`Extracted ${manaCount} mana templates and ${rarityCount} rarity templates`);
  } catch (error) {
    console.error('Error extracting templates:', error);
  }
}

// Main function
async function main() {
  try {
    // Ensure directories exist
    ensureDirectories();
    
    // Download card images
    await downloadCardImages();
    
    // Generate hashes
    await generateHashes();
    
    // Extract templates
    // Note: This is commented out because it requires precise coordinates
    // which would need to be determined for the specific card image format
    // await extractTemplates();
    
    console.log('Card hash generation complete!');
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

// Run the script
main();