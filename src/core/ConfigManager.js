/**
 * Configuration Manager for Certificate Generator
 * Handles loading, validation, and accessing configuration settings
 */

import fs from 'fs';
import path from 'path';

export class ConfigManager {
  constructor(configPath = './config.json') {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }
  /**
   * Load and validate configuration from file
   * @returns {Object} Configuration object
   */
  loadConfig() {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      // Override paths for Vercel environment
      this.applyVercelOverrides(config);
      
      this.validateConfig(config);
      return config;
    } catch (error) {
      console.error(`Error loading config from ${this.configPath}:`, error.message);
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }  /**
   * Apply Vercel-specific path overrides
   * @param {Object} config - Configuration object to modify
   */
  applyVercelOverrides(config) {
    const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
    
    if (isVercel) {
      console.log('🔧 Applying Vercel overrides...');
      console.log('🔍 Original output directory:', config.template?.outputDirectory);
      console.log('🔍 Original template path:', config.template?.pdfPath);
      
      // Override output directory to use writable /tmp in Vercel
      if (config.template && config.template.outputDirectory) {
        config.template.outputDirectory = '/tmp/output/participants';
        console.log('🔧 Vercel detected: Using /tmp/output/participants for certificate output');
      }
      
      // Convert relative paths to absolute paths in Vercel
      if (config.template && config.template.pdfPath && config.template.pdfPath.startsWith('./')) {
        config.template.pdfPath = config.template.pdfPath.replace('./', '/var/task/');
        console.log('🔧 Vercel detected: Updated template path to:', config.template.pdfPath);
      }
      
      // Convert font paths
      if (config.fonts) {
        if (config.fonts.primary && config.fonts.primary.path && config.fonts.primary.path.startsWith('./')) {
          config.fonts.primary.path = config.fonts.primary.path.replace('./', '/var/task/');
          console.log('🔧 Vercel detected: Updated primary font path to:', config.fonts.primary.path);
        }
        if (config.fonts.secondary && config.fonts.secondary.path && config.fonts.secondary.path.startsWith('./')) {
          config.fonts.secondary.path = config.fonts.secondary.path.replace('./', '/var/task/');
          console.log('🔧 Vercel detected: Updated secondary font path to:', config.fonts.secondary.path);
        }
      }
      
      // Also ensure we have a template object if it doesn't exist
      if (!config.template) {
        config.template = {};
      }
      if (!config.template.outputDirectory) {
        config.template.outputDirectory = '/tmp/output/participants';
        console.log('🔧 Vercel detected: Created output directory setting /tmp/output/participants');
      }
      
      console.log('🔍 Final output directory:', config.template.outputDirectory);
      console.log('🔍 Final template path:', config.template.pdfPath);
      
      // Ensure the output directory exists
      try {
        fs.mkdirSync('/tmp/output/participants', { recursive: true });
        console.log('✅ Created /tmp/output/participants directory');
      } catch (error) {
        console.warn('Could not create output directory:', error.message);
      }
    }
  }

