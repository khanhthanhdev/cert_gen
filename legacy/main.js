import fontkit from "@pdf-lib/fontkit";
import { parse } from "csv-parse";
import fs, { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { PDFDocument, rgb } from "pdf-lib";
import path from "path";

// Set UTF-8 encoding for all file operations
const FILE_ENCODING = "utf8";

const PRIMARY_FONT = "MonteCarlo/MonteCarlo-Regular.ttf";
const SECONDARY_FONT = "Quicksand/static/Quicksand-Bold.ttf";

const PRIMARY_TEXT_COLOR = rgb(0.13, 0.18, 0.4);
const SECONDARY_TEXT_COLOR = rgb(0.13, 0.18, 0.4);
const PRIMARY_TEXT_SIZE = 88.4;
const SECONDARY_TEXT_SIZE = 48;

const PRIMARY_TEXT_OFFSET = 15;
const SECONDARY_TEXT_OFFSET = 15;

const generateParticipantCert = async (name, position) => {
  const existingPdfBytes = readFileSync("./cert2.pdf");
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages()[0];

  // use monte carlo font
  const fontBytes = readFileSync("./MonteCarlo/MonteCarlo-Regular.ttf");
  pdfDoc.registerFontkit(fontkit);
  const primaryFont = await pdfDoc.embedFont(fontBytes);
  const secondaryFont = await pdfDoc.embedFont(
    readFileSync("./Quicksand/static/Quicksand-Bold.ttf")
  );

  // Keep the original name and position formatting since they're already properly formatted
  // Just ensure proper spacing between words
  let upperName = name
    .trim() // Remove leading/trailing spaces
    .split(/\s+/) // Split by whitespace
    .filter((word) => word) // Remove empty strings
    .map((word) => {
      // Special handling for acronyms - keep them as is
      if (word === word.toUpperCase() && word.length >= 2) {
        return word; // Keep acronyms like THPT, PTDTNT as is
      }
      // Normal capitalization for regular words
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("   "); // Join with a single space

  // Format position with proper spacing, preserving acronyms
  let upperPosition = position
    .trim() // Remove leading/trailing spaces
    .split(/\s+/) // Split by whitespace
    .filter((word) => word) // Remove empty strings
    .map((word) => {
      // Check if word is an acronym - all uppercase with 2 or more letters
      if (word === word.toUpperCase() && word.length >= 2) {
        return word; // Keep acronyms like THPT, PTDTNT as is
      }
      // Normal capitalization for regular words
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

  const nameTextWidth = primaryFont.widthOfTextAtSize(upperName, PRIMARY_TEXT_SIZE);
  const nameTextHeight = secondaryFont.heightAtSize(PRIMARY_TEXT_SIZE);

  // The name line is 784.89 pixels wide and positioned at (725, 546)
  // Calculate center of the line
  const lineCenter = 725 + 784.89 / 2; // 725 is the x starting position of the line

  // Calculate the x position to center the text above the name line
  const nameTextX = lineCenter - nameTextWidth / 2;

  // In PDF-lib, coordinates start from bottom-left, so we need to:
  // 1. Convert the y-coordinate (546) from top-left to bottom-left
  // 2. Add an offset upward from the line for proper text placement
  const pdfPageHeight = pages.getHeight(); // Get the total height of the PDF page
  const nameYPosition = pdfPageHeight - 546 + PRIMARY_TEXT_OFFSET; // Convert from top-down to bottom-up

  // Draw the name text
  pages.drawText(upperName, {
    x: nameTextX,
    y: nameYPosition, // Using the converted y-coordinate
    size: PRIMARY_TEXT_SIZE,
    font: primaryFont,
    color: PRIMARY_TEXT_COLOR,
  });

  const positionTextWidth = secondaryFont.widthOfTextAtSize(
    upperPosition,
    SECONDARY_TEXT_SIZE
  );
  const positionTextHeight = secondaryFont.heightAtSize(SECONDARY_TEXT_SIZE);

  // The position line is at (725, 688) with same width
  // Use the same horizontal centering
  const positionTextX = lineCenter - positionTextWidth / 2;

  // Convert position y-coordinate (688) from top-left to bottom-left
  const positionYPosition = pdfPageHeight - 688 + SECONDARY_TEXT_OFFSET;

  // Position the text above the position line
  pages.drawText(upperPosition, {
    x: positionTextX,
    y: positionYPosition, // Using the converted y-coordinate
    size: SECONDARY_TEXT_SIZE,
    font: secondaryFont,
    color: SECONDARY_TEXT_COLOR,
  });

  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), "output", "participants");
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Create a safe filename by replacing characters that might cause issues
  const safeName = name.replace(/[/\\?%*:|"<>]/g, "-");
  const safePosition = position.replace(/[/\\?%*:|"<>]/g, "-");

  const output = await pdfDoc.save();
  writeFileSync(
    path.join(outputDir, `${safeName}-${safePosition}.pdf`),
    output
  );
  console.log(`Certificate generated for ${name}`);
};

// Function to process CSV data with explicit UTF-8 encoding
const processCsvFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath, { encoding: FILE_ENCODING })
      .pipe(
        parse({
          delimiter: ",",
          from_line: 2,
          encoding: FILE_ENCODING,
        })
      )
      .on("data", (row) => {
        results.push(row);
      })
      .on("end", () => {
        resolve(results);
        console.log("CSV file successfully processed");
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
    for (const row of data) {
      const name = row[1];
      const position = row[3];

      if (name && name.length > 0) {
        await generateParticipantCert(name, position);
      }
    }
    console.log("All certificates from CSV generated successfully!");
  } catch (error) {
    console.error("Error generating certificates from CSV:", error);
  }
};

// Test with specific names
let names = [
  { name: "Vũ Công Thiên Hoàn", position: "Trường PTDTNT Tỉnh Điện Biên" },
  { name: "Bùi Ngọc An Nguyên", position: "Trường PTDTNT Tỉnh Điện Biên" },
];

// Generate certificates for test names
async function generateMultipleCertificates() {
  for (const person of names) {
    await generateParticipantCert(person.name, person.position);
  }
  console.log("All test certificates generated successfully!");
}

// Uncomment to generate from test data
// generateMultipleCertificates().catch((error) =>
//   console.error("Error generating test certificates:", error)
// );

// Uncomment to generate from CSV file
generateCertificatesFromCsv("./data.csv").catch(error => console.error("Error in CSV processing:", error));
