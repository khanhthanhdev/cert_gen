/**
 * Certificate Generator Application
 * Main application class that orchestrates certificate generation
 */

import ConfigManager from './ConfigManager.js';
import CsvProcessor from '../services/CsvProcessor.js';
import PdfGenerator from '../services/PdfGenerator.js';

export default class CertificateGenerator {
  constructor(configPath = './config.json') {
    this.config = new ConfigManager(configPath);
    this.csvProcessor = new CsvProcessor(this.config);
    this.pdfGenerator = new PdfGenerator(this.config);
  }

  /**
   * Generate certificates from test data
   * @returns {Promise<Array>} Array of generated certificate paths
   */
  async generateFromTestData() {
    const testData = this.config.executionSettings.testData;
    
    if (!testData || testData.length === 0) {
      throw new Error('No test data configured');
    }

    if (this.config.processingSettings.showProgress) {
      console.log(`🧪 Generating certificates from test data (${testData.length} participants)`);
    }

    return await this.pdfGenerator.generateCertificates(testData);
  }

  /**
   * Generate certificates from CSV file
   * @param {string} csvFilePath - Path to CSV file (optional, uses config if not provided)
   * @returns {Promise<Array>} Array of generated certificate paths
   */
  async generateFromCsv(csvFilePath = null) {
    const csvPath = csvFilePath || this.config.executionSettings.csvFilePath;
    
    if (!csvPath) {
      throw new Error('No CSV file path specified');
    }

    if (this.config.processingSettings.showProgress) {
      console.log(`📊 Generating certificates from CSV: ${csvPath}`);
    }

    const participants = await this.csvProcessor.getParticipants(csvPath);
    return await this.pdfGenerator.generateCertificates(participants);
  }

  /**
   * Generate certificates from CSV data array with custom column mapping
   * @param {Array} csvData - Array of CSV rows
   * @param {Object} mappings - Column mapping {fieldName: columnIndex}
   * @returns {Promise<Array>} Array of generated certificate paths
   */
  async generateFromCsvData(csvData, mappings) {
    if (!csvData || csvData.length === 0) {
      throw new Error('No CSV data provided');
    }

    if (!mappings || Object.keys(mappings).length === 0) {
      throw new Error('No column mappings provided');
    }

    if (this.config.processingSettings.showProgress) {
      console.log(`📊 Generating certificates from CSV data (${csvData.length} participants)`);
    }

    // Convert CSV data to participant objects using mappings
    const participants = csvData.map((row, index) => {
      const participant = {};
      
      // Map each field according to the provided mappings
      Object.entries(mappings).forEach(([fieldName, columnIndex]) => {
        if (columnIndex >= 0 && columnIndex < row.length) {
          participant[fieldName] = row[columnIndex] || '';
        } else {
          participant[fieldName] = '';
        }
      });

      return participant;
    }).filter(participant => {
      // Basic validation - at least one field should have content
      return Object.values(participant).some(value => value && value.trim().length > 0);
    });

    if (participants.length === 0) {
      throw new Error('No valid participant data found after mapping');
    }

    if (this.config.processingSettings.showProgress) {
      console.log(`✅ Mapped ${participants.length} valid participants`);
    }

    return await this.pdfGenerator.generateCertificates(participants);
  }

  /**
   * Generate certificates based on execution mode in configuration
   * @returns {Promise<Array>} Array of generated certificate paths
   */
  async generate() {
    const mode = this.config.executionSettings.mode;
    
    try {
      switch (mode) {
        case 'test':
          return await this.generateFromTestData();
        
        case 'csv':
          return await this.generateFromCsv();
        
        default:
          throw new Error(`Unknown execution mode: ${mode}. Use 'test' or 'csv'`);
      }
    } catch (error) {
      console.error('❌ Certificate generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate configuration and dependencies
   * @returns {Object} Validation result {isValid, errors, warnings}
   */
  validateSetup() {
    const errors = [];
    const warnings = [];

    try {
      // Check template file
      if (!this.config.templatePath) {
        errors.push('Template PDF path not configured');
      }

      // Check fonts
      if (!this.config.primaryFont.path || !this.config.secondaryFont.path) {
        errors.push('Font paths not properly configured');
      }

      // Check coordinate configuration
      const nameCoords = this.config.nameField.coordinates;
      const positionCoords = this.config.positionField.coordinates;
      
      if (!nameCoords.coordinateSystem) {
        warnings.push('Name coordinates missing coordinate system specification');
      }
      
      if (!positionCoords.coordinateSystem) {
        warnings.push('Position coordinates missing coordinate system specification');
      }

      // Check execution mode
      const mode = this.config.executionSettings.mode;
      if (mode === 'csv' && !this.config.executionSettings.csvFilePath) {
        errors.push('CSV mode selected but no CSV file path configured');
      }
      
      if (mode === 'test' && (!this.config.executionSettings.testData || this.config.executionSettings.testData.length === 0)) {
        errors.push('Test mode selected but no test data configured');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Configuration validation failed: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Generate a single test certificate for positioning verification
   * @param {string} name - Test name
   * @param {string} position - Test position
   * @returns {Promise<string>} Path to generated test certificate
   */
  async generateTestCertificate(name = 'Test Name', position = 'Test Position') {
    if (this.config.processingSettings.showProgress) {
      console.log(`🧪 Generating test certificate for positioning verification`);
    }

    return await this.pdfGenerator.generateCertificate(name, position);
  }

  /**
   * Get application status and statistics
   * @returns {Object} Status information
   */
  getStatus() {
    const config = this.config.config;
    const validation = this.validateSetup();
    
    return {
      version: '2.0.0',
      configPath: this.config.configPath,
      templatePath: config.template?.pdfPath,
      outputDirectory: config.template?.outputDirectory,
      executionMode: config.execution?.mode,
      validation,
      coordinateSystem: {
        name: config.textFields?.name?.coordinates?.coordinateSystem || 'unknown',
        position: config.textFields?.position?.coordinates?.coordinateSystem || 'unknown'
      }
    };
  }
}
