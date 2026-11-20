import { parse } from "./vendor/csv-parse.js";
import * as pdfjs from "./vendor/pdf.mjs";
import {
  FONT_FILES,
  validateFields,
  createRenderer,
  generateBatch,
} from "./lib/certificates.js";
import { readCsv, makeTable, mapParticipants } from "./lib/data.js";

pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "certificate-studio-layout-v1";
const PREVIEW_HINT =
  "Dashed lines mark text baselines. Arrow keys adjust position; Shift moves 10 points.";
const state = {
  settings: null,
  defaults: null,
  selected: null,
  templateBytes: null,
  table: null,
  workbook: null,
  render: null,
  previewBytes: null,
  previewVersion: 0,
  files: [],
  urls: [],
  busy: false,
};
let previewTimer;

function notify(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

function option(label, value) {
  return new Option(label, value);
}
function participantCount(count) {
  return `${count} participant${count === 1 ? "" : "s"}`;
}
function selectedField() {
  return state.settings.fields.find((field) => field.id === state.selected);
}
function saveLayout() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  } catch {
    notify(
      "Your browser could not remember this layout. Use Save layout to keep a copy.",
    );
  }
}

function clearResults() {
  state.urls.forEach((url) => URL.revokeObjectURL(url));
  state.urls = [];
  state.files = [];
  $("results").hidden = true;
  $("result-files").replaceChildren();
}

function updateActions() {
  $("generate").disabled =
    state.busy ||
    !state.templateBytes ||
    !state.table ||
    !state.settings.fields.length;
  $("download-preview").disabled = state.busy || !state.previewBytes;
  $("export-info").textContent = state.table
    ? `${participantCount(state.table.rows.length)} · Individual PDFs or ZIP`
    : "Import participant data to generate PDFs.";
}

function changed() {
  saveLayout();
  clearResults();
  renderFieldList();
  drawGuides();
  schedulePreview();
  updateActions();
}

function renderFieldList() {
  $("placement-field").replaceChildren(
    ...state.settings.fields.map((field) =>
      option(field.label || "Unnamed field", field.id),
    ),
  );
  $("placement-field").value = state.selected;
  $("fields").replaceChildren(
    ...state.settings.fields.map((field) => {
      const button = document.createElement("button");
      button.className = "field-button";
      button.setAttribute("aria-pressed", field.id === state.selected);
      const label = document.createElement("span");
      label.textContent = field.label || "Unnamed field";
      const column = document.createElement("span");
      column.textContent = field.column || "Choose a column";
      button.append(label, column);
      button.addEventListener("click", () => selectField(field.id));
      return button;
    }),
  );
}

function selectField(id) {
  state.selected = id;
  renderFieldList();
  renderEditor();
  drawGuides();
}

// Clicks, dragging, and keyboard nudges all use the same PDF coordinate limits.
function moveField(field, x, y) {
  const page = state.settings.pageSize;
  const halfWidth = Math.min(field.width, page.width) / 2;
  field.x = Math.max(halfWidth, Math.min(page.width - halfWidth, x));
  field.y = Math.max(field.size, Math.min(page.height - field.size / 3, y));
  renderEditor();
  drawGuides();
}

function bindPlacement() {
  const surface = $("page-wrap");
  let drag = null;
  surface.addEventListener("pointerdown", (event) => {
    if (
      state.busy ||
      !state.templateBytes ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return;
    const guide = event.target.closest(".guide");
    if (guide) selectField(guide.dataset.fieldId);
    const field = selectedField();
    if (!field) return;
    const rect = surface.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      field,
      guide: !!guide,
      rect,
      startX: event.clientX,
      startY: event.clientY,
      x: field.x,
      y: field.y,
      moved: false,
    };
    surface.setPointerCapture(event.pointerId);
    if (guide) event.preventDefault();
  });
  surface.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    if (!drag.guide) return;
    const page = state.settings.pageSize;
    moveField(
      drag.field,
      drag.x + (dx / drag.rect.width) * page.width,
      drag.y + (dy / drag.rect.height) * page.height,
    );
  });
  function finish(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    if (surface.hasPointerCapture(event.pointerId))
      surface.releasePointerCapture(event.pointerId);
    if (event.type !== "pointerup") {
      moveField(current.field, current.x, current.y);
      return;
    }
    if (!current.guide && !current.moved) {
      const page = state.settings.pageSize;
      moveField(
        current.field,
        Math.round(
          ((event.clientX - current.rect.left) / current.rect.width) *
            page.width,
        ),
        Math.round(
          ((event.clientY - current.rect.top) / current.rect.height) *
            page.height,
        ),
      );
    } else if (!current.moved) return;
    changed();
  }
  surface.addEventListener("pointerup", finish);
  surface.addEventListener("pointercancel", finish);
  surface.addEventListener("lostpointercapture", finish);
}

