// Preload script
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
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
    
    // Event listeners
    onCardsDetected: (callback) => {
      ipcRenderer.on('cardsDetected', (event, result) => callback(result));
    },
    
    // Remove event listeners
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('cardsDetected');
    }
  }
);

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
    captureRegion: (args) => ipcRenderer.invoke('CAPTURE_REGION', args)
  }
);