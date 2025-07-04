const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const imageHash = require('image-hash');
const { promisify } = require('util');

// Promisify the imageHash function
const generateHash = promisify(imageHash.imageHash);

// Configuration
const MANUAL_IMAGES_DIR = path.join(process.cwd(), 'data/manual_captured');
const HASH_FILE = path.join(process.cwd(), 'data/hashes/card_hashes.json');

/**
 * Advanced preprocessing for hash matching (matching the ImageMatcher optimization)
 */
async function preprocessForHashing(imageBuffer) {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const { width = 0, height = 0 } = metadata;
    
    console.log(`  📊 Preprocessing image: ${width}x${height}`);
    
    // Multi-stage optimization pipeline for maximum hash matching accuracy
    const processedBuffer = await sharp(imageBuffer)
      // Stage 1: Intelligent scaling - ensure optimal resolution for hashing
      .resize(
        width < 200 ? Math.floor(width * 2.5) : width,
        height < 200 ? Math.floor(height * 2.5) : height,
        { 
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: false
        }
      )
      // Stage 2: Advanced noise reduction while preserving card features
      .median(3)
      .blur(0.5)
      .sharpen({ 
        sigma: 1.2, 
        m1: 0.8, 
        m2: 3.0, 
        x1: 2.5, 
        y2: 12.0, 
        y3: 22.0 
      })
      // Stage 3: Extreme contrast and histogram optimization
      .normalize()
      .gamma(1.25)
      .linear(1.15, -8)
      // Stage 4: Convert to consistent grayscale for reliable hashing
      .grayscale()
      // Stage 5: Final histogram equalization for lighting consistency
      .clahe({ width: 16, height: 16, maxSlope: 3 })
      // Stage 6: Export as uncompressed PNG for hash consistency
      .png({ quality: 100, compressionLevel: 0, palette: false })
      .toBuffer();
    
    console.log(`  ✨ Enhanced preprocessing: ${imageBuffer.length} → ${processedBuffer.length} bytes`);
    return processedBuffer;
    
  } catch (error) {
    console.error('  ❌ Error in preprocessing:', error.message);
    return imageBuffer; // Return original on error
  }
}

/**
 * Generate multiple hash variants for better matching accuracy
 */
async function generateHashVariants(imageBuffer) {
  try {
    const hashes = [];
    
    // Original hash at 16-bit precision
    const originalHash = await generateHash(imageBuffer, 16, true);
    hashes.push({ type: 'original', hash: originalHash });
    
    // Additional variants with different preprocessing for edge cases
    const variants = await Promise.all([
      // Variant 1: Extra sharpened for low contrast cards
      sharp(imageBuffer)
        .sharpen({ sigma: 2.0, m1: 0.5, m2: 4.0, x1: 3.0, y2: 20.0, y3: 30.0 })
        .png({ quality: 100, compressionLevel: 0 })
        .toBuffer()
        .then(buf => generateHash(buf, 16, true))
        .then(hash => ({ type: 'extra_sharp', hash })),
        
      // Variant 2: High contrast for bright/dark cards
      sharp(imageBuffer)
        .linear(1.3, -20)
        .png({ quality: 100, compressionLevel: 0 })
        .toBuffer()
        .then(buf => generateHash(buf, 16, true))
        .then(hash => ({ type: 'high_contrast', hash })),
        
      // Variant 3: Different bit depth for precision
      generateHash(imageBuffer, 12, true)
        .then(hash => ({ type: '12bit', hash })),
      
      // Variant 4: Alternative hash algorithm
      generateHash(imageBuffer, 20, false)
        .then(hash => ({ type: '20bit_alt', hash }))
    ]);
    
    hashes.push(...variants);
    
    console.log(`  🎯 Generated ${hashes.length} hash variants`);
    return hashes;
    
  } catch (error) {
    console.error('  ❌ Error generating hash variants:', error.message);
    return [{ type: 'fallback', hash: await generateHash(imageBuffer, 16, true) }];
  }
}

/**
 * Enhanced hash similarity calculation with multiple algorithms
 */
function calculateEnhancedHashSimilarity(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    return 0;
  }
  
  // Primary calculation: Hamming distance
  let hammingMatches = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] === hash2[i]) {
      hammingMatches++;
    }
  }
  const hammingSimilarity = hammingMatches / hash1.length;
  
  // Secondary calculation: Substring matching for partial matches
  let substringScore = 0;
  const chunkSize = Math.max(4, Math.floor(hash1.length / 8));
  for (let i = 0; i <= hash1.length - chunkSize; i += chunkSize) {
    const chunk1 = hash1.substring(i, i + chunkSize);
    const chunk2 = hash2.substring(i, i + chunkSize);
    if (chunk1 === chunk2) {
      substringScore += chunkSize;
    }
  }
  const substringSimilarity = substringScore / hash1.length;
  
  // Weighted combination
  const combinedSimilarity = (hammingSimilarity * 0.7) + (substringSimilarity * 0.3);
  
  return combinedSimilarity;
}

/**
 * Original hash similarity calculation for comparison
 */
function calculateBasicHashSimilarity(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    return 0;
  }
  
  let matchingBits = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] === hash2[i]) {
      matchingBits++;
    }
  }
  
  return matchingBits / hash1.length;
}

