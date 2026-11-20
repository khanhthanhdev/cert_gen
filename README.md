# Certificate Studio

A small certificate maker: choose a PDF, import people, position your text, and download.

## Start

Requires Node.js 22.13 or newer (Node 24 recommended).

```powershell
npm.cmd install
npm.cmd start
```

Open **http://localhost:3000**. On macOS/Linux, use `npm` instead of `npm.cmd`.

1. Use the included template or upload your own PDF.
2. Import CSV, TSV, XLS, or XLSX data. The first row must contain column names. For Excel, choose the worksheet.
3. Select a text field and its data column. Use the field picker above the preview, then click the page or drag the text area to position it. Arrow keys make small adjustments. Change its font, size, color, or width as needed. Long text automatically shrinks to fit.
4. Preview any participant, then generate. Download individual PDFs or all successful certificates as a ZIP. Failed rows are listed separately.

Use **Try sample people** to try the complete workflow without a file. Text is added to the first page; remaining pages are preserved. Export rotated templates in the correct orientation before importing.

Files are processed in the browser. They are never uploaded to a server. Layouts are remembered on this browser; participant data and generated PDFs are cleared when you refresh. **Save layout** exports your settings, and **Load layout** restores them. A custom template must be reopened after refreshing.

## Code map

- `public/app.js`: workspace state, event handlers, preview, and downloads.
- `public/lib/certificates.js`: shared PDF renderer, text fitting, unique filenames, and batch results.
- `public/lib/data.js`: CSV parsing options, table normalization, and column mapping.
- `tools/serve.js`: local static server. It serves only `public/`.
- `tools/build.js`: copies installed browser libraries and runtime assets into `public/`.
- `index.js`: optional CLI using the same renderer and data mapping as the browser.
- `config.json`: initial template, text fields, and CLI defaults.

There is one UI and one rendering path. No database, upload API, temporary download service, CDN, or environment configuration is needed. Generated copies in `public/vendor/`, `public/assets/`, and `public/defaults.json` are ignored by Git; edit their source files instead.

## Commands

```powershell
npm.cmd run dev           # Start with Node's file watcher
npm.cmd run build         # Build the static app into public/
npm.cmd test             # Data and PDF regression tests
npm.cmd run test:browser  # Full browser workflow (install Chromium first)
npm.cmd run format        # Format maintained source files
```

Browser tests use Playwright Chromium. Install it once with `npx.cmd playwright install chromium`. Set `BROWSER_CHANNEL=chrome` to use installed Chrome instead.

## Optional CLI

```powershell
npm.cmd run generate
npm.cmd run generate -- people.csv output
npm.cmd run generate -- people.xlsx output certificate-layout.json
```

The CLI uses the first worksheet for Excel. A layout saved by the browser works here too. For an uploaded custom template, add `"templatePath": "./my-template.pdf"` to the exported JSON. Default data and output paths are in `config.json`. Each run writes to a separate folder so previous certificates are preserved. Any failed row produces a nonzero exit status.

## Deployment

Run `npm run build` and host `public/` with any static host. Vercel settings are in `vercel.json`; see [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md).

The Excel dependency uses the maintained tarball from the [official SheetJS installation guide](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
