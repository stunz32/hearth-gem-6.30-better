import { ipcRenderer } from 'electron';
import { Card } from './services/cardData/CardDataService';

// Add extended card interface for our UI needs
interface ExtendedCard extends Card {
  durability?: number;
  playerClass?: string;
}

/**
 * Renderer process for HearthGem Arena Assistant
 * Handles UI updates and user interactions
 * @module Renderer
 */

class HearthGemRenderer {
  private overlay: HTMLElement;
  private cardContainer: HTMLElement;
  private logStatusElement: HTMLElement;
  private draftStatusElement: HTMLElement;
  private heroInfoElement: HTMLElement;
  private draftInfoElement: HTMLElement;
  private detectedCardsElement: HTMLElement;
  private controlsElement: HTMLElement;
  
  /**
   * Creates a new HearthGemRenderer instance
   */
  constructor() {
    this.overlay = document.getElementById('overlay') as HTMLElement;
    this.logStatusElement = document.getElementById('log-status') as HTMLElement;
    this.draftStatusElement = document.getElementById('draft-status') as HTMLElement;
    
    // Create hero info element
    this.heroInfoElement = document.createElement('div');
    this.heroInfoElement.id = 'hero-info';
    this.heroInfoElement.className = 'info-panel';
    this.overlay.appendChild(this.heroInfoElement);
    
    // Create draft info element
    this.draftInfoElement = document.createElement('div');
    this.draftInfoElement.id = 'draft-info';
    this.draftInfoElement.className = 'info-panel';
    this.overlay.appendChild(this.draftInfoElement);
    
    // Create detected cards element
    this.detectedCardsElement = document.createElement('div');
    this.detectedCardsElement.id = 'detected-cards';
    this.detectedCardsElement.className = 'info-panel detected-cards';
    this.overlay.appendChild(this.detectedCardsElement);
    
    // Create controls element
    this.controlsElement = document.createElement('div');
    this.controlsElement.id = 'controls';
    this.controlsElement.className = 'controls-panel';
    this.createControls();
    this.overlay.appendChild(this.controlsElement);
    
    // Create card container
    this.cardContainer = document.createElement('div');
    this.cardContainer.className = 'card-container';
    this.overlay.appendChild(this.cardContainer);
    
    this.initializeEventListeners();
    console.log('Renderer process initialized');
  }
  
  /**
   * Initialize event listeners for IPC communication and UI interactions
   */
  private initializeEventListeners(): void {
    // Listen for card updates
    ipcRenderer.on('update-cards', (_, cards: Card[]) => {
      console.log('Received card update', { cardCount: cards.length });
      this.displayCards(cards);
    });
    
    // Listen for window position updates
    ipcRenderer.on('update-position', (_, position: { x: number; y: number }) => {
      console.log('Updating overlay position', { position });
      this.updateOverlayPosition(position);
    });
    
    // Listen for log status updates
    ipcRenderer.on('log-status', (_, status: { message: string; type: 'active' | 'warning' | 'error' | 'normal' }) => {
      this.updateLogStatus(status.message, status.type);
    });
    
    // Listen for draft status updates
    ipcRenderer.on('draft-status', (_, status: { message: string; type: 'active' | 'warning' | 'error' | 'normal' }) => {
      this.updateDraftStatus(status.message, status.type);
    });
    
    // Listen for hero selection events
    ipcRenderer.on('hero-selected', (_, hero: Card) => {
      this.updateHeroInfo(hero);
    });
    
    // Listen for draft card detection events
    ipcRenderer.on('draft-card-detected', (_, card: Card) => {
      this.addDetectedCard(card);
    });
    
    // Listen for draft progress updates
    ipcRenderer.on('draft-info', (_, info: { pickNumber: number; totalPicks: number }) => {
      this.updateDraftInfo(info.pickNumber, info.totalPicks);
    });

    // Listen for region configuration events
    ipcRenderer.on('regions-configured', (_, result: { success: boolean; regionCount: number }) => {
      if (result.success) {
        this.showRegionStatus(`✅ ${result.regionCount} card regions configured successfully!`, 'success');
      } else {
        this.showRegionStatus('❌ Failed to configure regions', 'error');
      }
    });

    ipcRenderer.on('regions-cleared', () => {
      this.showRegionStatus('🧹 Card regions cleared', 'warning');
    });

    ipcRenderer.on('region-test-result', (_, result: any) => {
      if (result.detected) {
        this.showRegionStatus(`🎯 Detection test: ${result.detectedCards} cards found`, 'success');
      } else {
        this.showRegionStatus('⚠️ Detection test: No cards detected', 'warning');
      }
    });

    // Setup UI button handlers
    this.setupUIHandlers();
    
    // Setup scroll buttons
    this.setupScrollButtons();
  }

