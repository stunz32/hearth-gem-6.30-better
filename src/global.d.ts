import { ICaptureRegionArgs, CaptureRegionResult, CaptureRegion } from './types/capture';

declare global {
  interface Window {
    api: {
      /**
       * Invoke a main-process handler and return a Promise.
       * @param channel – IPC channel name
       * @param args    – JSON-serialisable arguments
       * @returns Promise<any> – value resolved by main-process handler
       */
      invoke(channel: string, ...args: any[]): Promise<any>;
      
      // Specific IPC methods for HearthGem
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
      
      // Event listeners
      onCardsDetected: (callback: (result: any) => void) => void;
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