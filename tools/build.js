import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const publicDir = path.join(root, "public");

export async function build() {
  const vendor = path.join(publicDir, "vendor");
  await mkdir(vendor, { recursive: true });
  const libraries = {
    "pdf-lib/dist/pdf-lib.min.js": "pdf-lib.js",
    "@pdf-lib/fontkit/dist/fontkit.umd.min.js": "fontkit.js",
    "fflate/umd/index.js": "fflate.js",
    "xlsx/dist/xlsx.full.min.js": "xlsx.js",
    "csv-parse/dist/esm/sync.js": "csv-parse.js",
    "pdfjs-dist/build/pdf.mjs": "pdf.mjs",
    "pdfjs-dist/build/pdf.worker.mjs": "pdf.worker.mjs",
  };
  for (const [source, target] of Object.entries(libraries)) {
    await cp(
      path.join(root, "node_modules", source),
      path.join(vendor, target),
    );
  }
  for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
    await cp(
      path.join(root, "node_modules/pdfjs-dist", directory),
      path.join(vendor, directory),
      { recursive: true },
    );
  }
  // Publish runtime assets only: no repository, participant data, or output files.
  for (const directory of ["fonts", "templates"]) {
    await cp(
      path.join(root, "assets", directory),
      path.join(publicDir, "assets", directory),
      { recursive: true },
    );
  }
  const config = JSON.parse(
    await readFile(path.join(root, "config.json"), "utf8"),
  );
  const templates = (await readdir(path.join(root, "assets/templates"))).filter(
    (name) => name.endsWith(".pdf"),
  );
  await writeFile(
    path.join(publicDir, "defaults.json"),
    JSON.stringify(
      { template: config.template, fields: config.fields, templates },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await build();
  console.log("Built public/ for local use or static hosting.");
}
