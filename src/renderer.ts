// Import types
import type { DraftDetectionResult } from './services/draft/VisualDraftDetector';

// DOM elements
let findHearthstoneBtn: HTMLButtonElement;
let captureRegionsBtn: HTMLButtonElement;
let detectCardsBtn: HTMLButtonElement;
let startDetectionBtn: HTMLButtonElement;
let stopDetectionBtn: HTMLButtonElement;
let generateHashesBtn: HTMLButtonElement;
let detectRegionsBtn: HTMLButtonElement;
let statusText: HTMLElement;
let cardContainer: HTMLElement;
let captureContainer: HTMLElement;

// Initialize the UI
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  findHearthstoneBtn = document.getElementById('findHearthstoneBtn') as HTMLButtonElement;
  captureRegionsBtn = document.getElementById('captureRegionsBtn') as HTMLButtonElement;
  detectCardsBtn = document.getElementById('detectCardsBtn') as HTMLButtonElement;
  startDetectionBtn = document.getElementById('startDetectionBtn') as HTMLButtonElement;
  stopDetectionBtn = document.getElementById('stopDetectionBtn') as HTMLButtonElement;
  generateHashesBtn = document.getElementById('generateHashesBtn') as HTMLButtonElement;
  detectRegionsBtn = document.getElementById('detectRegionsBtn') as HTMLButtonElement;
  statusText = document.getElementById('status') as HTMLElement;
  cardContainer = document.getElementById('cardContainer') as HTMLElement;
  captureContainer = document.getElementById('captureContainer') as HTMLElement;
  
  // Set up event listeners
  findHearthstoneBtn.addEventListener('click', findHearthstoneWindow);
  captureRegionsBtn.addEventListener('click', captureRegions);
  detectCardsBtn.addEventListener('click', detectCards);
  startDetectionBtn.addEventListener('click', startDetection);
  stopDetectionBtn.addEventListener('click', stopDetection);
  generateHashesBtn.addEventListener('click', generateHashes);
  detectRegionsBtn.addEventListener('click', detectCardRegions);
  
  // Set up IPC event listeners
  window.api.onCardsDetected(handleCardsDetected);
  
  // Update status
  updateStatus('Ready');
});

// Clean up event listeners when window is closed
window.addEventListener('beforeunload', () => {
  window.api.removeAllListeners();
});

// Find Hearthstone window
async function findHearthstoneWindow() {
  try {
    updateStatus('Looking for Hearthstone window...');
    const found = await window.api.findHearthstoneWindow();
    
    if (found) {
      updateStatus('Hearthstone window found');
    } else {
      updateStatus('Hearthstone window not found');
    }
  } catch (error) {
    updateStatus(`Error finding Hearthstone window: ${error}`);
  }
}

// Capture regions
async function captureRegions() {
  try {
    updateStatus('Capturing regions...');
    const results = await window.api.captureRegions();
    
    if (results.length > 0) {
      updateStatus(`Captured ${results.length} regions`);
      displayCapturedImages(results);
    } else {
      updateStatus('No regions captured');
    }
  } catch (error) {
    updateStatus(`Error capturing regions: ${error}`);
  }
}

