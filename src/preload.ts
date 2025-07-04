// Ensure CommonJS globals exist in sandboxed renderer (needed because we compile renderer.js with CommonJS but NodeIntegration is disabled)
// This prevents errors like 'exports is not defined' when the renderer bundle references CommonJS globals.
globalThis.exports = globalThis.exports || {};
window.require = require;

import { contextBridge, ipcRenderer } from 'electron';

interface WindowAPI {
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
  
  // Region selector specific methods
  regionSelectionComplete: (regions: any[]) => Promise<boolean>;
  regionSelectionCancel: () => Promise<boolean>;
  
  // Event listeners
  onCardsDetected: (callback: (result: any) => void) => void;
  onScreenDimensions: (callback: (dimensions: { width: number, height: number }) => void) => void;
  removeAllListeners: () => void;
}

const api: WindowAPI = {
  invoke: (channel: string, ...args: any[]) =>
    ipcRenderer.invoke(channel, ...args),
    
  findHearthstoneWindow: () => ipcRenderer.invoke('findHearthstoneWindow'),
  captureRegions: () => ipcRenderer.invoke('captureRegions'),
  detectCards: () => ipcRenderer.invoke('detectCards'),
  startDetection: (intervalMs) => ipcRenderer.invoke('startDetection', intervalMs),
  stopDetection: () => ipcRenderer.invoke('stopDetection'),
  saveManualRegions: (regions) => ipcRenderer.invoke('saveManualRegions', regions),
  clearManualRegions: () => ipcRenderer.invoke('clearManualRegions'),
  generateHashes: () => ipcRenderer.invoke('generateHashes'),
  addCardImage: (imageData, cardId) => ipcRenderer.invoke('addCardImage', imageData, cardId),
  addManaTemplate: (imageData, cardId) => ipcRenderer.invoke('addManaTemplate', imageData, cardId),
  addRarityTemplate: (imageData, cardId) => ipcRenderer.invoke('addRarityTemplate', imageData, cardId),
  detectCardRegions: () => ipcRenderer.invoke('detectCardRegions'),
  
  // Region selector specific methods
  regionSelectionComplete: (regions) => ipcRenderer.invoke('region-selection-complete', regions),
  regionSelectionCancel: () => ipcRenderer.invoke('region-selection-cancel'),
  
  // Event listeners
  onCardsDetected: (callback) => {
    ipcRenderer.on('cardsDetected', (event, result) => callback(result));
  },
  
  // Screen dimensions listener for region selector
  onScreenDimensions: (callback) => {
    ipcRenderer.on('screen-dimensions', (event, dimensions) => callback(dimensions));
  },
  
  // Remove event listeners
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('cardsDetected');
    ipcRenderer.removeAllListeners('screen-dimensions');
  }
};

contextBridge.exposeInMainWorld('api', api);

// Expose the desktop API with safe screen capture functionality
contextBridge.exposeInMainWorld(
  'desktop', {
    /**
     * Capture a specific region of the screen using the safe capture method
     * @param {Object} args - Region coordinates and dimensions
     * @param {number} args.x - X coordinate (left)
     * @param {number} args.y - Y coordinate (top)
     * @param {number} args.width - Width of region
     * @param {number} args.height - Height of region
     * @returns {Promise<Uint8Array>} Promise resolving to raw PNG bytes
     */
    captureRegion: (args: any) => ipcRenderer.invoke('CAPTURE_REGION', args)
  }
);

console.log('[preload] IPC helper initialised, channels=', Object.keys(api));