function renderEditor() {
  const field = selectedField();
  $("field-editor").hidden = !field;
  if (!field) return;
  $("remove-field").disabled = state.settings.fields.length === 1;
  for (const key of ["label", "font", "size", "width", "color", "x", "y"])
    $("field-" + key).value = field[key];
  $("field-capitalize").checked = !!field.capitalize;
  $("field-column").replaceChildren(
    option(state.table ? "Choose a column…" : "Import data first", ""),
  );
  if (state.table)
    state.table.headers.forEach((header) =>
      $("field-column").add(option(header, header)),
    );
  $("field-column").value = field.column || "";
}

function drawGuides() {
  $("guides").replaceChildren();
  const page = state.settings.pageSize;
  if (!page || !$("show-guides").checked || !state.templateBytes) return;
  for (const field of state.settings.fields) {
    const guide = document.createElement("div");
    guide.className = "guide" + (field.id === state.selected ? " active" : "");
    guide.dataset.fieldId = field.id;
    guide.style.left = `${(field.x / page.width) * 100}%`;
    guide.style.top = `${(field.y / page.height) * 100}%`;
    guide.style.width = `${(field.width / page.width) * 100}%`;
    guide.style.height = `${(field.size / page.height) * 100}%`;
    guide.tabIndex = 0;
    guide.setAttribute("role", "button");
    guide.setAttribute(
      "aria-label",
      `Position ${field.label}. Use arrow keys to move, Shift for larger steps.`,
    );
    const label = document.createElement("span");
    label.textContent = field.label;
    guide.append(label);
    guide.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!state.busy) selectField(field.id);
    });
    guide.addEventListener("keydown", (event) => {
      if (state.busy) return;
      const delta = event.shiftKey ? 10 : 1;
      const moves = {
        ArrowLeft: [-delta, 0],
        ArrowRight: [delta, 0],
        ArrowUp: [0, -delta],
        ArrowDown: [0, delta],
      };
      if (moves[event.key]) {
        event.preventDefault();
        state.selected = field.id;
        moveField(
          field,
          field.x + moves[event.key][0],
          field.y + moves[event.key][1],
        );
        changed();
        const next = [...$("guides").children].find(
          (element) => element.dataset.fieldId === field.id,
        );
        next?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectField(field.id);
      }
    });
    $("guides").append(guide);
  }
}

function previewValues() {
  const row = state.table?.rows[Number($("preview-person").value) || 0];
  return Object.fromEntries(
    state.settings.fields.map((field) => {
      const index = state.table?.headers.indexOf(field.column) ?? -1;
      const sample =
        field.id === "name"
          ? "Nguyễn Minh Anh"
          : field.id === "position"
            ? "Volunteer"
            : field.label;
      return [field.id, row && index >= 0 ? row.cells[index] : sample];
    }),
  );
}

function schedulePreview() {
  clearTimeout(previewTimer);
  state.previewVersion++;
  state.previewBytes = null;
  updateActions();
  previewTimer = setTimeout(renderPreview, 220);
}

