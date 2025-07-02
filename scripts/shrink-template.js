const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, '..', 'data', 'templates', 'card_template.png');
const outputPath = path.join(path.dirname(templatePath), 'card_template_tmp.png');

(async () => {
  try {
    if (!fs.existsSync(templatePath)) {
      console.error('card_template.png not found');
      process.exit(1);
    }
    const meta = await sharp(templatePath).metadata();
    if (meta.width && meta.width > 800) {
      const newWidth = 400; // shrink large image
      await sharp(templatePath).resize({ width: newWidth }).toFile(outputPath);
      fs.renameSync(outputPath, templatePath);
      console.log(`Resized card_template.png from width ${meta.width} to ${newWidth}`);
    } else {
      console.log('card_template.png already reasonable size');
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();