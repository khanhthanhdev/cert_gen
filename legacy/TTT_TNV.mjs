import fontkit from "@pdf-lib/fontkit";
import { parse } from "csv-parse";
import fs, { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { PDFDocument, rgb } from "pdf-lib";
import path from "path";
import ConfigManager from "./configManager.js";

// Initialize configuration
const config = new ConfigManager();

const generateParticipantCert = async (name, position) => {
  const existingPdfBytes = readFileSync(config.templatePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages()[0];
  const pdfPageHeight = pages.getHeight();

  // Load fonts from config
  const fontBytes = readFileSync(config.primaryFont.path);
  pdfDoc.registerFontkit(fontkit);
  const primaryFont = await pdfDoc.embedFont(fontBytes);
  const secondaryFont = await pdfDoc.embedFont(
    readFileSync(config.secondaryFont.path)
  );

  // Format text using config
  const upperName = config.formatText(name, config.nameField);
  const upperPosition = config.formatText(position, config.positionField);
  // Get configuration values
  const nameConfig = config.nameField;
  const positionConfig = config.positionField;
  const primaryFontConfig = config.primaryFont;
  const secondaryFontConfig = config.secondaryFont;

  // Set font sizes
  let fixedNameFontSize = primaryFontConfig.size;
  // --- Calculate Name Position ---
  const nameTextWidth = primaryFont.widthOfTextAtSize(upperName, fixedNameFontSize);
  const namePosition = config.getTextCoordinates(nameConfig, nameTextWidth, 0, pdfPageHeight);
  
  // Check for text overflow
  const maxTextWidth = namePosition.lineWidth || 400; // Use line width if available
  if (nameTextWidth > maxTextWidth && config.processingSettings.showWarnings) {
    console.warn(`Name "${upperName}" (${nameTextWidth.toFixed(2)}) might overflow the designated area (${maxTextWidth.toFixed(2)}).`);
  }

  pages.drawText(upperName, {
    x: namePosition.x,
    y: namePosition.y,
    size: fixedNameFontSize,
    font: primaryFont,
    color: rgb(primaryFontConfig.color.r, primaryFontConfig.color.g, primaryFontConfig.color.b),
  });

  // --- Calculate Position Text Position ---
  let fixedPositionFontSize = secondaryFontConfig.size;
  const maxAllowedPositionSize = fixedNameFontSize / config.get('fonts.sizeRatio');

  if (fixedPositionFontSize > maxAllowedPositionSize) {
    if (config.processingSettings.showWarnings) {
      console.warn(`Initial SECONDARY_TEXT_SIZE (${fixedPositionFontSize.toFixed(2)}) was too large to maintain ${config.get('fonts.sizeRatio')}x ratio with fixed name font size (${fixedNameFontSize.toFixed(2)}). Adjusting to ${maxAllowedPositionSize.toFixed(2)}.`);
    }
    fixedPositionFontSize = maxAllowedPositionSize;
  }
  
  // Ensure fixedPositionFontSize is not less than minimum
  if (fixedPositionFontSize < secondaryFontConfig.minSize) {
    if (config.processingSettings.showWarnings) {
      console.warn(`Calculated fixedPositionFontSize (${fixedPositionFontSize.toFixed(2)}) is below minimum (${secondaryFontConfig.minSize}). Clamping to minimum.`);
    }
    fixedPositionFontSize = secondaryFontConfig.minSize;
  }

  const positionTextWidth = secondaryFont.widthOfTextAtSize(upperPosition, fixedPositionFontSize);
  const positionPosition = config.getTextCoordinates(positionConfig, positionTextWidth, 0, pdfPageHeight);
  
  // Check for text overflow
  const maxPositionWidth = positionPosition.lineWidth || 400;
  if (positionTextWidth > maxPositionWidth && config.processingSettings.showWarnings) {
    console.warn(`Position "${upperPosition}" (${positionTextWidth.toFixed(2)}) might overflow the designated area (${maxPositionWidth.toFixed(2)}).`);
  }

  pages.drawText(upperPosition, {
    x: positionPosition.x,
    y: positionPosition.y,
    size: fixedPositionFontSize,
    font: secondaryFont,
    color: rgb(secondaryFontConfig.color.r, secondaryFontConfig.color.g, secondaryFontConfig.color.b),
  });

  // Ensure output directory exists
  const outputDir = path.resolve(config.outputDirectory);
  if (!existsSync(outputDir) && config.processingSettings.createOutputDir) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Create safe filename using config
  const filename = config.createSafeFilename(name, position);
  
  const output = await pdfDoc.save();
  writeFileSync(path.join(outputDir, filename), output);
  
  if (config.processingSettings.showProgress) {
    console.log(`Certificate generated for ${name}`);
  }
};

// Function to process CSV data with config-based settings
const processCsvFile = (filePath) => {
  const csvSettings = config.csvSettings;
  
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath, { encoding: csvSettings.encoding })
      .pipe(
        parse({
          delimiter: csvSettings.delimiter,
          from_line: csvSettings.skipFirstRow ? 2 : 1,
          encoding: csvSettings.encoding,
        })
      )
      .on("data", (row) => {
        results.push(row);
      })
      .on("end", () => {
        resolve(results);
        if (config.processingSettings.showProgress) {
          console.log("CSV file successfully processed");
        }
      })
      .on("error", (error) => {
        reject(error);
        console.error(error);
      });
  });
};

// Generate certificates from CSV data
const generateCertificatesFromCsv = async (csvFilePath) => {
  try {
    const data = await processCsvFile(csvFilePath);
    const csvSettings = config.csvSettings;
    
    for (const row of data) {
      const name = row[csvSettings.nameColumn];
      const position = row[csvSettings.positionColumn];

      if (config.processingSettings.validateInput) {
        if (!name || name.trim().length === 0) {
          console.warn(`Skipping row with empty name: ${JSON.stringify(row)}`);
          continue;
        }
        if (!position || position.trim().length === 0) {
          console.warn(`Row has empty position for ${name}: ${JSON.stringify(row)}`);
        }
      }

      if (name && name.length > 0) {
        await generateParticipantCert(name, position || "");
      }
    }
    
    if (config.processingSettings.showProgress) {
      console.log("All certificates from CSV generated successfully!");
    }
  } catch (error) {
    console.error("Error generating certificates from CSV:", error);
  }
};

// Generate certificates for test data from config
async function generateMultipleCertificates() {
  const testData = config.executionSettings.testData;
  
  for (const person of testData) {
    await generateParticipantCert(person.name, person.position);
  }
  
  if (config.processingSettings.showProgress) {
    console.log("All test certificates generated successfully!");
  }
}

// Main execution based on config
async function main() {
  const mode = config.executionSettings.mode;
  
  try {
    if (mode === "csv") {
      const csvPath = config.executionSettings.csvFilePath;
      if (config.processingSettings.showProgress) {
        console.log(`Generating certificates from CSV: ${csvPath}`);
      }
      await generateCertificatesFromCsv(csvPath);
    } else if (mode === "test") {
      if (config.processingSettings.showProgress) {
        console.log("Generating certificates from test data");
      }
      await generateMultipleCertificates();
    } else {
      console.error(`Unknown execution mode: ${mode}. Use 'csv' or 'test'`);
    }
  } catch (error) {
    console.error("Error in main execution:", error);
  }
}

// Run the application
main();
