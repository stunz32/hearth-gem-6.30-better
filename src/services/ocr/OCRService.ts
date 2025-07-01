import { createWorker, PSM, OEM } from 'tesseract.js';
import logger from '../../utils/logger';
import { EventEmitter } from 'events';
import { CaptureResult } from '../capture/ScreenCaptureService';

/**
 * Interface for OCR result
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
 * OCRService
 * Handles OCR processing for card name detection
 * @module OCRService
 */
export class OCRService extends EventEmitter {
  private worker: Tesseract.Worker | null = null;
  private isInitialized: boolean = false;
  private isInitializing: boolean = false;
  private resultCache: Map<string, OCRResult> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache TTL
  
  constructor() {
    super();
    logger.info('OCRService initialized');
  }
  
  /**
   * Initialize the OCR worker
   * @returns Promise resolving when worker is ready
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.isInitializing) {
      // Wait for initialization to complete
      return new Promise<void>((resolve) => {
        this.once('initialized', () => resolve());
      });
    }
    
    this.isInitializing = true;
    logger.info('Initializing OCR worker');
    
    try {
      // Create and initialize worker with English language
      this.worker = await createWorker('eng');
      
      // Configure worker for better card name recognition
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\'",: -',
        tessedit_pageseg_mode: PSM.SINGLE_LINE, // Assume card names are single lines of text
        tessedit_ocr_engine_mode: OEM.LSTM_ONLY, // Use LSTM neural network for better accuracy
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
        tessjs_create_box: '0',
        tessjs_create_unlv: '0',
        tessjs_create_osd: '0',
        tessjs_textonly_pdf: '0',
        load_system_dawg: '1',
        language_model_penalty_non_dict_word: '0.8',
        language_model_penalty_non_freq_dict_word: '0.1',
        textord_min_linesize: '1.5',
      });
      
      this.isInitialized = true;
      this.isInitializing = false;
      logger.info('OCR worker initialized successfully');
      this.emit('initialized');
    } catch (error) {
      this.isInitializing = false;
      logger.error('Failed to initialize OCR worker', { error });
      throw new Error(`Failed to initialize OCR worker: ${error}`);
    }
  }
  
  /**
   * Terminate the OCR worker
   */
  public async terminate(): Promise<void> {
    if (this.worker) {
      logger.info('Terminating OCR worker');
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
    
    // Clear the cache
    this.resultCache.clear();
  }
  
  /**
   * Process captured image regions with OCR
   * @param captureResults Array of capture results to process
   * @returns Promise resolving to array of OCR results
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
          error: captureResult.error || 'Invalid capture result'
        });
        continue;
      }
      
      // Check cache first
      const cacheKey = `${captureResult.region.name}-${captureResult.timestamp}`;
      if (this.resultCache.has(cacheKey)) {
        results.push(this.resultCache.get(cacheKey)!);
        continue;
      }
      
      try {
        logger.debug('Processing image with OCR', { region: captureResult.region.name });
        
        // Recognize text in the image
        const { data } = await this.worker.recognize(captureResult.dataUrl);
        
        // Extract text and confidence
        const text = data.text.trim();
        const confidence = data.confidence / 100; // Convert to 0-1 range
        
        logger.debug('OCR result', { region: captureResult.region.name, text, confidence });
        
        const ocrResult: OCRResult = {
          text,
          confidence,
          region: captureResult.region.name,
          timestamp: captureResult.timestamp,
          success: true
        };
        
        // Cache the result
        this.resultCache.set(cacheKey, ocrResult);
        
        // Schedule cache cleanup
        setTimeout(() => {
          this.resultCache.delete(cacheKey);
        }, this.CACHE_TTL_MS);
        
        results.push(ocrResult);
      } catch (error) {
        logger.error('Error processing image with OCR', { 
          region: captureResult.region.name, 
          error 
        });
        
        results.push({
          text: '',
          confidence: 0,
          region: captureResult.region.name,
          timestamp: captureResult.timestamp,
          success: false,
          error: `OCR processing failed: ${error}`
        });
      }
    }
    
    return results;
  }
}

export default OCRService;