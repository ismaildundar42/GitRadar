// Tab-separated text as spreadsheets put it on the clipboard: cells holding a tab,
// a line break or a quote are wrapped in quotes, with inner quotes doubled.

export function toTsv(rows) {
  return rows.map((row) => row.map(quoteCell).join("\t")).join("\r\n");
}

function quoteCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Parses clipboard text into rows of cells. A single trailing line break is ignored. */
export function parseTsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let quoted = false;
  let atCellStart = true;
  const s = String(text ?? "");
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
      i++;
      continue;
    }
    if (ch === "\t") {
      row.push(cell);
      cell = "";
      atCellStart = true;
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atCellStart = true;
      i += ch === "\r" && s[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += ch;
    atCellStart = false;
    i++;
  }
  if (cell !== "" || row.length > 0 || (!rows.length && s.length > 0)) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
