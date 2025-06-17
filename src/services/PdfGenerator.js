/**
 * PDF Generator Service
 * Handles PDF creation and text positioning for certificates
 */

import fontkit from "@pdf-lib/fontkit";
import fs, { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { PDFDocument, rgb } from "pdf-lib";
import path from "path";

export class PdfGenerator {
  constructor(config) {
    this.config = config;
  }
  /**
   * Initialize and load fonts for PDF generation
   * @param {PDFDocument} pdfDoc - PDF document instance
   * @returns {Promise<Object>} Loaded fonts object {primary, secondary}
   */
  async initializeFonts(pdfDoc) {
    try {
      pdfDoc.registerFontkit(fontkit);
      
      // Always load fresh fonts for each PDF document
      const primaryFontBytes = readFileSync(this.config.primaryFont.path);
      const secondaryFontBytes = readFileSync(this.config.secondaryFont.path);
      
      const fonts = {
        primary: await pdfDoc.embedFont(primaryFontBytes),
        secondary: await pdfDoc.embedFont(secondaryFontBytes)
      };

      return fonts;
    } catch (error) {
      console.error('❌ Error loading fonts:', error);
      throw new Error(`Failed to load fonts: ${error.message}`);
    }
  }

  /**
   * Calculate font sizes according to configuration rules
   * @param {Object} primaryFontConfig - Primary font configuration
   * @param {Object} secondaryFontConfig - Secondary font configuration
   * @returns {Object} Font sizes {primary, secondary}
   */
  calculateFontSizes(primaryFontConfig, secondaryFontConfig) {
    let primarySize = primaryFontConfig.size;
    let secondarySize = secondaryFontConfig.size;
    
    // Ensure secondary font respects size ratio
    const maxAllowedSecondarySize = primarySize / this.config.get('fonts.sizeRatio');
    
    if (secondarySize > maxAllowedSecondarySize) {
      if (this.config.processingSettings.showWarnings) {
        console.warn(`⚠️ Secondary font size (${secondarySize}) adjusted to maintain ${this.config.get('fonts.sizeRatio')}x ratio with primary font (${primarySize})`);
      }
      secondarySize = maxAllowedSecondarySize;
    }
    
    // Ensure minimum sizes
    if (secondarySize < secondaryFontConfig.minSize) {
      if (this.config.processingSettings.showWarnings) {
        console.warn(`⚠️ Secondary font size clamped to minimum: ${secondaryFontConfig.minSize}`);
      }
      secondarySize = secondaryFontConfig.minSize;
    }

    return { primary: primarySize, secondary: secondarySize };
  }

  /**
   * Check for text overflow and warn if necessary
   * @param {string} text - Text to check
   * @param {number} textWidth - Calculated text width
   * @param {number} availableWidth - Available width for text
   * @param {string} fieldName - Name of the field for logging
   */
  checkTextOverflow(text, textWidth, availableWidth, fieldName) {
    if (textWidth > availableWidth && this.config.processingSettings.showWarnings) {
      console.warn(`⚠️ ${fieldName} "${text}" (${textWidth.toFixed(2)}px) might overflow available space (${availableWidth.toFixed(2)}px)`);
    }
  }

  /**
   * Draw text on PDF page with proper positioning
   * @param {PDFPage} page - PDF page to draw on
   * @param {string} text - Text to draw
   * @param {Object} position - Position coordinates {x, y}
   * @param {number} fontSize - Font size
   * @param {Object} font - PDF font object
   * @param {Object} color - RGB color object
   */
  drawText(page, text, position, fontSize, font, color) {
    page.drawText(text, {
      x: position.x,
      y: position.y,
      size: fontSize,
      font: font,
      color: rgb(color.r, color.g, color.b)
    });
  }

  /**
   * Generate a single certificate PDF
   * @param {string} name - Participant name
   * @param {string} position - Participant position
   * @returns {Promise<string>} Path to generated certificate
   */
  async generateCertificate(name, position) {
    try {
      // Load template PDF
      const existingPdfBytes = readFileSync(this.config.templatePath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const page = pdfDoc.getPages()[0];
      const pdfPageHeight = page.getHeight();

      // Initialize fonts
      const fonts = await this.initializeFonts(pdfDoc);
      
      // Get configuration
      const nameConfig = this.config.nameField;
      const positionConfig = this.config.positionField;
      const primaryFontConfig = this.config.primaryFont;
      const secondaryFontConfig = this.config.secondaryFont;

      // Calculate font sizes
      const fontSizes = this.calculateFontSizes(primaryFontConfig, secondaryFontConfig);

      // Format text
      const formattedName = this.config.formatText(name, nameConfig);
      const formattedPosition = this.config.formatText(position, positionConfig);

      // Calculate name positioning
      const nameTextWidth = fonts.primary.widthOfTextAtSize(formattedName, fontSizes.primary);
      const namePosition = this.config.getTextCoordinates(nameConfig, nameTextWidth, 0, pdfPageHeight);
      
      // Check for name overflow
      this.checkTextOverflow(
        formattedName, 
        nameTextWidth, 
        namePosition.lineWidth || 400, 
        'Name'
      );

      // Draw name
      this.drawText(
        page,
        formattedName,
        namePosition,
        fontSizes.primary,
        fonts.primary,
        primaryFontConfig.color
      );

      // Calculate position text positioning
      const positionTextWidth = fonts.secondary.widthOfTextAtSize(formattedPosition, fontSizes.secondary);
      const positionPosition = this.config.getTextCoordinates(positionConfig, positionTextWidth, 0, pdfPageHeight);
      
      // Check for position overflow
      this.checkTextOverflow(
        formattedPosition, 
        positionTextWidth, 
        positionPosition.lineWidth || 400, 
        'Position'
      );

      // Draw position
      this.drawText(
        page,
        formattedPosition,
        positionPosition,
        fontSizes.secondary,
        fonts.secondary,
        secondaryFontConfig.color
      );      // Ensure output directory exists
      const outputDir = path.resolve(this.config.outputDirectory);
      if (!existsSync(outputDir) && this.config.processingSettings.createOutputDir) {
        try {
          mkdirSync(outputDir, { recursive: true });
        } catch (error) {
          console.warn(`Could not create output directory ${outputDir}:`, error.message);
          // In Vercel, directories are created automatically when files are written
        }
      }

      // Generate safe filename and save
      const filename = this.config.createSafeFilename(name, position);
      const outputPath = path.join(outputDir, filename);
      
      const pdfBytes = await pdfDoc.save();
      writeFileSync(outputPath, pdfBytes);

      if (this.config.processingSettings.showProgress) {
        console.log(`✅ Certificate generated: ${filename}`);
      }

      return outputPath;
    } catch (error) {
      console.error(`❌ Error generating certificate for ${name}:`, error);
      throw error;
    }
  }
  /**
   * Generate multiple certificates from participant data
   * @param {Array} participants - Array of participant objects with dynamic fields
   * @returns {Promise<Array>} Array of generated certificate paths
   */
  async generateCertificates(participants) {
    const generatedPaths = [];
    
    if (this.config.config.processing.showProgress) {
      console.log(`🚀 Starting certificate generation for ${participants.length} participants...`);
    }

    for (const [index, participant] of participants.entries()) {
      try {
        // Use dynamic field method if we have textFields configuration
        const certificatePath = this.config.config.textFields ? 
          await this.generateCertificateWithDynamicFields(participant) :
          await this.generateCertificate(participant.name, participant.position);
          
        generatedPaths.push(certificatePath);
        
        if (this.config.config.processing.showProgress) {
          console.log(`📊 Progress: ${index + 1}/${participants.length} certificates generated`);
        }
      } catch (error) {
        console.error(`❌ Failed to generate certificate for participant:`, error);
        // Continue with next participant
      }
    }

    if (this.config.config.processing.showProgress) {
      console.log(`🎉 Certificate generation complete! Generated ${generatedPaths.length}/${participants.length} certificates`);
    }

    return generatedPaths;
  }

  /**
   * Generate a single certificate PDF with dynamic text fields
   * @param {Object} participant - Participant data with dynamic fields
   * @returns {Promise<string>} Path to generated certificate
   */
  async generateCertificateWithDynamicFields(participant) {
    try {
      // Load template PDF
      const existingPdfBytes = readFileSync(this.config.config.template.pdfPath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const page = pdfDoc.getPages()[0];
      const pdfPageHeight = page.getHeight();

      // Initialize fonts
      const fonts = await this.initializeFonts(pdfDoc);
      
      // Get font configurations
      const primaryFontConfig = this.config.config.fonts.primary;
      const secondaryFontConfig = this.config.config.fonts.secondary;

      // Calculate font sizes
      const fontSizes = this.calculateFontSizes(primaryFontConfig, secondaryFontConfig);

      // Process each text field dynamically
      const textFields = this.config.config.textFields || {};
      
      for (const [fieldName, fieldConfig] of Object.entries(textFields)) {
        const text = participant[fieldName] || '';
        if (!text) continue;

        // Format text according to field configuration
        const formattedText = this.formatTextForField(text, fieldConfig);
        
        // Determine font based on field configuration
        const fontType = fieldConfig.fontType || 'secondary';
        const font = fontType === 'primary' ? fonts.primary : fonts.secondary;
        const fontSize = fontType === 'primary' ? fontSizes.primary : fontSizes.secondary;
        const fontColor = fontType === 'primary' ? primaryFontConfig.color : secondaryFontConfig.color;

        // Calculate text positioning
        const textWidth = font.widthOfTextAtSize(formattedText, fontSize);
        const position = this.calculateTextPosition(fieldConfig, textWidth, pdfPageHeight);
        
        // Check for text overflow
        this.checkTextOverflow(
          formattedText, 
          textWidth, 
          position.lineWidth || 400, 
          fieldName
        );

        // Draw text
        this.drawText(
          page,
          formattedText,
          position,
          fontSize,
          font,
          fontColor
        );
      }      // Ensure output directory exists
      const outputDir = path.resolve(this.config.config.template.outputDirectory);
      console.log('🔍 PdfGenerator using output directory:', outputDir);
      
      if (!existsSync(outputDir) && this.config.config.processing.createOutputDir) {
        try {
          mkdirSync(outputDir, { recursive: true });
          console.log('✅ Created output directory:', outputDir);
        } catch (error) {
          console.warn(`Could not create output directory ${outputDir}:`, error.message);
          // In Vercel, directories are created automatically when files are written
        }
      }      // Generate safe filename
      const filename = this.createSafeFilename(participant);
      const outputPath = path.join(outputDir, filename);
      
      console.log('🔍 About to write certificate to:', outputPath);
      
      const pdfBytes = await pdfDoc.save();
      writeFileSync(outputPath, pdfBytes);

      if (this.config.config.processing.showProgress) {
        console.log(`✅ Certificate generated: ${filename}`);
      }

      return outputPath;
    } catch (error) {
      console.error(`❌ Error generating certificate for participant:`, error);
      throw error;
    }
  }

  /**
   * Format text according to field configuration
   * @param {string} text - Original text
   * @param {Object} fieldConfig - Field configuration
   * @returns {string} Formatted text
   */
  formatTextForField(text, fieldConfig) {
    let formattedText = text;
    
    if (fieldConfig.formatting?.capitalizeWords) {
      formattedText = this.capitalizeWords(formattedText, fieldConfig.formatting.preserveAcronyms);
    }
    
    if (fieldConfig.formatting?.wordSpacing) {
      formattedText = formattedText.split(' ').join(fieldConfig.formatting.wordSpacing);
    }
    
    return formattedText;
  }

  /**
   * Calculate text position based on field configuration
   * @param {Object} fieldConfig - Field configuration
   * @param {number} textWidth - Width of the text
   * @param {number} pdfPageHeight - Height of the PDF page
   * @returns {Object} Position coordinates
   */
  calculateTextPosition(fieldConfig, textWidth, pdfPageHeight) {
    const coords = fieldConfig.coordinates;
    const offset = fieldConfig.offset || 0;
    const verticalLift = fieldConfig.additionalVerticalLift || 0;
    
    if (coords.coordinateSystem === 'line') {
      const lineWidth = coords.lineEndX - coords.lineStartX;
      const centerX = coords.lineStartX + (lineWidth / 2) - (textWidth / 2) + offset;
      const y = pdfPageHeight - coords.yFromTop + verticalLift;
      
      return {
        x: centerX,
        y: y,
        lineWidth: lineWidth
      };
    } else {
      // Handle other coordinate systems if needed
      return {
        x: coords.x + offset,
        y: pdfPageHeight - coords.y + verticalLift,
        lineWidth: 400
      };
    }
  }

  /**
   * Capitalize words with optional acronym preservation
   * @param {string} text - Text to capitalize
   * @param {boolean} preserveAcronyms - Whether to preserve acronyms
   * @returns {string} Capitalized text
   */
  capitalizeWords(text, preserveAcronyms = false) {
    return text.split(' ').map(word => {
      if (preserveAcronyms && word === word.toUpperCase()) {
        return word; // Keep acronyms as-is
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }

  /**
   * Create safe filename from participant data
   * @param {Object} participant - Participant data
   * @returns {string} Safe filename
   */
  createSafeFilename(participant) {
    const nameField = participant.name || participant.Name || 'Participant';
    const positionField = participant.position || participant.Position || '';
    
    let filename = nameField;
    if (positionField) {
      filename += `-${positionField}`;
    }
    
    // Replace invalid characters
    filename = filename.replace(/[/\\?%*:|"<>]/g, '-');
    filename = filename.replace(/\s+/g, ' ').trim();
    
    return `${filename}.pdf`;
  }

  // ...existing code...
}

export default PdfGenerator;
