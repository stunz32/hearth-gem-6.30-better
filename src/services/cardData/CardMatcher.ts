import stringSimilarity from 'string-similarity';
import logger from '../../utils/logger';
import { Card } from './CardDataService';
import { OCRResult } from '../ocr/OCRService';

/**
 * Interface for card match result
 */
export interface CardMatchResult {
  cardId: string;
  matchedName: string;
  originalText: string;
  similarity: number;
  confidence: number;
  region: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * CardMatcher
 * Matches OCR results to card names using fuzzy string matching
 * @module CardMatcher
 */
export class CardMatcher {
  private cards: Card[] = [];
  private cardNames: string[] = [];
  private cardNameVariants: Map<string, string[]> = new Map(); // Map of card ID to name variants
  private readonly MIN_SIMILARITY_THRESHOLD = 0.55; // Slightly lower threshold to catch more matches
  private readonly CONFIDENCE_WEIGHT = 0.3; // Weight of OCR confidence in final score
  private readonly SIMILARITY_WEIGHT = 0.7; // Weight of string similarity in final score
  private readonly LENGTH_PENALTY_FACTOR = 0.05; // Penalty for short text to avoid false positives
  
  /**
   * Creates a new CardMatcher instance
   * @param cards Optional initial card data
   */
  constructor(cards?: Card[]) {
    if (cards) {
      this.setCards(cards);
    }
    logger.info('CardMatcher initialized');
  }
  
  /**
   * Set or update the card data
   * @param cards Array of cards to use for matching
   */
  public setCards(cards: Card[]): void {
    this.cards = cards;
    
    // Extract card names for faster matching
    this.cardNames = cards.map(card => card.name.toLowerCase());
    
    // Generate name variants for better matching
    this.generateCardNameVariants(cards);
    
    logger.info('Card data updated in matcher', { cardCount: cards.length });
  }
  
  /**
   * Generate variants of card names to improve matching
   * @param cards Array of cards
   * @private
   */
  private generateCardNameVariants(cards: Card[]): void {
    this.cardNameVariants.clear();
    
    for (const card of cards) {
      const variants: string[] = [];
      const name = card.name.toLowerCase();
      
      // Original name
      variants.push(name);
      
      // Remove special characters
      const noSpecialChars = name.replace(/[^\w\s]/g, '');
      if (noSpecialChars !== name) {
        variants.push(noSpecialChars);
      }
      
      // Remove "the", "of", etc.
      const commonWords = ['the', 'of', 'a', 'an'];
      let simplifiedName = name;
      for (const word of commonWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        simplifiedName = simplifiedName.replace(regex, '').trim();
      }
      if (simplifiedName !== name) {
        variants.push(simplifiedName);
        variants.push(simplifiedName.replace(/\s+/g, ' ')); // Normalize spaces
      }
      
      // Handle common OCR errors
      const ocrVariant = name
        .replace(/0/g, 'o')
        .replace(/1/g, 'l')
        .replace(/5/g, 's')
        .replace(/8/g, 'b');
      if (ocrVariant !== name) {
        variants.push(ocrVariant);
      }
      
      // Store unique variants
      this.cardNameVariants.set(card.id, [...new Set(variants)]);
    }
    
    logger.debug('Generated card name variants', { 
      variantCount: Array.from(this.cardNameVariants.values()).reduce((sum, variants) => sum + variants.length, 0) 
    });
  }
  
  /**
   * Normalize text for better matching
   * @param text Text to normalize
   * @returns Normalized text
   * @private
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }
  
  /**
   * Match OCR results to card names
   * @param ocrResults Array of OCR results to match
   * @returns Array of card match results
   */
  public matchCards(ocrResults: OCRResult[]): CardMatchResult[] {
    if (this.cards.length === 0) {
      logger.warn('No card data available for matching');
      return ocrResults.map(result => ({
        cardId: '',
        matchedName: '',
        originalText: result.text,
        similarity: 0,
        confidence: 0,
        region: result.region,
        timestamp: result.timestamp,
        success: false,
        error: 'No card data available for matching'
      }));
    }
    
    return ocrResults.map(result => this.matchSingleCard(result));
  }
  
  /**
   * Find a direct match using card name variants
   * @param normalizedText Normalized OCR text
   * @returns Match result or null if no direct match
   * @private
   */
  private findDirectMatch(normalizedText: string): { cardId: string, similarity: number } | null {
    let bestMatch = { cardId: '', similarity: 0 };
    const directMatchThreshold = 0.85; // Threshold for considering a direct match
    
    // Check each card's variants
    for (const [cardId, variants] of this.cardNameVariants.entries()) {
      for (const variant of variants) {
        const similarity = stringSimilarity.compareTwoStrings(normalizedText, variant);
        
        if (similarity > bestMatch.similarity) {
          bestMatch = { cardId, similarity };
        }
        
        // Early return for very high confidence matches
        if (similarity >= directMatchThreshold) {
          return bestMatch;
        }
      }
    }
    
    // Return the best match if it's good enough
    if (bestMatch.similarity >= this.MIN_SIMILARITY_THRESHOLD) {
      return bestMatch;
    }
    
    return null;
  }
  
