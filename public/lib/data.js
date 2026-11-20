export function readCsv(text, parse, delimiter = ",") {
  return makeTable(
    parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count_less: true,
      delimiter,
    }),
  );
}

// CSV and Excel feed the same shape. Keep row numbers for useful error messages.
export function makeTable(records) {
  if (!records.length) throw new Error("The file is empty.");
  const used = new Set();
  const headers = records[0].map((value, index) => {
    const label = String(value ?? "").trim() || `Column ${index + 1}`;
    let unique = label;
    for (let suffix = 2; used.has(unique); suffix++)
      unique = `${label} (${suffix})`;
    used.add(unique);
    return unique;
  });
  const rows = records
    .slice(1)
    .map((cells, index) => ({
      rowNumber: index + 2,
      cells: headers.map((_, column) => String(cells[column] ?? "").trim()),
    }))
    .filter((row) => row.cells.some(Boolean));
  if (!rows.length)
    throw new Error("The file has headers but no participant rows.");
  return { headers, rows };
}

export function mapParticipants(table, fields) {
  if (!fields.length) throw new Error("Add at least one text field.");
  for (const field of fields) {
    if (!table.headers.includes(field.column))
      throw new Error(`Choose a data column for ${field.label}.`);
  }
  return table.rows.map((row) => ({
    rowNumber: row.rowNumber,
    values: Object.fromEntries(
      fields.map((field) => [
        field.id,
        row.cells[table.headers.indexOf(field.column)],
      ]),
    ),
  }));
}
