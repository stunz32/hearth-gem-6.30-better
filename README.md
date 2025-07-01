# HearthGem Arena Assistant

HearthGem is a powerful assistant tool for Hearthstone Arena drafts. It helps players make better card choices by providing real-time card ratings and suggestions during the draft process.

## Features

- **Real-time Log Monitoring**: Automatically detects when you're in an Arena draft
- **Card Ratings**: Displays card ratings to help you make better choices
- **Transparent Overlay**: Non-intrusive overlay that shows information without blocking the game
- **Automatic Detection**: No manual input required - just start drafting!

## Installation

1. Download the latest release from the [Releases](https://github.com/yourusername/hearth-gem/releases) page
2. Extract the zip file to a location of your choice
3. Run the HearthGem executable

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- TypeScript

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/hearth-gem.git
   cd hearth-gem
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the project:
   ```
   npm run build
   ```

4. Start the application:
   ```
   npm start
   ```

### Project Structure

- `src/` - Source code
  - `core/` - Core application logic
  - `services/` - Service modules
    - `logReader/` - Hearthstone log reading functionality
    - `cardData/` - Card database and scoring
    - `overlay/` - Overlay UI management
  - `utils/` - Utility functions and helpers
  - `main.ts` - Main process entry point
  - `renderer.ts` - Renderer process logic
  - `index.html` - Main HTML template

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Hearthstone is a registered trademark of Blizzard Entertainment
- This tool is not affiliated with or endorsed by Blizzard Entertainment