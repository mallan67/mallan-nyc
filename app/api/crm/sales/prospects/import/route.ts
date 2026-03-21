/**
 * POST /api/crm/sales/prospects/import
 *
 * Bulk import seller prospects from CSV or XLSX files.
 * Supports preview mode (?preview=true) and full import.
 * Cap: 10,000 rows per import.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import * as XLSX from "xlsx";

const MAX_ROWS = 10_000;

// ── Column auto-detection (case-insensitive) ─────────────────────────────────
const COLUMN_MAP: Record<string, string[]> = {
  owner_name:  ["name", "full_name", "owner", "owner_name", "contact", "seller"],
  owner_email: ["email", "e-mail", "mail", "owner_email", "contact_email"],
  owner_phone: ["phone", "tel", "telephone", "mobile", "cell", "owner_phone"],
  address:     ["address", "property", "property_address", "street", "location"],
  unit:        ["unit", "apt", "apartment", "suite", "unit_number"],
};

function detectColumns(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {
    owner_name: null,
    owner_email: null,
    owner_phone: null,
    address: null,
    unit: null,
  };

  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
      if (aliases.includes(lower) && !mapping[field]) {
        mapping[field] = header;
        break;
      }
    }
  }

  return mapping;
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const wc = assertWriteAllowed();
  if (wc) return wc;

  const url = new URL(req.url);
  const isPreview = url.searchParams.get("preview") === "true";

  // ── Parse multipart form data ───────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const source = (formData.get("source") as string) || "imported";

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  // ── Read and parse file ─────────────────────────────────────────────────
  let rows: Record<string, string>[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Could not parse file. Ensure it is a valid CSV or XLSX." }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `File has ${rows.length} rows. Maximum is ${MAX_ROWS}.` },
      { status: 400 }
    );
  }

  // ── Detect columns ──────────────────────────────────────────────────────
  const headers = Object.keys(rows[0]);
  const columns = detectColumns(headers);

  // ── Preview mode ────────────────────────────────────────────────────────
  if (isPreview) {
    return NextResponse.json({
      preview: true,
      columns_detected: columns,
      available_headers: headers,
      sample_rows: rows.slice(0, 10),
      total_rows: rows.length,
    });
  }

  // ── Import mode ─────────────────────────────────────────────────────────
  let created = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is headers, i is 0-indexed

    const name = columns.owner_name ? (row[columns.owner_name] || "").trim() : "";
    const email = columns.owner_email ? (row[columns.owner_email] || "").trim() : "";
    const phone = columns.owner_phone ? (row[columns.owner_phone] || "").trim() : "";
    const addr = columns.address ? (row[columns.address] || "").trim() : "";
    const unit = columns.unit ? (row[columns.unit] || "").trim() : "";

    // Skip rows with no address AND no name
    if (!addr && !name) {
      skipped++;
      continue;
    }

    try {
      await prisma.sellerLead.create({
        data: {
          address: addr || `Unknown (${name})`,
          unit: unit || "",
          owner_name: name || null,
          owner_email: email || null,
          owner_phone: phone || null,
          source: "imported",
          source_detail: source,
          status: "new",
          assigned_agent_id: auth.userId,
          // Do NOT set last_researched_at — scoring cron will pick these up
        },
      });
      created++;
    } catch (err: unknown) {
      // Unique constraint violation (duplicate address+unit) → skip
      const prismaError = err as { code?: string };
      if (prismaError.code === "P2002") {
        skipped++;
      } else {
        errors++;
        if (errorDetails.length < 20) {
          errorDetails.push(`Row ${rowNum}: ${String(err).slice(0, 100)}`);
        }
      }
    }
  }

  // ── Audit log ───────────────────────────────────────────────────────────
  await logAuditEvent(
    "seller_prospects_bulk_imported",
    "SellerLead",
    "bulk",
    auth,
    { created, skipped, errors, source, filename: file.name }
  );

  return NextResponse.json({
    imported: created,
    skipped,
    errors,
    error_details: errorDetails,
    source,
  });
}
