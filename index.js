/**
 * Certificate Generator - Main Entry Point
 * Clean, organized certificate generation application
 */

import CertificateGenerator from './src/core/CertificateGenerator.js';

/**
 * Main application function
 */
async function main() {
  console.log('🎓 Certificate Generator v2.0.0');
  console.log('================================\n');

  try {
    // Initialize the certificate generator
    const generator = new CertificateGenerator('./config.json');
    
    // Validate setup
    const status = generator.getStatus();
    console.log('📊 Application Status:');
    console.log(`   Template: ${status.templatePath}`);
    console.log(`   Output: ${status.outputDirectory}`);
    console.log(`   Mode: ${status.executionMode}`);
    console.log(`   Coordinates: ${status.coordinateSystem.name}/${status.coordinateSystem.position}\n`);
    
    // Check validation
    if (!status.validation.isValid) {
      console.error('❌ Configuration validation failed:');
      status.validation.errors.forEach(error => console.error(`   • ${error}`));
      process.exit(1);
    }
    
    if (status.validation.warnings.length > 0) {
      console.warn('⚠️ Configuration warnings:');
      status.validation.warnings.forEach(warning => console.warn(`   • ${warning}`));
      console.log('');
    }
    
    // Generate certificates
    console.log('🚀 Starting certificate generation...\n');
    const generatedPaths = await generator.generate();
    
    // Report results
    console.log('\n🎉 Generation Complete!');
    console.log(`📁 Generated ${generatedPaths.length} certificates`);
    console.log(`📂 Location: ${status.outputDirectory}`);
    
    if (generatedPaths.length > 0) {
      console.log('\n📋 Generated certificates:');
      generatedPaths.forEach((path, index) => {
        const filename = path.split(/[/\\]/).pop();
        console.log(`   ${index + 1}. ${filename}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Application Error:', error.message);
    
    if (error.code === 'ENOENT') {
      console.error('💡 Suggestion: Check that all file paths in config.json are correct');
    } else if (error.message.includes('config')) {
      console.error('💡 Suggestion: Run "node tools/validateConfig.js" to check configuration');
    } else if (error.message.includes('CSV')) {
      console.error('💡 Suggestion: Check CSV file format and column mapping in config');
    }
    
    process.exit(1);
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the application
main();
