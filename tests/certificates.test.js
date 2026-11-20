import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { parse } from "csv-parse/sync";
import { unzipSync, zipSync } from "fflate";
import {
  FONT_FILES,
  createRenderer,
  generateBatch,
  certificateFilename,
} from "../public/lib/certificates.js";
import { readCsv, makeTable, mapParticipants } from "../public/lib/data.js";

const config = JSON.parse(
  await readFile(new URL("../config.json", import.meta.url), "utf8"),
);
const fontBytes = Object.fromEntries(
  await Promise.all(
    Object.entries(FONT_FILES).map(async ([key, file]) => [
      key,
      await readFile(new URL("../assets/" + file, import.meta.url)),
    ]),
  ),
);
const render = createRenderer({ PDFDocument, rgb, fontkit, fontBytes });
const template = await readFile(
  new URL("../assets/templates/ttt_tnv.pdf", import.meta.url),
);

test("CSV quotes, commas, BOM, escaped quotes, and multiline values stay in their columns", () => {
  const table = readCsv(
    '\ufeffName,Position\r\n"Doe, Jane","Teacher\nLead"\r\n"Nguyễn ""An""",Volunteer',
    parse,
  );
  assert.deepEqual(table.rows[0].cells, ["Doe, Jane", "Teacher\nLead"]);
  assert.deepEqual(table.rows[1].cells, ['Nguyễn "An"', "Volunteer"]);
  assert.throws(
    () => readCsv("Name,Position\nAlice,Teacher,extra", parse),
    /Invalid Record Length/,
  );
});

test("Excel-like values, blank rows, and duplicate headers normalize without losing source row numbers", () => {
  const table = makeTable([
    ["Name", "Name", ""],
    ["Alice", 0, "Teacher"],
    ["", "", ""],
    ["Bob", 42, "Lead"],
  ]);
  assert.deepEqual(table.headers, ["Name", "Name (2)", "Column 3"]);
  assert.equal(table.rows[0].cells[1], "0");
  assert.equal(table.rows[1].rowNumber, 4);
});

test("mapping supports custom fields and rejects missing mappings", () => {
  const table = readCsv("Full name,Course\nAlice,Math", parse);
  const fields = [{ id: "student", label: "Student", column: "Full name" }];
  assert.deepEqual(mapParticipants(table, fields), [
    { rowNumber: 2, values: { student: "Alice" } },
  ]);
  assert.throws(
    () => mapParticipants(table, [{ ...fields[0], column: "" }]),
    /Choose a data column/,
  );
});

test("duplicate names and custom fields produce unique, Unicode-safe ZIP entries", () => {
  const names = [
    certificateFilename({ fullName: "Nguyễn Văn An" }, 0),
    certificateFilename({ fullName: "Nguyễn Văn An" }, 1),
  ];
  assert.notEqual(names[0], names[1]);
  assert.match(names[0], /Nguyễn Văn An/);
  const entries = Object.fromEntries(
    names.map((name) => [name, new Uint8Array([1, 2])]),
  );
  assert.deepEqual(Object.keys(unzipSync(zipSync(entries))), names);
  assert.doesNotMatch(
    certificateFilename({ name: "../bad:name\n" }, 0),
    /[/\\:\n]/,
  );
});

test("batch failures remain associated with their source rows and never count as successes", async () => {
  const participants = [
    { rowNumber: 2, values: { name: "Alice" } },
    { rowNumber: 4, values: { name: "Bob" } },
    { rowNumber: 5, values: { name: "" } },
  ];
  const result = await generateBatch({
    templateBytes: template,
    fields: config.fields,
    participants,
    render: async (_template, _fields, values) => {
      if (values.name === "Alice") throw new Error("Write failed");
      return new Uint8Array([1]);
    },
  });
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].rowNumber, 4);
  assert.deepEqual(
    result.failures.map((failure) => failure.rowNumber),
    [2, 5],
  );
  const failed = await generateBatch({
    templateBytes: template,
    fields: config.fields,
    participants: participants.slice(0, 1),
    render: async () => {
      throw new Error("Failure");
    },
  });
  assert.equal(failed.files.length, 0);
  assert.equal(failed.failures.length, 1);
});

test("actual PDF generation preserves template pages and supports Vietnamese with font fitting", async () => {
  const document = await PDFDocument.load(template);
  document.addPage();
  const fields = structuredClone(config.fields);
  fields[0].width = 150;
  const bytes = await render(await document.save(), fields, {
    name: "Nguyễn Minh Anh",
    position: "Volunteer",
  });
  const generated = await PDFDocument.load(bytes);
  assert.equal(generated.getPageCount(), 2);
  assert.ok(bytes.length > 1000);
  assert.equal(
    generated.getPages()[0].getWidth(),
    document.getPages()[0].getWidth(),
  );
});

test("invalid placement, unsupported glyphs, and invalid sizes produce actionable errors", async () => {
  const outside = structuredClone(config.fields);
  outside[0].x = 0;
  await assert.rejects(
    render(template, outside, { name: "Alice" }),
    /outside the page/,
  );
  await assert.rejects(
    render(template, config.fields, { name: "Alice 😀" }),
    /characters this font cannot display/,
  );
  const invalid = structuredClone(config.fields);
  invalid[0].size = 0;
  await assert.rejects(
    render(template, invalid, { name: "Alice" }),
    /font size/,
  );
});
