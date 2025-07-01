# Hearthstone Arena Assistant (HearthGem) - Feature Specification Document

## Goal

This document outlines the comprehensive feature specifications for HearthGem, a desktop application designed to provide real-time, intelligent draft recommendations for Hearthstone Arena and Underground modes. It details the system architecture, technical requirements, implementation guidelines, and operational considerations necessary to build a high-performance, user-centric, and extensible application.

## File System

The file system structure for HearthGem will be organized to support a modular WPF (.NET 8) application, separating concerns for UI, core logic, data management, and machine learning components. This structure facilitates development, testing, and deployment.

```
HearthGem/
├── src/
│   ├── HearthGem.App/                  # Main WPF application project
│   │   ├── App.xaml
│   │   ├── App.xaml.cs
│   │   ├── MainWindow.xaml
│   │   ├── MainWindow.xaml.cs
│   │   ├── Views/                      # UI Views (XAML files)
│   │   │   ├── DraftView.xaml
│   │   │   ├── DeckStatsView.xaml
│   │   │   ├── SettingsView.xaml
│   │   │   └── ConversationalAIView.xaml
│   │   ├── ViewModels/                 # MVVM ViewModels (C# classes)
│   │   │   ├── DraftViewModel.cs
│   │   │   ├── DeckStatsViewModel.cs
│   │   │   ├── SettingsViewModel.cs
│   │   │   └── ConversationalAIViewModel.cs
│   │   ├── Models/                     # UI-specific models, DTOs
│   │   │   └── UIManifest.cs
│   │   ├── Services/                   # UI-related services (e.g., OverlayService, NavigationService)
│   │   │   ├── OverlayService.cs
│   │   │   └── NavigationService.cs
│   │   ├── Converters/                 # WPF Value Converters
│   │   │   └── BoolToVisibilityConverter.cs
│   │   ├── Controls/                   # Reusable custom UI controls
│   │   │   └── HearthstoneButton.xaml
│   │   ├── Properties/
│   │   ├── Resources/
│   │   └── appsettings.json            # Application configuration
│   │
│   ├── HearthGem.Core/                 # Core application logic, interfaces, and common models
│   │   ├── Contracts/
│   │   │   ├── ILogParser.cs
│   │   │   ├── IRecommendationEngine.cs
│   │   │   ├── ICardDatabase.cs
│   │   │   └── IConversationalAI.cs
│   │   ├── Models/                     # Core domain models (e.g., Card, DraftState, GameEvent)
│   │   │   ├── Card.cs
│   │   │   ├── DraftState.cs
│   │   │   └── GameEvent.cs
│   │   └── Utilities/                  # General utility classes
│   │       └── FileSystemWatcherWrapper.cs
│   │
│   ├── HearthGem.LogParser/            # Log parsing and data ingestion component
│   │   ├── LogFileMonitor.cs
│   │   ├── HearthstoneLogParser.cs
│   │   ├── FSM/
│   │   │   ├── DraftFSM.cs
│   │   │   └── FSMStates.cs
│   │   ├── Models/                     # Log-specific data models
│   │   │   └── LogEntry.cs
│   │   └── Exceptions/
│   │       └── LogParsingException.cs
│   │
│   ├── HearthGem.ML/                   # Machine Learning inference and data preparation
│   │   ├── RecommendationEngine.cs
│   │   ├── Models/                     # ML model input/output structures
│   │   │   ├── MLInput.cs
│   │   │   └── MLOutput.cs
│   │   ├── Delegates/                  # DirectML delegate integration
│   │   │   └── DirectMLTensorFlowLite.cs
│   │   └── DataProcessors/             # Feature engineering logic
│   │       └── FeatureExtractor.cs
│   │
│   ├── HearthGem.Data/                 # Data access layer (LiteDB, SQLite)
│   │   ├── LiteDbRepository.cs
│   │   ├── SQLiteRepository.cs
│   │   ├── Models/                     # Database-specific models
│   │   │   ├── UserPreferences.cs
│   │   │   └── CardData.cs
│   │   └── Migrations/
│   │       └── DatabaseMigrator.cs
│   │
│   ├── HearthGem.ConversationalAI/     # Conversational AI module
│   │   ├── LocalNLP/
│   │   │   ├── IntentRecognizer.cs
│   │   │   └── EntityExtractor.cs
│   │   ├── ChatGPT/
│   │   │   ├── ChatGPTClient.cs
│   │   │   └── Models/
│   │   │       ├── ChatRequest.cs
│   │   │       └── ChatResponse.cs
│   │   └── ConversationManager.cs
│   │
│   ├── HearthGem.Tests/                # Unit and Integration Tests
│   │   ├── HearthGem.App.Tests/
│   │   ├── HearthGem.LogParser.Tests/
│   │   └── HearthGem.ML.Tests/
│   │
│   └── HearthGem.Common/               # Shared utilities, constants, enums
│       ├── Constants.cs
│       └── Enums.cs
│
├── data/
│   ├── ml_models/                      # Trained TensorFlow Lite models
│   │   └── dnn_regressor_model.tflite
│   ├── db/                             # Local databases        │   ├── hearthgem.db                # SQLite database for card data
        │   └── user_preferences.db         # LiteDB for user preferences, session cache                  # Application logs (Sentry, debug)
│       └── hearthgem.log
│
├── scripts/
│   ├── train_model.py                  # Python script for ML model training
│   ├── scrape_heartharena.py           # Python script for HearthArena data scraping
│   └── update_card_data.py             # Python script for updating card data
│
├── .github/
│   ├── workflows/
│   │   └── nightly_build_and_train.yml # GitHub Actions workflow
│
├── docs/
│   └── architecture_diagrams/
│
├── .gitignore
├── README.md
└── HearthGem.sln                       # Visual Studio Solution file
```

## Feature Specifications

### Feature 1: Real-time Draft Recommendation System

**Feature Goal:** To provide highly accurate, real-time, and context-aware card recommendations during Hearthstone Arena and Underground drafts, optimizing the user's deck win rate. This system will dynamically analyze the current draft state, apply machine learning insights, and present clear, actionable advice to the user via the UI overlay.

**API Relationships:**

*   **HearthGem.LogParser:** Provides real-time game state data (e.g., offered cards, current deck, game mode) to the `HearthGem.ML` module.
*   **HearthGem.Data:** Provides static card data, historical HSReplay data, and HearthArena scraped ratings to the `HearthGem.ML` module for feature engineering and model inference.
*   **HearthGem.App (UI):** Consumes recommendations and associated data (e.g., scores, explanations) from `HearthGem.ML` to display them in the UI overlay.
*   **HearthGem.ConversationalAI:** Can query the recommendation system for explanations or alternative picks based on user natural language input.

**Detailed Feature Requirements:**

1.  **Real-time Recommendation Display:** The system shall display a recommended card with a "BEST" ribbon and a live rating for each draft pick within 100ms of the cards being presented in-game.
2.  **Dynamic Rating Updates:** Card ratings and associated analysis (synergy, curve impact, archetype bonus) shall update instantly after each card confirmation in the draft.
3.  **Comprehensive Contextual Analysis:** Recommendations shall account for:
    *   Current deck composition (cards already drafted).
    *   Mana curve of the current deck.
    *   Player's chosen archetype bias (if any).
    *   Known opponent class (if applicable).
    *   Game mode (Arena vs. Underground, including re-draft mechanics).
    *   Global meta-game data (HSReplay win-rate percentiles).
4.  **Explanatory Analysis Panel:** Hovering over any offered card shall expand an analysis panel providing:
    *   Detailed synergy explanations (e.g., "Strong synergy with existing Battlecry minions").
    *   Impact on mana curve (e.g., "Adds to your strong 4-drop slot").
    *   Archetype bonus/penalty (e.g., "+5% for Aggro archetype").
5.  **Visual Indicators:** Mana-curve bars, card-type grid, and synergy dots shall visually represent the deck's current state and the impact of potential picks.
6.  **Recommendation Accuracy:** Achieve an average deck win-rate uplift of +4 percentage points vs. HSReplay baseline (30-day rolling).
7.  **Performance Budget Adherence:** Model inference shall complete within <10 ms per inference on an RTX 3060 (with DirectML acceleration).

**Detailed Implementation Guide:**

#### 1. System Architecture Overview

*   **High-level Architecture:** The Real-time Draft Recommendation System is a core component of the `HearthGem.ML` module, interacting heavily with `HearthGem.LogParser` for input and `HearthGem.Data` for static and historical information. It processes game state, performs ML inference, and outputs recommendations to the `HearthGem.App` (UI).
*   **Technology Stack Selection:**
    *   **TensorFlow-Lite (C API via P/Invoke):** Chosen for its highly optimized, low-latency inference capabilities on client-side hardware, supporting GPU acceleration via DirectML. This ensures recommendations are delivered within strict performance budgets.
    *   **C# (.NET 8):** The primary language for application logic, providing robust asynchronous programming capabilities for log tailing and efficient data processing.
    *   **Python (for Training):** Used for offline model training due to its rich ecosystem of ML libraries (TensorFlow, scikit-learn, pandas) and data manipulation tools.
*   **Deployment Architecture:** The trained TensorFlow-Lite model (`.tflite` file) will be bundled with the application deployment. Updates to the model will be delivered via the application's auto-update mechanism (MSIX).
*   **Integration Points:**
    *   **LogParser Integration:** The `HearthGem.LogParser` will continuously monitor Hearthstone log files and push parsed game state events (e.g., `CardOfferedEvent`, `CardPickedEvent`) to the `HearthGem.ML.RecommendationEngine`.
    *   **Data Layer Integration:** The `RecommendationEngine` will query `HearthGem.Data.SQLiteRepository` for static card attributes, historical win rates, and meta-game data required for feature engineering.
    *   **UI Integration:** The `RecommendationEngine` will expose methods (e.g., `GetRecommendations(DraftState currentDraft)`) that the `HearthGem.App.ViewModels.DraftViewModel` will call to retrieve and display recommendations.

#### 2. Database Schema Design

This feature primarily relies on the `hearthgem.db` (SQLite) for comprehensive card data and historical performance metrics, and `user_preferences.db` (LiteDB) for user-specific archetype biases.

**SQLite (hearthgem.db) - Relevant Tables:**

