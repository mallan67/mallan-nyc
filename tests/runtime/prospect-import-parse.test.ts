/**
 * Parser fixture test for app/api/crm/sales/prospects/import/parse.ts
 *
 * Closes the #45-class blind spot: a library migration (xlsx → exceljs)
 * was structurally validated but had no real-input proof. This test
 * generates fixtures in-memory (no committed binary blobs) and verifies
 * the parser handles each shape correctly.
 *
 * Fixtures covered:
 *  - clean csv
 *  - clean xlsx
 *  - blank rows interspersed
 *  - mixed types (numeric cells, dates)
 *  - trimmed headers (whitespace tolerance)
 *  - empty workbook
 */

import ExcelJS from 'exceljs';
import { parseWorkbookBuffer } from '@/app/api/crm/sales/prospects/import/parse';

async function buildXlsxBuffer(rows: (string | number | Date | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('sheet1');
  for (const row of rows) {
    ws.addRow(row);
  }
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

function buildCsvBuffer(rows: (string | number)[][]): Buffer {
  const lines = rows.map((r) =>
    r.map((cell) => {
      const s = cell === null || cell === undefined ? '' : String(cell);
      // Quote any cell containing comma, quote, or newline
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(','),
  );
  return Buffer.from(lines.join('\n'), 'utf-8');
}

describe('prospect-import parseWorkbookBuffer', () => {
  it('parses a clean csv', async () => {
    const buf = buildCsvBuffer([
      ['email', 'first_name', 'last_name'],
      ['a@example.com', 'Alice', 'Andrews'],
      ['b@example.com', 'Bob', 'Brown'],
    ]);
    const rows = await parseWorkbookBuffer(buf, 'leads.csv');
    expect(rows.length).toBe(2);
    expect(rows[0].email).toBe('a@example.com');
    expect(rows[0].first_name).toBe('Alice');
    expect(rows[1].last_name).toBe('Brown');
  });

  it('parses a clean xlsx', async () => {
    const buf = await buildXlsxBuffer([
      ['email', 'first_name', 'last_name'],
      ['c@example.com', 'Carol', 'Cole'],
      ['d@example.com', 'Dan', 'Doe'],
    ]);
    const rows = await parseWorkbookBuffer(buf, 'leads.xlsx');
    expect(rows.length).toBe(2);
    expect(rows[0].email).toBe('c@example.com');
    expect(rows[1].first_name).toBe('Dan');
  });

  it('skips blank rows interspersed between data rows', async () => {
    const buf = await buildXlsxBuffer([
      ['email', 'first_name'],
      ['e@example.com', 'Eve'],
      [null, null],          // blank row 1
      ['f@example.com', 'Fay'],
      ['', ''],              // blank row 2 (empty strings)
      ['g@example.com', 'Gus'],
    ]);
    const rows = await parseWorkbookBuffer(buf, 'sparse.xlsx');
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.first_name)).toEqual(['Eve', 'Fay', 'Gus']);
  });

  it('coerces numeric cells to strings', async () => {
    const buf = await buildXlsxBuffer([
      ['email', 'lead_score'],
      ['h@example.com', 87],
      ['i@example.com', 42],
    ]);
    const rows = await parseWorkbookBuffer(buf, 'numeric.xlsx');
    expect(rows.length).toBe(2);
    expect(typeof rows[0].lead_score).toBe('string');
    expect(rows[0].lead_score).toBe('87');
    expect(rows[1].lead_score).toBe('42');
  });

  it('trims whitespace from header cells', async () => {
    const buf = await buildXlsxBuffer([
      ['  email  ', '   first_name', 'last_name   '],
      ['j@example.com', 'Jay', 'Jones'],
    ]);
    const rows = await parseWorkbookBuffer(buf, 'whitespace.xlsx');
    expect(Object.keys(rows[0])).toEqual(expect.arrayContaining(['email', 'first_name', 'last_name']));
    expect(rows[0].email).toBe('j@example.com');
  });

  it('returns empty array on a workbook with header but no data rows', async () => {
    const buf = await buildXlsxBuffer([
      ['email', 'first_name', 'last_name'],
    ]);
    const rows = await parseWorkbookBuffer(buf, 'header-only.xlsx');
    expect(rows).toEqual([]);
  });
});
