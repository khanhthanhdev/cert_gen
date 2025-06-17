import ConfigManager from '../src/core/ConfigManager.js';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';

const config = new ConfigManager();

async function diagnosePositioning() {
  console.log('🔍 Certificate Positioning Diagnostic Tool\n');

  try {
    // Load the PDF template
    const existingPdfBytes = fs.readFileSync(config.templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const page = pdfDoc.getPages()[0];
    const pdfPageHeight = page.getHeight();
    
    console.log(`📄 PDF Page Height: ${pdfPageHeight}`);
    console.log(`📐 Current Configuration:\n`);
    
    // Analyze name field
    const nameConfig = config.nameField;
    console.log('🏷️  NAME Field:');
    console.log(`   Line: ${nameConfig.coordinates.lineStartX} → ${nameConfig.coordinates.lineEndX}`);
    console.log(`   yFromTop: ${nameConfig.coordinates.yFromTop}`);
    console.log(`   offset: ${nameConfig.offset}`);
    console.log(`   additionalVerticalLift: ${nameConfig.additionalVerticalLift}\n`);
    
    // Calculate actual position
    const yFromTop = nameConfig.coordinates.yFromTop;
    const offset = nameConfig.offset;
    const additionalVerticalLift = nameConfig.additionalVerticalLift;
    
    const calculatedY = pdfPageHeight - yFromTop + offset - additionalVerticalLift;
    const simpleY = pdfPageHeight - yFromTop;
    
    console.log('📊 Position Calculations:');
    console.log(`   Expected Y (simple): ${simpleY.toFixed(2)} (pdfHeight - yFromTop)`);
    console.log(`   Actual Y (with offsets): ${calculatedY.toFixed(2)}`);
    console.log(`   Difference: ${(calculatedY - simpleY).toFixed(2)} pixels`);
    
    if (calculatedY < simpleY) {
      console.log('   ⬇️  Text appears LOWER than clicked position');
    } else if (calculatedY > simpleY) {
      console.log('   ⬆️  Text appears HIGHER than clicked position');
    }
    
    // Analyze position field
    const positionConfig = config.positionField;
    console.log('\n📍 POSITION Field:');
    console.log(`   Line: ${positionConfig.coordinates.lineStartX} → ${positionConfig.coordinates.lineEndX}`);
    console.log(`   yFromTop: ${positionConfig.coordinates.yFromTop}`);
    console.log(`   offset: ${positionConfig.offset}`);
    console.log(`   additionalVerticalLift: ${positionConfig.additionalVerticalLift}\n`);
    
    // Generate diagnostic PDF
    await generateDiagnosticPDF(pdfDoc, page, pdfPageHeight);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function generateDiagnosticPDF(pdfDoc, page, pdfPageHeight) {
  console.log('🧪 Generating diagnostic PDF...');
  
  // Load fonts
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(config.primaryFont.path);
  const font = await pdfDoc.embedFont(fontBytes);
  
  const nameConfig = config.nameField;
  const positionConfig = config.positionField;
  
  // Draw diagnostic markers for NAME field
  const nameY_simple = pdfPageHeight - nameConfig.coordinates.yFromTop;
  const nameY_actual = pdfPageHeight - nameConfig.coordinates.yFromTop + nameConfig.offset - nameConfig.additionalVerticalLift;
  const nameLineCenter = nameConfig.coordinates.lineStartX + (nameConfig.coordinates.lineEndX - nameConfig.coordinates.lineStartX) / 2;
  
  // Draw line where you clicked (expected position)
  page.drawLine({
    start: { x: nameConfig.coordinates.lineStartX, y: nameY_simple },
    end: { x: nameConfig.coordinates.lineEndX, y: nameY_simple },
    thickness: 2,
    color: rgb(0, 0, 1) // Blue - expected position
  });
  
  // Draw line where text actually appears
  page.drawLine({
    start: { x: nameConfig.coordinates.lineStartX, y: nameY_actual },
    end: { x: nameConfig.coordinates.lineEndX, y: nameY_actual },
    thickness: 2,
    color: rgb(1, 0, 0) // Red - actual position
  });
  
  // Add labels
  page.drawText('EXPECTED NAME LINE', {
    x: nameLineCenter - 80,
    y: nameY_simple + 10,
    size: 12,
    font: font,
    color: rgb(0, 0, 1)
  });
  
  page.drawText('ACTUAL NAME LINE', {
    x: nameLineCenter - 80,
    y: nameY_actual + 10,
    size: 12,
    font: font,
    color: rgb(1, 0, 0)
  });
  
  // Same for POSITION field
  const positionY_simple = pdfPageHeight - positionConfig.coordinates.yFromTop;
  const positionY_actual = pdfPageHeight - positionConfig.coordinates.yFromTop + positionConfig.offset - positionConfig.additionalVerticalLift;
  const positionLineCenter = positionConfig.coordinates.lineStartX + (positionConfig.coordinates.lineEndX - positionConfig.coordinates.lineStartX) / 2;
  
  page.drawLine({
    start: { x: positionConfig.coordinates.lineStartX, y: positionY_simple },
    end: { x: positionConfig.coordinates.lineEndX, y: positionY_simple },
    thickness: 2,
    color: rgb(0, 0.5, 1) // Light blue - expected position
  });
  
  page.drawLine({
    start: { x: positionConfig.coordinates.lineStartX, y: positionY_actual },
    end: { x: positionConfig.coordinates.lineEndX, y: positionY_actual },
    thickness: 2,
    color: rgb(1, 0.5, 0) // Orange - actual position
  });
  
  page.drawText('EXPECTED POSITION LINE', {
    x: positionLineCenter - 80,
    y: positionY_simple + 10,
    size: 12,
    font: font,
    color: rgb(0, 0.5, 1)
  });
  
  page.drawText('ACTUAL POSITION LINE', {
    x: positionLineCenter - 80,
    y: positionY_actual + 10,
    size: 12,
    font: font,
    color: rgb(1, 0.5, 0)
  });
  
  // Save diagnostic PDF
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('position-diagnostic.pdf', pdfBytes);
  
  console.log('✅ Diagnostic PDF saved as: position-diagnostic.pdf');
  console.log('\n📋 Line Color Guide:');
  console.log('   🔵 Blue lines: Where you clicked (expected position)');
  console.log('   🔴 Red/Orange lines: Where text actually appears');
  console.log('\n💡 Solutions:');
  console.log('   1. If text is too low: Reduce "offset" and "additionalVerticalLift"');
  console.log('   2. If text is too high: Increase "offset" or reduce "additionalVerticalLift"');
  console.log('   3. For exact positioning: Set both "offset" and "additionalVerticalLift" to 0');
}

// Suggest configuration fixes
function suggestFixes() {
  const nameConfig = config.nameField;
  console.log('\n🔧 Suggested Configuration Fixes:');
  console.log('\nFor EXACT positioning (text appears exactly where you clicked):');
  console.log(JSON.stringify({
    name: {
      ...nameConfig,
      offset: 0,
      additionalVerticalLift: 0
    }
  }, null, 2));
  
  console.log('\nFor SLIGHTLY ABOVE the line (traditional certificate style):');
  console.log(JSON.stringify({
    name: {
      ...nameConfig,
      offset: 5,
      additionalVerticalLift: 10
    }
  }, null, 2));
}

diagnosePositioning().then(() => {
  suggestFixes();
}).catch(console.error);
