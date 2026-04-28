/**
 * Workbook (XLSX/CSV) parsing utilities for the prospect-import route.
 *
 * Extracted from route.ts so it can be unit-tested without spinning up
 * Next.js or auth. Parser swap from `xlsx` → `exceljs` happened in PR 13b
 * of the master refactor plan (memory/REFACTOR-2026-04-25.md) to close
 * the unfixable Prototype Pollution + ReDoS advisories on the unmaintained
 * SheetJS open-source package.
 */
import ExcelJS from "exceljs";
import { Readable } from "node:stream";

/**
 * Parse a workbook (XLSX or CSV) buffer into row objects keyed by header.
 *
 * Header row is row 1. Empty rows (every cell blank) are skipped.
 * Cell values are coerced to trimmed strings.
 *
 * Format detection is by filename extension: `*.csv` → CSV reader,
 * everything else → XLSX reader. The route layer enforces auth and
 * file-size caps; this function trusts its inputs.
 *
 * @param buffer  Raw file bytes
 * @param filename  Used to detect CSV vs XLSX via extension
 * @returns Array of row objects with header strings as keys
 */
export async function parseWorkbookBuffer(
  buffer: Buffer,
  filename: string,
): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  const lower = filename.toLowerCase();

  if (lower.endsWith(".csv")) {
    // Wrapping the buffer in a single-element array makes Readable.from()
    // pick the Iterable<Buffer> overload and sidesteps a TS type-variance
    // issue between Node's Buffer<ArrayBufferLike> and exceljs's typings.
    const stream = Readable.from([buffer]);
    await workbook.csv.read(stream);
  } else {
    // exceljs's `.xlsx.load()` is typed as `(buffer: Buffer) => ...` but
    // Node 20's `Buffer.from()` returns `Buffer<ArrayBufferLike>`, which TS
    // strict mode flags as incompatible. Runtime behavior is identical;
    // this is purely a type-variance issue between exceljs typings and
    // newer @types/node.
     
    await workbook.xlsx.load(buffer as any);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    const v = cell.value;
    headers.push(v === null || v === undefined ? "" : String(v).trim());
  });

  const rows: Record<string, string>[] = [];
  // Start at row 2 (row 1 is headers)
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const obj: Record<string, string> = {};
    let hasAnyValue = false;
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (!header) continue;
      const cellValue = row.getCell(j + 1).value;
      let str: string;
      if (cellValue === null || cellValue === undefined) {
        str = "";
      } else if (
        typeof cellValue === "object" &&
        cellValue !== null &&
        "text" in cellValue
      ) {
        // Rich text or formula result
        str = String((cellValue as { text: unknown }).text ?? "");
      } else {
        str = String(cellValue);
      }
      obj[header] = str.trim();
      if (str.trim()) hasAnyValue = true;
    }
    if (hasAnyValue) rows.push(obj);
  }
  return rows;
}