async function renderPreview() {
  if (!state.templateBytes || !state.render) return;
  const version = state.previewVersion;
  let loadingTask;
  try {
    const bytes = await state.render(
      state.templateBytes,
      structuredClone(state.settings.fields),
      previewValues(),
    );
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      cMapUrl: "/vendor/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/vendor/standard_fonts/",
      wasmUrl: "/vendor/wasm/",
    });
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({
      canvas,
      canvasContext: canvas.getContext("2d"),
      viewport,
    }).promise;
    // Finish into a separate canvas so an older render never overwrites new edits.
    if (version !== state.previewVersion) return;
    const target = $("preview");
    target.width = canvas.width;
    target.height = canvas.height;
    target.getContext("2d").drawImage(canvas, 0, 0);
    $("page-wrap").style.display = "block";
    $("preview-empty").hidden = true;
    $("preview-note").textContent = PREVIEW_HINT;
    state.previewBytes = bytes;
    drawGuides();
  } catch (error) {
    if (version !== state.previewVersion) return;
    state.previewBytes = null;
    $("preview-note").textContent = error.message;
    notify(error.message, true);
  } finally {
    await loadingTask?.destroy();
    updateActions();
  }
}

async function loadTemplate(bytes, name, bundled = null, scaleFields = true) {
  const document = await window.PDFLib.PDFDocument.load(bytes);
  const page = document.getPages()[0];
  if (!page) throw new Error("The PDF has no pages.");
  if (page.getRotation().angle !== 0)
    throw new Error(
      "Please export the PDF in its correct orientation, without page rotation.",
    );
  const previous = state.settings.pageSize;
  const pageSize = { width: page.getWidth(), height: page.getHeight() };
  if (scaleFields && previous) {
    state.settings.fields.forEach((field) => {
      field.x *= pageSize.width / previous.width;
      field.y *= pageSize.height / previous.height;
      field.width *= pageSize.width / previous.width;
    });
  }
  state.templateBytes = new Uint8Array(bytes);
  state.settings.pageSize = pageSize;
  $("page-wrap").style.setProperty(
    "--page-aspect",
    pageSize.width / pageSize.height,
  );
  state.settings.template = bundled;
  state.settings.templateName = name;
  renderTemplateOptions();
  $("template-info").textContent =
    `${name} · ${Math.round(pageSize.width)} × ${Math.round(pageSize.height)} pt · text on page 1`;
  renderEditor();
  changed();
  notify("Template ready.");
}

function renderTemplateOptions() {
  $("template-select").replaceChildren(
    ...state.defaults.templates.map((name) => option(name, name)),
  );
  if (!state.settings.template)
    $("template-select").add(
      option(
        state.settings.templateName || "Reopen your custom PDF",
        "__custom__",
      ),
    );
  $("template-select").value = state.settings.template || "__custom__";
  $("template-select").disabled = false;
}

async function loadBundledTemplate(name, scaleFields = true) {
  const response = await fetch("/assets/templates/" + encodeURIComponent(name));
  if (!response.ok)
    throw new Error("Could not load the template. Try uploading a PDF.");
  await loadTemplate(
    new Uint8Array(await response.arrayBuffer()),
    name,
    name,
    scaleFields,
  );
}

function setTable(table, name) {
  state.table = table;
  for (const field of state.settings.fields) {
    if (!table.headers.includes(field.column)) {
      field.column =
        table.headers.find((header) =>
          [field.id, field.label].some(
            (value) => header.toLowerCase() === value.toLowerCase(),
          ),
        ) || "";
    }
  }
  $("data-info").textContent =
    `${name} · ${participantCount(table.rows.length)} · ${table.headers.length} columns`;
  $("preview-person").replaceChildren(
    ...table.rows.map((row, index) =>
      option(`${index + 1}. ${row.cells.find(Boolean) || "Person"}`, index),
    ),
  );
  const preview = document.createElement("table");
  const head = preview.createTHead().insertRow();
  for (const header of table.headers) {
    const cell = document.createElement("th");
    cell.textContent = header;
    head.append(cell);
  }
  const body = preview.createTBody();
  for (const row of table.rows.slice(0, 3))
    for (const [index, value] of row.cells.entries()) {
      if (!index) body.insertRow();
      body.rows[body.rows.length - 1].insertCell().textContent = value;
    }
  $("data-preview").replaceChildren(preview);
  $("data-preview").hidden = false;
  renderEditor();
  changed();
  notify(`${participantCount(table.rows.length)} imported.`);
}

