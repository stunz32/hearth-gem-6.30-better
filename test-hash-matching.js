const fs = require('fs');
const path = require('path');

// Mock Electron app to avoid dependency issues in Node.js
const mockApp = {
  getPath: (name) => {
    if (name === 'userData') {
      return path.join(process.cwd(), 'data');
    }
    return process.cwd();
  },
  getAppPath: () => process.cwd(),
  isPackaged: false
};

// Inject mock before requiring modules that depend on Electron
const originalRequire = require;
require = function(id) {
  if (id === 'electron') {
    return { app: mockApp };
  }
  return originalRequire.apply(this, arguments);
};

// Import compiled modules 
const { ImageMatcher } = require('./dist/services/capture/ImageMatcher');
const { CardDataService } = require('./dist/services/cardData/CardDataService');

// Restore original require
require = originalRequire;

async function testHashMatching() {
  console.log('🔍 Starting hash matching confidence test...\n');

  try {
    // Initialize services
    console.log('📚 Loading card data...');
    // Pass explicit data directory to avoid Electron dependency
    const dataDir = path.join(process.cwd(), 'data');
    const cardDataService = new CardDataService(dataDir);
    await cardDataService.loadCardData();
    
    console.log('🔧 Initializing ImageMatcher...');
    const imageMatcher = new ImageMatcher(cardDataService);
    
    // Wait a moment for hashes to load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (!imageMatcher.isReady()) {
      console.error('❌ ImageMatcher failed to load hashes!');
      return;
    }
    
    console.log('✅ ImageMatcher ready\n');

    // Get all manual captured images
    const capturedDir = path.join(process.cwd(), 'data', 'manual_captured');
    const imageFiles = fs.readdirSync(capturedDir).filter(f => f.endsWith('.png'));
    
    console.log(`📸 Found ${imageFiles.length} manual captured images\n`);

    const results = [];

    // Test each image
    for (const fileName of imageFiles) {
      console.log(`🔍 Testing: ${fileName}`);
      
      const filePath = path.join(capturedDir, fileName);
      const imageBuffer = fs.readFileSync(filePath);
      const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      
      // Create fake capture result for the matcher
      const fakeCapture = {
        dataUrl,
        region: { 
          name: fileName.replace('.png', ''), 
          x: 0, 
          y: 0, 
          width: 0, 
          height: 0 
        },
        timestamp: Date.now(),
        success: true
      };

      try {
        const matchResult = await imageMatcher.matchCardImage(fakeCapture);
        
        const result = {
          fileName,
          cardId: matchResult.cardId,
          cardName: matchResult.name,
          confidence: matchResult.confidence,
          matchMethod: matchResult.matchMethod
        };
        
        results.push(result);
        
        console.log(`   📊 Best match: ${matchResult.name || 'No match'}`);
        console.log(`   🎯 Confidence: ${(matchResult.confidence * 100).toFixed(1)}%`);
        console.log(`   🔧 Method: ${matchResult.matchMethod}`);
        console.log('');
        
      } catch (error) {
        console.error(`   ❌ Error testing ${fileName}:`, error.message);
        results.push({
          fileName,
          error: error.message
        });
      }
    }

    // Summary
    console.log('📈 SUMMARY:');
    console.log('='.repeat(50));
    
    const successfulMatches = results.filter(r => r.confidence && r.confidence >= 0.8);
    const belowThreshold = results.filter(r => r.confidence && r.confidence < 0.8 && r.confidence > 0);
    const noMatches = results.filter(r => !r.confidence || r.confidence === 0);
    
    console.log(`✅ Above threshold (≥80%): ${successfulMatches.length}`);
    console.log(`⚠️  Below threshold (<80%): ${belowThreshold.length}`);
    console.log(`❌ No matches: ${noMatches.length}`);
    console.log('');
    
    if (belowThreshold.length > 0) {
      console.log('🔧 OPTIMIZATION NEEDED:');
      belowThreshold.forEach(r => {
        console.log(`   ${r.fileName}: ${(r.confidence * 100).toFixed(1)}% - ${r.cardName || 'No match'}`);
      });
      console.log('');
    }
    
    if (successfulMatches.length === results.length) {
      console.log('🎉 ALL IMAGES MATCH WITH HIGH CONFIDENCE!');
      console.log('   The hash matching system should work reliably.');
    } else {
      console.log('⚠️  IMPROVEMENTS NEEDED:');
      console.log('   - Consider lowering the threshold');
      console.log('   - Re-capture images with different boundaries');
      console.log('   - Check if card regions include the actual card art');
    }

    // Save detailed results
    const reportPath = path.join(process.cwd(), 'hash-matching-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testHashMatching().then(() => {
  console.log('\n✅ Test completed');
}).catch(error => {
  console.error('❌ Test failed:', error);
}); 