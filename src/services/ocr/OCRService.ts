import { createWorker, PSM, OEM } from 'tesseract.js';
import logger from '../../utils/logger';
import { EventEmitter } from 'events';
import { CaptureResult } from '../capture/ScreenCaptureService';

/**
 * OCR result from processing an image
 */
export interface OCRResult {
  text: string;
  confidence: number;
  region: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Service for optical character recognition (OCR)
 */
export class OCRService extends EventEmitter {
  private worker: Tesseract.Worker | null = null;
  private isInitializing = false;
  private isInitialized = false;
  
  constructor() {
    super();
  }
  
  /**
   * Initialize the OCR worker
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized || this.isInitializing) {
      return;
    }
    
    this.isInitializing = true;
    
    try {
      // Create and initialize Tesseract worker
      // Use English language model
      this.worker = await createWorker('eng', OEM.LSTM_ONLY);
      
      // Configure Tesseract for card name recognition
      // PSM.SINGLE_LINE - Treat the image as a single line of text (card names are usually single line)
      // Only recognize standard letters, numbers, and minimal punctuation in card names
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\'\",.- ',
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        // Force DPI heuristics that expect ~300dpi
        user_defined_dpi: '300',
        // No inversion, no extra outputs
        tessedit_do_invert: 0,
        tessjs_create_hocr: 0,
        tessjs_create_tsv: 0,
        // Disable system dictionaries – fantasy names are non-dictionary anyway
        load_system_dawg: 0,
        load_freq_dawg: 0,
        // Reduce penalties – but we rely on fuzzy matcher later
        language_model_penalty_non_dict_word: 0.1,
        language_model_penalty_non_freq_dict_word: 0.05
      });
      
      this.isInitialized = true;
      logger.info('OCR worker initialized', {});
    } catch (error) {
      logger.error('Failed to initialize OCR worker', { error });
      this.isInitializing = false;
      throw error;
    }
  }
  
  /**
   * Process images with OCR
   * @param captureResults Image capture results to process
   * @returns Promise resolving to OCR results
   */
  public async processImages(captureResults: CaptureResult[]): Promise<OCRResult[]> {
    // Initialize worker if needed
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (!this.worker) {
      logger.error('OCR worker not available');
      return captureResults.map(result => ({
        text: '',
        confidence: 0,
        region: result.region.name,
        timestamp: result.timestamp,
        success: false,
        error: 'OCR worker not available'
      }));
    }
    
    const results: OCRResult[] = [];
    
    // Process each image
    for (const captureResult of captureResults) {
      if (!captureResult.success || !captureResult.dataUrl) {
        results.push({
          text: '',
          confidence: 0,
          region: captureResult.region.name,
          timestamp: captureResult.timestamp,
          success: false,
          error: 'Invalid capture result'
        });
        continue;
      }
      
      try {
        // Process with OCR
        const { data } = await this.worker.recognize(captureResult.dataUrl);
        
        // Clean up text - Hearthstone card names don't have multiple spaces or weird chars
        let text = data.text.replace(/\s+/g, ' ').trim();
        
        // Remove characters that are unlikely to be in card names
        text = text.replace(/[^a-zA-Z0-9',\- ]/g, '');
        
        // Capitalize words for consistency (Hearthstone card names are Title Case)
        text = text.split(' ').map(word => {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
        
        const confidence = data.confidence / 100; // Normalize to 0-1
        
        // Enhanced debug logging
        if (text.length > 0) {
          logger.info('OCR detected text', { 
            region: captureResult.region.name, 
            text, 
            confidence: confidence.toFixed(2),
            rawLength: text.length
          });
        } else {
          logger.warn('OCR returned empty text', { 
            region: captureResult.region.name, 
            confidence: confidence.toFixed(2),
            isEmpty: text.length === 0,
            dataUrlLength: captureResult.dataUrl.length
          });
        }
        
        results.push({
          text,
          confidence,
          region: captureResult.region.name,
          timestamp: captureResult.timestamp,
          success: true
        });
        
        this.emit('ocr-complete', { 
          region: captureResult.region.name, 
          text, 
          confidence 
        });
      } catch (error) {
        logger.error('Error processing image with OCR', {
          error,
          region: captureResult.region.name
        });
        
        results.push({
          text: '',
          confidence: 0,
          region: captureResult.region.name,
          timestamp: captureResult.timestamp,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }
  
  /**
   * Destroy the OCR worker
   */
  public async destroy(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
        this.worker = null;
        this.isInitialized = false;
      } catch (error) {
        logger.error('Error destroying OCR worker', { error });
      }
    }
  }
}

export default OCRService;