function selectWorksheet() {
  const sheet = state.workbook.Sheets[$("sheet-select").value];
  setTable(
    makeTable(
      window.XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: true,
      }),
    ),
    $("sheet-select").value,
  );
}

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function showResults(result, total) {
  state.files = result.files;
  $("results").hidden = false;
  $("result-summary").textContent =
    `${result.files.length} of ${total} generated · ${result.failures.length} failed`;
  $("download-zip").hidden = !result.files.length;
  $("result-files").replaceChildren(
    ...result.files.map((file) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const url = URL.createObjectURL(
        new Blob([file.bytes], { type: "application/pdf" }),
      );
      state.urls.push(url);
      link.href = url;
      link.download = file.name;
      link.textContent = file.name;
      item.append(link);
      return item;
    }),
  );
  $("failure-details").hidden = !result.failures.length;
  $("failure-list").replaceChildren(
    ...result.failures.map((failure) => {
      const item = document.createElement("li");
      item.textContent = `Row ${failure.rowNumber}: ${failure.message}`;
      return item;
    }),
  );
  $("failure-details").open = !!result.failures.length;
  notify(
    `${result.files.length} of ${total} certificates generated. ${result.failures.length ? "Review the failed rows below." : "Downloads ready."}`,
    !!result.failures.length,
  );
}

