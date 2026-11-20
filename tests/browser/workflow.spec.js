import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import XLSX from "xlsx";

async function ready(page) {
  await page.goto("/");
  await expect(page.locator("#download-preview")).toBeEnabled({
    timeout: 20_000,
  });
}

test("field picker, scaled dragging, and page-edge placement stay synchronized", async ({
  page,
}) => {
  await ready(page);
  const layout = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("certificate-studio-layout-v1")),
    );
  await page.locator("#placement-field").selectOption("position");
  await expect(page.locator("#field-label")).toHaveValue("Position");
  await expect(page.locator(".guide.active")).toHaveAttribute(
    "data-field-id",
    "position",
  );

  await page.locator("#page-wrap").scrollIntoViewIfNeeded();
  let rect = await page.locator("#page-wrap").boundingBox();
  await page.mouse.click(
    rect.x + rect.width * 0.35,
    rect.y + rect.height * 0.65,
  );
  let saved = await layout();
  let field = saved.fields.find((field) => field.id === "position");
  expect(field.x).toBeCloseTo(Math.round(saved.pageSize.width * 0.35), 0);
  expect(field.y).toBeCloseTo(Math.round(saved.pageSize.height * 0.65), 0);

  // Grab off-center: moving must preserve the grab offset rather than snap to the cursor.
  const before = { ...field };
  const guide = await page.locator(".guide.active").boundingBox();
  await page.mouse.move(
    guide.x + guide.width * 0.2,
    guide.y + guide.height - 3,
  );
  await page.mouse.down();
  await page.mouse.move(
    guide.x + guide.width * 0.2 + 45,
    guide.y + guide.height - 3 + 22,
    { steps: 5 },
  );
  await page.mouse.up();
  saved = await layout();
  field = saved.fields.find((field) => field.id === "position");
  expect(field.x).toBeCloseTo(
    before.x + (45 / rect.width) * saved.pageSize.width,
    1,
  );
  expect(field.y).toBeCloseTo(
    before.y + (22 / rect.height) * saved.pageSize.height,
    1,
  );

  await page.setViewportSize({ width: 700, height: 1100 });
  await page.locator("#page-wrap").scrollIntoViewIfNeeded();
  rect = await page.locator("#page-wrap").boundingBox();
  await page.mouse.click(rect.x + 2, rect.y + rect.height * 0.8);
  saved = await layout();
  field = saved.fields.find((field) => field.id === "position");
  expect(field.x).toBe(field.width / 2);
  await expect(page.locator("#download-preview")).toBeEnabled();
  await expect(page.locator("#placement-field")).toHaveValue("position");
  await page.locator(".guide.active").focus();
  await page.keyboard.press("ArrowDown");
  saved = await layout();
  expect(saved.fields.find((field) => field.id === "position").y).toBe(
    field.y + 1,
  );
  await page.reload();
  await expect(page.locator("#download-preview")).toBeEnabled();
  expect(
    (await layout()).fields.find((field) => field.id === "position").y,
  ).toBe(field.y + 1);
  const download = page.waitForEvent("download");
  await page.locator("#download-preview").click();
  const pdf = await download;
  const actual = await page.evaluate(
    async (bytes) => {
      const pdfjs = await import("/vendor/pdf.mjs");
      const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
      try {
        const document = await task.promise;
        const text = await (await document.getPage(1)).getTextContent();
        const item = text.items.find((item) => item.str === "Volunteer");
        return {
          center: item.transform[4] + item.width / 2,
          baseline: item.transform[5],
        };
      } finally {
        await task.destroy();
      }
    },
    [...(await readFile(await pdf.path()))],
  );
  expect(actual.center).toBeCloseTo(field.x, 1);
  expect(actual.baseline).toBeCloseTo(saved.pageSize.height - field.y - 1, 1);
  await page.screenshot({
    path: test.info().outputPath("field-placement.png"),
    fullPage: true,
  });
});

