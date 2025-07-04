import { ICaptureRegionArgs, CaptureRegionResult, CaptureRegion } from './types/capture';

declare global {
  interface Window {
    api: {
      findHearthstoneWindow: () => Promise<boolean>;
      captureRegions: () => Promise<any[]>;
      detectCards: () => Promise<any>;
      startDetection: (intervalMs: number) => Promise<boolean>;
      stopDetection: () => Promise<boolean>;
      saveManualRegions: (regions: any[]) => Promise<boolean>;
      clearManualRegions: () => Promise<boolean>;
      generateHashes: () => Promise<boolean>;
      addCardImage: (imageData: string, cardId: string) => Promise<boolean>;
      addManaTemplate: (imageData: string, cardId: string) => Promise<boolean>;
      addRarityTemplate: (imageData: string, cardId: string) => Promise<boolean>;
      detectCardRegions: () => Promise<any>;
      
      // Generic IPC invoke method for additional handlers
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      
      // Event listeners
      onCardsDetected: (callback: (result: any) => void) => void;
      
      // Remove event listeners
      removeAllListeners: () => void;
    };
    
    desktop: {
      /**
       * Capture a specific region of the screen
       * @param args Region coordinates and dimensions
       * @returns Promise resolving to raw PNG bytes with compatibility properties
       */
      captureRegion: (args: ICaptureRegionArgs | CaptureRegion) => Promise<CaptureRegionResult>;
    };
  }
}

export {}; 