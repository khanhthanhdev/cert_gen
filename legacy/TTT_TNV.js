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
let PRIMARY_TEXT_SIZE = 88.4; // Will be adjusted
let SECONDARY_TEXT_SIZE = 48; // Will be adjusted

const MINIMUM_PRIMARY_FONT_SIZE = 20; // Example minimum, adjust as needed
const MINIMUM_SECONDARY_FONT_SIZE = 10; // Example minimum, adjust as needed
const FONT_SIZE_ADJUSTMENT_STEP = 1; // Decrement step for font size

const PRIMARY_TEXT_OFFSET = 15;
const SECONDARY_TEXT_OFFSET = 15;

const generateParticipantCert = async (name, position) => {
  const existingPdfBytes = readFileSync("./cert2.pdf");
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages()[0];
  const pdfPageHeight = pages.getHeight();

  // use monte carlo font
  const fontBytes = readFileSync("./MonteCarlo/MonteCarlo-Regular.ttf");
  pdfDoc.registerFontkit(fontkit);
  const primaryFont = await pdfDoc.embedFont(fontBytes);
  const secondaryFont = await pdfDoc.embedFont(
    readFileSync("./Quicksand/static/Quicksand-Bold.ttf")
  );

  let upperName = name
    .trim()
    .split(/\s+/)
    .filter((word) => word)
    .map((word) => {
      if (word === word.toUpperCase() && word.length >= 2) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("   ");

  let upperPosition = position
    .trim()
    .split(/\s+/)
    .filter((word) => word)
    .map((word) => {
      if (word === word.toUpperCase() && word.length >= 2) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

  // --- Dynamic Font Size for Name ---
  const nameLineStartX = 340.00;
  const nameLineEndX = 713.00;
  const targetNameWidth = nameLineEndX - nameLineStartX;
  let currentNameFontSize = PRIMARY_TEXT_SIZE; // Start with the global default
  let nameTextWidth = primaryFont.widthOfTextAtSize(upperName, currentNameFontSize);

  while (nameTextWidth > targetNameWidth && currentNameFontSize > MINIMUM_PRIMARY_FONT_SIZE) {
    currentNameFontSize -= FONT_SIZE_ADJUSTMENT_STEP;
    nameTextWidth = primaryFont.widthOfTextAtSize(upperName, currentNameFontSize);
  }
  // Ensure it doesn't go below minimum if the loop exited due to minimum font size
  if (nameTextWidth > targetNameWidth && currentNameFontSize <= MINIMUM_PRIMARY_FONT_SIZE) {
      console.warn(`Name "${upperName}" might be too long to fit even at minimum font size.`);
  }

  const nameLineCenter = nameLineStartX + targetNameWidth / 2;
  const nameLineYFromTop = 304.21;
  const nameTextX = nameLineCenter - nameTextWidth / 2;
  const nameYPosition = pdfPageHeight - nameLineYFromTop + PRIMARY_TEXT_OFFSET;

  pages.drawText(upperName, {
    x: nameTextX,
    y: nameYPosition,
    size: currentNameFontSize, // Use adjusted font size
    font: primaryFont,
    color: PRIMARY_TEXT_COLOR,
  });

  // --- Dynamic Font Size for Position ---
  const positionLineStartX = 404.00;
  const positionLineEndX = 653.00;
  const targetPositionWidth = positionLineEndX - positionLineStartX;
  let currentPositionFontSize = SECONDARY_TEXT_SIZE; // Start with the global default
  let positionTextWidth = secondaryFont.widthOfTextAtSize(upperPosition, currentPositionFontSize);

  while (positionTextWidth > targetPositionWidth && currentPositionFontSize > MINIMUM_SECONDARY_FONT_SIZE) {
    currentPositionFontSize -= FONT_SIZE_ADJUSTMENT_STEP;
    positionTextWidth = secondaryFont.widthOfTextAtSize(upperPosition, currentPositionFontSize);
  }
  // Ensure it doesn't go below minimum
  if (positionTextWidth > targetPositionWidth && currentPositionFontSize <= MINIMUM_SECONDARY_FONT_SIZE) {
      console.warn(`Position "${upperPosition}" might be too long to fit even at minimum font size.`);
  }

  const positionLineCenter = positionLineStartX + targetPositionWidth / 2;
  const positionLineYFromTop = 266.21;
  const positionTextX = positionLineCenter - positionTextWidth / 2;
  const positionYPosition = pdfPageHeight - positionLineYFromTop + SECONDARY_TEXT_OFFSET;

  pages.drawText(upperPosition, {
    x: positionTextX,
    y: positionYPosition,
    size: currentPositionFontSize, // Use adjusted font size
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
  { name: "Vũ Công Thiên Hoàn", position: "Teaching Assistant Lead" },
  { name: "Bùi Ngọc An Nguyên", position: "Corporate Communications Manager" },
];

// Generate certificates for test names
async function generateMultipleCertificates() {
  for (const person of names) {
    await generateParticipantCert(person.name, person.position);
  }
  console.log("All test certificates generated successfully!");
}

// Test in names with 2 cert


// Uncomment to generate from test data
generateMultipleCertificates().catch((error) =>
  console.error("Error generating test certificates:", error)
);

// Uncomment to generate from CSV file
// generateCertificatesFromCsv("./data.csv").catch(error => console.error("Error in CSV processing:", error));
