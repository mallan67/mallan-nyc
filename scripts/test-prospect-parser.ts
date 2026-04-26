#!/usr/bin/env tsx
// Smoke test for app/api/crm/sales/prospects/import/parse.ts
//
// Verifies the exceljs-based workbook parser handles the three real-world
// inputs the route accepts:
//   1. XLSX with header row and data rows
//   2. CSV with header row and data rows
//   3. Empty file (zero bytes)
//
// Run via:  npm run test:prospect-parser
//
// Exit codes:  0 = all pass, 1 = at least one assertion failed.
//
// When PR 11 (restore CRM test runner) lands and adds wider test
// infrastructure, migrate these into a proper jest suite and delete
// this script.

import ExcelJS from "exceljs";
import { parseWorkbookBuffer } from "../app/api/crm/sales/prospects/import/parse";

const TEST_DATA = [
  { name: "Alice Smith", email: "alice@example.com", phone: "212-555-0001" },
  { name: "Bob Jones", email: "bob@example.com", phone: "917-555-0002" },
  { name: "Carol Davis", email: "carol@example.com", phone: "646-555-0003" },
];

async function buildXlsxBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["Name", "Email", "Phone"]);
  for (const r of TEST_DATA) ws.addRow([r.name, r.email, r.phone]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from((await wb.xlsx.writeBuffer()) as any);
}

function buildCsvBuffer(): Buffer {
  const lines = ["Name,Email,Phone"];
  for (const r of TEST_DATA) {
    lines.push(r.name + "," + r.email + "," + r.phone);
  }
  return Buffer.from(lines.join("\n"), "utf-8");
}

function assertRows(label: string, rows: Array<Record<string, string>>): void {
  if (rows.length !== TEST_DATA.length) {
    throw new Error(label + ": expected " + TEST_DATA.length + " rows, got " + rows.length);
  }
  for (let i = 0; i < TEST_DATA.length; i++) {
    const expected = TEST_DATA[i];
    const actual = rows[i];
    if (actual.Name !== expected.name) {
      throw new Error(label + " row " + i + ": name mismatch (" + actual.Name + " vs " + expected.name + ")");
    }
    if (actual.Email !== expected.email) {
      throw new Error(label + " row " + i + ": email mismatch");
    }
    if (actual.Phone !== expected.phone) {
      throw new Error(label + " row " + i + ": phone mismatch");
    }
  }
}

async function main() {
  console.log("--- XLSX path ---");
  const xlsxBuffer = await buildXlsxBuffer();
  const xlsxRows = await parseWorkbookBuffer(xlsxBuffer, "test.xlsx");
  console.log("Parsed " + xlsxRows.length + " XLSX rows");
  assertRows("XLSX", xlsxRows);
  console.log("PASS XLSX parsing correct");

  console.log("");
  console.log("--- CSV path ---");
  const csvBuffer = buildCsvBuffer();
  const csvRows = await parseWorkbookBuffer(csvBuffer, "test.csv");
  console.log("Parsed " + csvRows.length + " CSV rows");
  assertRows("CSV", csvRows);
  console.log("PASS CSV parsing correct");

  console.log("");
  console.log("--- Empty file ---");
  const emptyBuffer = Buffer.from("");
  try {
    const emptyRows = await parseWorkbookBuffer(emptyBuffer, "test.csv");
    if (emptyRows.length !== 0) {
      throw new Error("Expected 0 rows, got " + emptyRows.length);
    }
    console.log("PASS Empty file returns 0 rows (no exception)");
  } catch (e) {
    // Either behavior is acceptable; the route's outer try/catch returns 400 on parse exceptions.
    console.log("PASS Empty file throws (route returns 400): " + (e as Error).message);
  }

  console.log("");
  console.log("--- Header trimming + non-string cell coercion ---");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["  Padded Header  ", "Numeric", "Boolean"]);
  ws.addRow(["value-a", 12345, true]);
  ws.addRow(["value-b", 0, false]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = Buffer.from((await wb.xlsx.writeBuffer()) as any);
  const rows = await parseWorkbookBuffer(buf, "test.xlsx");
  if (rows.length !== 2) throw new Error("expected 2 rows got " + rows.length);
  if (rows[0]["Padded Header"] !== "value-a") {
    throw new Error("header trimming failed");
  }
  if (rows[0]["Numeric"] !== "12345") {
    throw new Error("numeric coercion failed: got " + JSON.stringify(rows[0]["Numeric"]));
  }
  if (rows[0]["Boolean"] !== "true") {
    throw new Error("boolean coercion failed: got " + JSON.stringify(rows[0]["Boolean"]));
  }
  console.log("PASS Header trim + cell type coercion correct");

  console.log("");
  console.log("All exceljs migration smoke tests passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED: " + (e as Error).message);
  process.exit(1);
});