  /**
   * Match a single OCR result to a card name
   * @param ocrResult OCR result to match
   * @returns Card match result
   * @private
   */
  private matchSingleCard(ocrResult: OCRResult): CardMatchResult {
    if (!ocrResult.success || !ocrResult.text) {
      return {
        cardId: '',
        matchedName: '',
        originalText: ocrResult.text,
        similarity: 0,
        confidence: 0,
        region: ocrResult.region,
        timestamp: ocrResult.timestamp,
        success: false,
        error: ocrResult.error || 'Invalid OCR result'
      };
    }
    
    try {
      // Normalize the OCR text
      const normalizedText = this.normalizeText(ocrResult.text);
      
      if (normalizedText.length < 3) {
        logger.debug('OCR text too short for reliable matching', { text: normalizedText });
        return {
          cardId: '',
          matchedName: '',
          originalText: ocrResult.text,
          similarity: 0,
          confidence: 0,
          region: ocrResult.region,
          timestamp: ocrResult.timestamp,
          success: false,
          error: 'OCR text too short for reliable matching'
        };
      }
      
      // Apply length penalty for very short text to avoid false positives
      const lengthPenalty = Math.max(0, (10 - normalizedText.length) * this.LENGTH_PENALTY_FACTOR);
      
      // First try direct matching with variants for exact or near-exact matches
      const directMatch = this.findDirectMatch(normalizedText);
      if (directMatch) {
        const matchedCard = this.cards.find(card => card.id === directMatch.cardId)!;
        const combinedConfidence = 
          (directMatch.similarity * this.SIMILARITY_WEIGHT) + 
          (ocrResult.confidence * this.CONFIDENCE_WEIGHT);
        
        logger.debug('Direct card match found', {
          text: normalizedText,
          matchedName: matchedCard.name,
          cardId: matchedCard.id,
          similarity: directMatch.similarity,
          confidence: combinedConfidence
        });
        
        return {
          cardId: matchedCard.id,
          matchedName: matchedCard.name,
          originalText: ocrResult.text,
          similarity: directMatch.similarity,
          confidence: combinedConfidence,
          region: ocrResult.region,
          timestamp: ocrResult.timestamp,
          success: true
        };
      }
      
      // If no direct match, fall back to string similarity
      const matches = stringSimilarity.findBestMatch(normalizedText, this.cardNames);
      const bestMatch = matches.bestMatch;
      
      // Calculate combined confidence score with length penalty
      const combinedConfidence = 
        ((bestMatch.rating - lengthPenalty) * this.SIMILARITY_WEIGHT) + 
        (ocrResult.confidence * this.CONFIDENCE_WEIGHT);
      
      // Check if the match meets our threshold
      if (bestMatch.rating < this.MIN_SIMILARITY_THRESHOLD + lengthPenalty) {
        logger.debug('No good match found for OCR text', { 
          text: normalizedText,
          bestMatchRating: bestMatch.rating,
          bestMatchTarget: bestMatch.target,
          lengthPenalty
        });
        
        return {
          cardId: '',
          matchedName: bestMatch.target,
          originalText: ocrResult.text,
          similarity: bestMatch.rating,
          confidence: combinedConfidence,
          region: ocrResult.region,
          timestamp: ocrResult.timestamp,
          success: false,
          error: 'No good match found'
        };
      }
      
      // Find the card that corresponds to the matched name
      const matchedCardIndex = this.cardNames.indexOf(bestMatch.target.toLowerCase());
      const matchedCard = this.cards[matchedCardIndex];
      
      logger.debug('Card match found', {
        text: normalizedText,
        matchedName: matchedCard.name,
        cardId: matchedCard.id,
        similarity: bestMatch.rating,
        confidence: combinedConfidence,
        lengthPenalty
      });
      
      return {
        cardId: matchedCard.id,
        matchedName: matchedCard.name,
        originalText: ocrResult.text,
        similarity: bestMatch.rating,
        confidence: combinedConfidence,
        region: ocrResult.region,
        timestamp: ocrResult.timestamp,
        success: true
      };
    } catch (error) {
      logger.error('Error matching card', { text: ocrResult.text, error });
      
      return {
        cardId: '',
        matchedName: '',
        originalText: ocrResult.text,
        similarity: 0,
        confidence: 0,
        region: ocrResult.region,
        timestamp: ocrResult.timestamp,
        success: false,
        error: `Matching failed: ${error}`
      };
    }
  }
}

export default CardMatcher;