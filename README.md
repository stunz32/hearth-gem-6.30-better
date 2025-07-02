# HearthGem with Fast-Hash Vision Module

HearthGem is an Electron-based application that assists with Hearthstone Arena drafts by automatically detecting cards on the screen. This version includes the new Fast-Hash Vision Module, which provides lightweight card detection using perceptual hashing instead of heavy computer vision libraries like OpenCV.

## Features

- **Fast-Hash Vision Module**: Lightweight card detection using perceptual hashing
- **Region Detection**: Automatically detects card regions in the Hearthstone window
- **Template Matching**: Matches card templates (mana crystals, rarity gems) to identify cards
- **Card Image Matching**: Uses perceptual hashing to match card images
- **Real-time Detection**: Continuously monitors the Hearthstone window for cards

## Components

### Vision Services

- **ImageMatcherService**: Matches card images using perceptual hashing
- **TemplateMatcherService**: Matches card templates (mana crystals, rarity gems)

### Capture Services

- **RegionDetector**: Detects card regions in the Hearthstone window
- **ScreenCaptureService**: Captures screenshots of the Hearthstone window

### Draft Services

- **VisualDraftDetector**: Detects cards in the Hearthstone draft using computer vision

### Configuration Services

- **RegionConfigService**: Manages configuration for card regions

### Utilities

- **build-card-hashes.ts**: Downloads card images and generates perceptual hashes

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the application: `npm run build`
4. Start the application: `npm start`

## Development

- Run in development mode: `npm run dev`
- Watch TypeScript files: `npm run watch`
- Generate card hashes: `npm run generate-hashes`

## How It Works

1. The application detects the Hearthstone window
2. It identifies card regions in the window using template matching
3. It captures screenshots of these regions
4. It uses perceptual hashing to match the captured images against known card images
5. It verifies the matches using template matching on mana crystals and rarity gems
6. It displays the detected cards in the user interface

## Requirements

- Node.js 16+
- Electron 28+
- Hearthstone client

## License

MIT