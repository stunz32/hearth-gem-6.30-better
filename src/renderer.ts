import { ipcRenderer } from 'electron';
import { Card } from './services/cardData/CardDataService';

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
    
    // Create card container
    this.cardContainer = document.createElement('div');
    this.cardContainer.className = 'card-container';
    this.overlay.appendChild(this.cardContainer);
    
    this.initializeEventListeners();
    console.log('Renderer process initialized');
  }
  
  /**
   * Initialize event listeners for IPC communication
   * @private
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
    
    // Listen for hero updates
    ipcRenderer.on('hero-selected', (_, hero: Card) => {
      this.updateHeroInfo(hero);
    });
    
    // Listen for draft card detected
    ipcRenderer.on('draft-card-detected', (_, card: Card) => {
      this.addDetectedCard(card);
    });
    
    // Listen for draft info updates
    ipcRenderer.on('draft-info', (_, info: { pickNumber: number, totalPicks: number }) => {
      this.updateDraftInfo(info);
    });
    
    // Add keyboard shortcut for toggling overlay
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        ipcRenderer.send('toggle-overlay');
      }
    });
  }
  
  /**
   * Display cards in the overlay
   * @param cards Array of cards to display
   * @private
   */
  private displayCards(cards: Card[]): void {
    // Clear existing cards
    this.cardContainer.innerHTML = '';
    
    // Add header for card choices
    const header = document.createElement('h2');
    header.textContent = 'Choose a card for your deck:';
    header.className = 'cards-header';
    this.cardContainer.appendChild(header);
    
    // Create a wrapper for the card elements
    const cardsWrapper = document.createElement('div');
    cardsWrapper.className = 'cards-wrapper';
    
    cards.forEach(card => {
      const cardElement = this.createCardElement(card);
      cardsWrapper.appendChild(cardElement);
    });
    
    this.cardContainer.appendChild(cardsWrapper);
  }
  
  /**
   * Create a card element for display
   * @param card Card data
   * @returns HTMLElement representing the card
   * @private
   */
  private createCardElement(card: Card): HTMLElement {
    const cardElement = document.createElement('div');
    cardElement.className = 'card';
    
    // Cost element (mana crystal)
    const costElement = document.createElement('div');
    costElement.className = 'card-cost';
    costElement.textContent = card.cost !== undefined ? card.cost.toString() : '?';
    cardElement.appendChild(costElement);
    
    // Card image if available
    if (card.imageUrl) {
      const cardImage = document.createElement('img');
      cardImage.src = card.imageUrl;
      cardImage.alt = card.name || card.id;
      cardImage.className = 'card-image';
      cardElement.appendChild(cardImage);
    }
    
    // Card content container
    const cardContent = document.createElement('div');
    cardContent.className = 'card-content';
    
    // Card name
    const cardName = document.createElement('div');
    cardName.textContent = card.name || card.id;
    cardName.className = 'card-name';
    cardContent.appendChild(cardName);
    
    // Card stats (Attack/Health for minions, Durability for weapons)
    if (card.attack !== undefined || card.health !== undefined) {
      const statsContainer = document.createElement('div');
      statsContainer.className = 'card-stats';
      
      if (card.attack !== undefined) {
        const attackElement = document.createElement('div');
        attackElement.className = 'card-attack';
        attackElement.textContent = card.attack.toString();
        statsContainer.appendChild(attackElement);
      }
      
      if (card.health !== undefined) {
        const healthElement = document.createElement('div');
        healthElement.className = 'card-health';
        healthElement.textContent = card.health.toString();
        statsContainer.appendChild(healthElement);
      }
      
      cardContent.appendChild(statsContainer);
    }
    
    // Card text
    if (card.text) {
      const cardText = document.createElement('div');
      cardText.className = 'card-text';
      cardText.innerHTML = this.formatCardText(card.text);
      cardContent.appendChild(cardText);
    }
    
    // Card type, rarity and set
    const cardMeta = document.createElement('div');
    cardMeta.className = 'card-meta';
    cardMeta.textContent = `${card.type}${card.rarity ? ' - ' + card.rarity : ''}${card.set ? ' - ' + card.set : ''}`;
    cardContent.appendChild(cardMeta);
    
    cardElement.appendChild(cardContent);
    
    // Add score if available
    if (card.score !== undefined) {
      const scoreElement = document.createElement('div');
      scoreElement.className = 'card-score';
      scoreElement.textContent = card.score.toString();
      
      // Color based on score
      if (card.score >= 80) {
        scoreElement.classList.add('score-high');
      } else if (card.score >= 60) {
        scoreElement.classList.add('score-medium');
      } else {
        scoreElement.classList.add('score-low');
      }
      
      cardElement.appendChild(scoreElement);
    }
    
    return cardElement;
  }
  
  /**
   * Format card text with HTML
   * @param text Card text to format
   * @returns Formatted HTML
   * @private
   */
  private formatCardText(text: string): string {
    // Replace Hearthstone markup with HTML
    return text
      .replace(/\n/g, '<br>')
      .replace(/<b>/g, '<strong>')
      .replace(/<\/b>/g, '</strong>')
      .replace(/\[x\]/g, '');
  }
  
  /**
   * Update the overlay position
   * @param position Position coordinates
   * @private
   */
  private updateOverlayPosition(position: { x: number; y: number }): void {
    this.overlay.style.transform = `translate(${position.x}px, ${position.y}px)`;
  }
  
  /**
   * Update the log status indicator
   * @param message Status message to display
   * @param type Status type for styling
   * @private
   */
  private updateLogStatus(message: string, type: 'active' | 'warning' | 'error' | 'normal'): void {
    this.logStatusElement.textContent = message;
    this.logStatusElement.className = 'status-indicator';
    
    if (type === 'active') {
      this.logStatusElement.classList.add('status-active');
    } else if (type === 'warning') {
      this.logStatusElement.classList.add('status-warning');
    } else if (type === 'error') {
      this.logStatusElement.classList.add('status-error');
    }
  }
  
  /**
   * Update the draft status indicator
   * @param message Status message to display
   * @param type Status type for styling
   * @private
   */
  private updateDraftStatus(message: string, type: 'active' | 'warning' | 'error' | 'normal'): void {
    this.draftStatusElement.textContent = message;
    this.draftStatusElement.className = 'status-indicator';
    
    if (type === 'active') {
      this.draftStatusElement.classList.add('status-active');
    } else if (type === 'warning') {
      this.draftStatusElement.classList.add('status-warning');
    } else if (type === 'error') {
      this.draftStatusElement.classList.add('status-error');
    }
  }
  
  /**
   * Update hero information
   * @param hero Hero card data
   * @private
   */
  private updateHeroInfo(hero: Card): void {
    this.heroInfoElement.innerHTML = '';
    
    const header = document.createElement('h3');
    header.textContent = 'Selected Hero:';
    this.heroInfoElement.appendChild(header);
    
    const heroName = document.createElement('div');
    heroName.className = 'hero-name';
    heroName.textContent = hero.name || hero.id;
    this.heroInfoElement.appendChild(heroName);
    
    // Show hero image if available
    if (hero.imageUrl) {
      const heroImage = document.createElement('img');
      heroImage.src = hero.imageUrl;
      heroImage.alt = hero.name || hero.id;
      heroImage.className = 'hero-image';
      this.heroInfoElement.appendChild(heroImage);
    }
  }
  
  /**
   * Update draft information
   * @param info Draft information
   * @private
   */
  private updateDraftInfo(info: { pickNumber: number, totalPicks: number }): void {
    this.draftInfoElement.innerHTML = '';
    
    const header = document.createElement('h3');
    header.textContent = 'Draft Progress:';
    this.draftInfoElement.appendChild(header);
    
    const progress = document.createElement('div');
    progress.className = 'draft-progress';
    progress.textContent = `Pick ${info.pickNumber}/${info.totalPicks}`;
    this.draftInfoElement.appendChild(progress);
    
    // Add progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar-container';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-bar-fill';
    progressFill.style.width = `${(info.pickNumber / info.totalPicks) * 100}%`;
    
    progressBar.appendChild(progressFill);
    this.draftInfoElement.appendChild(progressBar);
  }
  
  /**
   * Add a detected card to the list
   * @param card Detected card data
   * @private
   */
  private addDetectedCard(card: Card): void {
    // Create or get the list of detected cards
    let cardList = this.detectedCardsElement.querySelector('.detected-cards-list');
    
    if (!cardList) {
      // First card detected, create header and list
      const header = document.createElement('h3');
      header.textContent = 'Detected Cards:';
      this.detectedCardsElement.appendChild(header);
      
      cardList = document.createElement('div');
      cardList.className = 'detected-cards-list';
      this.detectedCardsElement.appendChild(cardList);
    }
    
    // Create a new card entry
    const cardEntry = document.createElement('div');
    cardEntry.className = 'detected-card';
    
    // Add mana cost if available
    if (card.cost !== undefined) {
      const costBadge = document.createElement('span');
      costBadge.className = 'card-cost-badge';
      costBadge.textContent = card.cost.toString();
      cardEntry.appendChild(costBadge);
    }
    
    // Add card name
    const cardName = document.createElement('span');
    cardName.className = 'detected-card-name';
    cardName.textContent = card.name || card.id;
    cardEntry.appendChild(cardName);
    
    // Add to the beginning of the list (newest first)
    cardList.insertBefore(cardEntry, cardList.firstChild);
    
    // Limit the number of cards shown to prevent overflow
    const maxCards = 10;
    const cards = cardList.querySelectorAll('.detected-card');
    if (cards.length > maxCards) {
      cardList.removeChild(cards[cards.length - 1]);
    }
  }
}

// Initialize the renderer
new HearthGemRenderer();