  /**
   * Validate configuration structure and required fields
   * @param {Object} config - Configuration object to validate
   */
  validateConfig(config) {
    const requiredPaths = [
      'template.pdfPath',
      'fonts.primary.path',
      'fonts.secondary.path',
      'textFields.name.coordinates',
      'textFields.position.coordinates',
      'csvMapping'
    ];

    for (const path of requiredPaths) {
      if (!this.getNestedValue(config, path)) {
        throw new Error(`Missing required configuration: ${path}`);
      }
    }

    // Validate file paths exist
    const filePaths = [
      config.template.pdfPath,
      config.fonts.primary.path,
      config.fonts.secondary.path
    ];

    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        console.warn(`Warning: File not found: ${filePath}`);
      }
    }
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to search
   * @param {string} path - Dot-separated path (e.g., 'fonts.primary.size')
   * @returns {*} Value at path or undefined
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  /**
   * Get configuration value using dot notation
   * @param {string} path - Dot-separated path
   * @returns {*} Configuration value
   */
  get(path) {
    return this.getNestedValue(this.config, path);
  }

  // Convenience getters for commonly used values
  get templatePath() { return this.config.template.pdfPath; }
  get outputDirectory() { return this.config.template.outputDirectory; }
  get primaryFont() { return this.config.fonts.primary; }
  get secondaryFont() { return this.config.fonts.secondary; }
  get nameField() { return this.config.textFields.name; }
  get positionField() { return this.config.textFields.position; }
  get csvSettings() { return this.config.csvMapping; }
  get fileSettings() { return this.config.fileSettings; }
  get processingSettings() { return this.config.processing; }
  get executionSettings() { return this.config.execution; }

  /**
   * Calculate text positioning coordinates based on configuration
   * @param {Object} fieldConfig - Field configuration object
   * @param {number} textWidth - Width of the text to position
   * @param {number} textHeight - Height of the text (optional)
   * @param {number} pdfPageHeight - PDF page height for coordinate conversion
   * @returns {Object} Positioning coordinates {x, y, lineWidth?}
   */
  getTextCoordinates(fieldConfig, textWidth, textHeight = 0, pdfPageHeight = null) {
    const coords = fieldConfig.coordinates;
    
    if (coords.coordinateSystem === "click") {
      // Direct click coordinates - center the text on the clicked point
      return {
        x: coords.centerX - (textWidth / 2),
        y: coords.centerY - (textHeight / 2)
      };
    } else if (coords.coordinateSystem === "line" || coords.lineStartX !== undefined) {
      // Line-based system - center text on the line
      const lineStartX = coords.lineStartX || 0;
      const lineEndX = coords.lineEndX || lineStartX + 100;
      const yFromTop = coords.yFromTop || 0;
      const offset = fieldConfig.offset || 0;
      const additionalVerticalLift = fieldConfig.additionalVerticalLift || 0;
      
      const lineCenter = lineStartX + (lineEndX - lineStartX) / 2;
      
      // Convert yFromTop to bottom-up coordinate system
      let finalY = yFromTop;
      if (pdfPageHeight) {
        finalY = pdfPageHeight - yFromTop + offset - additionalVerticalLift;
      }
      
      return {
        x: lineCenter - (textWidth / 2),
        y: finalY,
        lineWidth: lineEndX - lineStartX
      };
    } else {
      // Fallback for legacy or malformed configs
      console.warn('Unknown coordinate system, using default positioning');
      return {
        x: coords.centerX || 400,
        y: coords.centerY || 400
      };
    }
  }

  /**
   * Format text according to field configuration
   * @param {string} text - Text to format
   * @param {Object} fieldConfig - Field configuration
   * @returns {string} Formatted text
   */
  formatText(text, fieldConfig) {
    const formatting = fieldConfig.formatting;
    
    return text
      .trim()
      .split(/\s+/)
      .filter(word => word)
      .map(word => {
        if (formatting.preserveAcronyms && word === word.toUpperCase() && word.length >= 2) {
          return word;
        }
        if (formatting.capitalizeWords) {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        return word;
      })
      .join(formatting.wordSpacing);
  }

  /**
   * Create safe filename from name and position
   * @param {string} name - Person's name
   * @param {string} position - Person's position
   * @returns {string} Safe filename
   */
  createSafeFilename(name, position) {
    const settings = this.fileSettings;
    const regex = new RegExp(settings.invalidCharsRegex, 'g');
    
    const safeName = name.replace(regex, settings.replacementChar);
    const safePosition = position.replace(regex, settings.replacementChar);
    
    return `${safeName}${settings.filenameSeparator}${safePosition}.pdf`;
  }

  /**
   * Get RGB color object for pdf-lib from configuration
   * @param {Object} colorConfig - Color configuration {r, g, b}
   * @returns {Object} RGB color object
   */
  getRgbColor(colorConfig) {
    return {
      r: colorConfig.r,
      g: colorConfig.g,
      b: colorConfig.b
    };
  }

  /**
   * Reload configuration from file
   * @returns {Object} Reloaded configuration
   */
  reload() {
    this.config = this.loadConfig();
    return this.config;
  }

  /**
   * Update configuration and save to file
   * @param {Object} updates - Configuration updates
   */
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * Save current configuration to file
   */
  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving config:', error.message);
      throw error;
    }
  }
}

export default ConfigManager;
