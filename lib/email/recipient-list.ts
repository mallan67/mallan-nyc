// lib/email/recipient-list.ts
// Parse + normalize an uploaded recipient list (CSV / TSV / XLSX) for a
// listing email campaign.
//
// The parse/normalize path is intentionally PURE — no DB, no network — so it is
// fully unit-testable. Suppression against unsubscribed Leads is a SEPARATE,
// DB-backed step (filterSuppressedRecipients) that the campaign route composes
// on top. That pre-send filter is a convenience for the review UI; it is NOT the
// durable opt-out gate. sendEmail()'s own fail-closed suppression still runs per
// recipient at delivery time (and BLOCKS the send via _suppressionError on any
// lookup outage), so a stale pre-send filter can never leak a real opt-out.

import ExcelJS from "exceljs";

export interface CampaignRecipient {
  email: string;
  name: string;
}

export interface RecipientParseCounts {
  /** Raw data rows seen (excludes a detected header row). */
  total: number;
  /** Unique, syntactically-valid recipients kept. */
  valid: number;
  /** Dropped because the (normalized) email repeated an earlier row. */
  duplicate: number;
  /** Dropped because the email cell failed syntax validation. */
  invalid: number;
  /** Dropped because the row had no email cell at all. */
  missing: number;
}

export interface RecipientParseResult {
  recipients: CampaignRecipient[];
  counts: RecipientParseCounts;
  /** Up to 10 offending raw values, surfaced in the review UI for correction. */
  invalidSamples: string[];
}

// Same shape the /api/unsubscribe route and sendgrid use — one email regex,
// deliberately conservative (single @, a dot in the domain, no whitespace).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_HEADERS = new Set(["email", "e-mail", "email address", "emailaddress", "mail"]);
const NAME_HEADERS = new Set(["name", "full name", "fullname", "contact", "contact name", "recipient"]);
const FIRST_HEADERS = new Set(["first name", "firstname", "first"]);
const LAST_HEADERS = new Set(["last name", "lastname", "last"]);

// ─── Delimited (CSV / TSV) parsing ──────────────────────────────────────────

/** Pick the delimiter that appears most on the header line (outside quotes). */
function detectDelimiter(sample: string): "," | "\t" | ";" {
  const firstLine = sample.replace(/^﻿/, "").split(/\r?\n/, 1)[0] || "";
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "," || ch === "\t" || ch === ";")) counts[ch]++;
  }
  if (counts["\t"] >= counts[","] && counts["\t"] >= counts[";"] && counts["\t"] > 0) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

/** Minimal RFC-4180 reader: quoted fields, escaped quotes, CRLF/LF, trailing field. */
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const t = text.replace(/^﻿/, ""); // strip UTF-8 BOM

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; } // escaped ""
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++; // CRLF → one break
      row.push(field); field = ""; rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // Drop rows that are entirely blank (e.g. a trailing newline).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ─── XLSX cell → text ───────────────────────────────────────────────────────

/** Coerce an ExcelJS cell value (hyperlink / richText / formula result) to text. */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text; // hyperlink { text, hyperlink }
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    }
    if ("result" in o) return String(o.result ?? ""); // formula
    if ("hyperlink" in o) return String(o.hyperlink ?? "");
  }
  return String(v);
}

// ─── Header detection + normalization ───────────────────────────────────────

