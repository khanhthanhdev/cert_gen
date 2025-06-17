import ConfigManager from '../src/core/ConfigManager.js';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';

const config = new ConfigManager();

async function testCoordinates(testX, testY, testText = 'TEST') {
  try {
    // Load the PDF template
    const existingPdfBytes = fs.readFileSync(config.templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const page = pdfDoc.getPages()[0];
    
    // Load fonts
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = fs.readFileSync(config.primaryFont.path);
    const font = await pdfDoc.embedFont(fontBytes);
    
    // Calculate text width for centering
    const fontSize = 20;
    const textWidth = font.widthOfTextAtSize(testText, fontSize);
    
    // Center the text on the provided coordinates
    const textX = testX - (textWidth / 2);
    const textY = testY;
    
    // Draw the test text
    page.drawText(testText, {
      x: textX,
      y: textY,
      size: fontSize,
      font: font,
      color: rgb(1, 0, 0) // Red color for visibility
    });
    
    // Draw a small cross at the exact coordinate
    const crossSize = 10;
    page.drawText('+', {
      x: testX - 3,
      y: testY - 3,
      size: 12,
      font: font,
      color: rgb(0, 0, 1) // Blue cross
    });
    
    // Save the test PDF
    const pdfBytes = await pdfDoc.save();
    const testFileName = `test_coordinates_${testX}_${testY}.pdf`;
    fs.writeFileSync(testFileName, pdfBytes);
    
    console.log(`✅ Test PDF created: ${testFileName}`);
    console.log(`   Text "${testText}" centered at (${testX}, ${testY})`);
    console.log(`   Blue cross (+) marks the exact coordinate`);
    
    return testFileName;
    
  } catch (error) {
    console.error('❌ Error creating test PDF:', error.message);
    throw error;
  }
}

// Example usage
async function runTest() {
  console.log('🧪 Testing Coordinates from Config...\n');
  
  try {
    const nameCoords = config.nameField.coordinates;
    const positionCoords = config.positionField.coordinates;
    
    if (nameCoords.coordinateSystem === 'click') {
      console.log('Testing NAME coordinates...');
      await testCoordinates(nameCoords.centerX, nameCoords.centerY, 'NAME TEST');
      
      console.log('\nTesting POSITION coordinates...');
      await testCoordinates(positionCoords.centerX, positionCoords.centerY, 'POSITION TEST');
      
      console.log('\n✅ Test complete! Check the generated test PDF files.');
      console.log('💡 If text is not positioned correctly, update the centerX and centerY values in config.json');
    } else {
      console.log('⚠️ Legacy coordinate system detected. Please update to the new "click" system.');
      console.log('💡 Use test_coordinates.html to get coordinates by clicking on your PDF');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Command line usage
if (process.argv.length > 3) {
  const x = parseFloat(process.argv[2]);
  const y = parseFloat(process.argv[3]);
  const text = process.argv[4] || 'TEST';
  
  if (isNaN(x) || isNaN(y)) {
    console.error('Usage: node testCoordinates.js <x> <y> [text]');
    console.error('Example: node testCoordinates.js 400 350 "Hello World"');
    process.exit(1);
  }
  
  console.log(`Testing custom coordinates: (${x}, ${y}) with text "${text}"`);
  testCoordinates(x, y, text).catch(console.error);
} else {
  runTest();
}

export { testCoordinates };