*   **`Cards` Table:**
    *   `CardID` (TEXT, PRIMARY KEY): Unique identifier for each card (language-agnostic).
    *   `Name` (TEXT): English name of the card.
    *   `LocalizedNames` (JSON TEXT): JSON array of localized names for display purposes.
    *   `Rarity` (TEXT): Common, Rare, Epic, Legendary.
    *   `Type` (TEXT): Minion, Spell, Weapon, Hero.
    *   `Tribe` (TEXT): Beast, Demon, Dragon, etc. (NULLable).
    *   `ManaCost` (INTEGER): Mana cost of the card.
    *   `Attack` (INTEGER): Attack value (for minions/weapons, NULLable).
    *   `Health` (INTEGER): Health value (for minions, NULLable).
    *   `Text` (TEXT): Card text.
    *   `IsCollectible` (BOOLEAN): Whether the card can be collected.
    *   `Set` (TEXT): Card set (e.g., TITANS, Whizbang's Workshop).
    *   `ImageURL` (TEXT): URL to card image.
*   **`HSReplayMeta` Table:**
    *   `CardID` (TEXT, PRIMARY KEY, FOREIGN KEY REFERENCES `Cards(CardID)`)
    *   `Patch` (TEXT): Game patch version.
    *   `GlobalDrawnWinRatePercentile` (REAL): Card's global drawn win rate percentile in Arena for the given patch.
    *   `LastUpdated` (DATETIME): Timestamp of last update.
*   **`HearthArenaRatings` Table:**
    *   `CardID` (TEXT, PRIMARY KEY, FOREIGN KEY REFERENCES `Cards(CardID)`)
    *   `Class` (TEXT): Class for which the rating applies (e.g., 


    `Class` (TEXT): Class for which the rating applies (e.g., 'Druid', 'Mage', 'Neutral').
    *   `Rating` (REAL): The numerical rating from HearthArena.
    *   `LastScraped` (DATETIME): Timestamp of last scrape.

**LiteDB (user_preferences.db) - Relevant Collections:**

*   **`UserPreferences` Collection:**
    *   `_id` (ObjectId, PRIMARY KEY)
    *   `PreferredArchetype` (TEXT): User's currently selected archetype (e.g., 'Aggro', 'Control', 'Balanced').
    *   `ChatGPTApiKey` (TEXT): Encrypted OpenAI API key (if provided).
    *   `EnableChatGPT` (BOOLEAN): Flag to enable/disable ChatGPT integration.
*   **`DraftHistory` Collection:**
    *   `_id` (ObjectId, PRIMARY KEY)
    *   `RunId` (TEXT): Unique identifier for a draft run.
    *   `Timestamp` (DATETIME): When the draft occurred.
    *   `GameMode` (TEXT): 'Arena' or 'Underground'.
    *   `PlayerClass` (TEXT): Class played.
    *   `DraftedCards` (ARRAY of TEXT): List of `CardID`s drafted.
    *   `Recommendations` (ARRAY of JSON): Stores details of each pick, including offered cards, recommended card, and user's actual pick.

#### 3. Comprehensive API Design

While HearthGem is a desktop application, internal communication between modules can be thought of in terms of API-like contracts. The `HearthGem.ML.RecommendationEngine` will expose a C# interface for its core functionality.

**Interface: `IRecommendationEngine` (in `HearthGem.Core.Contracts`)**

```csharp
public interface IRecommendationEngine
{
    /// <summary>
    /// Generates card recommendations for a given draft state.
    /// </summary>
    /// <param name="currentDraftState">The current state of the draft, including existing deck, offered cards, and user archetype bias.</param>
    /// <returns>A collection of recommended cards with their scores and explanations.</returns>
    Task<IEnumerable<CardRecommendation>> GetRecommendationsAsync(DraftState currentDraftState);

    /// <summary>
    /// Provides a detailed explanation for a specific card recommendation.
    /// </summary>
    /// <param name="cardId">The ID of the card to explain.</param>
    /// <param name="context">The current game context (e.g., draft state, archetype).</param>
    /// <returns>A detailed explanation string.</returns>
    Task<string> GetRecommendationExplanationAsync(string cardId, DraftState context);

    /// <summary>
    /// Updates the archetype bias for the recommendation engine.
    /// </summary>
    /// <param name="archetype">The new archetype to bias recommendations towards.</param>
    Task SetArchetypeBiasAsync(string archetype);
}

public class CardRecommendation
{
    public string CardId { get; set; }
    public double Score { get; set; }
    public string RibbonText { get; set; } // e.g., "BEST"
    public string ExplanationSummary { get; set; }
    public Dictionary<string, double> DetailedAnalysis { get; set; } // e.g., "Synergy": 0.8, "CurveImpact": 0.5
}

public class DraftState
{
    public List<string> CurrentDeckCardIds { get; set; }
    public List<string> OfferedCardIds { get; set; }
    public string PlayerClass { get; set; }
    public string GameMode { get; set; }
    public string SelectedArchetype { get; set; } // From UserPreferences
    public int PickIndex { get; set; }
    // ... other relevant state variables like IsLegendaryGroup, LossRedraftCount
}
```

**Authentication and Authorization:** Not applicable for internal module communication within a single-user desktop application. Data access is managed by the application's internal permissions.

**Error Handling Strategies:**

*   **`GetRecommendationsAsync`:** If ML inference fails or data dependencies are missing, the method will return recommendations based on a fallback strategy (e.g., static HearthArena ratings) and include an `IsFallback` flag in the `CardRecommendation` object or a status message in the UI.
*   **`GetRecommendationExplanationAsync`:** If an explanation cannot be generated (e.g., card not found, context too ambiguous), it will return a generic 


    `GetRecommendationExplanationAsync`:** If an explanation cannot be generated (e.g., card not found, context too ambiguous), it will return a generic "Explanation not available" message.

#### 4. Frontend Architecture

*   **Component Hierarchy:** The UI for the Real-time Draft Recommendation System will primarily reside within the `DraftView.xaml` and its corresponding `DraftViewModel.cs`. It will utilize several sub-components and controls.

    ```
    DraftView
    ├── HeaderBar (reusable component)
    ├── DraftTabControl
    │   ├── DraftPanel
    │   │   ├── CardOfferingsControl (displays 3-5 cards)
    │   │   │   ├── CardDisplayControl (reusable, for each card)
    │   │   │   │   ├── CardImage
    │   │   │   │   ├── CardName
    │   │   │   │   ├── LiveRatingDisplay
    │   │   │   │   └── "BEST"RibbonControl
    │   │   │   └── AnalysisPanelControl (expands on hover)
    │   │   │       ├── SynergyDetails
    │   │   │       ├── CurveImpactDetails
    │   │   │       └── ArchetypeBonusDetails
    │   │   ├── DeckOverviewControl
    │   │   │   ├── ManaCurveBars
    │   │   │   ├── CardTypeGrid
    │   │   │   └── SynergyDots
    │   │   └── ArchetypeSelectionControl (optional)
    │   │       └── ArchetypeIcon (reusable for each archetype)
    │   ├── DeckStatsPanel (separate tab)
    │   └── RedraftPanel (contextual tab)
    └── FooterBar (reusable component)
    ```

*   **Reusable Component Library:**
    *   `CardDisplayControl`: Displays a single card with its image, name, and live rating. Can be reused across different views (e.g., Deck Stats).
    *   `BESTRibbonControl`: A small, visually distinct ribbon to highlight the best pick.
    *   `ArchetypeIcon`: Displays an archetype icon and handles selection.
    *   `ManaCurveBar`: A custom control to visualize the mana curve.
    *   `HearthstoneButton`: A themed button control.

*   **State Management Strategy:** MVVM with data binding will be the primary state management strategy. The `DraftViewModel` will hold the current `DraftState` (from `HearthGem.Core.Models`) and `CardRecommendation` objects (from `HearthGem.ML.Models`). Changes to these properties will automatically update the UI via `INotifyPropertyChanged`.

*   **Routing and Navigation Flow:** Navigation between the main tabs (Draft, Deck Stats, Redraft) will be handled by a `NavigationService` (in `HearthGem.App.Services`) that manages the active ViewModel displayed in the main content area of `MainWindow.xaml`.

*   **Responsive Design Specifications:**
    *   **Draggable, Resizable Window:** The main overlay window will be draggable and resizable within specified `min-width = 260 px` and `max-width = 400 px` constraints.
    *   **Fluid Layouts:** UI elements within the `DraftView` will use `Grid` and `StackPanel` layouts with `*` (star) sizing and `Auto` sizing to adapt to window resizing. This ensures elements scale proportionally or maintain their size as needed.
    *   **Dynamic Content Adjustment:** The `CardOfferingsControl` will dynamically adjust the layout of `CardDisplayControl` instances based on the number of cards offered (3, 4, or 5), ensuring optimal use of space.
    *   **Text Wrapping/Truncation:** Text elements (e.g., card names, explanations) will implement text wrapping or ellipsis (`TextTrimming`) to prevent overflow in smaller window sizes.

#### 5. Detailed CRUD Operations

For the Real-time Draft Recommendation System, CRUD operations are primarily internal, involving the interaction between the `HearthGem.ML` module and the data layers (`HearthGem.Data`).

*   **Create Operation (Internal):**
    *   **Purpose:** To generate new `CardRecommendation` objects based on the current `DraftState`.
    *   **Trigger:** Initiated by the `HearthGem.App` (specifically `DraftViewModel`) whenever a new card offering is detected by the `HearthGem.LogParser`.
    *   **Process:**
        1.  `DraftViewModel` receives `CardOfferedEvent` from `LogParser`.
        2.  `DraftViewModel` constructs a `DraftState` object, populating it with `CurrentDeckCardIds`, `OfferedCardIds`, `PlayerClass`, `GameMode`, `SelectedArchetype`, `PickIndex`, etc.
        3.  `DraftViewModel` calls `IRecommendationEngine.GetRecommendationsAsync(currentDraftState)`.
        4.  `RecommendationEngine` (in `HearthGem.ML`):
            *   Retrieves static card data and meta-data from `HearthGem.Data.SQLiteRepository`.
            *   Performs feature engineering on the `DraftState` and `OfferedCardIds` to create the input tensor for the TensorFlow-Lite model.
            *   Executes ML inference using the loaded `.tflite` model.
            *   Applies post-processing rules (normalization, tie-breaking) to the raw ML output.
            *   Constructs `CardRecommendation` objects for each offered card.
    *   **Validation Rules:** Input `DraftState` must be valid (e.g., `OfferedCardIds` count must be 3, 4, or 5; `CardID`s must exist in the `Cards` database). Invalid inputs will result in an empty recommendation list or a fallback to static scores.
    *   **Required Fields:** All fields within `DraftState` relevant to ML inference are required.

*   **Read Operation (Internal & UI Display):**
    *   **Purpose:** To retrieve `CardRecommendation` objects for display and to access detailed analysis for the analysis panel.
    *   **Trigger:** `DraftView` binds to properties in `DraftViewModel` that hold the `CardRecommendation` list. User hovers over a card to trigger the analysis panel.
    *   **Process:**
        1.  `DraftViewModel` exposes an `ObservableCollection<CardRecommendation>` that the `CardOfferingsControl` binds to.
        2.  When a user hovers over a `CardDisplayControl`, its associated `CardRecommendation` object is passed to the `AnalysisPanelControl`.
        3.  The `AnalysisPanelControl` displays `ExplanationSummary` and `DetailedAnalysis` from the `CardRecommendation` object.
        4.  For more detailed explanations, the UI might trigger a call to `IRecommendationEngine.GetRecommendationExplanationAsync(cardId, currentDraftState)`.
    *   **Filtering/Pagination/Sorting:** Not directly applicable for real-time recommendations (all relevant recommendations are displayed simultaneously). However, internal data queries to `HearthGem.Data` for feature engineering will utilize indexing for efficient filtering and retrieval of card data.

*   **Update Operation (Internal):**
    *   **Purpose:** To update the displayed recommendations as the draft state changes (e.g., after a card is picked).
    *   **Trigger:** `HearthGem.LogParser` detects a `CardPickedEvent`.
    *   **Process:**
        1.  `DraftViewModel` receives `CardPickedEvent`.
        2.  `DraftViewModel` updates its internal `DraftState` (e.g., adds the picked card to `CurrentDeckCardIds`, increments `PickIndex`).
        3.  `DraftViewModel` re-initiates the `Create` operation by calling `IRecommendationEngine.GetRecommendationsAsync` with the updated `DraftState`.
        4.  The UI automatically updates due to data binding.

*   **Delete Operation:** Not applicable for real-time recommendations. `CardRecommendation` objects are transient and not persisted.

#### 6. User Experience Flow

*   **User Journey Map (Drafting):**
    1.  **Launch & Attach:** User double-clicks HearthGem icon. Overlay starts, waits for Hearthstone.exe, then snaps into always-on-top transparent mode, showing compact "Draft" tab.
    2.  **Run Identification:** User clicks Arena in-game. Overlay reads log headers, labels run (Arena/Underground), and displays loss counter/win cap.
    3.  **Archetype Setup (Optional):** Five archetype icons slide in. User taps one to bias recommendations (can switch anytime). A confirmation prompt appears before applying bias. Skipping defaults to "Balanced."
    4.  **Legendary Group Pick (if applicable):** First pack shows 4 cards. Overlay presents them as a single unit with bundle score and synergy explanation. User clicks bundle, score/synergy turn gold, overlay moves to next pick.
    5.  **Standard Pick Loop:** For each 3-card offer:
        *   Overlay highlights best pick with "BEST" ribbon and live rating.
        *   Hovering any card expands analysis panel (synergy, curve impact, archetype bonus).
        *   Mana-curve bars, card-type grid, synergy dots update instantly after confirmation.
        *   Loop continues until 30 cards or loss in Underground.
    6.  **(Underground only) Loss Re-Draft Cycle:** After in-game defeat, Hearthstone presents 5 new cards. Overlay switches to Redraft tab, showing recommendations for the re-draft.
    7.  **Draft Completion:** After 30 cards (or run end), the Draft tab transitions to a summary or the Deck Stats tab.

*   **Wireframes for Key Screens (Conceptual):**
    *   **Main Overlay (Compact Draft Tab):**
        *   Top: Logo, Help, Collapse, Minimize buttons. Run identification (Arena/Underground, Loss/Win Cap).
        *   Middle: Three (or four/five) card slots. Each slot shows card art, name, and live rating. The "BEST" ribbon is prominently displayed on the recommended card.
        *   Bottom: Mana curve visualization (horizontal bars), small grid for card types (minion/spell/weapon counts), small dots/icons for key synergies.
    *   **Analysis Panel (Expanded on Hover):**
        *   Appears next to the hovered card.
        *   Sections for: "Synergy Details" (e.g., "+2 to your existing Elemental synergy"), "Curve Impact" (e.g., "Fills your 3-drop slot perfectly"), "Archetype Bonus" (e.g., "High value for your selected Aggro archetype").
    *   **Archetype Selection Overlay:**
        *   A temporary, semi-transparent overlay with 5 large, distinct archetype icons.
        *   Clicking an icon highlights it and brings up a small confirmation dialog.

*   **State Transitions and Loading States:**
    *   **Initial Load:** Overlay shows a loading spinner/message until Hearthstone.exe is detected and initial log parsing is complete.
    *   **Draft Detection:** Smooth transition from idle state to active draft display upon `DRAFT_START` event.
    *   **Recommendation Calculation:** While ML inference is running (milliseconds), the UI will show a subtle loading indicator on the card slots, or simply update once the result is ready (given the <10ms budget, this might be imperceptible).
    *   **Archetype Selection:** Visual feedback (e.g., icon highlight, subtle animation) upon selection, followed by a confirmation prompt.
    *   **Log Parsing Errors:** Display a prominent "Log Error" banner at the top of the overlay.

*   **Error Handling from User Perspective:**
    *   **Log File Access Issues:** A clear, non-intrusive banner (e.g., yellow bar at the top of the overlay) stating "Log files inaccessible. Recommendations may be limited." with a clickable link to troubleshooting steps.
    *   **ML Model Loading Failure:** "Recommendation engine offline. Using static scores." banner.
    *   **Network Issues (for HSReplay/HearthArena updates):** "Data updates unavailable. Using cached data." banner.
    *   **ChatGPT API Errors:** "ChatGPT integration error. Check API key or network." message in the conversational AI chat window.

#### 7. Security Considerations

*   **Authentication Flow Details:** Not applicable for the core application as it is a single-user desktop application without server-side authentication. User preferences and API keys are stored locally.
*   **Authorization Matrix:** Not applicable.
*   **Data Validation and Sanitization Rules:**
    *   **Log Parsing Input:** Log entries are treated as untrusted input. Regular expressions and strict parsing rules will be used to extract data. Any unexpected or malformed data will be discarded or flagged for error logging, preventing injection or unexpected behavior.
    *   **User Input (e.g., API Keys):** User-provided API keys will be validated for format (e.g., length, character set) before encryption and storage. No direct execution of user input will occur.
*   **Protection Against Common Vulnerabilities:**
    *   **Local File Access:** Adherence to the principle of least privilege. The application will only request necessary file read permissions for Hearthstone log directories. File paths will be validated to prevent directory traversal attacks.
    *   **Data Storage:** Sensitive user data (e.g., ChatGPT API key) will be encrypted using a robust, industry-standard encryption algorithm (e.g., AES-256) before being stored in LiteDB. The encryption key will be derived from a combination of machine-specific identifiers and potentially a user-provided passphrase (if implemented for higher security).
    *   **Network Communication (for ChatGPT API):** All communication with the ChatGPT API will use HTTPS to ensure data is encrypted in transit. Standard .NET `HttpClient` will handle TLS/SSL certificate validation.
    *   **Code Integrity:** The application will be code-signed to ensure its authenticity and detect any tampering after release.

#### 8. Testing Strategy

A multi-layered testing strategy will be employed to ensure the reliability, accuracy, and performance of the Real-time Draft Recommendation System.

*   **Unit Test Requirements:**
    *   **Scope:** Individual methods and classes within `HearthGem.ML` (e.g., `FeatureExtractor`, `RecommendationEngine` logic excluding actual ML inference), `HearthGem.Data` repositories, and `HearthGem.LogParser` (individual parsing functions, FSM state transitions).
    *   **Coverage:** Aim for >90% code coverage for core logic components.
    *   **Tools:** NUnit or xUnit for C# unit testing.
*   **Integration Test Scenarios:**
    *   **Log Parsing to ML Inference:** Simulate log file writes and verify that the `LogParser` correctly extracts game state, passes it to the `RecommendationEngine`, and that the engine produces valid recommendations.
    *   **Data Layer Integration:** Test the interaction between `RecommendationEngine` and `SQLiteRepository`/`LiteDbRepository` for data retrieval and preference storage.
    *   **UI-ML Integration:** Verify that UI actions (e.g., archetype selection) correctly influence recommendations and that recommendations are displayed accurately.
    *   **ChatGPT API Integration:** Test successful API calls, error handling for invalid keys/network issues, and correct display of responses.
*   **End-to-End Test Flows:**
    *   **Full Draft Simulation:** Simulate an entire Arena draft process, from launch to completion, verifying all UI updates, recommendations, and data persistence.
    *   **Error Condition Simulation:** Test graceful degradation scenarios (e.g., disconnect network, corrupt log file) and verify appropriate error messages and fallback behavior.
    *   **Performance Benchmarking:** Run automated tests to measure log tailing, ML inference, and UI rendering times against the defined performance budgets.
*   **Performance Testing Thresholds:**
    *   Log tail: <5 ms
    *   Model inference: <10 ms (on target hardware)
    *   UI diff & render: <20 ms
    *   Overall margin: 15 ms

#### 9. Data Management

*   **Data Lifecycle Policies:**
    *   **Static Card Data:** Updated periodically (e.g., nightly via GitHub Actions) from external sources. Cached locally in SQLite. Old versions are overwritten.
    *   **HSReplay Meta Data:** Daily pull, stored in SQLite. Older than 30 days can be purged or archived to manage database size.
    *   **HearthArena Ratings:** Daily scrape, stored in SQLite. Overwritten with new data.
    *   **User Preferences/Session Cache:** Stored in LiteDB. Persisted across sessions. User-initiated deletion option will remove all associated data.
    *   **Draft History:** Stored in LiteDB. Persisted indefinitely unless user deletes.
*   **Caching Strategies:**
    *   **HSReplay Stats:** Last 28 days of HSReplay stats (~60 MB) will be cached in SQLite for fast local access.
    *   **ML Model:** The TensorFlow-Lite model is loaded into memory once at application startup for rapid inference.
    *   **Card Data:** Frequently accessed card data (e.g., for current patch) can be loaded into an in-memory cache (e.g., `ConcurrentDictionary<string, Card>`) for near-instant lookup.
*   **Pagination and Infinite Scrolling:** Not directly applicable to the real-time recommendation system, as all relevant data for a pick is displayed at once. However, for future features like the Deck Statistics Dashboard, pagination and filtering will be implemented for historical draft data.
*   **Real-time Data Requirements:** The system requires real-time updates from Hearthstone log files (via `HearthGem.LogParser`) to ensure recommendations are based on the most current game state. ML inference must be near-instantaneous to meet the UX requirements.

#### 10. Error Handling & Logging

*   **Structured Logging Format:** All application logs will use a structured logging format (e.g., JSON) to facilitate easier parsing, querying, and analysis by logging tools (e.g., Sentry, ELK stack if deployed server-side).
    *   **Example Log Entry (JSON):**
        ```json
        {
            "Timestamp": "2025-06-26T14:30:00.123Z",
            "Level": "Error",
            "Source": "HearthGem.LogParser",
            "Message": "Failed to parse log entry",
            "ExceptionType": "LogParsingException",
            "StackTrace": "...",
            "LogLine": "[Power] D 14:29:59.123456 Invalid log entry format",
            "CurrentFSMState": "DRAFT_STARTED"
        }
        ```
*   **Error Classification and Prioritization:**
    *   **Critical:** Application crash, inability to parse logs, ML model loading failure. Requires immediate attention.
    *   **Warning:** Network issues preventing data updates, minor parsing errors, performance degradation.
    *   **Info:** Normal operation, feature usage, successful updates.
    *   **Debug:** Detailed information for development and troubleshooting.
*   **Monitoring and Alerting Thresholds:**
    *   **Sentry Integration:** The Sentry SDK will be integrated to capture and report errors and exceptions. Critical errors will trigger alerts (e.g., email, Slack notification) to the development team.
    *   **Performance Monitoring:** Automated tests and potentially in-app telemetry (with user consent) will monitor key performance metrics (log tail latency, inference time) against defined thresholds. Deviations will trigger warnings.
*   **Recovery Mechanisms:**
    *   **Graceful Degradation:** As detailed in Section 2.5, the application will fall back to static scores or cached data if real-time data or ML inference is unavailable.
    *   **Auto-Restart Overlay:** If an unhandled exception occurs in the UI process, the overlay will attempt to auto-restart to restore basic functionality.
    *   **Retry Mechanisms:** For transient errors (e.g., network glitches, file access contention), retry logic with exponential backoff will be implemented.




### Feature 2: User Interface (UI) Overlay

**Feature Goal:** To provide a polished, Hearthstone-themed graphical user interface that overlays the game, offering intuitive controls and visual feedback for the draft process, while maintaining minimal performance impact on the game.

**API Relationships:**

*   **HearthGem.App (UI):** This is the primary consumer of data and services from other modules.
*   **HearthGem.ML:** Receives `CardRecommendation` objects and related analysis data for display.
*   **HearthGem.LogParser:** Receives real-time game state updates (e.g., `DRAFT_START`, `CardOfferedEvent`, `CardPickedEvent`) to trigger UI changes and updates.
*   **HearthGem.Data:** Retrieves user preferences (e.g., selected archetype, accessibility settings) and static card data for UI rendering.
*   **HearthGem.ConversationalAI:** Provides the chat interface and displays responses from both local NLP and optional ChatGPT integration.

**Detailed Feature Requirements:**

1.  **Overlay Window:** The UI shall be presented as a transparent, always-on-top overlay window that snaps to the Hearthstone game client upon detection.
2.  **Draggable and Resizable:** The overlay window shall be draggable by the user and resizable within a `max-width = 400 px` and `min-width = 260 px` range.
3.  **Hearthstone-Themed Aesthetic:** The UI shall adhere to a dark stone & parchment theme with gold accents, utilizing Belwe and Open Sans typography for visual consistency with the game.
4.  **Header Bar:** A persistent header bar shall include a logo, help button, collapse button, and minimize button.
5.  **Tabbed Navigation:** The main content area shall feature tabs for "Draft," "Deck Stats," and a contextual "Redraft" tab (visible only during Underground re-draft cycles).
6.  **Accessibility Features:**
    *   **Color-blind Safe Palette Toggle:** Provide an option to switch to a color-blind safe palette.
    *   **Keyboard Navigation:** All interactive elements shall be navigable via keyboard.
    *   **ARIA-Label for Tooltips:** Provide descriptive text for screen readers for non-textual UI elements.
7.  **Visual Consistency:** Maintain visual consistency with the official Hearthstone UI elements where appropriate.
8.  **Responsive and Performant:** UI interactions shall be responsive, and rendering shall not exceed a frame-time overhead of <2 ms on a GTX 1060.
9.  **Clear and Readable Display:** All information, including card details, recommendations, and statistics, shall be clearly and readably displayed over the game.

**Detailed Implementation Guide:**

#### 1. System Architecture Overview

*   **High-level Architecture:** The UI Overlay is the primary user-facing component, implemented as a WPF application (`HearthGem.App`). It acts as the orchestrator, subscribing to events from `HearthGem.LogParser`, querying `HearthGem.ML` for recommendations, and retrieving data from `HearthGem.Data`. It also hosts the `HearthGem.ConversationalAI` interface.
*   **Technology Stack Selection:**
    *   **WPF (.NET 8):** Chosen for its rich UI capabilities, robust data binding, and strong support for hardware acceleration, making it suitable for creating complex, performant desktop applications. Its MVVM pattern support aids in separation of concerns.
    *   **D3DImage:** Essential for achieving low-latency, transparent overlay rendering by directly sharing DirectX textures with the operating system's Desktop Window Manager (DWM). This bypasses traditional GDI/GDI+ rendering overhead.
    *   **DirectWrite and Direct2D:** Used for high-quality text rendering and advanced graphical effects (like blur) that integrate seamlessly with DirectX rendering, ensuring visual fidelity and performance.
*   **Deployment Architecture:** The WPF application will be deployed as a single executable package (e.g., via MSIX), bundling all necessary dependencies. Updates will be managed through an auto-update mechanism.
*   **Integration Points:**
    *   **LogParser:** The `HearthGem.App` will subscribe to events from `HearthGem.LogParser` (e.g., `OnCardOffered`, `OnDraftStart`) to update the UI state.
    *   **ML Module:** The `DraftViewModel` will call methods on `IRecommendationEngine` (from `HearthGem.ML`) to fetch recommendations.
    *   **Data Module:** ViewModels will interact with `LiteDbRepository` and `SQLiteRepository` (from `HearthGem.Data`) to load/save user preferences and retrieve static card data.
    *   **Conversational AI:** The `ConversationalAIView` and `ConversationalAIViewModel` will interact with the `HearthGem.ConversationalAI` module to send user queries and display AI responses.

#### 2. Database Schema Design

The UI Overlay primarily interacts with the `UserPreferences` collection in `LiteDB` for user-specific settings and the `Cards` table in `SQLite` for displaying card information.

**LiteDB (user_preferences.db) - Relevant Collections:**

*   **`UserPreferences` Collection:**
    *   `_id` (ObjectId, PRIMARY KEY)
    *   `OverlayPositionX` (DOUBLE): X-coordinate of the overlay window.
    *   `OverlayPositionY` (DOUBLE): Y-coordinate of the overlay window.
    *   `OverlayWidth` (DOUBLE): Width of the overlay window.
    *   `OverlayHeight` (DOUBLE): Height of the overlay window.
    *   `IsCollapsed` (BOOLEAN): State of the collapse button.
    *   `IsMinimized` (BOOLEAN): State of the minimize button.
    *   `ColorBlindModeEnabled` (BOOLEAN): Flag for color-blind safe palette.
    *   `ChatGPTApiKey` (TEXT): Encrypted OpenAI API key.
    *   `EnableChatGPT` (BOOLEAN): Flag to enable/disable ChatGPT integration.
    *   `LastSelectedTab` (TEXT): Stores the last active tab (e.g., "Draft", "DeckStats").

**SQLite (hearthgem.db) - Relevant Tables:**

*   **`Cards` Table:** (As defined in Feature 1, used for displaying card names, images, and other static attributes in the UI).

#### 3. Comprehensive API Design

The UI Overlay interacts with other modules primarily through C# interfaces and event subscriptions, adhering to the MVVM pattern where ViewModels expose data and commands.

**Interfaces Consumed by UI (in `HearthGem.Core.Contracts`):**

*   **`ILogParser`:**
    ```csharp
    public interface ILogParser
    {
        event EventHandler<CardOfferedEventArgs> CardOffered;
        event EventHandler<CardPickedEventArgs> CardPicked;
        event EventHandler<DraftStartedEventArgs> DraftStarted;
        event EventHandler<GameEndedEventArgs> GameEnded;
        // ... other relevant game events
        Task StartMonitoringAsync();
        void StopMonitoring();
    }
    ```
*   **`IRecommendationEngine`:** (As defined in Feature 1, used by `DraftViewModel` to get recommendations and explanations).
*   **`IDataRepository` (abstracted for LiteDB/SQLite):**
    ```csharp
    public interface IDataRepository<TEntity>
    {
        Task<TEntity> GetByIdAsync(string id);
        Task SaveAsync(TEntity entity);
        // ... other CRUD operations for specific entities like UserPreferences
    }
    ```
*   **`IConversationalAI`:**
    ```csharp
    public interface IConversationalAI
    {
        Task<string> SendQueryAsync(string query, DraftState context, bool useChatGPT);
        // ... methods for managing API key, enabling/disabling ChatGPT
    }
    ```

**Internal UI Communication (MVVM):**

*   **`ICommand`:** Used for binding UI actions (button clicks, tab selections) to methods in ViewModels.
*   **`INotifyPropertyChanged`:** Implemented by ViewModels to notify the View of property changes, enabling automatic UI updates.
*   **`ObservableCollection<T>`:** Used for collections of items (e.g., `OfferedCards` in `DraftViewModel`) to automatically update UI when items are added, removed, or changed.

**Error Handling:** UI components will subscribe to error events from underlying services or handle exceptions directly. Errors will be displayed to the user via non-intrusive banners or specific error messages within the UI, as detailed in Section 1.10 (Error Handling & Logging).

#### 4. Frontend Architecture

*   **Component Hierarchy:** The WPF application will follow a hierarchical component structure, with `MainWindow` as the root, hosting various views and controls.

    ```
    MainWindow
    ├── HeaderBar (UserControl)
    │   ├── Logo (Image)
    │   ├── HelpButton (Button)
    │   ├── CollapseButton (Button)
    │   └── MinimizeButton (Button)
    ├── TabControl (main navigation)
    │   ├── TabItem (Draft)
    │   │   └── DraftView (UserControl) # Contains CardOfferingsControl, DeckOverviewControl, etc.
    │   ├── TabItem (Deck Stats)
    │   │   └── DeckStatsView (UserControl)
    │   ├── TabItem (Redraft) # Contextual visibility
    │   │   └── RedraftView (UserControl)
    │   └── TabItem (Settings) # Hidden tab, accessible via Help/Settings button
    │       └── SettingsView (UserControl)
    ├── ConversationalAIView (UserControl) # Integrated chat panel
    └── StatusBar (UserControl) # For displaying status messages, error banners
    ```

*   **Reusable Component Library Specifications:**
    *   **`CardDisplayControl`:** Displays a single card with image, name, mana cost, and potentially a live rating/ribbon. Parameters: `CardId`, `Score`, `IsBestPick`, `IsHovered`.
    *   **`ManaCurveBar`:** A custom control visualizing the mana curve. Parameters: `ManaCosts` (list of integers), `MaxMana`.
    *   **`HearthstoneButton`:** A custom button styled to match Hearthstone aesthetics. Parameters: `Command`, `CommandParameter`, `Text`.
    *   **`ThemedTextBlock`:** A custom `TextBlock` for consistent typography (Belwe/Open Sans) and color.
    *   **`OverlayWindow`:** A custom `Window` class inheriting from `Window` with properties for transparency, always-on-top behavior, and D3DImage integration.

*   **State Management Strategy:** MVVM is the core. `MainWindowViewModel` manages overall application state and navigation. Each `View` has a corresponding `ViewModel` (`DraftViewModel`, `DeckStatsViewModel`, etc.) that encapsulates its specific state and logic. Data binding connects the View and ViewModel. Services (e.g., `OverlayService`, `NavigationService`) handle cross-ViewModel communication and application-level concerns.

*   **Routing and Navigation Flow:** A `NavigationService` will be responsible for switching between the main tabs. It will expose methods like `NavigateToDraft()`, `NavigateToDeckStats()`, `ShowSettings()`. The `MainWindowViewModel` will bind to the `NavigationService` to update the `ContentControl` that hosts the active view.

*   **Responsive Design Specifications:**
    *   **Window Resizing:** The `OverlayWindow` will handle `SizeChanged` events to adjust the layout of its internal `Grid` and `StackPanel` elements. `Viewbox` controls will be used for scaling content within certain bounds.
    *   **Dynamic Layouts:** `Grid.IsSharedSizeScope` and `ColumnDefinition`/`RowDefinition` with `*` sizing will ensure proportional resizing of UI elements. `DataTemplates` will be used to dynamically render card displays based on the number of cards offered.
    *   **Text Handling:** `TextWrapping=


    *   **Text Handling:** `TextWrapping`, `TextTrimming`, and `MinHeight`/`MaxHeight` properties will be used for `TextBlock` elements to ensure readability and prevent overflow. Custom logic might be needed for complex text layouts.

#### 5. Detailed CRUD Operations

For the UI Overlay, CRUD operations primarily involve reading and updating user preferences and displaying data from other modules.

*   **Create Operation:**
    *   **Purpose:** To initialize default user preferences if no existing preferences are found (e.g., on first application launch).
    *   **Trigger:** Application startup, `SettingsViewModel` checks for existing `UserPreferences` in LiteDB.
    *   **Process:** If `LiteDbRepository.GetUserPreferencesAsync()` returns null, a new `UserPreferences` object is instantiated with default values (e.g., default window position, color-blind mode disabled, ChatGPT integration disabled).
    *   **Validation Rules:** Default values are inherently valid.
    *   **Required Fields:** All fields in `UserPreferences` are initialized.

*   **Read Operation:**
    *   **Purpose:** To load user preferences, display current game state, and show recommendations/statistics.
    *   **Trigger:** Application startup (for preferences), `LogParser` events (for game state), `DraftViewModel` requests (for recommendations), user navigation to different tabs (for statistics).
    *   **Process:**
        1.  **User Preferences:** `LiteDbRepository.GetUserPreferencesAsync()` is called at startup to load `OverlayPositionX`, `OverlayPositionY`, `OverlayWidth`, `OverlayHeight`, `IsCollapsed`, `IsMinimized`, `ColorBlindModeEnabled`, `EnableChatGPT`, `ChatGPTApiKey`, `LastSelectedTab`.
        2.  **Game State:** `DraftViewModel` subscribes to `ILogParser` events (`CardOffered`, `CardPicked`, `DraftStarted`, etc.) to receive `DraftState` updates. These updates are then bound to UI elements.
        3.  **Recommendations:** `DraftViewModel` calls `IRecommendationEngine.GetRecommendationsAsync()` to retrieve `CardRecommendation` objects, which are then displayed.
        4.  **Static Card Data:** `SQLiteRepository.GetCardByIdAsync()` is called to retrieve `Card` objects for displaying card images, names, and details.
    *   **Filtering/Pagination/Sorting:** Not directly applicable for the UI overlay's primary display of real-time data. However, internal data access methods for historical data (e.g., in Deck Stats) will support these operations.

*   **Update Operation:**
    *   **Purpose:** To save changes to user preferences (e.g., window position, settings changes) and update the UI based on game events.
    *   **Trigger:** User interaction (dragging window, changing settings), `LogParser` events.
    *   **Process:**
        1.  **User Preferences:** When the user drags/resizes the window, or changes settings in the `SettingsView`, the corresponding properties in `UserPreferences` are updated in the `SettingsViewModel`. `LiteDbRepository.SaveUserPreferencesAsync(updatedPreferences)` is then called to persist these changes.
        2.  **UI Updates from Game Events:** `DraftViewModel` receives events from `ILogParser` (e.g., `CardPickedEventArgs`). It updates its internal `DraftState` and triggers a re-evaluation of recommendations, which in turn updates the UI via data binding.
    *   **Validation Rules:** Input validation for settings (e.g., ensuring window dimensions are within reasonable bounds) will be performed in the `SettingsViewModel` before persisting to LiteDB.

*   **Delete Operation:**
    *   **Purpose:** To remove user-specific data, primarily for privacy or troubleshooting.
    *   **Trigger:** User action (e.g., a 


    *   **Trigger:** User action (e.g., a "Delete My Data" button in settings).
    *   **Process:** `LiteDbRepository.DeleteUserPreferencesAsync()` would be called to remove the `UserPreferences` document. For `DraftHistory`, individual draft runs could be deleted.

#### 6. User Experience Flow

*   **User Journey Maps:**
    *   **Initial Launch & Overlay Attachment:**
        1.  User double-clicks HearthGem executable.
        2.  HearthGem application starts, displays a splash screen or loading indicator.
        3.  Application monitors for `Hearthstone.exe` process.
        4.  Once `Hearthstone.exe` is detected, HearthGem overlay window (transparent, always-on-top) is created and positioned relative to the Hearthstone game window.
        5.  Overlay displays the compact "Draft" tab, ready for a new Arena/Underground run.
    *   **Drafting a Deck:** (Detailed in Feature 1, Section 6. User Journey Map (Drafting))
    *   **Accessing Deck Statistics:**
        1.  User clicks the "Deck Stats" tab in the Header Bar.
        2.  `DeckStatsView` loads, displaying historical draft data and statistics.
        3.  User can filter/sort historical drafts by class, archetype, patch.
        4.  User can click on a specific draft to view detailed card performance.
    *   **Configuring Settings:**
        1.  User clicks the "Help" or "Settings" button in the Header Bar.
        2.  `SettingsView` loads, displaying options for UI customization (e.g., color-blind mode), log file paths, and Conversational AI settings (e.g., ChatGPT API key input).
        3.  User modifies settings and clicks "Save" or changes are applied immediately.

*   **Wireframes for Key Screens (Conceptual):**
    *   **Main Overlay (Compact Draft Tab):** (Detailed in Feature 1, Section 6. Wireframes for Key Screens (Conceptual))
    *   **Deck Stats Tab:**
        *   Top: Filters (Class, Archetype, Patch), Sort by (Win Rate, Date).
        *   Middle: List/Grid of historical drafted decks, showing key stats (e.g., Class, Win/Loss, Archetype, Avg. Card Score).
        *   Bottom: Summary statistics (e.g., Overall Win Rate, Avg. Draft Score).
    *   **Settings Tab:**
        *   Sections: "General" (e.g., auto-start with Windows), "Display" (e.g., color-blind toggle, overlay opacity), "Data" (e.g., clear cache, delete data), "Conversational AI" (e.g., ChatGPT API key input field, enable/disable toggle).
        *   Each setting has a clear label and an interactive control (checkbox, slider, text input).

*   **State Transitions and Loading States:**
    *   **Application Startup:** Splash screen -> Main Window (loading state) -> Main Window (active, compact Draft tab).
    *   **Tab Switching:** Smooth transition between tabs. If a tab requires data loading (e.g., Deck Stats), a localized loading indicator will be shown within that tab.
    *   **Settings Changes:** Immediate visual feedback for UI-related settings (e.g., color-blind mode toggle changes UI colors instantly). Data-related settings (e.g., clearing cache) will show a progress indicator.

*   **Error Handling from User Perspective:**
    *   **General UI Errors:** Unhandled exceptions will trigger a graceful restart of the overlay (as detailed in Section 2.5). A small, persistent error icon might appear in the header bar, which, when clicked, provides details or directs the user to a troubleshooting guide.
    *   **Invalid User Input:** Input fields (e.g., API key) will provide immediate inline validation feedback (e.g., red border, error message).

#### 7. Security Considerations

*   **Authentication Flow Details:** Not applicable for the UI itself, as user authentication is not a feature of the desktop application. User preferences are stored locally.
*   **Authorization Matrix:** Not applicable.
*   **Data Validation and Sanitization Rules:**
    *   **User Preferences:** Input fields for settings (e.g., window dimensions, API key) will be validated client-side to ensure they conform to expected formats and ranges. For example, the ChatGPT API key input will be validated for its expected length and character set before being encrypted and stored.
    *   **UI Input:** Any user input that could potentially be used to manipulate the application (e.g., through text fields) will be sanitized to prevent injection attacks, although the primary attack surface is limited in a local desktop application.
*   **Protection Against Common Vulnerabilities:**
    *   **Sensitive Data Storage:** The ChatGPT API key, if provided by the user, will be encrypted using a robust, industry-standard encryption algorithm (e.g., AES-256) before being stored in LiteDB. The encryption key will be derived from a combination of machine-specific identifiers (e.g., machine GUID) to tie the key to the specific installation, and potentially a user-provided passphrase (if a higher security tier is implemented).
    *   **Code Signing:** The entire application package (MSIX) will be digitally signed with a trusted certificate. This ensures the integrity of the application, verifying that it has not been tampered with since it was published and providing assurance to the user about the software's origin.
    *   **Process Isolation:** The overlay will operate within its own process space, minimizing the risk of interference with the Hearthstone game client. While `D3DImage` involves shared memory for textures, the interaction is controlled and limited to rendering.
    *   **Least Privilege:** The application will request only the necessary permissions (e.g., file read access to Hearthstone log directories, network access for updates and optional ChatGPT API). It will not run with elevated privileges unless absolutely necessary for specific system interactions (e.g., installing updates), and this will be clearly communicated to the user.

#### 8. Testing Strategy

*   **Unit Test Requirements:**
    *   **Scope:** Individual UI components (e.g., `CardDisplayControl`, `ManaCurveBar`), ViewModels (`DraftViewModel`, `SettingsViewModel`), and UI-related services (`OverlayService`, `NavigationService`).
    *   **Coverage:** Focus on testing ViewModel logic, data binding correctness, and service interactions. Aim for high coverage of presentation logic.
    *   **Tools:** NUnit or xUnit for C# unit testing. Mocking frameworks (e.g., Moq) will be used to isolate UI components from their dependencies.
*   **Integration Test Scenarios:**
    *   **UI-ViewModel Integration:** Verify that UI elements correctly bind to ViewModel properties and that user interactions trigger appropriate ViewModel commands.
    *   **Overlay Attachment and Positioning:** Test the `OverlayService`'s ability to detect `Hearthstone.exe`, create the transparent window, and position it correctly.
    *   **Tab Navigation:** Ensure smooth and correct transitions between UI tabs.
    *   **Settings Persistence:** Test that user settings changes are correctly saved to LiteDB and loaded on subsequent application launches.
*   **End-to-End Test Flows:**
    *   **Full UI Interaction:** Simulate user interactions (clicks, drags, keyboard input) across all UI elements and verify correct visual responses and underlying data updates.
    *   **Accessibility Testing:** Automated accessibility checks (if tools are available) and manual testing with screen readers and color-blind simulators to ensure compliance with accessibility requirements.
    *   **Performance Benchmarking:** Measure UI rendering performance and responsiveness under various conditions (e.g., during rapid log updates, window resizing) against the defined performance budgets.
*   **Performance Testing Thresholds:**
    *   UI diff & render: <20 ms
    *   UX: Overlay frame-time overhead < 2 ms on GTX 1060

#### 9. Data Management

*   **Data Lifecycle Policies:**
    *   **User Preferences:** Stored indefinitely in LiteDB until explicitly modified or deleted by the user. No automatic purging.
    *   **UI State (e.g., window position, last active tab):** Persisted across sessions in LiteDB to provide a consistent user experience.
*   **Caching Strategies:**
    *   **UI Resources:** WPF leverages its own caching mechanisms for UI elements and resources. Custom UI elements will be designed for efficient rendering and reuse.
    *   **Card Images:** Card images displayed in the UI will be loaded on demand and cached in memory (or on disk by the OS/WPF) to prevent repeated loading.
*   **Pagination and Infinite Scrolling:** Not directly applicable to the main UI overlay, which focuses on real-time, limited-scope data display. However, future features like detailed historical deck statistics might implement these for large datasets.
*   **Real-time Data Requirements:** The UI must react instantly to real-time data updates from the `LogParser` and `RecommendationEngine` to provide a fluid and responsive user experience. This is achieved through efficient data binding and event-driven updates.

#### 10. Error Handling & Logging

*   **Structured Logging Format:** UI-specific errors (e.g., rendering issues, invalid user input) will be logged using the same structured JSON format as other modules.
    *   **Example UI Log Entry:**
        ```json
        {
            "Timestamp": "2025-06-26T14:35:00.456Z",
            "Level": "Warning",
            "Source": "HearthGem.App.UI",
            "Message": "Window resize outside bounds",
            "CurrentWidth": 450,
            "CurrentHeight": 300
        }
        ```
*   **Error Classification and Prioritization:** UI errors will be classified (e.g., `Critical` for unhandled exceptions leading to restart, `Warning` for minor display glitches or invalid input, `Info` for successful UI operations).
*   **Monitoring and Alerting Thresholds:** Sentry integration will capture UI-related exceptions. Performance metrics (frame rate, responsiveness) will be monitored to detect UI bottlenecks.
*   **Recovery Mechanisms:**
    *   **Auto-Restart Overlay:** If the UI thread encounters an unhandled exception, the application will attempt to gracefully restart the overlay window to restore functionality without requiring a full application restart.
    *   **Fallback UI:** If certain UI elements fail to load or render correctly, fallback content (e.g., placeholder text, default images) will be displayed to prevent a blank or broken interface.
    *   **User Feedback:** Clear, concise error messages will be displayed directly in the UI (e.g., in a status bar or pop-up) to inform the user of issues without overwhelming them.




### Feature 3: Log Parsing & Data Ingestion

**Feature Goal:** To accurately and efficiently monitor, parse, and extract critical game state information from Hearthstone log files in real-time, providing the foundational data for draft analysis, recommendations, and other application features.

**API Relationships:**

*   **HearthGem.App (UI):** Subscribes to events from `HearthGem.LogParser` to update the UI with current game state (e.g., `DRAFT_START`, `CardOfferedEvent`, `CardPickedEvent`).
*   **HearthGem.ML:** Receives parsed game state data (e.g., `DraftState` updates) from `HearthGem.LogParser` to trigger ML inference for recommendations.
*   **HearthGem.Data:** Stores extracted `CARD_ID`s and other relevant game data for persistence and lookup.
*   **HearthGem.ConversationalAI:** May query the current game state as managed by the log parser for context in conversational responses.

**Detailed Feature Requirements:**

1.  **Real-time Log Monitoring:** The system shall continuously monitor `Power.log`, `Arena.log`, `Zone.log`, and `Hearthstone.log` for changes.
2.  **Dynamic Log File Discovery:** The system shall automatically identify and monitor the most current log files within the `M:\Hearthstone\Logs\Hearthstone_YYYY_MM_DD_HH_MM_SS` directory structure.
3.  **Finite-State Machine (FSM) for Draft Tracking:** Implement a robust FSM to accurately track the state of the Arena/Underground draft process (e.g., `DRAFT_START`, `LEGENDARY_GROUP`, `STANDARD_PICK`, `LOSS_DETECTED`, `REDRAFT_5_START`, `RUN_END`).
4.  **Language-Agnostic `CARD_ID` Extraction:** Extract unique, language-agnostic `CARD_ID`s from log entries, regardless of the user's Hearthstone client language.
5.  **Accurate and Timely Data Extraction:** Ensure critical game state data (e.g., offered cards, picked cards, current deck, player class, game mode) is extracted accurately and with minimal latency.
6.  **Robust Error Handling:** Implement comprehensive error handling for log file access issues (e.g., file locked, corrupted logs, partial writes) and provide graceful recovery mechanisms.
7.  **Efficient Processing:** Minimize CPU and memory footprint to ensure efficient processing and avoid performance impact on the Hearthstone game client.

**Detailed Implementation Guide:**

#### 1. System Architecture Overview

*   **High-level Architecture:** The Log Parsing & Data Ingestion component (`HearthGem.LogParser`) operates as an independent service within the application. It continuously reads Hearthstone log files, parses their content, and emits events containing structured game state data. Other modules subscribe to these events to react to game changes.
*   **Technology Stack Selection:**
    *   **C# async file tailer (FileStream + ReadAsync):** Chosen for its efficiency in reading large files asynchronously without blocking the main thread, crucial for real-time monitoring and minimizing performance impact.
    *   **C# (`System.IO.FileSystemWatcher`):** Used for dynamic discovery of new log directories, ensuring the application always monitors the most recent log files.
    *   **Regular Expressions:** For pattern matching and extracting specific data points from log lines.
    *   **Finite-State Machine (FSM) Implementation:** Custom C# classes to manage and transition through draft states.
*   **Deployment Architecture:** The `HearthGem.LogParser` component is bundled directly with the main application executable. It runs as a background service within the same process.
*   **Integration Points:**
    *   **HearthGem.App (UI):** The `DraftViewModel` and other UI components subscribe to events (e.g., `CardOffered`, `DraftStarted`) exposed by `HearthGem.LogParser.HearthstoneLogParser`.
    *   **HearthGem.ML:** The `RecommendationEngine` receives `DraftState` updates, which are constructed by the `LogParser` based on parsed events.
    *   **HearthGem.Data:** The `LogParser` queries `HearthGem.Data.SQLiteRepository` for `CardID` lookups based on localized card names.

#### 2. Database Schema Design

The Log Parsing & Data Ingestion feature primarily interacts with the `Cards` table in `hearthgem.db` (SQLite) for localization handling.

**SQLite (hearthgem.db) - Relevant Tables:**

*   **`Cards` Table:** (As defined in Feature 1, used for mapping localized card names to `CardID`s).
    *   `CardID` (TEXT, PRIMARY KEY)
    *   `LocalizedNames` (JSON TEXT): JSON array of localized names for lookup.

#### 3. Comprehensive API Design

The `HearthGem.LogParser` module will expose a C# interface for its monitoring and event emission capabilities.

**Interface: `ILogParser` (in `HearthGem.Core.Contracts`)**

```csharp
public interface ILogParser
{
    /// <summary>
    /// Event fired when a card offering is detected in the logs.
    /// </summary>
    event EventHandler<CardOfferedEventArgs> CardOffered;

    /// <summary>
    /// Event fired when a card pick is detected in the logs.
    /// </summary>
    event EventHandler<CardPickedEventArgs> CardPicked;

    /// <summary>
    /// Event fired when a draft run starts.
    /// </summary>
    event EventHandler<DraftStartedEventArgs> DraftStarted;

    /// <summary>
    /// Event fired when a game ends.
    /// </summary>
    event EventHandler<GameEndedEventArgs> GameEnded;

    /// <summary>
    /// Event fired when a draft run ends.
    /// </summary>
    event EventHandler<RunEndedEventArgs> RunEnded;

    /// <summary>
    /// Event fired when the FSM state changes.
    /// </summary>
    event EventHandler<FSMStateChangedEventArgs> FSMStateChanged;

    /// <summary>
    /// Event fired when a log parsing error occurs.
    /// </summary>
    event EventHandler<LogParsingErrorEventArgs> LogParsingError;

    /// <summary>
    /// Starts monitoring Hearthstone log files.
    /// </summary>
    /// <param name="logDirectoryPath">The base directory where Hearthstone logs are located (e.g., M:\Hearthstone\Logs).</param>
    Task StartMonitoringAsync(string logDirectoryPath);

    /// <summary>
    /// Stops monitoring Hearthstone log files.
    /// </summary>
    void StopMonitoring();

    /// <summary>
    /// Gets the current state of the draft FSM.
    /// </summary>
    DraftFSMState GetCurrentFSMState();
}

public class CardOfferedEventArgs : EventArgs
{
    public List<string> OfferedCardNames { get; set; } // Localized names
    public string PlayerClass { get; set; }
    public string GameMode { get; set; }
    public int PickIndex { get; set; }
    // ... other relevant context
}

public class CardPickedEventArgs : EventArgs
{
    public string PickedCardName { get; set; } // Localized name
    public List<string> CurrentDeckCardNames { get; set; } // Localized names
    // ... other relevant context
}

// ... other EventArgs classes for other events
```

**Error Handling Strategies:**

*   **`LogParsingErrorEventArgs`:** Critical parsing errors (e.g., unrecoverable malformed log lines) will be emitted via this event, allowing the UI to display warnings and the application to log the issue.
*   **Fallback:** If log files become completely inaccessible, the `ILogParser` will stop emitting events, and the UI will enter a degraded state, potentially falling back to static recommendations.

#### 4. Frontend Architecture

*   **Component Hierarchy:** The UI (`HearthGem.App`) will subscribe to events from `HearthGem.LogParser` to update its `DraftViewModel` and other relevant ViewModels.

    ```
    MainWindow
    ├── StatusBar (displays log parsing status, errors)
    └── DraftView
        ├── CardOfferingsControl (updates based on CardOfferedEvent)
        ├── DeckOverviewControl (updates based on CardPickedEvent)
        └── RunIdentificationDisplay (updates based on DraftStartedEvent)
    ```

*   **Reusable Component Library:** No specific UI components are directly owned by the Log Parsing module, but it provides the data that drives updates in `CardOfferingsControl`, `DeckOverviewControl`, and `RunIdentificationDisplay`.

*   **State Management Strategy:** The `DraftViewModel` will maintain the current `DraftState` by listening to events from `ILogParser`. When `CardOfferedEventArgs` is received, the `DraftViewModel` updates its `OfferedCardNames` property. When `CardPickedEventArgs` is received, it updates `CurrentDeckCardNames` and `PickIndex`. These ViewModel property changes trigger UI updates via data binding.

*   **Routing and Navigation Flow:** The `LogParser` does not directly influence UI navigation, but its `FSMStateChangedEvent` can be used by the `NavigationService` to conditionally show/hide tabs (e.g., show `RedraftView` only when `REDRAFT_5_STARTED` state is active).

*   **Responsive Design Specifications:** The Log Parsing module operates in the background and does not have direct UI elements that require responsive design. It provides the data that responsive UI components consume.

#### 5. Detailed CRUD Operations

For the Log Parsing & Data Ingestion feature, CRUD operations are primarily focused on reading log files and creating/updating internal game state representations.

*   **Create Operation (Internal):**
    *   **Purpose:** To create structured `GameEvent` objects (e.g., `CardOfferedEvent`, `CardPickedEvent`) from raw log lines.
    *   **Trigger:** New lines are detected in monitored log files by the `C# async file tailer`.
    *   **Process:**
        1.  `LogFileMonitor` (in `HearthGem.LogParser`) reads a new line from a log file.
        2.  `HearthstoneLogParser` attempts to parse the line using regular expressions and FSM logic.
        3.  If successful, a corresponding `EventArgs` object (e.g., `CardOfferedEventArgs`) is instantiated with extracted data (e.g., `OfferedCardNames`, `PlayerClass`).
        4.  The `HearthstoneLogParser` then raises the appropriate event (e.g., `CardOffered`).
    *   **Validation Rules:** Log lines must conform to expected patterns. Card names extracted must be mappable to a `CARD_ID` in the `Cards` database. Invalid lines are skipped and logged as errors.
    *   **Required Fields:** Specific patterns and data points are required for each type of game event to be successfully parsed.

*   **Read Operation:**
    *   **Purpose:** To continuously read Hearthstone log files.
    *   **Trigger:** `ILogParser.StartMonitoringAsync()` is called at application startup.
    *   **Process:**
        1.  `LogFileMonitor` identifies the most recent Hearthstone log directory (e.g., `M:\Hearthstone\Logs\Hearthstone_2025_06_23_20_31_30`).
        2.  It then opens `Power.log`, `Arena.log`, `Zone.log`, and `Hearthstone.log` within that directory using `FileStream` with `FileShare.ReadWrite`.
        3.  An `async file tailer` continuously reads new lines from the end of these files using `ReadAsync`.
        4.  `System.IO.FileSystemWatcher` monitors the parent `M:\Hearthstone\Logs` directory for new subdirectories, triggering a re-evaluation of the most current log path.
    *   **Filtering/Pagination/Sorting:** Not applicable, as the system reads the entire stream of new log entries.

*   **Update Operation (Internal):**
    *   **Purpose:** To update the internal `DraftFSM` state based on parsed game events.
    *   **Trigger:** A successfully parsed log event that signifies a state change (e.g., `DRAFT_START`, `LOSS_DETECTED`).
    *   **Process:** The `DraftFSM` (in `HearthGem.LogParser.FSM`) receives the parsed event and transitions to the next appropriate state, updating its internal `CurrentState` property.

*   **Delete Operation:** Not applicable. Log files are read-only for the application, and internal game state representations are transient or managed by other modules.

#### 6. User Experience Flow

*   **User Journey Maps:**
    *   **Application Launch and Log Monitoring:**
        1.  User launches HearthGem.
        2.  HearthGem immediately begins searching for the active Hearthstone log directory.
        3.  If found, a subtle status indicator (e.g., green checkmark in status bar) shows "Monitoring Logs."
        4.  If not found or inaccessible, a warning (e.g., yellow banner) appears: "Hearthstone logs not found/accessible. Please ensure Hearthstone is running and check permissions."
    *   **Draft Event Detection:**
        1.  User enters Arena/Underground in Hearthstone.
        2.  HearthGem detects `DRAFT_START` event from logs.
        3.  UI transitions from idle to active draft display.
    *   **Card Offer/Pick Detection:**
        1.  Hearthstone presents cards.
        2.  HearthGem detects `CardOfferedEvent`.
        3.  UI updates with card recommendations.
        4.  User picks a card.
        5.  HearthGem detects `CardPickedEvent`.
        6.  UI updates deck statistics and mana curve.

*   **Wireframes for Key Screens (Conceptual):**
    *   **Status Bar:** A small bar at the bottom of the overlay window displaying real-time status messages related to log parsing (e.g., "Monitoring Hearthstone Logs," "Log Error: File Access Denied").

*   **State Transitions and Loading States:**
    *   **Log Directory Discovery:** A brief "Searching for Hearthstone logs..." message on startup.
    *   **Parsing Delay:** Due to the real-time nature, parsing is near-instantaneous. Any perceptible delay would be due to Hearthstone writing logs, not the parser itself.
    *   **Error States:** Transition to a prominent error state in the UI (e.g., red banner) if log parsing becomes critical.

*   **Error Handling from User Perspective:**
    *   **Log File Not Found/Accessible:** A persistent, clear message in the status bar or a dedicated error banner, guiding the user to check if Hearthstone is running or to verify file permissions. A "Retry" button might be offered.
    *   **Parsing Errors:** Less critical parsing errors (e.g., malformed lines) will be logged internally but not necessarily shown to the user unless they impact core functionality. If they do, a generic "Some log data could not be processed" message might appear.

#### 7. Security Considerations

*   **Authentication Flow Details:** Not applicable.
*   **Authorization Matrix:** Not applicable.
*   **Data Validation and Sanitization Rules:**
    *   **Log Line Validation:** Strict regular expressions and pattern matching will be used to validate each log line. Any line that does not conform to expected patterns will be discarded, preventing the injection of malicious or malformed data into the application's internal state.
    *   **Card ID Mapping:** The process of mapping localized card names to `CARD_ID`s will include validation to ensure that only known and valid `CARD_ID`s are used internally. Unknown card names will be flagged and potentially ignored or logged.
*   **Protection Against Common Vulnerabilities:**
    *   **Least Privilege Principle:** The application will only request read access to the Hearthstone log directories. It will not attempt to write to or modify these files. This minimizes the attack surface.
    *   **Directory Traversal Prevention:** When constructing log file paths, robust path sanitization will be used to prevent directory traversal attacks, ensuring that the application only accesses files within the designated Hearthstone log directory structure.
    *   **Input Validation:** While log files are generally trusted, treating them as untrusted input and applying strict validation helps prevent unexpected behavior if the log format changes or if a malicious actor were to somehow inject data into the log files.

#### 8. Testing Strategy

A robust testing strategy is essential for the Log Parsing & Data Ingestion module due to its critical role in providing real-time data.

*   **Unit Test Requirements:**
    *   **Scope:** Individual parsing functions (e.g., `ParseCardOfferedLine`), FSM state transition logic (`DraftFSM.Transition`), `CardID` lookup logic, and log file path discovery (`LogFileMonitor.GetLatestLogDirectory`).
    *   **Coverage:** High code coverage for all parsing logic and FSM states.
    *   **Tools:** NUnit or xUnit for C# unit testing. Mocking frameworks (e.g., Moq) will be used to simulate `FileStream` reads and `FileSystemWatcher` events.
*   **Integration Test Scenarios:**
    *   **Simulated Log Files:** Create a suite of simulated Hearthstone log files (including valid, invalid, partial, and multi-line entries) to test the parser's robustness and accuracy.
    *   **End-to-End Log Flow:** Simulate a full draft process by writing log entries to a temporary directory and verifying that the `LogParser` correctly emits all expected events and that the FSM transitions through all states.
    *   **Dynamic Log Discovery:** Test the `FileSystemWatcher` integration by creating new timestamped log directories and verifying that the `LogParser` switches to monitoring the new files.
    *   **Error Recovery:** Test scenarios like file locking, corrupted lines, and unexpected log rotations to ensure graceful degradation and recovery mechanisms function as expected.
*   **End-to-End Test Flows:** (As part of overall application E2E tests)
    *   Launch Hearthstone and HearthGem, perform a full Arena draft, and verify that all UI elements update correctly based on log events.
    *   Simulate a game crash or log file corruption during a draft and observe the application's error handling and recovery.
*   **Performance Testing Thresholds:**
    *   Log tail latency: <5 ms (time from log line written to event emitted).
    *   CPU/Memory Usage: Minimal impact on system resources (e.g., <1% CPU usage when idle, <50MB RAM).

#### 9. Data Management

*   **Data Lifecycle Policies:**
    *   **Log Files:** The application only reads log files. Their lifecycle is managed by Hearthstone itself. The application will only monitor the most current set of logs.
    *   **Internal Game State:** The `DraftState` and other internal representations are transient and updated in real-time. They are not directly persisted by the Log Parsing module but are passed to other modules for their own persistence needs (e.g., `DraftHistory` in LiteDB).
*   **Caching Strategies:**
    *   **CardID Lookup Cache:** An in-memory cache (e.g., `Dictionary<string, string>`) will store recent lookups of localized card names to `CARD_ID`s to avoid repeated database queries.
*   **Pagination and Infinite Scrolling:** Not applicable.
*   **Real-time Data Requirements:** The core function of this module is to provide real-time data. Latency is critical, and the design prioritizes immediate processing and event emission upon detection of new log entries.

#### 10. Error Handling & Logging

*   **Structured Logging Format:** All log parsing events and errors will be logged using the structured JSON format.
    *   **Example Log Entry (JSON):**
        ```json
        {
            "Timestamp": "2025-06-26T14:40:00.789Z",
            "Level": "Info",
            "Source": "HearthGem.LogParser.FSM",
            "Message": "FSM state transition",
            "OldState": "DRAFT_STARTED",
            "NewState": "STANDARD_PICK",
            "TriggerEvent": "CardPickedEvent"
        }
        ```
        ```json
        {
            "Timestamp": "2025-06-26T14:41:00.123Z",
            "Level": "Error",
            "Source": "HearthGem.LogParser.HearthstoneLogParser",
            "Message": "Failed to map localized card name to CARD_ID",
            "LocalizedCardName": "Unknown Card Name",
            "LogLine": "[Zone] ... cardName=Unknown Card Name ..."
        }
        ```
*   **Error Classification and Prioritization:**
    *   **Critical:** Inability to access log files, continuous parsing failures that prevent core functionality. Triggers `LogParsingErrorEventArgs` with a critical level.
    *   **Warning:** Isolated malformed log lines, temporary file access issues. Triggers `LogParsingErrorEventArgs` with a warning level.
    *   **Info:** Successful state transitions, log file discovery.
*   **Monitoring and Alerting Thresholds:** Sentry integration will capture `LogParsingErrorEventArgs` with `Critical` level. Continuous monitoring of log tail latency and CPU/memory usage will be in place.
*   **Recovery Mechanisms:**
    *   **Retry Logic:** For transient file access errors, a retry mechanism with exponential backoff will be implemented.
    *   **FSM Resilience:** The FSM is designed to be resilient to unexpected log entries, skipping unparseable lines and maintaining its current state until a valid transition trigger is found.
    *   **User Notification:** Critical log parsing errors will trigger a prominent UI notification to the user, suggesting troubleshooting steps.




### Feature 4: Machine Learning (ML) / AI Pipeline

**Feature Goal:** To encompass the data sources, feature engineering, model architecture, and training pipeline necessary to generate highly accurate and contextually relevant draft recommendations, serving as the core intelligence of HearthGem.

**API Relationships:**

*   **HearthGem.Data:** This module is the primary consumer of data from `HearthGem.Data` (SQLite for HSReplay, HearthArena, and card data) for model training and inference.
*   **HearthGem.LogParser:** Provides real-time `DraftState` data to the ML pipeline for live inference.
*   **HearthGem.App (UI):** Consumes the recommendations generated by the ML pipeline for display.
*   **HearthGem.ConversationalAI:** May query the ML pipeline for explanations or insights derived from the model.

**Detailed Feature Requirements:**

1.  **Data Sources Integration:** Integrate daily data pulls from HSReplay (free tier) and daily scraped ratings from HearthArena to form the training dataset.
2.  **Comprehensive Feature Engineering:** Generate a rich feature matrix including static card attributes, contextual draft parameters, synergy indicators, and meta-game statistics.
3.  **DNNRegressor Model Architecture:** Utilize a Deep Neural Network (DNN) Regressor with specified layers, ReLU activation, and dropout for robust recommendation generation.
4.  **Automated Training Pipeline:** Implement a nightly GitHub Actions job for automated data download, pre-processing, model training, validation, and promotion.
5.  **High Recommendation Accuracy:** Achieve target metrics for recommendation accuracy (MAE, Spearman ρ, Lift vs. baseline).
6.  **Efficient Model Inference:** Ensure model inference completes within <25 μs per inference on an RTX 3060, leveraging DirectML for GPU acceleration.
7.  **Robust Deployment:** Provide a reliable mechanism for deploying new ML models to client applications, including versioning and rollback capabilities.

**Detailed Implementation Guide:**

#### 1. System Architecture Overview

*   **High-level Architecture:** The ML/AI Pipeline is divided into two main parts: an offline training pipeline (Python-based, running on GitHub Actions) and an online inference component (C#-based, integrated into `HearthGem.ML`). The training pipeline generates the `.tflite` model, which is then bundled with the application for local inference.
*   **Technology Stack Selection:**
    *   **Python (TensorFlow, scikit-learn, pandas, requests, BeautifulSoup):** The primary language and libraries for the offline training pipeline, offering a rich ecosystem for data manipulation, model building, and web scraping.
    *   **TensorFlow-Lite (C API via P/Invoke):** Chosen for its optimized, low-latency inference capabilities on client devices, supporting GPU acceleration.
    *   **C# (.NET 8):** For the online inference component, handling feature engineering, data preparation, and interaction with the TensorFlow-Lite C API.
    *   **SQLite 3:** For storing raw data dumps (HSReplay) and processed features.
    *   **DirectML Delegate:** For GPU acceleration of TensorFlow-Lite inference on Windows devices.
*   **Deployment Architecture:** The trained `.tflite` model is versioned and promoted to a release artifact. It is then included in the MSIX package for application distribution. Model updates are delivered via the application's auto-update mechanism.
*   **Integration Points:**
    *   **Data Sources:** The Python training scripts interact with HSReplay (via web scraping/API) and HearthArena (via web scraping) to gather raw data. This data is then stored in `hearthgem.db` (SQLite).
    *   **HearthGem.Data:** The `HearthGem.ML.RecommendationEngine` queries `HearthGem.Data.SQLiteRepository` to retrieve card data, HSReplay meta, and HearthArena ratings for feature engineering during live inference.
    *   **HearthGem.LogParser:** Provides the real-time `DraftState` to the `RecommendationEngine` for live inference.
    *   **HearthGem.App (UI):** The `DraftViewModel` calls the `RecommendationEngine` to get card recommendations.

#### 2. Database Schema Design

This feature heavily relies on the `hearthgem.db` (SQLite) for storing raw and processed data used in the ML pipeline.

**SQLite (hearthgem.db) - Relevant Tables:**

*   **`Cards` Table:** (As defined in Feature 1, used for static card attributes).
*   **`HSReplayMeta` Table:** (As defined in Feature 1, used for global drawn win-rate percentiles).
*   **`HearthArenaRatings` Table:** (As defined in Feature 1, used for scraped card ratings).
*   **`DraftLogs` Table (New/Expanded):**
    *   `DraftLogID` (TEXT, PRIMARY KEY): Unique ID for each draft run.
    *   `PlayerClass` (TEXT)
    *   `GameMode` (TEXT)
    *   `DraftDate` (DATETIME)
    *   `FinalDecklist` (JSON TEXT): Array of `CardID`s in the final drafted deck.
    *   `Picks` (JSON TEXT): Array of objects, each detailing a pick: `PickIndex`, `OfferedCardIDs`, `PickedCardID`, `RecommendedCardID` (from model).
    *   `WinLossRecord` (TEXT): e.g., "7-3"
    *   `RunOutcome` (TEXT): e.g., "Completed", "Retired"
    *   `Source` (TEXT): e.g., "HSReplay", "HearthGemUser"
*   **`TrainingFeatures` Table (New):**
    *   `FeatureID` (INTEGER, PRIMARY KEY AUTOINCREMENT)
    *   `DraftLogID` (TEXT, FOREIGN KEY REFERENCES `DraftLogs(DraftLogID)`)
    *   `PickIndex` (INTEGER)
    *   `CardID` (TEXT, FOREIGN KEY REFERENCES `Cards(CardID)`)
    *   `FeatureVector` (BLOB/JSON TEXT): Serialized feature vector for the ML model.
    *   `TargetValue` (REAL): The target win-rate for this pick (e.g., actual win rate of the deck after this pick).

**Indexing Strategy:**

*   Indexes on `CardID` in `Cards`, `HSReplayMeta`, `HearthArenaRatings` for fast lookups.
*   Index on `DraftLogID` in `DraftLogs` and `TrainingFeatures` for efficient joining.
*   Indexes on `PickIndex` in `TrainingFeatures` for sequential access.

**Database Migration/Versioning Approach:**

*   Use a lightweight migration framework (e.g., FluentMigrator for C# or Alembic for Python scripts) to manage schema changes for the SQLite database. This ensures that database schema updates are applied incrementally and reliably across different versions of the application and training pipeline.

#### 3. Comprehensive API Design

The ML/AI Pipeline exposes its core functionality through the `IRecommendationEngine` interface (defined in Feature 1). The training pipeline is an offline process and does not expose a runtime API.

**Interface: `IRecommendationEngine` (in `HearthGem.Core.Contracts`)**

(Refer to Feature 1, Section 3 for the interface definition. This interface is the primary programmatic API for interacting with the ML pipeline's inference capabilities.)

**Error Handling Strategies:**

*   **Model Loading Errors:** If the `.tflite` model fails to load (e.g., corrupted file, incompatible version), the `RecommendationEngine` will throw a specific exception (`ModelLoadException`) which the `HearthGem.App` will catch, triggering a fallback to static scores and displaying an error message to the user.
*   **Inference Errors:** If `TensorFlow-Lite` inference encounters an error, a `RecommendationEngineException` will be thrown, indicating a problem with the ML computation. This will also trigger fallback behavior.
*   **Data Dependency Errors:** If required data for feature engineering (e.g., `HSReplayMeta`, `HearthArenaRatings`) is missing or corrupted, the `RecommendationEngine` will attempt to use default values or fallback mechanisms, logging a warning.

#### 4. Frontend Architecture

The ML/AI Pipeline itself does not have a direct frontend component. Its output is consumed by the `HearthGem.App` (UI) for display.

*   **Component Hierarchy:** The `DraftViewModel` (in `HearthGem.App`) interacts with the `RecommendationEngine` (in `HearthGem.ML`).
*   **State Management:** The `DraftViewModel` manages the `DraftState` and updates the UI based on the `CardRecommendation` objects received from the `RecommendationEngine`.

#### 5. Detailed CRUD Operations

CRUD operations for the ML/AI Pipeline primarily revolve around data management for training and the generation of recommendations.

*   **Create Operation (Training Data):**
    *   **Purpose:** To generate and store training data (feature vectors and target values) for the ML model.
    *   **Trigger:** Nightly GitHub Actions job (`nightly_build_and_train.yml`).
    *   **Process:**
        1.  Python scripts (`scrape_heartharena.py`, `update_card_data.py`) download/scrape raw data from HSReplay and HearthArena.
        2.  Raw data is stored in `hearthgem.db` (SQLite).
        3.  Python scripts process raw data, perform feature engineering, and generate `FeatureVector` and `TargetValue` for each pick in historical drafts.
        4.  These are stored in the `TrainingFeatures` table in `hearthgem.db`.
    *   **Validation Rules:** Data consistency checks (e.g., ensuring all features are present, numerical values are within expected ranges). Invalid data points are discarded or flagged.
    *   **Required Fields:** All features defined in the `Feature Matrix` are required for each training example.

*   **Read Operation (Inference Data):**
    *   **Purpose:** To retrieve necessary data for live ML inference.
    *   **Trigger:** `IRecommendationEngine.GetRecommendationsAsync()` call from `DraftViewModel`.
    *   **Process:**
        1.  `RecommendationEngine` receives `DraftState` from `DraftViewModel`.
        2.  `RecommendationEngine` queries `HearthGem.Data.SQLiteRepository` to retrieve:
            *   Static card attributes for `OfferedCardIds` and `CurrentDeckCardIds`.
            *   `HSReplayMeta` data for meta-game features.
            *   `HearthArenaRatings` for fallback or additional features.
        3.  `FeatureExtractor` (in `HearthGem.ML.DataProcessors`) uses this data and the `DraftState` to construct the input tensor for the TensorFlow-Lite model.
    *   **Filtering/Pagination/Sorting:** Efficient indexing on `CardID` and other relevant fields in SQLite ensures fast data retrieval for feature engineering.

*   **Update Operation (Model Training & Promotion):**
    *   **Purpose:** To train a new ML model and promote it for deployment.
    *   **Trigger:** Nightly GitHub Actions job (`nightly_build_and_train.yml`).
    *   **Process:**
        1.  Python script (`train_model.py`) loads `TrainingFeatures` from `hearthgem.db`.
        2.  The DNNRegressor model is trained using TensorFlow.
        3.  The trained model is evaluated against a validation set.
        4.  If performance metrics meet predefined thresholds, the model is converted to `.tflite` format.
        5.  The new `.tflite` model is versioned and uploaded as a GitHub Release artifact.
        6.  The application's auto-update mechanism (MSIX) detects the new release and downloads/installs the updated model.
    *   **Validation Rules:** Model performance metrics (MAE, Spearman ρ, Lift) must meet minimum thresholds for promotion. Model conversion to `.tflite` must be successful.

*   **Delete Operation:**
    *   **Purpose:** To manage historical training data and old model versions.
    *   **Trigger:** Automated cleanup scripts in the GitHub Actions pipeline or manual intervention.
    *   **Process:**
        1.  Old `HSReplayMeta` data (e.g., older than 30 days) can be purged from `hearthgem.db` to manage database size.
        2.  Older `.tflite` model versions can be archived or deleted from release artifacts after a new stable version is deployed and verified.

#### 6. User Experience Flow

*   **User Journey Maps:**
    *   **Initial Model Download/Update:** User launches HearthGem. If a new model version is available, the application downloads it in the background. A subtle progress indicator might be shown in the status bar. If the download fails, the application falls back to the previously installed model.
    *   **Live Recommendation:** As detailed in Feature 1, the ML pipeline operates silently in the background, providing recommendations that are displayed in the UI. The user primarily interacts with the UI, not directly with the ML pipeline.

*   **Wireframes for Key Screens (Conceptual):** No direct UI for the ML pipeline itself, but its output is central to the `DraftView`.

*   **State Transitions and Loading States:**
    *   **Model Loading:** A brief loading state on application startup while the `.tflite` model is loaded into memory. If loading fails, an error message is displayed, and the application falls back to static scores.
    *   **Inference:** The inference process is designed to be so fast (<10ms) that no explicit loading state is needed during live recommendations. The UI updates almost instantaneously.

*   **Error Handling from User Perspective:**
    *   **Model Unavailable:** "Recommendation engine offline. Using static scores." banner displayed prominently in the UI.
    *   **Data Outdated:** "Meta data may be outdated. Connect to internet for updates." banner if HSReplay/HearthArena data cannot be refreshed.

#### 7. Security Considerations

*   **Authentication Flow Details:** Not applicable for the ML pipeline itself.
*   **Authorization Matrix:** Not applicable.
*   **Data Validation and Sanitization Rules:**
    *   **Training Data:** Rigorous validation of all incoming data (HSReplay, HearthArena) to ensure consistency, prevent malformed inputs, and handle missing values. Outliers will be identified and potentially removed or transformed.
    *   **Feature Engineering:** Input features will be validated against expected ranges and types before being fed into the ML model. This prevents numerical instability or crashes.
*   **Protection Against Common Vulnerabilities:**
    *   **Model Tampering:** The `.tflite` model bundled with the application will be part of the code-signed MSIX package, ensuring its integrity. Any tampering would invalidate the signature.
    *   **Data Source Integrity:** While scraping HearthArena carries inherent risks, the application will implement robust parsing and validation to mitigate issues from unexpected format changes. Data from HSReplay will be validated against expected schemas.
    *   **Supply Chain Security:** The GitHub Actions pipeline will use secure practices for dependency management and artifact storage.

#### 8. Testing Strategy

*   **Unit Test Requirements:**
    *   **Scope:** `FeatureExtractor` logic, data loading and preprocessing functions, TensorFlow-Lite C API P/Invoke wrappers.
    *   **Coverage:** High coverage for all data transformation and model input preparation logic.
    *   **Tools:** NUnit or xUnit for C# components. Pytest for Python training scripts.
*   **Integration Test Scenarios:**
    *   **Data Source to Feature Vector:** Test the entire pipeline from raw data (simulated HSReplay/HearthArena data) to generated feature vectors.
    *   **Model Inference Accuracy:** Test the `.tflite` model with a known set of input feature vectors and verify that the output predictions are within an acceptable error margin.
    *   **DirectML Integration:** Verify that GPU acceleration is correctly utilized and provides expected performance benefits.
*   **End-to-End Test Flows:**
    *   **Full Training Pipeline:** Run the entire GitHub Actions workflow to ensure data download, training, and model promotion work as expected.
    *   **Application with New Model:** Deploy a new `.tflite` model with the application and verify that recommendations are generated correctly and performantly.
*   **Performance Testing Thresholds:**
    *   Model inference: <25 μs per inference on RTX 3060.
    *   Overall model loading time: <500 ms at application startup.

#### 9. Data Management

*   **Data Lifecycle Policies:**
    *   **Raw Data (HSReplay, HearthArena):** Stored temporarily in SQLite for training purposes. Older data (e.g., beyond 30 days for HSReplay) can be purged or archived.
    *   **Trained Models:** New models are generated nightly. Only the latest stable version is bundled with the application. Older versions are retained in GitHub Releases for rollback purposes.
*   **Caching Strategies:**
    *   **In-memory Feature Cache:** For live inference, frequently accessed static card features can be cached in memory to reduce database lookups.
    *   **Model Caching:** The `.tflite` model is loaded into memory once at application startup.
*   **Pagination and Infinite Scrolling:** Not applicable for the ML pipeline itself.
*   **Real-time Data Requirements:** The ML inference component requires real-time `DraftState` data from the `LogParser` to provide immediate recommendations.

#### 10. Error Handling & Logging

*   **Structured Logging Format:** All ML pipeline events and errors will be logged using the structured JSON format.
    *   **Example Log Entry (JSON):**
        ```json
        {
            "Timestamp": "2025-06-26T14:45:00.123Z",
            "Level": "Error",
            "Source": "HearthGem.ML.RecommendationEngine",
            "Message": "TensorFlow-Lite inference failed",
            "ExceptionType": "TensorFlowLiteException",
            "ErrorCode": "TF_ERROR_INVALID_ARGUMENT",
            "InputShape": "[1, 128]"
        }
        ```
        ```json
        {
            "Timestamp": "2025-06-26T03:00:00.000Z",
            "Level": "Info",
            "Source": "HearthGem.ML.TrainingPipeline",
            "Message": "New model trained and promoted",
            "ModelVersion": "1.2.0",
            "MAE": 0.05,
            "SpearmanRho": 0.85
        }
        ```
*   **Error Classification and Prioritization:**
    *   **Critical:** Model loading failure, persistent inference errors. Triggers fallback to static scores.
    *   **Warning:** Data scraping issues, minor training pipeline failures (e.g., single data source unavailable).
    *   **Info:** Successful training runs, model promotions.
*   **Monitoring and Alerting Thresholds:** Sentry integration for runtime errors. GitHub Actions workflow monitoring for training pipeline failures. Automated alerts for critical model performance degradation (e.g., if MAE exceeds a threshold).
*   **Recovery Mechanisms:**
    *   **Fallback to Static Scores:** If the ML model cannot be loaded or inference fails, the application will automatically switch to using static HearthArena ratings for recommendations.
    *   **Automated Retraining:** The nightly GitHub Actions job provides an automated recovery mechanism for training failures, attempting to retrain the model on the next scheduled run.
    *   **Model Rollback:** If a newly deployed model causes issues, the MSIX auto-update mechanism or manual intervention can revert to a previous stable version.




### Feature 5: Conversational AI Interface

**Feature Goal:** To provide a natural language interface for users to interact with HearthGem, enabling them to ask questions, receive context-aware recommendations, and get explanations for drafting decisions. This feature will leverage a hybrid approach, combining local NLP capabilities with an optional, user-configured integration with the OpenAI ChatGPT API.

**API Relationships:**

*   **HearthGem.App (UI):** Provides the chat interface for user input and displays AI responses.
*   **HearthGem.LogParser:** Provides real-time `DraftState` and game events as context for conversational queries.
*   **HearthGem.ML:** Provides detailed recommendations and explanations based on its inference, which the Conversational AI can then articulate.
*   **HearthGem.Data:** Provides static card data and user preferences (including ChatGPT API key) for context and configuration.
*   **OpenAI API (External):** Optional integration for advanced natural language understanding and generation, requiring a user-provided API key.

**Detailed Feature Requirements:**

1.  **Natural Language Understanding (NLU):** The system shall accurately interpret user queries, identifying intent (e.g., "recommendation," "explanation," "strategy") and extracting entities (e.g., card names, archetypes, game states).
2.  **Context-Aware Responses:** Responses shall be relevant to the current game state (e.g., current draft, cards offered, player class) and the ongoing conversation.
3.  **Local NLP Processing:** Core conversational capabilities (intent recognition, entity extraction, basic response generation) shall function entirely locally without an internet connection or API key.
4.  **Optional ChatGPT Integration:** Provide a user-configurable option to integrate with the OpenAI ChatGPT API for enhanced conversational capabilities.
5.  **Secure API Key Management:** If ChatGPT is enabled, the user-provided API key shall be securely stored (encrypted) locally and never transmitted or stored externally by HearthGem.
6.  **Intelligent Query Routing:** Queries shall be intelligently routed, prioritizing local ML models for game-specific recommendations and optionally routing broader or more nuanced queries to ChatGPT.
7.  **Clear Response Attribution:** Responses from ChatGPT shall be clearly attributed as such in the UI.
8.  **Robust Error Handling:** Implement robust error handling for API rate limits, network issues, and invalid API keys for the ChatGPT integration.

**Detailed Implementation Guide:**

#### 1. System Architecture Overview

*   **High-level Architecture:** The Conversational AI Interface (`HearthGem.ConversationalAI`) acts as an intermediary between the user (via `HearthGem.App`) and the underlying intelligence modules (`HearthGem.ML`, `HearthGem.Data`). It comprises a local NLP engine and an optional external API client for ChatGPT.
*   **Technology Stack Selection:**
    *   **C# (.NET 8):** For implementing the local NLP logic, managing conversational flow, and interacting with the ChatGPT API.
    *   **Lightweight NLP Models/Libraries:** For local intent recognition and entity extraction, potentially using ONNX Runtime for pre-trained models or custom rule-based parsers.
    *   **`System.Net.Http.HttpClient`:** For secure communication with the OpenAI API (HTTPS).
    *   **JSON Serialization/Deserialization:** For handling data exchange with the OpenAI API.
*   **Deployment Architecture:** The `HearthGem.ConversationalAI` module is bundled with the main application. Local NLP models are included in the application package. The ChatGPT integration is activated only if the user provides and enables an API key.
*   **Integration Points:**
    *   **HearthGem.App (UI):** The `ConversationalAIView` sends user input to `IConversationalAI.SendQueryAsync()` and displays the returned responses.
    *   **HearthGem.LogParser:** The `ConversationManager` (in `HearthGem.ConversationalAI`) can query the `ILogParser` for the current `DraftState` to provide context to both local NLP and ChatGPT.
    *   **HearthGem.ML:** The `ConversationManager` can call `IRecommendationEngine.GetRecommendationExplanationAsync()` or `GetRecommendationsAsync()` based on user intent.
    *   **HearthGem.Data:** The `ConversationManager` retrieves the `ChatGPTApiKey` and `EnableChatGPT` flag from `LiteDbRepository`.

#### 2. Database Schema Design

The Conversational AI Interface primarily interacts with the `UserPreferences` collection in `LiteDB` for storing the ChatGPT API key and user settings.

**LiteDB (user_preferences.db) - Relevant Collections:**

*   **`UserPreferences` Collection:**
    *   `_id` (ObjectId, PRIMARY KEY)
    *   `ChatGPTApiKey` (TEXT): Encrypted OpenAI API key.
    *   `EnableChatGPT` (BOOLEAN): Flag to enable/disable ChatGPT integration.
    *   `ConversationHistory` (ARRAY of JSON): Stores recent chat messages for context (optional, with user consent).

#### 3. Comprehensive API Design

The `HearthGem.ConversationalAI` module will expose a C# interface for interaction with the UI and other modules.

**Interface: `IConversationalAI` (in `HearthGem.Core.Contracts`)**

```csharp
public interface IConversationalAI
{
    /// <summary>
    /// Sends a user query to the conversational AI and gets a response.
    /// </summary>
    /// <param name="query">The user's natural language query.</param>
    /// <param name="currentDraftState">The current state of the draft for context.</param>
    /// <returns>The AI's response.</returns>
    Task<AIResponse> SendQueryAsync(string query, DraftState currentDraftState);

    /// <summary>
    /// Sets the OpenAI ChatGPT API key.
    /// </summary>
    /// <param name="apiKey">The API key to set.</param>
    Task SetChatGPTApiKeyAsync(string apiKey);

    /// <summary>
    /// Enables or disables ChatGPT integration.
    /// </summary>
    /// <param name="enable">True to enable, false to disable.</param>
    Task SetChatGPTIntegrationEnabledAsync(bool enable);

    /// <summary>
    /// Checks if ChatGPT integration is currently enabled and configured.
    /// </summary>
    bool IsChatGPTEnabledAndConfigured { get; }
}

public class AIResponse
{
    public string Text { get; set; }
    public bool IsChatGPTResponse { get; set; }
    public string ErrorMessage { get; set; } // For API errors
}
```

**External API: OpenAI ChatGPT API**

*   **Endpoint:** `https://api.openai.com/v1/chat/completions`
*   **Method:** `POST`
*   **Headers:**
    *   `Authorization: Bearer YOUR_API_KEY`
    *   `Content-Type: application/json`
*   **Request Body (JSON):**
    ```json
    {
      "model": "gpt-3.5-turbo", // or other suitable model
      "messages": [
        {"role": "system", "content": "You are a helpful Hearthstone Arena assistant. Provide concise and accurate advice based on the current game context."},
        {"role": "user", "content": "<user_query>"}
      ],
      "temperature": 0.7
    }
    ```
    *   The `system` message will be dynamically constructed to include relevant `DraftState` context (e.g., current class, cards in hand, archetype).
*   **Response Body (JSON):**
    ```json
    {
      "id": "chatcmpl-...",
      "object": "chat.completion",
      "created": 1677652288,
      "model": "gpt-3.5-turbo-0125",
      "choices": [
        {
          "index": 0,
          "message": {
            "role": "assistant",
            "content": "<AI_response_text>"
          },
          "logprobs": null,
          "finish_reason": "stop"
        }
      ],
      "usage": {
        "prompt_tokens": 10,
        "completion_tokens": 10,
        "total_tokens": 20
      }
    }
    ```

**Error Handling Strategies:**

*   **Local NLP Errors:** If the local NLP module fails to understand an intent or extract entities, it will return a generic "I didn't quite understand that. Can you rephrase?" message.
*   **ChatGPT API Errors:**
    *   **Invalid API Key:** The `ChatGPTClient` will catch authentication errors (HTTP 401) and return an `AIResponse` with an `ErrorMessage` indicating an invalid key.
    *   **Rate Limits:** Catch HTTP 429 errors and return an `AIResponse` with an `ErrorMessage` suggesting the user wait and retry.
    *   **Network Issues:** Catch `HttpRequestException` and return an `AIResponse` with an `ErrorMessage` indicating a network problem.
    *   **API Response Parsing Errors:** If the API returns an unexpected format, log the error and return a generic error message.

#### 4. Frontend Architecture

*   **Component Hierarchy:** The `ConversationalAIView` will be a dedicated UI component, likely integrated as a collapsible panel or a separate tab within the main `MainWindow`.

    ```
    MainWindow
    └── ConversationalAIView
        ├── ChatHistoryDisplay (ScrollViewer + ItemsControl for messages)
        │   ├── UserMessageBubble (UserControl)
        │   └── AIMessageBubble (UserControl)
        │       └── AttributionText (e.g., "(via ChatGPT)")
        ├── TextInputBox (TextBox for user input)
        └── SendButton (Button)
    ```

*   **Reusable Component Library:**
    *   `UserMessageBubble`: Displays user's chat messages.
    *   `AIMessageBubble`: Displays AI's responses, including optional attribution for ChatGPT.

*   **State Management Strategy:** The `ConversationalAIViewModel` will manage the `ObservableCollection<ChatMessage>` (where `ChatMessage` is a custom class with `Sender`, `Text`, `IsChatGPTResponse` properties) that binds to the `ChatHistoryDisplay`. User input from `TextInputBox` will be bound to a `QueryText` property.

*   **Routing and Navigation Flow:** The `ConversationalAIView` will be accessible via a dedicated button or tab. It will not directly influence the main application navigation but will provide a communication channel.

*   **Responsive Design Specifications:** The `ConversationalAIView` will be designed to be resizable, with the `ChatHistoryDisplay` expanding to fill available space and the `TextInputBox` and `SendButton` remaining at the bottom. Text wrapping will be enabled for chat messages.

#### 5. Detailed CRUD Operations

For the Conversational AI Interface, CRUD operations primarily involve managing user queries, AI responses, and the ChatGPT API key.

*   **Create Operation (Query/Response):**
    *   **Purpose:** To send a user query and receive an AI response.
    *   **Trigger:** User types a message in `TextInputBox` and clicks `SendButton` or presses Enter.
    *   **Process:**
        1.  `ConversationalAIViewModel` calls `IConversationalAI.SendQueryAsync(queryText, currentDraftState)`.
        2.  `ConversationManager` (in `HearthGem.ConversationalAI`):
            *   Performs local NLP (intent recognition, entity extraction).
            *   If the intent is a game-specific recommendation/explanation, it calls `IRecommendationEngine`.
            *   If `IsChatGPTEnabledAndConfigured` is true and the query is broader, it calls `ChatGPTClient.SendChatCompletionAsync()`.
            *   Constructs an `AIResponse` object.
        3.  `ConversationalAIViewModel` adds both the user's query and the `AIResponse` to its `ObservableCollection<ChatMessage>`.
    *   **Validation Rules:** User query text length. API key format validation before storage.
    *   **Required Fields:** User query text.

*   **Read Operation (History/Settings):**
    *   **Purpose:** To display conversation history and retrieve ChatGPT API key/settings.
    *   **Trigger:** `ConversationalAIView` loads, user navigates to settings.
    *   **Process:**
        1.  `ConversationalAIViewModel` loads `ConversationHistory` from `UserPreferences` (if persisted).
        2.  `SettingsViewModel` loads `ChatGPTApiKey` and `EnableChatGPT` from `UserPreferences` for display in settings UI.
    *   **Filtering/Pagination/Sorting:** Not applicable for current scope. Conversation history might be limited to a certain number of recent messages.

*   **Update Operation (API Key/Settings):**
    *   **Purpose:** To allow the user to configure ChatGPT integration.
    *   **Trigger:** User changes API key or toggle in `SettingsView`.
    *   **Process:**
        1.  `SettingsViewModel` calls `IConversationalAI.SetChatGPTApiKeyAsync(newKey)` and `SetChatGPTIntegrationEnabledAsync(enable)`.
        2.  `ConversationManager` encrypts and saves the `newKey` to `UserPreferences` in LiteDB and updates the `EnableChatGPT` flag.
    *   **Validation Rules:** API key format validation.

*   **Delete Operation (API Key/History):**
    *   **Purpose:** To remove the stored ChatGPT API key or clear conversation history.
    *   **Trigger:** User action in `SettingsView` (e.g., "Clear API Key," "Clear Chat History").
    *   **Process:**
        1.  `SettingsViewModel` calls `IConversationalAI.SetChatGPTApiKeyAsync(string.Empty)` to clear the key.
        2.  `ConversationalAIViewModel` clears its `ObservableCollection<ChatMessage>` and removes `ConversationHistory` from `UserPreferences`.

#### 6. User Experience Flow

*   **User Journey Maps:**
    *   **Asking a Game-Specific Question (Local AI):**
        1.  User opens `ConversationalAIView`.
        2.  User types: "Should I pick this card?" (while a card offering is active).
        3.  `ConversationalAIViewModel` sends query with current `DraftState` to `IConversationalAI`.
        4.  `ConversationManager` identifies "recommendation" intent, calls `IRecommendationEngine`.
        5.  `IRecommendationEngine` returns recommendation.
        6.  `ConversationalAIViewModel` displays AI response: "Yes, pick Card X. It significantly improves your mana curve."
    *   **Asking a General Question (ChatGPT):**
        1.  User opens `ConversationalAIView`.
        2.  User types: "What's the best strategy for playing against a Mage in Arena?" (ChatGPT enabled).
        3.  `ConversationalAIViewModel` sends query with current `DraftState` to `IConversationalAI`.
        4.  `ConversationManager` identifies general strategy intent, routes to `ChatGPTClient` with context.
        5.  `ChatGPTClient` sends query to OpenAI API, receives response.
        6.  `ConversationalAIViewModel` displays AI response: "(via ChatGPT) Against Mage, prioritize early board control..."
    *   **Configuring ChatGPT API Key:**
        1.  User navigates to `SettingsView`.
        2.  User finds "Conversational AI" section.
        3.  User inputs API key into encrypted text field.
        4.  User toggles "Enable ChatGPT Integration" checkbox.
        5.  `SettingsViewModel` calls `IConversationalAI.SetChatGPTApiKeyAsync()` and `SetChatGPTIntegrationEnabledAsync()`.
        6.  Confirmation message appears: "ChatGPT integration enabled/disabled."

*   **Wireframes for Key Screens (Conceptual):**
    *   **Conversational AI Panel:**
        *   Top: Title "HearthGem AI Chat" and a toggle/button to collapse/expand.
        *   Middle: Scrollable chat history area, with alternating bubbles for user and AI messages. AI messages from ChatGPT have a small "(via ChatGPT)" attribution.
        *   Bottom: Text input field for user queries and a "Send" button.
    *   **Settings - Conversational AI Section:**
        *   Label: "OpenAI ChatGPT API Key:"
        *   Input field: PasswordBox or masked TextBox for API key.
        *   Button: "Save Key" or "Clear Key."
        *   Checkbox: "Enable ChatGPT Integration."
        *   Info text: "Using ChatGPT may incur costs. Refer to OpenAI pricing."

*   **State Transitions and Loading States:**
    *   **Sending Query:** While waiting for AI response, the `TextInputBox` is disabled, and a small loading indicator appears next to the `SendButton`.
    *   **ChatGPT API Errors:** Error messages appear directly in the chat history as an AI message, clearly stating the issue (e.g., "ChatGPT Error: Invalid API Key. Please check your settings.").

*   **Error Handling from User Perspective:**
    *   **Local AI Failure:** "I'm sorry, I couldn't process that request. Please try again." or "My local knowledge is limited on that topic."
    *   **ChatGPT API Errors:** Specific error messages as detailed above, guiding the user to resolve the issue (e.g., check internet, check API key, wait for rate limit reset).

#### 7. Security Considerations

*   **Authentication Flow Details:** Not applicable for the AI itself. User provides their own API key for external service.
*   **Authorization Matrix:** Not applicable.
*   **Data Validation and Sanitization Rules:**
    *   **API Key Validation:** The user-provided ChatGPT API key will be validated for its format (e.g., expected length, character set) before encryption and storage. This is a basic sanity check, as full validation can only be done by attempting an API call.
    *   **User Query Sanitization:** While user queries are sent to an external service (ChatGPT), basic sanitization (e.g., trimming whitespace) will be applied. However, the primary responsibility for handling malicious input from the user side rests with the external API provider.
*   **Protection Against Common Vulnerabilities:**
    *   **Secure API Key Storage:** The ChatGPT API key will be encrypted using AES-256 (or similar strong algorithm) before being stored in LiteDB. The encryption key will be derived from machine-specific identifiers to prevent the key from being easily moved to another machine. This ensures that even if the LiteDB file is compromised, the API key is not immediately readable.
    *   **HTTPS Communication:** All communication with the OpenAI API will strictly use HTTPS to ensure data encryption in transit, protecting the API key and query/response content from eavesdropping.
    *   **No API Key Logging:** The raw API key will never be logged to files or sent to error reporting services (e.g., Sentry). Only masked versions (e.g., `sk-****abcd`) might be used for debugging purposes if absolutely necessary.
    *   **User Consent:** Clear user consent will be obtained before enabling ChatGPT integration, informing them about potential costs and data sharing with OpenAI.

#### 8. Testing Strategy

*   **Unit Test Requirements:**
    *   **Scope:** `IntentRecognizer`, `EntityExtractor` (local NLP), `ChatGPTClient` (mocking OpenAI API responses), `ConversationManager` logic (query routing, context management), API key encryption/decryption.
    *   **Coverage:** High coverage for local NLP parsing rules, API client request/response handling, and secure storage logic.
    *   **Tools:** NUnit or xUnit for C# unit testing. Mocking frameworks (e.g., Moq) for external API calls and internal dependencies.
*   **Integration Test Scenarios:**
    *   **Local NLP End-to-End:** Simulate user queries and verify that local NLP correctly identifies intents and entities, and triggers appropriate calls to `IRecommendationEngine`.
    *   **ChatGPT Integration:** Test with a valid API key (using a test account) to ensure successful communication with OpenAI, correct query routing, and proper response parsing. Test error scenarios (invalid key, rate limits).
    *   **Contextual Understanding:** Test that `DraftState` context is correctly passed to both local NLP and ChatGPT for relevant responses.
*   **End-to-End Test Flows:**
    *   **Full Conversational Flow:** Simulate a user conversation, including game-specific questions and general queries, verifying correct AI responses and UI updates.
    *   **Settings Configuration:** Test enabling/disabling ChatGPT integration and saving/clearing API keys.
*   **Performance Testing Thresholds:**
    *   Local NLP inference: <50 ms.
    *   ChatGPT API call latency: Dependent on network and OpenAI service, but the application should remain responsive during the wait.

#### 9. Data Management

*   **Data Lifecycle Policies:**
    *   **ChatGPT API Key:** Stored encrypted in LiteDB until cleared by the user or application uninstallation.
    *   **Conversation History:** Stored in LiteDB (optional, with user consent) for the current session or a limited number of past sessions. Can be cleared by the user.
*   **Caching Strategies:**
    *   **Local NLP Models:** Loaded into memory at application startup.
    *   **ChatGPT Responses:** Short-term caching of recent ChatGPT responses for identical queries might be considered to reduce API calls, but this needs careful design to avoid stale information.
*   **Pagination and Infinite Scrolling:** For conversation history, a simple scrollable view with a limited history size will be implemented. No complex pagination is anticipated.
*   **Real-time Data Requirements:** The Conversational AI needs real-time `DraftState` from the `LogParser` to provide contextually relevant answers.

#### 10. Error Handling & Logging

*   **Structured Logging Format:** All Conversational AI events and errors will be logged using the structured JSON format.
    *   **Example Log Entry (JSON):**
        ```json
        {
            "Timestamp": "2025-06-26T14:50:00.123Z",
            "Level": "Info",
            "Source": "HearthGem.ConversationalAI.ConversationManager",
            "Message": "User query processed",
            "Query": "Should I pick this card?",
            "Intent": "Recommendation",
            "ResponseSource": "LocalML"
        }
        ```
        ```json
        {
            "Timestamp": "2025-06-26T14:51:00.456Z",
            "Level": "Error",
            "Source": "HearthGem.ConversationalAI.ChatGPTClient",
            "Message": "OpenAI API call failed",
            "StatusCode": 401,
            "ResponseContent": "{\"error\":{\"message\":\"Incorrect API key provided...\"}}",
            "MaskedApiKey": "sk-****abcd"
        }
        ```
*   **Error Classification and Prioritization:**
    *   **Critical:** Persistent failure to communicate with OpenAI API (if enabled), local NLP model loading failure.
    *   **Warning:** Transient network issues, rate limits hit, minor parsing errors in API responses.
    *   **Info:** Successful query processing, API key changes.
*   **Monitoring and Alerting Thresholds:** Sentry integration for runtime errors. Monitoring of API call success rates and latency (if enabled).
*   **Recovery Mechanisms:**
    *   **Fallback to Local AI:** If ChatGPT integration fails or is disabled, the system will attempt to answer queries using its local NLP capabilities.
    *   **User Notification:** Clear error messages in the chat UI guide the user to resolve issues (e.g., check API key, internet connection).




### Feature 6: Data Management, Performance & Error Handling

**Feature Goal:** To ensure the efficient management of data, optimal application performance, and robust error handling across all modules, providing a stable, reliable, and responsive user experience.

**API Relationships:**

*   **All Modules:** This feature underpins the operation of all other modules by defining how data is managed, performance is budgeted, and errors are handled.

**Detailed Feature Requirements:**

1.  **Data Caching:** Implement caching mechanisms for frequently accessed data, including HSReplay stats (last 28 days, ~60 MB) and in-memory caches for card data and ML models.
2.  **Performance Budget Adherence:** Adhere to strict performance budgets for critical operations:
    *   Log tail latency: <5 ms
    *   ML model inference: <10 ms
    *   UI diff & render: <20 ms
    *   Overall margin: 15 ms
3.  **Graceful Degradation:** Implement graceful degradation mechanisms for external service unavailability (e.g., HSReplay API unreachable, local ML model not found), falling back to static scores or cached data.
4.  **Robustness:** Ensure all disk writes are asynchronous, implement comprehensive `try/catch` blocks with logging, and provide an auto-restart mechanism for the UI overlay in case of unhandled exceptions.
5.  **Structured Logging:** Implement a structured logging format (e.g., JSON) across the entire application for efficient error reporting and diagnostics.
6.  **Error Classification and Prioritization:** Categorize errors (Critical, Warning, Info, Debug) and prioritize their handling and alerting.
7.  **Monitoring and Alerting:** Integrate with Sentry SDK for error reporting and establish thresholds for monitoring key performance indicators and error rates.
8.  **Recovery Mechanisms:** Implement retry logic for transient errors and define clear recovery paths for critical failures.

**Detailed Implementation Guide:**

#### 1. System Architecture Overview

*   **High-level Architecture:** Data Management, Performance, and Error Handling are cross-cutting concerns implemented across all modules. A centralized logging service (`HearthGem.Common.LoggingService`) will be responsible for structured logging. Performance monitoring will be integrated into key components. Data caching will be managed by individual data access layers and specific service implementations.
*   **Technology Stack Selection:**
    *   **C# (`async/await`):** For asynchronous operations, particularly disk writes and network calls, to maintain UI responsiveness.
    *   **LiteDB/SQLite:** Chosen for their embedded nature and performance for local data storage and caching.
    *   **Sentry SDK:** For robust error reporting and crash analytics.
    *   **WPF (`D3DImage`):** For performant UI rendering, contributing to the overall performance budget.
*   **Deployment Architecture:** Error reporting and performance monitoring components are bundled with the application. Configuration for these (e.g., Sentry DSN) will be part of the application settings.
*   **Integration Points:**
    *   **All Modules:** Will utilize the `LoggingService` for emitting structured logs.
    *   **Data Modules:** Will implement caching strategies.
    *   **UI Module:** Will display status and error messages based on system health.

#### 2. Database Schema Design

This feature primarily defines how data is managed and accessed rather than introducing new schema elements, but it impacts the design of existing tables.

**SQLite (hearthgem.db) / LiteDB (user_preferences.db):**

*   **Indexing Strategy:** Ensure appropriate indexes are defined on frequently queried columns (e.g., `CardID`, `DraftLogID`, `Timestamp`) to optimize read performance.
*   **Data Retention Policies:** Implement mechanisms to purge or archive old data (e.g., HSReplay meta data older than 30 days) to manage database size and maintain performance.

#### 3. Comprehensive API Design

This feature defines internal APIs for logging and error reporting, and influences the design of existing APIs to include performance and error handling considerations.

**Interface: `ILoggingService` (in `HearthGem.Common`)**

```csharp
public interface ILoggingService
{
    void LogInfo(string source, string message, object properties = null);
    void LogWarning(string source, string message, object properties = null);
    void LogError(string source, string message, Exception exception = null, object properties = null);
    void LogCritical(string source, string message, Exception exception = null, object properties = null);
    void LogDebug(string source, string message, object properties = null);
}
```

**Error Handling Strategies (Cross-cutting):**

*   **Exception Handling:** Use `try-catch` blocks at appropriate boundaries (e.g., I/O operations, ML inference calls, network requests) to gracefully handle exceptions. Unhandled exceptions will be caught at the application level and reported to Sentry.
*   **Return Types:** APIs will return clear status indicators or custom result objects (e.g., `OperationResult<T>`) that encapsulate success/failure, data, and error messages, rather than solely relying on exceptions for control flow.

#### 4. Frontend Architecture

*   **Component Hierarchy:** The UI will include a `StatusBar` or `NotificationBar` component to display real-time status messages, warnings, and error banners.

    ```
    MainWindow
    ├── ... (other UI components)
    └── StatusBar (UserControl)
        ├── StatusText (TextBlock)
        ├── ErrorIcon (Image, visible on error)
        └── RetryButton (Button, for certain errors)
    ```

*   **State Management Strategy:** The `MainWindowViewModel` or a dedicated `StatusViewModel` will subscribe to error events from the `ILoggingService` and update the `StatusBar` properties accordingly.

*   **Responsive Design Specifications:** The `StatusBar` will be designed to be non-intrusive and adapt to window resizing, ensuring messages are always visible and readable.

#### 5. Detailed CRUD Operations

This feature primarily involves the *reporting* and *management* of operational data (logs, performance metrics) rather than traditional CRUD on user data.

*   **Create Operation (Logs/Metrics):**
    *   **Purpose:** To generate structured log entries and performance metrics.
    *   **Trigger:** Any significant event, error, or completion of a critical operation within any module.
    *   **Process:** Modules call `ILoggingService.LogX()` methods, which format the data into JSON and write it to a local log file and/or send it to Sentry (if configured).
    *   **Validation Rules:** Log messages and properties are validated for format and size before being written.

*   **Read Operation (Logs/Metrics):**
    *   **Purpose:** To retrieve log entries for debugging or analysis.
    *   **Trigger:** Developer/support team accessing local log files or Sentry dashboard.
    *   **Process:** Log files are read by external tools. Sentry dashboard provides a web interface for querying and analyzing reported errors.

*   **Update Operation:** Not applicable for logs (they are immutable once written). Performance thresholds might be updated in configuration.

*   **Delete Operation:**
    *   **Purpose:** To manage log file size and data retention.
    *   **Trigger:** Automated log rotation policies (e.g., delete logs older than 7 days) or user-initiated data deletion.
    *   **Process:** Old log files are periodically deleted from the local file system. Sentry data retention policies are configured on the Sentry platform.

#### 6. User Experience Flow

*   **User Journey Maps:**
    *   **Normal Operation:** User sees a subtle "Monitoring Logs" or "Ready" message in the status bar.
    *   **Graceful Degradation:** If HSReplay data is unavailable, a yellow banner appears: "Data updates unavailable. Using cached data." Recommendations might still appear, but with a clear indication of their source.
    *   **Critical Error:** A red banner appears: "Critical Error: Log files inaccessible. Please restart Hearthstone or check permissions." A link to troubleshooting or a "Report Issue" button might be present.

*   **Wireframes for Key Screens (Conceptual):**
    *   **Status Bar:** (As described in Frontend Architecture, Section 4)
    *   **Error Dialog:** A modal dialog for unrecoverable errors, providing an error code, message, and options to restart or report.

*   **State Transitions and Loading States:**
    *   **Performance Monitoring:** No direct UI state, but internal metrics are continuously collected. If a performance budget is exceeded, a warning might be logged.
    *   **Error State:** Transition from normal UI to an error state (e.g., banner, disabled features) upon detection of critical issues.

*   **Error Handling from User Perspective:**
    *   **Clear Messaging:** Error messages will be concise, actionable, and avoid technical jargon where possible.
    *   **Contextual Help:** Error messages will link to relevant troubleshooting guides or FAQs.
    *   **Non-blocking:** Most errors will be displayed in a non-blocking manner (e.g., banners) to allow the user to continue using available functionality.

#### 7. Security Considerations

*   **Authentication/Authorization:** Not directly applicable.
*   **Data Validation and Sanitization Rules:** All data processed and logged will be sanitized to prevent log injection or other vulnerabilities. Sensitive information (e.g., API keys, PII) will be masked or excluded from logs.
*   **Protection Against Common Vulnerabilities:**
    *   **Secure Logging:** Ensure logs do not contain sensitive user data (e.g., API keys, full IP addresses, personal identifiers) unless explicitly consented to and anonymized/encrypted.
    *   **Crash Reporting:** Sentry SDK will be configured to anonymize or exclude PII by default. Users will be informed about what data is collected and given options to opt-out.
    *   **Asynchronous Operations:** Using `async/await` for I/O operations prevents UI freezing, which can be exploited in some denial-of-service scenarios.

#### 8. Testing Strategy

*   **Unit Test Requirements:**
    *   **Scope:** `LoggingService` (ensuring correct formatting and output), caching mechanisms, individual error handling routines.
    *   **Coverage:** High coverage for all error paths and fallback logic.
    *   **Tools:** NUnit or xUnit.
*   **Integration Test Scenarios:**
    *   **Sentry Integration:** Test that exceptions are correctly captured and reported to Sentry.
    *   **Performance Budget Compliance:** Automated tests to measure and verify that critical operations (log tail, ML inference, UI render) stay within their defined budgets.
    *   **Graceful Degradation:** Simulate network outages or corrupted files and verify that the application correctly enters degraded states and provides appropriate user feedback.
*   **End-to-End Test Flows:**
    *   **Stress Testing:** Simulate high load (e.g., rapid log updates) to identify performance bottlenecks.
    *   **Fault Injection:** Introduce errors (e.g., kill a process, corrupt a file) to test the robustness and recovery mechanisms.
*   **Performance Testing Thresholds:** (As defined in Detailed Feature Requirements, Section 2)

#### 9. Data Management

*   **Data Lifecycle Policies:**
    *   **Application Logs:** Local logs will be rotated and purged based on size or age (e.g., keep last 7 days or 100MB). Sentry data retention will be configured on the platform.
    *   **Cached Data:** Caches (e.g., HSReplay stats) will be refreshed periodically. Old cached data will be overwritten.
*   **Caching Strategies:**
    *   **HSReplay Stats:** Cached in SQLite for 28 days. Refreshed daily.
    *   **Card Data:** Loaded into an in-memory cache for fast access.
    *   **ML Model:** Loaded into memory at startup.
*   **Pagination and Infinite Scrolling:** Not directly applicable.
*   **Real-time Data Requirements:** Performance budgets are designed to ensure real-time responsiveness for all critical data flows.

#### 10. Error Handling & Logging

*   **Structured Logging Format:** (As detailed in previous features, this is a consistent cross-cutting concern).
*   **Error Classification and Prioritization:** (As detailed in previous features, this is a consistent cross-cutting concern).
*   **Monitoring and Alerting Thresholds:** (As detailed in previous features, this is a consistent cross-cutting concern).
*   **Recovery Mechanisms:**
    *   **Automated Retries:** For transient errors (e.g., network, file access), implement retry logic with exponential backoff.
    *   **Circuit Breaker Pattern:** For external dependencies (e.g., HSReplay API, ChatGPT API), consider implementing a circuit breaker to prevent repeated calls to a failing service, allowing it to recover.
    *   **Application-level Exception Handling:** A global exception handler will catch unhandled exceptions, log them, and attempt a graceful shutdown or UI restart.




### Feature 7: Future Features (Post-MVP)

**Feature Goal:** To outline potential enhancements and expansions to HearthGem beyond the Minimum Viable Product (MVP), ensuring a clear roadmap for future development and continued value delivery to users. These features will build upon the established architecture and data foundation.

**API Relationships:**

*   **All Core Modules:** Future features will interact with and extend the capabilities of existing modules like `HearthGem.Data`, `HearthGem.ML`, `HearthGem.App`, and `HearthGem.ConversationalAI`.
*   **External APIs (New):** Community features may introduce new external API relationships for data sharing or social integration.

**Detailed Feature Requirements:**

1.  **Deck Statistics Dashboard Enhancements:** Expand the Deck Stats tab to provide more in-depth analysis and historical data.
    *   Historical win-rate tracking for specific deck archetypes.
    *   Comparison of user's draft performance against global averages.
    *   Detailed breakdown of card performance within drafted decks.
2.  **Advanced Archetype Customization:** Allow users to create and save their own custom archetype profiles.
    *   User-defined archetype parameters (e.g., preferred mana curve, minion/spell ratio, specific card synergies).
    *   Ability to import/export custom archetypes.
    *   Integration with the ML model to bias recommendations based on custom archetypes.
3.  **Community Features & Sharing:** Enable users to share their draft results, custom archetypes, and insights with a community.
    *   Secure sharing of draft logs and decklists.
    *   Leaderboards for draft performance.
    *   Forum or chat integration for community discussion.

**Detailed Implementation Guide:**

#### 1. System Architecture Overview

*   **High-level Architecture:** Future features will generally extend existing modules. For example, Deck Statistics Enhancements will primarily extend `HearthGem.Data` and `HearthGem.App`. Advanced Archetype Customization will extend `HearthGem.Data`, `HearthGem.App`, and `HearthGem.ML`. Community Features will likely introduce a new backend service component.
*   **Technology Stack Selection:** Will primarily leverage the existing .NET 8, WPF, SQLite, LiteDB, and TensorFlow-Lite stack. Community features may introduce ASP.NET Core for backend APIs and cloud databases.
*   **Deployment Architecture:** New features will be deployed via the existing MSIX auto-update mechanism. Backend services for community features would require separate cloud deployment.
*   **Integration Points:** New UI components will integrate with existing ViewModels and services. New data models will extend existing database schemas. ML models may require retraining or fine-tuning to incorporate new features.

#### 2. Database Schema Design

Future features will require extensions to the existing `hearthgem.db` (SQLite) and `user_preferences.db` (LiteDB) schemas.

**SQLite (hearthgem.db) - Extensions for Deck Statistics Dashboard:**

*   **`DraftRuns` Table (Expanded from `DraftLogs`):**
    *   `RunID` (TEXT, PRIMARY KEY)
    *   `PlayerClass` (TEXT)
    *   `GameMode` (TEXT)
    *   `DraftDate` (DATETIME)
    *   `FinalDecklist` (JSON TEXT): Array of `CardID`s.
    *   `WinLossRecord` (TEXT): e.g., "7-3"
    *   `RunOutcome` (TEXT): e.g., "Completed", "Retired"
    *   `DraftScore` (REAL): Overall score of the drafted deck.
    *   `AvgCardRating` (REAL): Average rating of cards in the deck.
    *   `ArchetypeSelected` (TEXT): User-selected archetype for this run.
    *   `GlobalAvgWinRate` (REAL): Global average win rate for this archetype/class combination.
*   **`CardPerformance` Table (New):**
    *   `RunID` (TEXT, FOREIGN KEY REFERENCES `DraftRuns(RunID)`)
    *   `CardID` (TEXT, FOREIGN KEY REFERENCES `Cards(CardID)`)
    *   `PickedOrder` (INTEGER): Order in which the card was picked.
    *   `PerformanceMetric` (REAL): e.g., win rate when this card was in hand/played.

**LiteDB (user_preferences.db) - Extensions for Advanced Archetype Customization:**

*   **`CustomArchetypes` Collection (New):**
    *   `_id` (ObjectId, PRIMARY KEY)
    *   `ArchetypeName` (TEXT): User-defined name.
    *   `Description` (TEXT)
    *   `ManaCurvePreference` (JSON TEXT): e.g., `{"2": 0.2, "3": 0.3, ...}`
    *   `MinionSpellRatio` (REAL): Preferred ratio.
    *   `SynergyKeywords` (ARRAY of TEXT): List of preferred synergy keywords.
    *   `CardBiases` (JSON TEXT): `{"CardID": bias_value}` for specific cards.

**Cloud Database (for Community Features) - Example (Azure SQL Database):**

*   **`SharedDrafts` Table:**
    *   `ShareID` (GUID, PRIMARY KEY)
    *   `UserID` (TEXT, FOREIGN KEY REFERENCES `Users(UserID)`)
    *   `DraftRunData` (JSON TEXT): Serialized `DraftRuns` data.
    *   `ShareDate` (DATETIME)
    *   `Visibility` (TEXT): e.g., "Public", "FriendsOnly"
*   **`Leaderboards` Table:**
    *   `LeaderboardID` (TEXT, PRIMARY KEY)
    *   `Metric` (TEXT): e.g., "AvgWinRate", "TotalWins"
    *   `Entries` (JSON TEXT): Array of `UserID` and `Score`.

#### 3. Comprehensive API Design

Future features will extend existing interfaces and introduce new ones, particularly for community features.

**Extensions to `IRecommendationEngine` (for Advanced Archetype Customization):**

```csharp
public interface IRecommendationEngine
{
    // ... existing methods

    /// <summary>
    /// Applies a custom archetype bias to the recommendation engine.
    /// </summary>
    /// <param name="customArchetype">The custom archetype definition.</param>
    Task SetCustomArchetypeBiasAsync(CustomArchetype customArchetype);
}
```

**New Backend API (for Community Features - Example ASP.NET Core Web API):**

*   **`/api/drafts/share` (POST):**
    *   **Request:** `{


    *   **Request:** `{"DraftRunData": {...}, "Visibility": "Public"}`
    *   **Response:** `{"ShareID": "..."}`
*   **`/api/leaderboards/{metric}` (GET):**
    *   **Request:** None
    *   **Response:** `{"Entries": [...]}`

**Authentication and Authorization (for Community Features):**

*   **OAuth 2.0 / OpenID Connect:** For user authentication (e.g., via Google, Battle.net if API allows).
*   **JWT (JSON Web Tokens):** For securing API calls between the client and backend.
*   **Role-Based Access Control (RBAC):** To manage permissions for sharing and accessing community data.

**Error Handling Strategies:**

*   Standard HTTP status codes (400, 401, 403, 404, 500) for API responses.
*   Detailed error messages in JSON format for client consumption.

#### 4. Frontend Architecture

*   **Component Hierarchy:** New UI components will be added to `HearthGem.App` to support future features.

    ```
    MainWindow
    ├── TabControl
    │   ├── TabItem (Deck Stats)
    │   │   └── DeckStatsView (UserControl) # Expanded with historical data, card performance
    │   ├── TabItem (Archetype Builder) # New tab for custom archetypes
    │   │   └── ArchetypeBuilderView (UserControl)
    │   ├── TabItem (Community) # New tab for sharing, leaderboards
    │   │   └── CommunityView (UserControl)
    ```

*   **Reusable Component Library:** New custom controls for data visualization (e.g., advanced charts for deck stats), archetype parameter input, and social sharing widgets.

*   **State Management Strategy:** MVVM will continue to be the primary strategy. New ViewModels (`ArchetypeBuilderViewModel`, `CommunityViewModel`) will manage the state for these new features.

*   **Routing and Navigation Flow:** The `NavigationService` will be extended to support navigation to these new tabs/views.

*   **Responsive Design Specifications:** All new UI components will adhere to the existing responsive design principles, ensuring adaptability to window resizing and maintaining a consistent user experience.

#### 5. Detailed CRUD Operations

Future features will introduce new CRUD operations, particularly for custom archetypes and community data.

*   **Create Operation:**
    *   **Custom Archetype:** User defines parameters in `ArchetypeBuilderView`, `ArchetypeBuilderViewModel` calls `LiteDbRepository.SaveCustomArchetypeAsync()`.
    *   **Shared Draft:** User selects a draft run, `CommunityViewModel` calls `CommunityService.ShareDraftAsync()` which makes an API call to the backend.

*   **Read Operation:**
    *   **Historical Deck Stats:** `DeckStatsViewModel` queries `SQLiteRepository` for `DraftRuns` and `CardPerformance` data.
    *   **Custom Archetypes:** `ArchetypeBuilderViewModel` loads `CustomArchetypes` from `LiteDbRepository`.
    *   **Leaderboards:** `CommunityViewModel` calls `CommunityService.GetLeaderboardAsync()` which makes an API call to the backend.

*   **Update Operation:**
    *   **Custom Archetype:** User modifies an existing custom archetype, `ArchetypeBuilderViewModel` calls `LiteDbRepository.UpdateCustomArchetypeAsync()`.

*   **Delete Operation:**
    *   **Custom Archetype:** User deletes a custom archetype, `ArchetypeBuilderViewModel` calls `LiteDbRepository.DeleteCustomArchetypeAsync()`.
    *   **Shared Draft:** User deletes a shared draft, `CommunityViewModel` calls `CommunityService.DeleteSharedDraftAsync()` (API call).

#### 6. User Experience Flow

*   **User Journey Maps:**
    *   **Analyzing Historical Performance:**
        1.  User clicks "Deck Stats" tab.
        2.  Dashboard displays overall win rate, average draft score.
        3.  User filters by class/archetype.
        4.  User clicks on a specific draft run to see detailed card performance and pick analysis.
    *   **Creating a Custom Archetype:**
        1.  User clicks "Archetype Builder" tab.
        2.  User defines mana curve, minion/spell ratio, adds synergy keywords.
        3.  User saves the archetype.
        4.  User selects the custom archetype to bias future recommendations.
    *   **Sharing a Draft:**
        1.  User completes a draft run.
        2.  User navigates to "Community" tab or a share button on the draft summary.
        3.  User selects visibility (public/private) and shares the draft.
        4.  Confirmation message appears.

*   **Wireframes for Key Screens (Conceptual):**
    *   **Deck Stats Dashboard:** Interactive charts for win rate trends, card performance heatmaps, detailed draft summaries.
    *   **Archetype Builder:** Sliders for mana curve, input fields for keywords, drag-and-drop interface for card biases.
    *   **Community Hub:** Leaderboard tables, shared draft feed, search bar for other users' shared content.

*   **State Transitions and Loading States:**
    *   Loading indicators for data-intensive views (e.g., Deck Stats dashboard, Community feed).
    *   Real-time updates for leaderboards or shared content feeds.

*   **Error Handling from User Perspective:**
    *   Clear messages for data loading failures, network errors for community features, or invalid archetype definitions.

#### 7. Security Considerations

*   **Authentication Flow Details:** For community features, robust user authentication (e.g., OAuth 2.0) will be implemented to secure user accounts and shared data.
*   **Authorization Matrix:** For community features, an RBAC system will define who can view/share/delete content.
*   **Data Validation and Sanitization Rules:** All user-generated content (custom archetypes, shared draft notes) will be rigorously validated and sanitized to prevent XSS, SQL injection, and other vulnerabilities.
*   **Protection Against Common Vulnerabilities:**
    *   **Backend Security:** For community features, the backend API will implement standard web security practices (e.g., input validation, secure session management, protection against CSRF/XSS).
    *   **Data Privacy:** Strict adherence to data privacy regulations (e.g., GDPR, CCPA) for user-shared data. Users will have full control over their shared content and data deletion.
    *   **Secure Communication:** All communication with backend services will be over HTTPS.

#### 8. Testing Strategy

*   **Unit Test Requirements:** Extend existing unit test coverage to new models, ViewModels, and services.
*   **Integration Test Scenarios:** Test new data access layers, ML model integration with custom archetypes, and backend API interactions.
*   **End-to-End Test Flows:** Simulate full user journeys for new features, including data creation, modification, and sharing.
*   **Performance Testing Thresholds:** Define and test performance budgets for new data visualizations and network-dependent features.

#### 9. Data Management

*   **Data Lifecycle Policies:** Define retention policies for shared community data. Users will have the ability to delete their shared content.
*   **Caching Strategies:** Implement caching for community feeds and leaderboard data to reduce backend load and improve responsiveness.
*   **Pagination and Infinite Scrolling:** Implement for large datasets in the Deck Stats dashboard and Community feeds.
*   **Real-time Data Requirements:** For leaderboards and shared feeds, near real-time updates will be desirable.

#### 10. Error Handling & Logging

*   **Structured Logging Format:** Continue using structured JSON logging for all new features.
*   **Error Classification and Prioritization:** Classify errors for new features (e.g., API errors, data processing errors) and prioritize accordingly.
*   **Monitoring and Alerting Thresholds:** Extend Sentry integration and performance monitoring to new features.
*   **Recovery Mechanisms:** Implement retry logic for network calls to backend services. Provide clear user feedback for community feature failures.






### HearthArena Tierlist Integration

**Feature Goal:** To dynamically incorporate the latest HearthArena tierlist data into the recommendation engine, ensuring that card recommendations are always based on the most current community-driven ratings.

**Implementation Details:**

*   **Data Source:** The primary data source will be `https://www.heartharena.com/tierlist`.
*   **Scraping Mechanism:** A Python script (`scrape_heartharena.py`) will be developed to periodically scrape the HearthArena tierlist. This script will use libraries like `BeautifulSoup` and `requests` to parse the HTML and extract card ratings. The scraping process will be scheduled to run regularly (e.g., daily or weekly) to ensure data freshness.
*   **Data Storage:** Scraped data will be stored in the `HearthArenaRatings` table within `hearthgem.db` (SQLite).
*   **Integration with Recommendation Engine:** The `HearthGem.ML.RecommendationEngine` will query the `HearthArenaRatings` table to retrieve card ratings. These ratings will serve as a crucial feature in the ML model's input, and also as a fallback mechanism if ML inference is unavailable or unreliable.

### Log File Handling (Dynamic Discovery)

**Feature Goal:** To reliably locate and monitor the most current Hearthstone log files, even when they are organized in dynamically created subdirectories, ensuring continuous and accurate game state parsing.

**Implementation Details:**

*   **Base Log Directory:** The user will specify the base Hearthstone log directory (e.g., `M:\Hearthstone\Logs`).
*   **Dynamic Subdirectory Discovery:** The `HearthGem.LogParser.LogFileMonitor` will implement logic to scan the base log directory for subdirectories matching the pattern `Hearthstone_YYYY_MM_DD_HH_MM_SS`. It will identify the most recently created subdirectory based on its timestamp in the folder name.
*   **Log File Identification:** Within the most current subdirectory, the monitor will look for `Hearthstone.log` and `Arena.log` files.
*   **Real-time Monitoring:** `FileSystemWatcher` (or similar mechanism in .NET) will be used to monitor changes to these identified log files, triggering the `HearthstoneLogParser` to process new lines as they are written.
*   **Robustness:** The system will handle cases where new log directories are created during an active Hearthstone session, seamlessly switching to monitor the latest log files.



