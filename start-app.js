// Simple start script to launch the Electron app
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Create necessary directories
const directories = [
  path.join(__dirname, 'data', 'templates'),
  path.join(__dirname, 'data', 'hashes'),
  path.join(__dirname, 'data', 'images', 'cards'),
];

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Create sample JSON data for card hashes
const hashFile = path.join(__dirname, 'data', 'hashes', 'card_hashes.json');
if (!fs.existsSync(hashFile)) {
  fs.writeFileSync(hashFile, JSON.stringify([
    {
      "cardId": "sample_card",
      "hash": "0000000000000000",
      "imageUrl": "https://art.hearthstonejson.com/v1/render/latest/enUS/256x/sample_card.png"
    }
  ], null, 2));
  console.log(`Created sample hash file: ${hashFile}`);
}

// Start the Electron app
console.log('Starting HearthGem...');
const electronProcess = spawn('npx', ['electron', '.'], { 
  stdio: 'inherit',
  shell: true
});

electronProcess.on('close', (code) => {
  console.log(`HearthGem exited with code ${code}`);
});