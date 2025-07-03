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
  
  // Get manual region configuration elements
  const saveRegionsBtn = document.getElementById('saveRegionsBtn') as HTMLButtonElement;
  const clearRegionsBtn = document.getElementById('clearRegionsBtn') as HTMLButtonElement;
  
  // Set up event listeners
  findHearthstoneBtn.addEventListener('click', findHearthstoneWindow);
  captureRegionsBtn.addEventListener('click', captureRegions);
  detectCardsBtn.addEventListener('click', detectCards);
  startDetectionBtn.addEventListener('click', startDetection);
  stopDetectionBtn.addEventListener('click', stopDetection);
  generateHashesBtn.addEventListener('click', generateHashes);
  detectRegionsBtn.addEventListener('click', detectCardRegions);
  
  // Set up manual region configuration handlers
  if (saveRegionsBtn) {
    saveRegionsBtn.addEventListener('click', saveManualRegions);
  }
  
  if (clearRegionsBtn) {
    clearRegionsBtn.addEventListener('click', clearManualRegions);
  }
  
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
  if (!captureContainer) return;

  try {
    updateStatus('Capturing...');
    const images = await window.api.captureRegions();
    
    console.log('Capture results:', images);
    
    if (!images || images.length === 0) {
      captureContainer.innerHTML = '<div class="empty">No regions captured – configure regions first.</div>';
      updateStatus('No regions captured');
      return;
    }

    // Add debug info to the UI
    const debugInfo = document.createElement('div');
    debugInfo.style.padding = '10px';
    debugInfo.style.margin = '10px 0';
    debugInfo.style.backgroundColor = '#f0f0f0';
    debugInfo.style.border = '1px solid #ddd';
    debugInfo.style.borderRadius = '4px';
    debugInfo.style.color = '#333';
    debugInfo.innerHTML = `<p><strong>Debug Info:</strong></p>
      <p>Number of regions: ${images.length}</p>
      <p>First region has dataUrl: ${images[0] && !!images[0].dataUrl}</p>
      <p>Region data: ${JSON.stringify(images.map(img => ({
        success: img.success,
        hasDataUrl: !!img.dataUrl,
        dataUrlLength: img.dataUrl ? img.dataUrl.length : 0,
        region: img.region
      })))}</p>`;
    captureContainer.innerHTML = '';
    captureContainer.appendChild(debugInfo);

    displayCapturedImages(images);
    updateStatus(`Captured ${images.length} regions`);
  } catch (error) {
    console.error('Failed to capture regions:', error);
    updateStatus('Failed to capture regions');
    captureContainer.innerHTML = '<div class="error">Failed to capture regions. Check the console for details.</div>';
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

// Save manual regions
async function saveManualRegions() {
  try {
    updateStatus('Saving manual regions...');
    
    // Get values from input fields
    const card1x = parseFloat((document.getElementById('card1-x') as HTMLInputElement)?.value || '12') / 100;
    const card1y = parseFloat((document.getElementById('card1-y') as HTMLInputElement)?.value || '40') / 100;
    const card1width = parseFloat((document.getElementById('card1-width') as HTMLInputElement)?.value || '22') / 100;
    const card1height = parseFloat((document.getElementById('card1-height') as HTMLInputElement)?.value || '40') / 100;
    
    const card2x = parseFloat((document.getElementById('card2-x') as HTMLInputElement)?.value || '41') / 100;
    const card2y = parseFloat((document.getElementById('card2-y') as HTMLInputElement)?.value || '40') / 100;
    const card2width = parseFloat((document.getElementById('card2-width') as HTMLInputElement)?.value || '22') / 100;
    const card2height = parseFloat((document.getElementById('card2-height') as HTMLInputElement)?.value || '40') / 100;
    
    const card3x = parseFloat((document.getElementById('card3-x') as HTMLInputElement)?.value || '70') / 100;
    const card3y = parseFloat((document.getElementById('card3-y') as HTMLInputElement)?.value || '40') / 100;
    const card3width = parseFloat((document.getElementById('card3-width') as HTMLInputElement)?.value || '22') / 100;
    const card3height = parseFloat((document.getElementById('card3-height') as HTMLInputElement)?.value || '40') / 100;
    
    // Create regions array
    const regions = [
      {
        name: 'card1',
        x: card1x,
        y: card1y,
        width: card1width,
        height: card1height
      },
      {
        name: 'card2',
        x: card2x,
        y: card2y,
        width: card2width,
        height: card2height
      },
      {
        name: 'card3',
        x: card3x,
        y: card3y,
        width: card3width,
        height: card3height
      }
    ];
    
    // Save regions
    const success = await window.api.saveManualRegions(regions);
    
    if (success) {
      updateStatus('Manual regions saved successfully');
    } else {
      updateStatus('Failed to save manual regions');
    }
  } catch (error) {
    console.error('Error saving manual regions:', error);
    updateStatus('Error saving manual regions');
  }
}

// Clear manual regions
async function clearManualRegions() {
  try {
    updateStatus('Clearing manual regions...');
    
    // Reset input fields to defaults
    (document.getElementById('card1-x') as HTMLInputElement).value = '12';
    (document.getElementById('card1-y') as HTMLInputElement).value = '40';
    (document.getElementById('card1-width') as HTMLInputElement).value = '22';
    (document.getElementById('card1-height') as HTMLInputElement).value = '40';
    
    (document.getElementById('card2-x') as HTMLInputElement).value = '41';
    (document.getElementById('card2-y') as HTMLInputElement).value = '40';
    (document.getElementById('card2-width') as HTMLInputElement).value = '22';
    (document.getElementById('card2-height') as HTMLInputElement).value = '40';
    
    (document.getElementById('card3-x') as HTMLInputElement).value = '70';
    (document.getElementById('card3-y') as HTMLInputElement).value = '40';
    (document.getElementById('card3-width') as HTMLInputElement).value = '22';
    (document.getElementById('card3-height') as HTMLInputElement).value = '40';
    
    // Clear regions on the backend
    const success = await window.api.clearManualRegions();
    
    if (success) {
      updateStatus('Manual regions cleared successfully');
    } else {
      updateStatus('Failed to clear manual regions');
    }
  } catch (error) {
    console.error('Error clearing manual regions:', error);
    updateStatus('Error clearing manual regions');
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
  // Don't clear container here since we want to keep the debug info
  // Add a heading for the images
  const imagesHeading = document.createElement('h3');
  imagesHeading.textContent = 'Captured Images:';
  imagesHeading.style.marginTop = '20px';
  captureContainer.appendChild(imagesHeading);
  
  // Container for the images
  const imagesContainer = document.createElement('div');
  imagesContainer.style.display = 'flex';
  imagesContainer.style.flexWrap = 'wrap';
  imagesContainer.style.gap = '15px';
  captureContainer.appendChild(imagesContainer);
  
  let imagesAdded = 0;
  
  // Create image elements
  for (const result of results) {
    console.log('Processing result:', {
      success: result.success,
      hasDataUrl: !!result.dataUrl,
      dataUrlStart: result.dataUrl ? result.dataUrl.substring(0, 50) + '...' : 'none'
    });
    
    // Check for valid dataUrl - make sure it's a string and has proper prefix
    let dataUrl = '';
    if (result.dataUrl) {
      if (typeof result.dataUrl === 'string') {
        // Check if it's already formatted as a data URL
        if (result.dataUrl.startsWith('data:')) {
          dataUrl = result.dataUrl;
        } else {
          // Try to format it as a data URL
          dataUrl = 'data:image/png;base64,' + result.dataUrl;
        }
      }
    }
    
    if (dataUrl) {
      const wrapper = document.createElement('div');
      wrapper.className = 'capture-wrapper';
      wrapper.style.border = '2px solid #4CAF50';
      wrapper.style.padding = '10px';
      wrapper.style.borderRadius = '4px';
      wrapper.style.backgroundColor = '#f9f9f9';
      wrapper.style.width = '200px';
      
      // Image
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = result.region?.name || 'Captured Region';
      img.style.width = '100%';
      img.style.marginBottom = '10px';
      img.onerror = () => {
        console.error('Error loading image:', dataUrl.substring(0, 50) + '...');
        img.style.display = 'none';
        const errorMsg = document.createElement('div');
        errorMsg.textContent = 'Error loading image';
        errorMsg.style.color = 'red';
        errorMsg.style.padding = '20px';
        errorMsg.style.textAlign = 'center';
        errorMsg.style.backgroundColor = '#ffeeee';
        wrapper.insertBefore(errorMsg, img.nextSibling);
      };
      wrapper.appendChild(img);
      
      // Info
      const info = document.createElement('div');
      info.className = 'capture-info';
      info.style.fontSize = '12px';
      info.innerHTML = `
        <p><strong>Region:</strong> ${result.region?.name || 'Unknown'}</p>
        <p><strong>Position:</strong> (${result.region?.x || 0}, ${result.region?.y || 0})</p>
        <p><strong>Size:</strong> ${result.region?.width || 0}x${result.region?.height || 0}</p>
        <p><strong>DataUrl Length:</strong> ${dataUrl.length}</p>
      `;
      wrapper.appendChild(info);
      
      // Add to container
      imagesContainer.appendChild(wrapper);
      imagesAdded++;
    }
  }
  
  if (imagesAdded === 0) {
    const noImagesMsg = document.createElement('div');
    noImagesMsg.textContent = 'No images were successfully processed for display.';
    noImagesMsg.style.padding = '15px';
    noImagesMsg.style.backgroundColor = '#fff3cd';
    noImagesMsg.style.border = '1px solid #ffeeba';
    noImagesMsg.style.borderRadius = '4px';
    noImagesMsg.style.color = '#856404';
    imagesContainer.appendChild(noImagesMsg);
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