  /**
   * Setup UI button handlers
   */
  private setupUIHandlers(): void {
    // Configure regions button
    const configureBtn = document.getElementById('configure-regions-btn');
    if (configureBtn) {
      configureBtn.addEventListener('click', this.handleConfigureRegions.bind(this));
    }

    // Test regions button
    const testBtn = document.getElementById('test-regions-btn');
    if (testBtn) {
      testBtn.addEventListener('click', this.handleTestRegions.bind(this));
    }

    // Clear regions button
    const clearBtn = document.getElementById('clear-regions-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', this.handleClearRegions.bind(this));
    }

    // Check if regions are configured on startup
    this.checkRegionStatus();
  }

  /**
   * Handle configure regions button click
   */
  private async handleConfigureRegions(): Promise<void> {
    try {
      this.showRegionStatus('📍 Starting region configuration...', 'normal');
      const result = await ipcRenderer.invoke('configure-regions');
      
      if (result.success) {
        this.showRegionStatus(`✅ ${result.regionCount} regions configured!`, 'success');
      } else if (result.cancelled) {
        this.showRegionStatus('❌ Region configuration cancelled', 'warning');
      } else {
        this.showRegionStatus('❌ Region configuration failed', 'error');
      }
    } catch (error) {
      console.error('Error configuring regions:', error);
      this.showRegionStatus('❌ Error configuring regions', 'error');
    }
  }

  /**
   * Handle test regions button click
   */
  private async handleTestRegions(): Promise<void> {
    try {
      this.showRegionStatus('🔍 Testing region detection...', 'normal');
      const result = await ipcRenderer.invoke('test-region-detection');
      
      if (result.success && result.result.detected) {
        this.showRegionStatus(`✅ Test successful: ${result.result.detectedCards} cards detected`, 'success');
      } else {
        this.showRegionStatus('⚠️ No cards detected in test', 'warning');
      }
    } catch (error) {
      console.error('Error testing regions:', error);
      this.showRegionStatus('❌ Error testing regions', 'error');
    }
  }

  /**
   * Handle clear regions button click
   */
  private async handleClearRegions(): Promise<void> {
    if (!confirm('Are you sure you want to clear the configured card regions?')) {
      return;
    }

    try {
      this.showRegionStatus('🧹 Clearing regions...', 'normal');
      const result = await ipcRenderer.invoke('clear-regions');
      
      if (result.success) {
        this.showRegionStatus('✅ Regions cleared successfully', 'success');
      } else {
        this.showRegionStatus('❌ Failed to clear regions', 'error');
      }
    } catch (error) {
      console.error('Error clearing regions:', error);
      this.showRegionStatus('❌ Error clearing regions', 'error');
    }
  }

  /**
   * Check current region configuration status
   */
  private async checkRegionStatus(): Promise<void> {
    try {
      const result = await ipcRenderer.invoke('check-regions-configured');
      
      if (result.configured) {
        this.showRegionStatus('✅ Card regions are configured', 'success');
      } else {
        this.showRegionStatus('⚠️ Card regions not configured - click "Configure Regions" to set up', 'warning');
      }
    } catch (error) {
      console.error('Error checking region status:', error);
    }
  }

  /**
   * Show region status message
   */
  private showRegionStatus(message: string, type: 'success' | 'warning' | 'error' | 'normal'): void {
    const statusElement = document.getElementById('region-status');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = `region-status ${type}`;
      
      // Auto-hide after 5 seconds for success/error messages
      if (type === 'success' || type === 'error') {
        setTimeout(() => {
          statusElement.textContent = '';
          statusElement.className = 'region-status';
        }, 5000);
      }
    }
  }
  
  /**
   * Create UI controls
   * @private
   */
  private createControls(): void {
    const controlsHeader = document.createElement('h3');
    controlsHeader.textContent = 'Controls';
    this.controlsElement.appendChild(controlsHeader);
    
    // Visual detection toggle
    const visualDetectionContainer = document.createElement('div');
    visualDetectionContainer.className = 'control-item';
    
    const visualDetectionLabel = document.createElement('label');
    visualDetectionLabel.htmlFor = 'visual-detection-toggle';
    visualDetectionLabel.textContent = 'Visual Detection:';
    visualDetectionContainer.appendChild(visualDetectionLabel);
    
    const visualDetectionToggle = document.createElement('input');
    visualDetectionToggle.type = 'checkbox';
    visualDetectionToggle.id = 'visual-detection-toggle';
    visualDetectionToggle.checked = true; // Default to enabled
    visualDetectionToggle.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      ipcRenderer.send('toggle-visual-detection', enabled);
    });
    visualDetectionContainer.appendChild(visualDetectionToggle);
    
    this.controlsElement.appendChild(visualDetectionContainer);
    
    // Test visual detection button with advanced options
    const testVisualDetectionBtn = document.createElement('button');
    testVisualDetectionBtn.textContent = 'Test Visual Detection';
    testVisualDetectionBtn.className = 'control-button';
    
    // Create advanced options container
    const advancedOptionsContainer = document.createElement('div');
    advancedOptionsContainer.className = 'advanced-options-container';
    advancedOptionsContainer.style.display = 'none';
    
    // Confidence threshold slider
    const confidenceContainer = document.createElement('div');
    confidenceContainer.className = 'option-container';
    
    const confidenceLabel = document.createElement('label');
    confidenceLabel.textContent = 'Confidence Threshold: ';
    confidenceLabel.htmlFor = 'confidence-threshold';
    
    const confidenceValue = document.createElement('span');
    confidenceValue.textContent = '0.65';
    confidenceValue.className = 'option-value';
    
    const confidenceSlider = document.createElement('input');
    confidenceSlider.type = 'range';
    confidenceSlider.id = 'confidence-threshold';
    confidenceSlider.min = '0.5';
    confidenceSlider.max = '0.9';
    confidenceSlider.step = '0.05';
    confidenceSlider.value = '0.65';
    confidenceSlider.addEventListener('input', () => {
      confidenceValue.textContent = confidenceSlider.value;
    });
    
    confidenceContainer.appendChild(confidenceLabel);
    confidenceContainer.appendChild(confidenceValue);
    confidenceContainer.appendChild(confidenceSlider);
    advancedOptionsContainer.appendChild(confidenceContainer);
    
    // Image preprocessing options
    const preprocessingContainer = document.createElement('div');
    preprocessingContainer.className = 'preprocessing-options';
    
    const preprocessingTitle = document.createElement('h4');
    preprocessingTitle.textContent = 'Image Preprocessing:';
    preprocessingContainer.appendChild(preprocessingTitle);
    
    // Create checkbox options
    const preprocessingOptions = [
      { id: 'enhance-contrast', label: 'Enhance Contrast', checked: true },
      { id: 'sharpen', label: 'Sharpen', checked: true },
      { id: 'binarize', label: 'Binarize', checked: false },
      { id: 'scale-up', label: 'Scale Up', checked: false }
    ];
    
    preprocessingOptions.forEach(option => {
      const optionContainer = document.createElement('div');
      optionContainer.className = 'checkbox-option';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = option.id;
      checkbox.checked = option.checked;
      
      const label = document.createElement('label');
      label.htmlFor = option.id;
      label.textContent = option.label;
      
      optionContainer.appendChild(checkbox);
      optionContainer.appendChild(label);
      preprocessingContainer.appendChild(optionContainer);
    });
    
    // Scale factor input (only relevant if scale-up is checked)
    const scaleFactorContainer = document.createElement('div');
    scaleFactorContainer.className = 'option-container';
    
    const scaleFactorLabel = document.createElement('label');
    scaleFactorLabel.textContent = 'Scale Factor: ';
    scaleFactorLabel.htmlFor = 'scale-factor';
    
    const scaleFactor = document.createElement('input');
    scaleFactor.type = 'number';
    scaleFactor.id = 'scale-factor';
    scaleFactor.min = '1.5';
    scaleFactor.max = '3';
    scaleFactor.step = '0.5';
    scaleFactor.value = '2';
    
    scaleFactorContainer.appendChild(scaleFactorLabel);
    scaleFactorContainer.appendChild(scaleFactor);
    preprocessingContainer.appendChild(scaleFactorContainer);
    
    advancedOptionsContainer.appendChild(preprocessingContainer);
    
    // Toggle advanced options button
    const toggleAdvancedBtn = document.createElement('button');
    toggleAdvancedBtn.textContent = 'Advanced Options';
    toggleAdvancedBtn.className = 'control-button secondary';
    toggleAdvancedBtn.addEventListener('click', () => {
      const isVisible = advancedOptionsContainer.style.display !== 'none';
      advancedOptionsContainer.style.display = isVisible ? 'none' : 'block';
      toggleAdvancedBtn.textContent = isVisible ? 'Advanced Options' : 'Hide Options';
    });
    
    // Run test button
    testVisualDetectionBtn.addEventListener('click', () => {
      // Collect options
      const options = {
        confidenceThreshold: parseFloat(confidenceSlider.value),
        preprocessingOptions: {
          enhanceContrast: (document.getElementById('enhance-contrast') as HTMLInputElement).checked,
          sharpen: (document.getElementById('sharpen') as HTMLInputElement).checked,
          binarize: (document.getElementById('binarize') as HTMLInputElement).checked,
          scaleUp: (document.getElementById('scale-up') as HTMLInputElement).checked,
          scaleUpFactor: parseFloat((document.getElementById('scale-factor') as HTMLInputElement).value)
        }
      };
      
      // Send test request with options
      ipcRenderer.send('test-visual-detection', options);
    });
    
    // Add elements to controls
    this.controlsElement.appendChild(testVisualDetectionBtn);
    this.controlsElement.appendChild(toggleAdvancedBtn);
    this.controlsElement.appendChild(advancedOptionsContainer);
    
    // Test display cards button
    const testDisplayCardsBtn = document.createElement('button');
    testDisplayCardsBtn.textContent = 'Test Display Cards';
    testDisplayCardsBtn.className = 'control-button';
    testDisplayCardsBtn.addEventListener('click', () => {
      ipcRenderer.send('test-display-cards');
    });
    this.controlsElement.appendChild(testDisplayCardsBtn);
  }
  
  /**
   * Display cards in the card container
   * @param cards Array of cards to display
   */
  private displayCards(cards: Card[]): void {
    console.log('Displaying cards', { cards });
    
    // Clear existing cards
    this.cardContainer.innerHTML = '';
    
    // Display each card
    cards.forEach(card => {
      const cardElement = this.createCardElement(card);
      this.cardContainer.appendChild(cardElement);
    });
  }
  
  /**
   * Create a card element
   * @param card Card data
   * @returns HTML element for the card
   */
  private createCardElement(card: Card): HTMLElement {
    // Cast to our extended interface - not needed in this method
    const cardElement = document.createElement('div');
    cardElement.className = 'card';
    cardElement.dataset.cardId = card.id;
    
    // Card header with mana cost and name
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    
    const manaCost = document.createElement('div');
    manaCost.className = 'card-mana';
    manaCost.textContent = card.cost !== undefined ? `${card.cost}` : '?';
    cardHeader.appendChild(manaCost);
    
    const cardName = document.createElement('div');
    cardName.className = 'card-name';
    cardName.textContent = card.name || card.id;
    cardHeader.appendChild(cardName);
    
    cardElement.appendChild(cardHeader);
    
    // Card type
    if (card.type) {
      const cardType = document.createElement('div');
      cardType.className = 'card-type';
      cardType.textContent = card.type;
      cardElement.appendChild(cardType);
    }
    
    // Card stats (attack/health for minions, attack/durability for weapons)
    if (card.type === 'MINION' || card.type === 'WEAPON') {
      const cardStats = document.createElement('div');
      cardStats.className = 'card-stats';
      
      if (card.attack !== undefined) {
        const attack = document.createElement('span');
        attack.className = 'card-attack';
        attack.textContent = `${card.attack}`;
        cardStats.appendChild(attack);
      }
      
      // For weapons, use health as durability
      if (card.health !== undefined) {
        const healthOrDurability = document.createElement('span');
        healthOrDurability.className = card.type === 'MINION' ? 'card-health' : 'card-durability';
        healthOrDurability.textContent = `${card.health}`;
        cardStats.appendChild(healthOrDurability);
      }
      
      cardElement.appendChild(cardStats);
    }
    
    // Card text
    if (card.text) {
      const cardText = document.createElement('div');
      cardText.className = 'card-text';
      cardText.innerHTML = this.formatCardText(card.text);
      cardElement.appendChild(cardText);
    }
    
    // Card rarity
    if (card.rarity) {
      const cardRarity = document.createElement('div');
      cardRarity.className = `card-rarity ${card.rarity.toLowerCase()}`;
      cardRarity.textContent = card.rarity;
      cardElement.appendChild(cardRarity);
    }
    
    // Card set
    if (card.set) {
      const cardSet = document.createElement('div');
      cardSet.className = 'card-set';
      cardSet.textContent = card.set;
      cardElement.appendChild(cardSet);
    }
    
    return cardElement;
  }
  
  /**
   * Format card text with HTML
   * @param text Raw card text
   * @returns Formatted HTML
   */
  private formatCardText(text: string): string {
    if (!text) return '';
    
    // Replace newlines with <br>
    let formattedText = text.replace(/\n/g, '<br>');
    
    // Bold keywords
    const keywords = ['Battlecry', 'Deathrattle', 'Discover', 'Taunt', 'Divine Shield', 'Windfury', 
                      'Charge', 'Rush', 'Lifesteal', 'Poisonous', 'Stealth', 'Spell Damage', 'Overkill', 
                      'Combo', 'Overload', 'Secret', 'Adapt', 'Inspire', 'Quest', 'Reborn', 'Outcast',
                      'Corrupt', 'Dormant', 'Frenzy', 'Tradeable', 'Colossal', 'Infuse', 'Spellburst'];
                      
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      formattedText = formattedText.replace(regex, `<strong>${keyword}</strong>`);
    });
    
    return formattedText;
  }
  
  /**
   * Update overlay position
   * @param position New position coordinates
   */
  private updateOverlayPosition(position: { x: number; y: number }): void {
    this.overlay.style.left = `${position.x}px`;
    this.overlay.style.top = `${position.y}px`;
  }
  
  /**
   * Update log status message
   * @param message Status message
   * @param type Status type
   */
  private updateLogStatus(message: string, type: 'active' | 'warning' | 'error' | 'normal'): void {
    this.logStatusElement.textContent = message;
    
    // Reset classes
    this.logStatusElement.className = 'status-message';
    
    // Add type-specific class
    if (type) {
      this.logStatusElement.classList.add(`status-${type}`);
    }
  }
  
  /**
   * Update draft status message
   * @param message Status message
   * @param type Status type
   */
  private updateDraftStatus(message: string, type: 'active' | 'warning' | 'error' | 'normal'): void {
    this.draftStatusElement.textContent = message;
    
    // Reset classes
    this.draftStatusElement.className = 'status-message';
    
    // Add type-specific class
    if (type) {
      this.draftStatusElement.classList.add(`status-${type}`);
    }
  }
  
  /**
   * Update hero information display
   * @param hero Hero card data
   */
  private updateHeroInfo(hero: Card): void {
    // Cast to our extended interface
    const extHero = hero as ExtendedCard;
    this.heroInfoElement.innerHTML = '';
    
    const heroTitle = document.createElement('h3');
    heroTitle.textContent = 'Selected Hero';
    this.heroInfoElement.appendChild(heroTitle);
    
    const heroContent = document.createElement('div');
    heroContent.className = 'hero-content';
    
    const heroName = document.createElement('div');
    heroName.className = 'hero-name';
    heroName.textContent = hero.name || hero.id;
    heroContent.appendChild(heroName);
    
    const heroClass = document.createElement('div');
    heroClass.className = 'hero-class';
    
    // Map hero ID to class name if needed
    const heroClassMap: { [key: string]: string } = {
      'HERO_01': 'Warrior',
      'HERO_02': 'Shaman',
      'HERO_03': 'Rogue',
      'HERO_04': 'Paladin',
      'HERO_05': 'Hunter',
      'HERO_06': 'Druid',
      'HERO_07': 'Warlock',
      'HERO_08': 'Mage',
      'HERO_09': 'Priest',
      'HERO_10': 'Demon Hunter'
    };
    
    heroClass.textContent = heroClassMap[hero.id] || extHero.playerClass || '';
    heroContent.appendChild(heroClass);
    
    this.heroInfoElement.appendChild(heroContent);
    this.heroInfoElement.style.display = 'block';
  }
  
  /**
   * Update draft progress information
   */
  private updateDraftInfo(pickNumber: number, totalPicks: number): void {
    if (!this.draftInfoElement) return;
    
    // Clear previous content
    this.draftInfoElement.innerHTML = '';
    
    const draftHeader = document.createElement('h3');
    draftHeader.textContent = '📊 Draft Progress';
    draftHeader.style.color = '#FFD700';
    draftHeader.style.marginBottom = '10px';
    this.draftInfoElement.appendChild(draftHeader);
    
    const progressContainer = document.createElement('div');
    progressContainer.style.display = 'flex';
    progressContainer.style.alignItems = 'center';
    progressContainer.style.gap = '15px';
    
    // Progress text
    const progressText = document.createElement('div');
    progressText.textContent = `Pick ${pickNumber} of ${totalPicks}`;
    progressText.style.fontSize = '16px';
    progressText.style.fontWeight = 'bold';
    progressContainer.appendChild(progressText);
    
    // Progress bar
    const progressBarContainer = document.createElement('div');
    progressBarContainer.style.flex = '1';
    progressBarContainer.style.height = '20px';
    progressBarContainer.style.background = '#333';
    progressBarContainer.style.borderRadius = '10px';
    progressBarContainer.style.overflow = 'hidden';
    progressBarContainer.style.border = '1px solid #666';
    
    const progressBar = document.createElement('div');
    progressBar.style.height = '100%';
    progressBar.style.background = 'linear-gradient(to right, #4CAF50, #FFD700)';
    progressBar.style.width = `${(pickNumber / totalPicks) * 100}%`;
    progressBar.style.transition = 'width 0.3s ease';
    progressBarContainer.appendChild(progressBar);
    
    progressContainer.appendChild(progressBarContainer);
    
    // Progress percentage
    const progressPercent = document.createElement('div');
    progressPercent.textContent = `${Math.round((pickNumber / totalPicks) * 100)}%`;
    progressPercent.style.fontSize = '14px';
    progressPercent.style.color = '#FFD700';
    progressContainer.appendChild(progressPercent);
    
    this.draftInfoElement.appendChild(progressContainer);
  }
  
  /**
   * Add a detected card to the UI
   */
  private addDetectedCard(card: Card): void {
    // Check if we need to initialize the detected cards element
    if (!this.detectedCardsElement.querySelector('h3')) {
      const detectedTitle = document.createElement('h3');
      detectedTitle.textContent = 'Drafted Cards';
      this.detectedCardsElement.appendChild(detectedTitle);
      
      const cardsList = document.createElement('div');
      cardsList.className = 'detected-cards-list';
      cardsList.id = 'detected-cards-list';
      this.detectedCardsElement.appendChild(cardsList);
    }
    
    const cardsList = document.getElementById('detected-cards-list') as HTMLElement;
    
    // Create card entry
    const cardEntry = document.createElement('div');
    cardEntry.className = 'detected-card-entry';
    cardEntry.dataset.cardId = card.id;
    
    // Check if this card already exists in the list
    const existingCard = cardsList.querySelector(`[data-card-id="${card.id}"]`);
    if (existingCard) {
      // If it exists, update the count
      const countElement = existingCard.querySelector('.card-count') as HTMLElement;
      if (countElement) {
        const currentCount = parseInt(countElement.dataset.count || '1', 10);
        countElement.dataset.count = (currentCount + 1).toString();
        countElement.textContent = `x${currentCount + 1}`;
      }
      return;
    }
    
    // Card mana cost
    const manaCost = document.createElement('span');
    manaCost.className = 'card-mana-small';
    manaCost.textContent = card.cost !== undefined ? `${card.cost}` : '?';
    cardEntry.appendChild(manaCost);
    
    // Card name
    const cardName = document.createElement('span');
    cardName.className = 'card-name-small';
    cardName.textContent = card.name || card.id;
    cardEntry.appendChild(cardName);
    
    // Card count
    const cardCount = document.createElement('span');
    cardCount.className = 'card-count';
    cardCount.dataset.count = '1';
    cardCount.textContent = 'x1';
    cardEntry.appendChild(cardCount);
    
    // Add to list
    cardsList.appendChild(cardEntry);
    
    // Show the detected cards panel
    this.detectedCardsElement.style.display = 'block';
  }

  /**
   * Setup scroll buttons functionality
   */
  private setupScrollButtons(): void {
    const scrollUpBtn = document.getElementById('scroll-up');
    const scrollDownBtn = document.getElementById('scroll-down');
    
    if (scrollUpBtn) {
      scrollUpBtn.addEventListener('click', () => {
        window.scrollBy({
          top: -300,
          behavior: 'smooth'
        });
      });
    }
    
    if (scrollDownBtn) {
      scrollDownBtn.addEventListener('click', () => {
        window.scrollBy({
          top: 300,
          behavior: 'smooth'
        });
      });
    }
    
    // Show/hide scroll buttons based on scroll position
    window.addEventListener('scroll', () => {
      const scrollUpBtn = document.getElementById('scroll-up');
      const scrollDownBtn = document.getElementById('scroll-down');
      
      if (scrollUpBtn) {
        scrollUpBtn.style.display = window.scrollY > 100 ? 'flex' : 'none';
      }
      
      if (scrollDownBtn) {
        const maxScroll = document.body.scrollHeight - window.innerHeight;
        scrollDownBtn.style.display = window.scrollY < maxScroll - 100 ? 'flex' : 'none';
      }
    });
    
    // Initial check for scroll button visibility
    setTimeout(() => {
      const scrollUpBtn = document.getElementById('scroll-up');
      const scrollDownBtn = document.getElementById('scroll-down');
      
      if (scrollUpBtn) {
        scrollUpBtn.style.display = window.scrollY > 100 ? 'flex' : 'none';
      }
      
      if (scrollDownBtn) {
        const maxScroll = document.body.scrollHeight - window.innerHeight;
        scrollDownBtn.style.display = window.scrollY < maxScroll - 100 ? 'flex' : 'none';
      }
    }, 500);
  }
}

// Initialize the renderer
new HearthGemRenderer();