async function main() {
  console.log('🚀 Advanced Hash Matching Performance Test');
  console.log('===========================================\n');

  // Load card hashes
  console.log('📂 Loading card hash database...');
  if (!fs.existsSync(HASH_FILE)) {
    console.error(`❌ Card hashes file not found: ${HASH_FILE}`);
    process.exit(1);
  }

  const cardHashes = JSON.parse(fs.readFileSync(HASH_FILE, 'utf8'));
  console.log(`✅ Loaded ${cardHashes.length} card hashes\n`);

  // Check for manual captured images
  if (!fs.existsSync(MANUAL_IMAGES_DIR)) {
    console.error(`❌ Manual captured images directory not found: ${MANUAL_IMAGES_DIR}`);
    process.exit(1);
  }

  const imageFiles = fs.readdirSync(MANUAL_IMAGES_DIR)
    .filter(file => file.toLowerCase().endsWith('.png'))
    .slice(0, 5); // Test first 5 images

  if (imageFiles.length === 0) {
    console.error(`❌ No PNG images found in: ${MANUAL_IMAGES_DIR}`);
    process.exit(1);
  }

  console.log(`🖼️  Testing ${imageFiles.length} captured images...\n`);

  let totalOriginalConfidence = 0;
  let totalEnhancedConfidence = 0;
  let improvementCount = 0;

  for (const filename of imageFiles) {
    const imagePath = path.join(MANUAL_IMAGES_DIR, filename);
    console.log(`🎯 Testing: ${filename}`);
    
    try {
      // Load image
      const imageBuffer = fs.readFileSync(imagePath);
      
      // === ORIGINAL METHOD TEST ===
      console.log('  📊 Testing original method...');
      const originalHash = await generateHash(imageBuffer, 16, true);
      let bestOriginalMatch = 0;
      let bestOriginalCard = '';
      
      for (const cardHash of cardHashes) {
        const similarity = calculateBasicHashSimilarity(originalHash, cardHash.hash);
        if (similarity > bestOriginalMatch) {
          bestOriginalMatch = similarity;
          bestOriginalCard = cardHash.name;
        }
      }
      
      console.log(`  📈 Original: ${(bestOriginalMatch * 100).toFixed(1)}% - ${bestOriginalCard}`);
      
      // === ENHANCED METHOD TEST ===
      console.log('  🔬 Testing enhanced method...');
      const preprocessedBuffer = await preprocessForHashing(imageBuffer);
      const hashVariants = await generateHashVariants(preprocessedBuffer);
      
      let bestEnhancedMatch = 0;
      let bestEnhancedCard = '';
      let bestVariantType = '';
      
      for (const cardHash of cardHashes) {
        for (const variant of hashVariants) {
          const similarity = calculateEnhancedHashSimilarity(variant.hash, cardHash.hash);
          if (similarity > bestEnhancedMatch) {
            bestEnhancedMatch = similarity;
            bestEnhancedCard = cardHash.name;
            bestVariantType = variant.type;
          }
        }
      }
      
      console.log(`  🚀 Enhanced: ${(bestEnhancedMatch * 100).toFixed(1)}% - ${bestEnhancedCard} (${bestVariantType})`);
      
      // Calculate improvement
      const improvement = bestEnhancedMatch - bestOriginalMatch;
      const improvementPercent = (improvement * 100).toFixed(1);
      
      if (improvement > 0) {
        console.log(`  ✅ IMPROVED by +${improvementPercent}%`);
        improvementCount++;
      } else if (improvement < 0) {
        console.log(`  ⚠️  Decreased by ${improvementPercent}%`);
      } else {
        console.log(`  ➡️  No change`);
      }
      
      totalOriginalConfidence += bestOriginalMatch;
      totalEnhancedConfidence += bestEnhancedMatch;
      
    } catch (error) {
      console.error(`  ❌ Error processing ${filename}:`, error.message);
    }
    
    console.log(''); // Empty line for readability
  }

  // Summary
  console.log('📊 PERFORMANCE SUMMARY');
  console.log('======================');
  console.log(`Images tested: ${imageFiles.length}`);
  console.log(`Images improved: ${improvementCount}/${imageFiles.length} (${((improvementCount/imageFiles.length)*100).toFixed(1)}%)`);
  console.log(`Average original confidence: ${((totalOriginalConfidence/imageFiles.length)*100).toFixed(1)}%`);
  console.log(`Average enhanced confidence: ${((totalEnhancedConfidence/imageFiles.length)*100).toFixed(1)}%`);
  console.log(`Overall improvement: +${(((totalEnhancedConfidence-totalOriginalConfidence)/imageFiles.length)*100).toFixed(1)}%`);
  
  // Recommendation
  const avgEnhancedConfidence = totalEnhancedConfidence / imageFiles.length;
  if (avgEnhancedConfidence >= 0.6) {
    console.log('\n🎉 EXCELLENT! Enhanced preprocessing achieved 60%+ confidence!');
    console.log('   Recommended threshold: 0.6');
  } else if (avgEnhancedConfidence >= 0.4) {
    console.log('\n👍 GOOD! Enhanced preprocessing achieved 40%+ confidence.');
    console.log('   Recommended threshold: 0.4');
  } else if (avgEnhancedConfidence >= 0.2) {
    console.log('\n🔧 MODERATE improvement. Consider region recapture.');
    console.log('   Recommended threshold: 0.2');
  } else {
    console.log('\n🚨 LOW confidence. Regions likely need recapturing.');
    console.log('   Focus on pure card artwork, avoid UI elements.');
  }
}

main().catch(console.error); 