// Shared by the browser and CLI. Measurements are PDF points, from the top.
export const FONT_FILES = {
  script: "fonts/MonteCarlo/MonteCarlo-Regular.ttf",
  sans: "fonts/Quicksand/static/Quicksand-Regular.ttf",
  sansBold: "fonts/Quicksand/static/Quicksand-Bold.ttf",
};

export function validateFields(fields) {
  if (!Array.isArray(fields) || !fields.length)
    throw new Error("Add at least one text field.");
  const ids = new Set();
  for (const field of fields) {
    if (!field.id || ids.has(field.id))
      throw new Error("Each field needs a unique ID.");
    ids.add(field.id);
    if (!field.label?.trim()) throw new Error("Give every field a name.");
    if (!Object.hasOwn(FONT_FILES, field.font))
      throw new Error(`Choose a font for ${field.label}.`);
    for (const key of ["x", "y", "width", "size"]) {
      if (!Number.isFinite(field[key]) || field[key] < 0)
        throw new Error(`${field.label}: ${key} must be a positive number.`);
    }
    if (field.width < 1 || field.size < 6 || field.size > 200) {
      throw new Error(
        `${field.label}: use a width above zero and a font size from 6 to 200.`,
      );
    }
    if (!/^#[\da-f]{6}$/i.test(field.color))
      throw new Error(`Choose a color for ${field.label}.`);
  }
}

export function formatText(value, field) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!field.capitalize || (word.length > 1 && word === word.toUpperCase()))
        return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(field.wordSpacing || " ");
}

export function certificateFilename(values, index) {
  const title =
    values.name ||
    Object.values(values).find((value) => String(value).trim()) ||
    "Participant";
  const safe =
    String(title)
      .normalize("NFC")
      .replace(/[\x00-\x1f\x7f/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90)
      .replace(/[ .]+$/, "") || "Participant";
  // Sequence prevents collisions for duplicate names and custom fields.
  return `${String(index + 1).padStart(3, "0")}-${safe}.pdf`;
}

// Supply dependencies once so both runtimes use the exact same renderer.
export function createRenderer({ PDFDocument, rgb, fontkit, fontBytes }) {
  return async function renderCertificate(templateBytes, fields, values) {
    validateFields(fields);
    const document = await PDFDocument.load(templateBytes);
    document.registerFontkit(fontkit);
    const page = document.getPages()[0];
    if (!page) throw new Error("The template has no pages.");
    if (page.getRotation().angle !== 0)
      throw new Error(
        "Use an unrotated PDF template (export it in the correct orientation).",
      );
    const fonts = new Map();
    for (const field of fields) {
      const text = formatText(values[field.id], field);
      if (!text) continue;
      if (
        field.x - field.width / 2 < 0 ||
        field.x + field.width / 2 > page.getWidth() ||
        field.y > page.getHeight()
      ) {
        throw new Error(
          `${field.label} is outside the page. Move it or reduce its width.`,
        );
      }
      // Full embedding preserves MonteCarlo's Vietnamese glyphs and ligatures.
      if (!fonts.has(field.font))
        fonts.set(field.font, await document.embedFont(fontBytes[field.font]));
      const font = fonts.get(field.font);
      const supported = new Set(font.getCharacterSet());
      if ([...text].some((char) => !supported.has(char.codePointAt(0)))) {
        throw new Error(
          `${field.label} contains characters this font cannot display. Try another font.`,
        );
      }
      const naturalWidth = font.widthOfTextAtSize(text, field.size);
      const size = naturalWidth
        ? Math.min(field.size, (field.size * field.width) / naturalWidth)
        : field.size;
      if (size < 6)
        throw new Error(
          `${field.label} is too long. Widen the text area or shorten the value.`,
        );
      const width = font.widthOfTextAtSize(text, size);
      const height = font.heightAtSize(size, { descender: false });
      if (field.y < height)
        throw new Error(
          `${field.label} is too close to the top. Move it down.`,
        );
      const descender = font.heightAtSize(size) - height;
      if (field.y + descender > page.getHeight())
        throw new Error(
          `${field.label} is too close to the bottom. Move it up.`,
        );
      const channels = field.color
        .slice(1)
        .match(/.{2}/g)
        .map((hex) => parseInt(hex, 16) / 255);
      page.drawText(text, {
        x: field.x - width / 2,
        y: page.getHeight() - field.y,
        size,
        font,
        color: rgb(...channels),
      });
    }
    return document.save();
  };
}

export async function generateBatch({
  templateBytes,
  fields,
  participants,
  render,
  onProgress = () => {},
}) {
  validateFields(fields);
  if (!participants.length) throw new Error("Add participant data first.");
  const files = [];
  const failures = [];
  for (const [index, participant] of participants.entries()) {
    try {
      if (
        !Object.values(participant.values).some((value) => String(value).trim())
      )
        throw new Error("No values in the selected columns.");
      const bytes = await render(templateBytes, fields, participant.values);
      files.push({
        name: certificateFilename(participant.values, index),
        bytes,
        rowNumber: participant.rowNumber,
      });
    } catch (error) {
      failures.push({
        rowNumber: participant.rowNumber,
        message: error.message,
      });
    }
    await onProgress(index + 1, participants.length);
  }
  return { files, failures };
}