test("CSV to preview to individual Unicode downloads and ZIP", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.locator("#data-file").setInputFiles({
    name: "people.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Name,Position\n"Doe, Jane",Teacher\nNguyễn Minh Anh,Volunteer\nNguyễn Minh Anh,Volunteer',
    ),
  });
  await expect(page.locator("#data-info")).toContainText("3 participants");
  await expect(page.locator("#data-preview tbody tr").first()).toContainText(
    "Doe, Jane",
  );
  await page.locator("#preview-person").selectOption("1");
  await expect(page.locator("#download-preview")).toBeEnabled();
  await page.screenshot({
    path: test.info().outputPath("workspace-desktop.png"),
    fullPage: true,
  });
  await page.locator("#generate").click();
  await expect(page.locator("#result-summary")).toHaveText(
    "3 of 3 generated · 0 failed",
    { timeout: 30_000 },
  );
  const individual = page.waitForEvent("download");
  await page.locator("#result-files a").nth(1).click();
  const pdf = await individual;
  expect(pdf.suggestedFilename()).toContain("Nguyễn Minh Anh");
  const pdfBytes = await readFile(await pdf.path());
  const text = await page.evaluate(
    async (bytes) => {
      const pdfjs = await import("/vendor/pdf.mjs");
      const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
      try {
        const document = await task.promise;
        const page = await document.getPage(1);
        return (await page.getTextContent()).items
          .map((item) => item.str)
          .join(" ")
          .normalize("NFC");
      } finally {
        await task.destroy();
      }
    },
    [...pdfBytes],
  );
  expect(text).toContain("Nguyễn Minh Anh");
  expect(
    (await PDFDocument.load(await readFile(await pdf.path()))).getPageCount(),
  ).toBe(1);
  const zipDownload = page.waitForEvent("download");
  await page.locator("#download-zip").click();
  const zip = await zipDownload;
  const entries = unzipSync(await readFile(await zip.path()));
  expect(Object.keys(entries)).toHaveLength(3);
  expect(Object.keys(entries)[1]).toContain("Nguyễn Minh Anh");
  expect(errors).toEqual([]);
});

test("deleting a field persists, custom fields map, and layout edits invalidate old downloads", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#sample").click();
  await page.locator(".field-button").filter({ hasText: "Position" }).click();
  await page.locator("#remove-field").click();
  await page.reload();
  await expect(page.locator(".field-button")).toHaveCount(1);
  await expect(page.locator("#download-preview")).toBeEnabled();
  await page.locator("#sample").click();
  await page.locator("#add-field").click();
  await page.locator("#field-label").fill("Role");
  await page.locator("#field-column").selectOption("Position");
  await page.getByText("Exact position", { exact: true }).click();
  await page.locator("#field-y").fill("360");
  await page.locator("#field-y").press("Tab");
  const bounds = await page.locator("#preview").boundingBox();
  await page
    .locator("#preview")
    .click({ position: { x: bounds.width * 0.55, y: bounds.height * 0.65 } });
  const x = Number(await page.locator("#field-x").inputValue());
  await page.locator(".guide.active").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#field-x")).toHaveValue(String(x + 1));
  await page.locator("#generate").click();
  await expect(page.locator("#result-summary")).toHaveText(
    "3 of 3 generated · 0 failed",
    { timeout: 30_000 },
  );
  await page.locator("#field-size").fill("20");
  await page.locator("#field-size").press("Tab");
  await expect(page.locator("#results")).toBeHidden();
  const savedLayout = page.waitForEvent("download");
  await page.locator("#export-settings").click();
  const layout = await savedLayout;
  const bytes = await readFile(await layout.path());
  await page.locator("#settings-file").setInputFiles({
    name: "layout.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.locator(".field-button")).toHaveCount(2);
  await expect(page.locator("#download-preview")).toBeEnabled();
});

test("Excel sheets, custom PDF upload, and responsive layout work", async ({
  page,
}) => {
  await ready(page);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Name", "Position"],
      ["Alice", "Teacher"],
    ]),
    "Teachers",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Name", "Position"],
      ["Bob", "Volunteer"],
      ["Carol", "Lead"],
    ]),
    "Volunteers",
  );
  await page.locator("#data-file").setInputFiles({
    name: "people.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
  });
  await expect(page.locator("#data-info")).toContainText("1 participant");
  await page.locator("#sheet-select").selectOption("Volunteers");
  await expect(page.locator("#data-info")).toContainText("2 participants");
  const document = await PDFDocument.create();
  document.addPage([842, 595]);
  await page.locator("#template-file").setInputFiles({
    name: "custom.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await document.save()),
  });
  await expect(page.locator("#template-info")).toContainText("custom.pdf");
  await expect(page.locator("#download-preview")).toBeEnabled();
  await page.locator("#generate").click();
  await expect(page.locator("#result-summary")).toHaveText(
    "2 of 2 generated · 0 failed",
    { timeout: 30_000 },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("workspace-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("generation failures are reported accurately and source files are not exposed", async ({
  page,
  request,
}) => {
  await ready(page);
  await page.locator("#sample").click();
  await page.locator("#field-width").fill("1");
  await page.locator("#field-width").press("Tab");
  await page.locator("#generate").click();
  await expect(page.locator("#result-summary")).toHaveText(
    "0 of 3 generated · 3 failed",
    { timeout: 30_000 },
  );
  await expect(page.locator("#download-zip")).toBeHidden();
  await expect(page.locator("#failure-list li")).toHaveCount(3);
  expect((await request.get("/config.json")).status()).toBe(404);
  expect((await request.get("/assets/sample-data/ttt_tnv.csv")).status()).toBe(
    404,
  );
});
