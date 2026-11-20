import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { parse } from "csv-parse/sync";
import XLSX from "xlsx";
import {
  FONT_FILES,
  createRenderer,
  generateBatch,
} from "./public/lib/certificates.js";
import { readCsv, makeTable, mapParticipants } from "./public/lib/data.js";

// Usage: npm run generate -- [data.csv|data.xlsx] [output-directory] [layout.json]
async function main() {
  const root = fileURLToPath(new URL("./", import.meta.url));
  const [dataArgument, outputArgument, layoutArgument] = process.argv.slice(2);
  const defaults = JSON.parse(
    await readFile(path.join(root, "config.json"), "utf8"),
  );
  const layout = layoutArgument
    ? JSON.parse(await readFile(path.resolve(layoutArgument), "utf8"))
    : defaults;
  const dataPath = dataArgument
    ? path.resolve(dataArgument)
    : path.resolve(root, defaults.cli.data);
  const outputRoot = outputArgument
    ? path.resolve(outputArgument)
    : path.resolve(root, defaults.cli.output);
  let table;
  if (/\.xlsx?$/i.test(dataPath)) {
    const workbook = XLSX.read(await readFile(dataPath), {
      type: "buffer",
      cellDates: true,
    });
    table = makeTable(
      XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
        header: 1,
        raw: false,
        defval: "",
        blankrows: true,
      }),
    );
  } else {
    table = readCsv(
      await readFile(dataPath, "utf8"),
      parse,
      /\.tsv$/i.test(dataPath) ? "\t" : ",",
    );
  }
  const fontBytes = Object.fromEntries(
    await Promise.all(
      Object.entries(FONT_FILES).map(async ([font, file]) => [
        font,
        await readFile(path.join(root, "assets", file)),
      ]),
    ),
  );
  const render = createRenderer({ PDFDocument, rgb, fontkit, fontBytes });
  const templatePath = layout.templatePath
    ? path.resolve(layout.templatePath)
    : path.join(root, "assets/templates", path.basename(layout.template));
  const templateBytes = await readFile(templatePath);
  const participants = mapParticipants(table, layout.fields);
  // A separate folder per run prevents an earlier batch from being overwritten.
  await mkdir(outputRoot, { recursive: true });
  const output = path.join(
    outputRoot,
    new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      crypto.randomUUID().slice(0, 8),
  );
  await mkdir(output);
  const result = await generateBatch({
    templateBytes,
    fields: layout.fields,
    participants,
    render,
  });
  for (const file of result.files)
    await writeFile(path.join(output, file.name), file.bytes);
  for (const failure of result.failures)
    console.error(`Row ${failure.rowNumber}: ${failure.message}`);
  console.log(
    `Generated ${result.files.length} of ${participants.length} certificates. ${result.failures.length} failed.`,
  );
  console.log(`Output: ${output}`);
  if (result.failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
