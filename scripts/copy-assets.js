const fs = require('fs');
const path = require('path');

function copyFileSync(source, target) {
  fs.copyFileSync(source, target);
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Copy HTML and other static assets to dist folder
function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const distDir = path.join(projectRoot, 'dist');
  const srcDir = path.join(projectRoot, 'src');

  ensureDirSync(distDir);

  // list of files to copy
  const files = [path.join(srcDir, 'index.html')];

  files.forEach((file) => {
    const dest = path.join(distDir, path.basename(file));
    copyFileSync(file, dest);
    console.log(`Copied ${file} -> ${dest}`);
  });
}

main();