// Detect cards
async function detectCards() {
  try {
    updateStatus('Detecting cards...');
    const result = await window.api.detectCards();
    
    if (result.success) {
      updateStatus(`Detected ${result.cards.length} cards`);
      displayDetectedCards(result);
    } else {
      updateStatus(`Detection failed: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    updateStatus(`Error detecting cards: ${error}`);
  }
}

// Start detection
async function startDetection() {
  try {
    const intervalMs = 2000; // 2 seconds
    updateStatus('Starting detection...');
    await window.api.startDetection(intervalMs);
    updateStatus('Detection started');
    
    // Update button states
    startDetectionBtn.disabled = true;
    stopDetectionBtn.disabled = false;
  } catch (error) {
    updateStatus(`Error starting detection: ${error}`);
  }
}

// Stop detection
async function stopDetection() {
  try {
    updateStatus('Stopping detection...');
    await window.api.stopDetection();
    updateStatus('Detection stopped');
    
    // Update button states
    startDetectionBtn.disabled = false;
    stopDetectionBtn.disabled = true;
  } catch (error) {
    updateStatus(`Error stopping detection: ${error}`);
  }
}

// Generate hashes
async function generateHashes() {
  try {
    updateStatus('Generating card hashes...');
    await window.api.generateHashes();
    updateStatus('Card hashes generated');
  } catch (error) {
    updateStatus(`Error generating hashes: ${error}`);
  }
}

// Detect card regions
async function detectCardRegions() {
  try {
    updateStatus('Detecting card regions...');
    const result = await window.api.detectCardRegions();
    
    if (result) {
      updateStatus('Card regions detected');
      } else {
      updateStatus('Failed to detect card regions');
    }
  } catch (error) {
    updateStatus(`Error detecting card regions: ${error}`);
  }
}

// Handle cards detected event
function handleCardsDetected(result: DraftDetectionResult) {
  if (result.success) {
    updateStatus(`Detected ${result.cards.length} cards`);
    displayDetectedCards(result);
  }
}

// Display detected cards
function displayDetectedCards(result: DraftDetectionResult) {
  // Clear container
  cardContainer.innerHTML = '';
  
  // Create card elements
  for (const card of result.cards) {
    const cardElement = document.createElement('div');
    cardElement.className = 'card';
    
    // Card image
    if (card.imageUrl) {
      const img = document.createElement('img');
      img.src = card.imageUrl;
      img.alt = card.cardId;
      cardElement.appendChild(img);
    }
    
    // Card info
    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `
      <p><strong>Card ID:</strong> ${card.cardId}</p>
      <p><strong>Confidence:</strong> ${(card.confidence * 100).toFixed(2)}%</p>
      <p><strong>Position:</strong> ${card.cardIndex}</p>
    `;
    cardElement.appendChild(info);
    
    // Add to container
    cardContainer.appendChild(cardElement);
  }
}

// Display captured images
function displayCapturedImages(results: any[]) {
  // Clear container
  captureContainer.innerHTML = '';
  
  // Create image elements
  for (const result of results) {
    if (result.success && result.dataUrl) {
      const wrapper = document.createElement('div');
      wrapper.className = 'capture-wrapper';
      
      // Image
      const img = document.createElement('img');
      img.src = result.dataUrl;
      img.alt = result.region.name;
      wrapper.appendChild(img);
      
      // Info
      const info = document.createElement('div');
      info.className = 'capture-info';
      info.innerHTML = `
        <p><strong>Region:</strong> ${result.region.name}</p>
        <p><strong>Position:</strong> (${result.region.x}, ${result.region.y})</p>
        <p><strong>Size:</strong> ${result.region.width}x${result.region.height}</p>
      `;
      wrapper.appendChild(info);
      
      // Add to container
      captureContainer.appendChild(wrapper);
    }
  }
}

// Update status text
function updateStatus(message: string) {
  statusText.textContent = message;
  console.log(message);
}

/**
 * Example function to test the safe capture method
 */
async function testSafeCapture(): Promise<void> {
  try {
    console.log('Testing safe capture method...');
    
    // Capture a small region of the screen
    const result = await window.desktop.captureRegion({
      x: 100,
      y: 100,
      width: 320,
      height: 180
    });
    
    console.log('Capture successful, bytes:', result.length);
    
    // Create a blob URL from the PNG buffer
    const blob = new Blob([result], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    
    // Display the captured image (example)
    const img = document.createElement('img');
    img.src = url;
    img.style.border = '2px solid green';
    img.style.margin = '10px';
    
    // Add to the document for testing
    const testContainer = document.getElementById('test-container');
    if (testContainer) {
      testContainer.appendChild(img);
      console.log('Test image added to container');
    } else {
      console.log('Test container not found, image URL:', url);
    }
  } catch (error) {
    console.error('Error testing safe capture:', error);
  }
}

// Uncomment to test the safe capture method
// window.addEventListener('DOMContentLoaded', () => {
//   setTimeout(testSafeCapture, 2000);
// });