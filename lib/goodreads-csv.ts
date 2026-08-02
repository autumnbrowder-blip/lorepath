/**
 * Lightweight Goodreads CSV helpers — parse only, no network.
 * Goodreads exports often wrap ISBN cells as ="978…".
 */

export type GoodreadsCsvRow = {
  title: string;
  author: string;
  isbn: string | null;
  isbn13: string | null;
  exclusiveShelf: string | null;
  bookshelves: string | null;
  dateRead: string | null;
  /** Original row index in the CSV (for stable keys). */
  rowIndex: number;
};

export type GoodreadsParseResult = {
  rows: GoodreadsCsvRow[];
  /** Header names found (trimmed). */
  headers: string[];
};

const MAX_ROWS = 500;

function stripGoodreadsCell(raw: string): string {
  let value = raw.trim();
  // Goodreads formula-style: ="9781234567890" or ="" 
  if (value.startsWith("=")) {
    value = value.slice(1).trim();
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.replace(/""/g, '"').trim();
}

/** RFC-style CSV split that respects double-quoted fields. */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // Skip entirely empty trailing rows
    if (row.length === 1 && row[0] === "" && records.length > 0) {
      row = [];
      return;
    }
    records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      pushField();
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    field += ch;
  }

  // Final field / row
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  return records;
}

function headerIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function cellAt(row: string[], index: number): string {
  if (index < 0 || index >= row.length) return "";
  return stripGoodreadsCell(row[index] ?? "");
}

/**
 * Parse a Goodreads library export into structured rows.
 * Throws a user-facing Error when the file is empty or missing Title.
 */
export function parseGoodreadsCsv(csvText: string): GoodreadsParseResult {
  const trimmed = csvText.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    throw new Error("That scroll looks empty. Try exporting again from Goodreads.");
  }

  const records = parseCsvRecords(trimmed);
  if (records.length < 2) {
    throw new Error(
      "We couldn’t find any books in that file. Make sure it’s a Goodreads library export."
    );
  }

  const headers = records[0].map((h) => stripGoodreadsCell(h));
  const titleIdx = headerIndex(headers, ["Title"]);
  if (titleIdx < 0) {
    throw new Error(
      "This doesn’t look like a Goodreads export — we need a Title column."
    );
  }

  const authorIdx = headerIndex(headers, ["Author", "Author l-f"]);
  const isbnIdx = headerIndex(headers, ["ISBN"]);
  const isbn13Idx = headerIndex(headers, ["ISBN13", "ISBN-13"]);
  const exclusiveIdx = headerIndex(headers, ["Exclusive Shelf"]);
  const shelvesIdx = headerIndex(headers, ["Bookshelves"]);
  const dateReadIdx = headerIndex(headers, ["Date Read"]);

  const rows: GoodreadsCsvRow[] = [];

  for (let i = 1; i < records.length && rows.length < MAX_ROWS; i++) {
    const record = records[i];
    const title = cellAt(record, titleIdx);
    if (!title) continue;

    let author = cellAt(record, authorIdx);
    // Author l-f is "Last, First" — leave as-is for search; matching normalizes.
    if (!author) author = "Unknown author";

    rows.push({
      title,
      author,
      isbn: cellAt(record, isbnIdx) || null,
      isbn13: cellAt(record, isbn13Idx) || null,
      exclusiveShelf: cellAt(record, exclusiveIdx) || null,
      bookshelves: cellAt(record, shelvesIdx) || null,
      dateRead: cellAt(record, dateReadIdx) || null,
      rowIndex: i,
    });
  }

  if (rows.length === 0) {
    throw new Error(
      "No readable book rows were found. Check that your export includes titles."
    );
  }

  return { rows, headers };
}

export function isFinishedRead(row: GoodreadsCsvRow): boolean {
  const shelf = (row.exclusiveShelf ?? "").trim().toLowerCase();
  if (shelf === "read") return true;
  const shelves = (row.bookshelves ?? "").toLowerCase();
  // Exclusive shelf empty but bookshelves mentions read
  if (!shelf && /\bread\b/.test(shelves)) return true;
  return false;
}

/**
 * Prefer finished reads; if none, return all rows (conservative) so the
 * importer still has something to match.
 */
export function selectImportCandidates(rows: GoodreadsCsvRow[]): {
  candidates: GoodreadsCsvRow[];
  preferredReadShelf: boolean;
} {
  const reads = rows.filter(isFinishedRead);
  if (reads.length > 0) {
    return { candidates: reads, preferredReadShelf: true };
  }
  return { candidates: rows, preferredReadShelf: false };
}
