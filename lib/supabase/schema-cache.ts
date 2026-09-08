/**
 * Process-local cache for PostgREST schema errors (PGRST204 / 42703).
 * Prevents repeating the same failing SELECT/upsert after a missing column
 * is discovered (romance, spice_level, avatar_key, …).
 */

const missingColumns = new Set<string>();

function columnKey(table: string, column: string): string {
  return `${table}.${column}`;
}

export function markColumnMissing(table: string, column: string): void {
  missingColumns.add(columnKey(table, column));
}

export function isColumnMarkedMissing(table: string, column: string): boolean {
  return missingColumns.has(columnKey(table, column));
}

export function isMissingColumnError(message: string, column: string): boolean {
  if (!message || !column) return false;
  const mentionsColumn = new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
    message
  );
  if (!mentionsColumn) return false;
  return (
    /does not exist/i.test(message) ||
    /could not find/i.test(message) ||
    /schema cache/i.test(message) ||
    /PGRST204/i.test(message) ||
    /42703/.test(message) ||
    /column/i.test(message)
  );
}

export function noteMissingColumnFromError(
  table: string,
  column: string,
  message: string
): boolean {
  if (!isMissingColumnError(message, column)) return false;
  markColumnMissing(table, column);
  return true;
}

export function isPermissionDeniedError(
  message: string,
  code?: string
): boolean {
  return (
    code === "42501" ||
    code === "401" ||
    code === "403" ||
    /42501/.test(message) ||
    /row-level security/i.test(message) ||
    /violates row-level security/i.test(message) ||
    /not authenticated/i.test(message) ||
    /jwt expired/i.test(message) ||
    /invalid jwt/i.test(message)
  );
}