function extractRecipients(rows: string[][]): RecipientParseResult {
  const counts: RecipientParseCounts = { total: 0, valid: 0, duplicate: 0, invalid: 0, missing: 0 };
  const invalidSamples: string[] = [];
  if (rows.length === 0) return { recipients: [], counts, invalidSamples };

  const header = rows[0].map((c) => c.trim().toLowerCase());
  const hasHeader = header.some((h) => EMAIL_HEADERS.has(h));

  let emailIdx: number, nameIdx: number, firstIdx = -1, lastIdx = -1;
  if (hasHeader) {
    emailIdx = header.findIndex((h) => EMAIL_HEADERS.has(h));
    nameIdx = header.findIndex((h) => NAME_HEADERS.has(h));
    firstIdx = header.findIndex((h) => FIRST_HEADERS.has(h));
    lastIdx = header.findIndex((h) => LAST_HEADERS.has(h));
  } else {
    // No recognizable header → assume col 0 is the email, col 1 the name.
    emailIdx = 0;
    nameIdx = rows[0].length > 1 ? 1 : -1;
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const seen = new Set<string>();
  const recipients: CampaignRecipient[] = [];

  for (const r of dataRows) {
    counts.total++;
    const rawEmail = (r[emailIdx] ?? "").trim();
    if (!rawEmail) { counts.missing++; continue; }

    const email = rawEmail.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      counts.invalid++;
      if (invalidSamples.length < 10) invalidSamples.push(rawEmail);
      continue;
    }
    if (seen.has(email)) { counts.duplicate++; continue; }
    seen.add(email);

    let name = nameIdx >= 0 ? (r[nameIdx] ?? "").trim() : "";
    if (!name && firstIdx >= 0) {
      name = [r[firstIdx], lastIdx >= 0 ? r[lastIdx] : ""]
        .map((x) => (x ?? "").trim())
        .filter(Boolean)
        .join(" ");
    }
    if (!name) name = email.split("@")[0]; // last resort — never empty

    recipients.push({ email, name });
    counts.valid++;
  }

  return { recipients, counts, invalidSamples };
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Parse an uploaded recipient file into normalized, de-duplicated recipients.
 * Dispatches on the filename extension: .xlsx/.xlsm via ExcelJS, everything else
 * as delimited text (comma / tab / semicolon auto-detected).
 */
export async function parseRecipientFile(
  buffer: Buffer,
  filename: string,
): Promise<RecipientParseResult> {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (ext === "xlsx" || ext === "xlsm") {
    const wb = new ExcelJS.Workbook();
    // @types/node's Buffer is generic (Buffer<ArrayBufferLike>); ExcelJS's bundled
    // types still expect the non-generic Buffer. Cast to ExcelJS's declared param.
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    const rows: string[][] = [];
    if (ws) {
      ws.eachRow({ includeEmpty: false }, (rowObj) => {
        const cells: string[] = [];
        const n = rowObj.cellCount;
        for (let c = 1; c <= n; c++) cells.push(cellText(rowObj.getCell(c)));
        rows.push(cells);
      });
    }
    return extractRecipients(rows.filter((r) => r.some((c) => c.trim() !== "")));
  }

  const text = buffer.toString("utf8");
  return extractRecipients(parseDelimited(text, detectDelimiter(text)));
}

// ─── DB-backed suppression filter (route-composed, not the durable gate) ─────

export interface SuppressionFilterResult {
  kept: CampaignRecipient[];
  suppressed: CampaignRecipient[];
}

type LeadFinder = {
  lead: { findMany: (args: unknown) => Promise<{ email: string }[]> };
};

/**
 * Split recipients into those safe to queue and those already opted out
 * (a matching Lead has last_unsubscribe_at set). Pre-send convenience only —
 * see the file header: sendEmail() remains the durable, fail-closed opt-out gate.
 * The prisma client is injected so this stays unit-testable without a DB.
 */
export async function filterSuppressedRecipients(
  recipients: CampaignRecipient[],
  db: LeadFinder,
): Promise<SuppressionFilterResult> {
  if (recipients.length === 0) return { kept: [], suppressed: [] };

  const emails = recipients.map((r) => r.email);
  const rows = await db.lead.findMany({
    where: { email: { in: emails }, last_unsubscribe_at: { not: null } },
    select: { email: true },
  });
  const suppressedSet = new Set(rows.map((r) => r.email.toLowerCase()));

  const kept: CampaignRecipient[] = [];
  const suppressed: CampaignRecipient[] = [];
  for (const r of recipients) {
    (suppressedSet.has(r.email) ? suppressed : kept).push(r);
  }
  return { kept, suppressed };
}
