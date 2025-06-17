/**
 * Configuration Validator Tool
 * Validates and displays certificate generator configuration
 */

import CertificateGenerator from '../src/core/CertificateGenerator.js';
import { fileExists, formatFileSize, getFileSize } from '../src/utils/fileUtils.js';

/**
 * Main validation function
 */
async function validateConfiguration() {
  console.log('🔧 Certificate Generator - Configuration Validator\n');

  try {
    // Initialize generator and get status
    const generator = new CertificateGenerator('./config.json');
    const status = generator.getStatus();
    
    console.log('📊 Configuration Overview:');
    console.log(`   Version: ${status.version}`);
    console.log(`   Config File: ${status.configPath}`);
    console.log(`   Execution Mode: ${status.executionMode}`);
    console.log(`   Coordinate System: ${status.coordinateSystem.name}/${status.coordinateSystem.position}\n`);
    
    // File validation
    console.log('📁 File Validation:');
    const filesToCheck = [
      { name: 'PDF Template', path: status.templatePath },
      { name: 'Primary Font', path: generator.config.primaryFont.path },
      { name: 'Secondary Font', path: generator.config.secondaryFont.path }
    ];
    
    if (status.executionMode === 'csv') {
      filesToCheck.push({ 
        name: 'CSV File', 
        path: generator.config.executionSettings.csvFilePath 
      });
    }
    
    let allFilesExist = true;
    for (const file of filesToCheck) {
      if (fileExists(file.path)) {
        const size = formatFileSize(getFileSize(file.path));
        console.log(`   ✅ ${file.name}: ${file.path} (${size})`);
      } else {
        console.log(`   ❌ ${file.name}: ${file.path} (NOT FOUND)`);
        allFilesExist = false;
      }
    }
    
    // Output directory check
    const outputExists = fileExists(status.outputDirectory);
    console.log(`   ${outputExists ? '✅' : '⚠️'} Output Directory: ${status.outputDirectory} ${outputExists ? '' : '(will be created)'}`);
    
    // Coordinate system validation
    console.log('\n📐 Text Positioning:');
    const nameCoords = generator.config.nameField.coordinates;
    const positionCoords = generator.config.positionField.coordinates;
    
    if (nameCoords.coordinateSystem === 'click') {
      console.log(`   Name: Center at (${nameCoords.centerX}, ${nameCoords.centerY}) - Click coordinates`);
      console.log(`   Position: Center at (${positionCoords.centerX}, ${positionCoords.centerY}) - Click coordinates`);
      console.log('   💡 Use tools/coordinatePicker.html for adjustments');
    } else if (nameCoords.coordinateSystem === 'line' || nameCoords.lineStartX !== undefined) {
      console.log(`   Name Line: X(${nameCoords.lineStartX} - ${nameCoords.lineEndX}) Y(${nameCoords.yFromTop}) - Line coordinates`);
      console.log(`   Position Line: X(${positionCoords.lineStartX} - ${positionCoords.lineEndX}) Y(${positionCoords.yFromTop}) - Line coordinates`);
      console.log('   💡 Use tools/lineCoordinatePicker.html for adjustments');
    } else {
      console.log('   ⚠️ Unknown coordinate system detected');
    }
    
    // Font configuration
    console.log('\n🎨 Font Configuration:');
    console.log(`   Primary: Size ${generator.config.primaryFont.size}, Min ${generator.config.primaryFont.minSize}`);
    console.log(`   Secondary: Size ${generator.config.secondaryFont.size}, Min ${generator.config.secondaryFont.minSize}`);
    console.log(`   Size Ratio: ${generator.config.get('fonts.sizeRatio')}:1`);
    
    // Execution mode details
    if (status.executionMode === 'test') {
      console.log('\n🧪 Test Data:');
      generator.config.executionSettings.testData.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.name} - ${item.position}`);
      });
    }
    
    if (status.executionMode === 'csv') {
      console.log('\n📊 CSV Configuration:');
      console.log(`   Name Column: ${generator.config.csvSettings.nameColumn}`);
      console.log(`   Position Column: ${generator.config.csvSettings.positionColumn}`);
      console.log(`   Skip First Row: ${generator.config.csvSettings.skipFirstRow}`);
      console.log(`   Delimiter: "${generator.config.csvSettings.delimiter}"`);
    }
    
    // Processing options
    console.log('\n⚙️ Processing Options:');
    console.log(`   Show Warnings: ${generator.config.processingSettings.showWarnings}`);
    console.log(`   Show Progress: ${generator.config.processingSettings.showProgress}`);
    console.log(`   Validate Input: ${generator.config.processingSettings.validateInput}`);
    
    // Final validation
    console.log('\n🔍 Configuration Validation:');
    if (status.validation.isValid) {
      console.log('   ✅ Configuration is valid and ready to use!');
      
      if (status.validation.warnings.length > 0) {
        console.log('\n   ⚠️ Warnings:');
        status.validation.warnings.forEach(warning => {
          console.log(`     • ${warning}`);
        });
      }
    } else {
      console.log('   ❌ Configuration has errors:');
      status.validation.errors.forEach(error => {
        console.log(`     • ${error}`);
      });
    }
    
    if (!allFilesExist) {
      console.log('\n❌ Some required files are missing. Please check the paths in your config.json');
      process.exit(1);
    } else if (status.validation.isValid) {
      console.log('\n🚀 Ready to generate certificates!');
      console.log('   Run: node index.js');
    } else {
      console.log('\n🔧 Please fix the configuration errors before proceeding.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

// Run validation
validateConfiguration();