async function generate() {
  const fields = structuredClone(state.settings.fields);
  validateFields(fields);
  const participants = mapParticipants(state.table, fields);
  clearResults();
  state.busy = true;
  const controls = [...document.querySelectorAll("button,input,select")];
  const disabled = controls.map((control) => control.disabled);
  controls.forEach((control) => (control.disabled = true));
  $("progress").hidden = false;
  $("progress").value = 0;
  try {
    const result = await generateBatch({
      templateBytes: state.templateBytes,
      fields,
      participants,
      render: state.render,
      onProgress: async (done, total) => {
        $("progress").value = (done / total) * 100;
        notify(`Creating certificate ${done} of ${total}…`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });
    showResults(result, participants.length);
  } finally {
    state.busy = false;
    $("progress").hidden = true;
    controls.forEach((control, index) => (control.disabled = disabled[index]));
    updateActions();
  }
}

// Keep asynchronous failures visible instead of leaving controls stuck or failing silently.
function on(id, event, handler) {
  $(id).addEventListener(event, async (event) => {
    if (state.busy) return;
    try {
      await handler(event);
    } catch (error) {
      notify(error.message, true);
    }
  });
}

function bindEvents() {
  on("template-select", "change", async (event) => {
    if (event.target.value === "__custom__") {
      $("template-file").click();
      return;
    }
    try {
      await loadBundledTemplate(event.target.value);
    } finally {
      renderTemplateOptions();
    }
  });
  on("template-file", "change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (file)
      await loadTemplate(new Uint8Array(await file.arrayBuffer()), file.name);
  });
  on("data-file", "change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      const workbook = window.XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: true,
      });
      state.workbook = workbook;
      $("sheet-select").replaceChildren(
        ...workbook.SheetNames.map((name) => option(name, name)),
      );
      $("sheet-row").hidden = workbook.SheetNames.length < 2;
      const first = makeTable(
        window.XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]],
          { header: 1, raw: false, defval: "", blankrows: true },
        ),
      );
      setTable(first, file.name);
    } else {
      const table = readCsv(
        await file.text(),
        parse,
        /\.tsv$/i.test(file.name) ? "\t" : ",",
      );
      state.workbook = null;
      $("sheet-row").hidden = true;
      setTable(table, file.name);
    }
  });
  on("sheet-select", "change", selectWorksheet);
  on("sample", "click", () => {
    $("sheet-row").hidden = true;
    state.workbook = null;
    setTable(
      readCsv(
        'Name,Position\nNguyễn Minh Anh,Volunteer\n"Doe, Jane",Teacher\nTrần Hoàng Nam,Team Lead',
        parse,
      ),
      "Sample data",
    );
  });
  on("add-field", "click", () => {
    const page = state.settings.pageSize || { width: 842, height: 595 };
    const id = "field-" + crypto.randomUUID();
    state.settings.fields.push({
      id,
      label: "New field",
      column: "",
      font: "sansBold",
      size: 24,
      color: "#212e66",
      x: page.width / 2,
      y: page.height / 2,
      width: page.width / 2,
      capitalize: false,
    });
    state.selected = id;
    changed();
    renderEditor();
    $("field-label").focus();
    $("field-label").select();
  });
  on("remove-field", "click", () => {
    if (state.settings.fields.length === 1) return;
    state.settings.fields = state.settings.fields.filter(
      (field) => field.id !== state.selected,
    );
    state.selected = state.settings.fields[0]?.id;
    changed();
    renderEditor();
  });
  for (const key of [
    "label",
    "column",
    "font",
    "size",
    "width",
    "color",
    "x",
    "y",
    "capitalize",
  ]) {
    on("field-" + key, key === "label" ? "input" : "change", (event) => {
      const field = selectedField();
      if (!field) return;
      field[key] = ["size", "width", "x", "y"].includes(key)
        ? Number(event.target.value)
        : key === "capitalize"
          ? event.target.checked
          : event.target.value;
      changed();
    });
  }
  bindPlacement();
  on("placement-field", "change", (event) => selectField(event.target.value));
  on("show-guides", "change", drawGuides);
  on("preview-person", "change", schedulePreview);
  on("generate", "click", generate);
  on("download-preview", "click", () =>
    download(state.previewBytes, "certificate-preview.pdf", "application/pdf"),
  );
  on("download-zip", "click", async () => {
    $("download-zip").disabled = true;
    try {
      const bytes = await new Promise((resolve, reject) =>
        window.fflate.zip(
          Object.fromEntries(
            state.files.map((file) => [file.name, file.bytes]),
          ),
          { level: 0 },
          (error, data) => (error ? reject(error) : resolve(data)),
        ),
      );
      download(bytes, "certificates.zip", "application/zip");
    } finally {
      $("download-zip").disabled = false;
    }
  });
  on("export-settings", "click", () =>
    download(
      JSON.stringify(state.settings, null, 2),
      "certificate-layout.json",
      "application/json",
    ),
  );
  on("settings-file", "change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const layout = JSON.parse(await file.text());
    validateFields(layout.fields);
    state.settings = {
      fields: layout.fields,
      template: state.defaults.templates.includes(layout.template)
        ? layout.template
        : null,
      templateName: layout.templateName,
    };
    state.selected = layout.fields[0].id;
    state.templateBytes = null;
    if (state.settings.template)
      await loadBundledTemplate(state.settings.template, false);
    else {
      $("page-wrap").style.display = "none";
      $("preview-empty").hidden = false;
      notify("Layout loaded. Reopen the custom PDF it belongs to.");
    }
    renderTemplateOptions();
    renderEditor();
    changed();
  });
  on("reset", "click", async () => {
    if (!confirm("Reset the layout and clear participant data and downloads?"))
      return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
}

async function init() {
  const response = await fetch("/defaults.json");
  if (!response.ok)
    throw new Error(
      "Could not load the app settings. Restart the app and refresh.",
    );
  state.defaults = await response.json();
  state.settings = {
    template: state.defaults.template,
    fields: structuredClone(state.defaults.fields),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      validateFields(saved.fields);
      state.settings = saved;
    }
  } catch {
    /* A broken or outdated saved layout must not prevent startup. */
  }
  if (!state.defaults.templates.includes(state.settings.template))
    state.settings.template = null;
  state.selected = state.settings.fields[0]?.id;
  const fontBytes = Object.fromEntries(
    await Promise.all(
      Object.entries(FONT_FILES).map(async ([font, path]) => {
        const response = await fetch("/assets/" + path);
        if (!response.ok)
          throw new Error(
            "Could not load the fonts. Restart the app and refresh.",
          );
        return [font, new Uint8Array(await response.arrayBuffer())];
      }),
    ),
  );
  state.render = createRenderer({
    ...window.PDFLib,
    fontkit: window.fontkit,
    fontBytes,
  });
  bindEvents();
  renderTemplateOptions();
  renderFieldList();
  renderEditor();
  if (state.settings.template)
    await loadBundledTemplate(state.settings.template, false);
  else {
    notify("Layout loaded. Reopen the custom PDF to continue.");
    updateActions();
  }
}

init().catch((error) => notify(error.message, true));
