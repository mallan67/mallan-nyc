/**
 * POST /api/crm/scanner/verify
 *
 * On-demand active verification for a contact record. Caller passes
 * the BBL (or an inline ContactRecord), the orchestrator runs Twilio
 * Lookup / NeverBounce-or-DNS / USPS against the unique normalized
 * values, and returns the audit log + an updated ContactRecord
 * with confidence labels reflecting the new verifications.
 *
 * Auth: agent or broker.
 *
 * Body shape:
 *   { record: ContactRecord, max_per_call?: number,
 *     skip_phone?: boolean, skip_email?: boolean, skip_address?: boolean }
 *
 * NOTE: This endpoint costs money per call (Twilio Lookup ~$0.005 each,
 * NeverBounce ~$0.005 each). The default max_per_call cap of 10 keeps
 * any single verification call under ~5 cents.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAgentOrBroker, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";
import { runVerifications } from "@/lib/scanner/contact/verify/orchestrator";
import { aggregateContacts } from "@/lib/scanner/contact/aggregator";
import type { ContactRecord, SourceContactRow } from "@/lib/scanner/contact/types";

interface VerifyBody {
  /** Pre-built ContactRecord to verify (typical caller path). */
  record?: ContactRecord;
  /** Or: raw source rows that the server will aggregate first. */
  source_rows?: SourceContactRow[];
  /** Hard cap on lookups this call (default 10). */
  max_per_call?: number;
  skip_phone?: boolean;
  skip_email?: boolean;
  skip_address?: boolean;
}

function recordFromBody(body: VerifyBody): ContactRecord | null {
  if (body.record) return body.record;
  if (Array.isArray(body.source_rows) && body.source_rows.length > 0) {
    return aggregateContacts(body.source_rows);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const [body, parseErr] = await safeJson<VerifyBody>(req);
  if (parseErr) return parseErr;

  const record = recordFromBody(body);
  if (!record) {
    return NextResponse.json(
      { error: "body must include either `record` or `source_rows`" },
      { status: 400 },
    );
  }

  const out = await runVerifications(record, {
    max_per_call: body.max_per_call,
    skip_phone: body.skip_phone,
    skip_email: body.skip_email,
    skip_address: body.skip_address,
  });

  // Re-aggregate with the new verifications so the response reflects
  // upgraded confidence. We need source rows to do this — if the caller
  // sent a pre-built record, we can't fully re-aggregate. In that case,
  // return the verifications map as JSON-serializable entries.
  const verificationsAsArray: Array<{ key: string; verified: boolean; method: string; at?: string }> = [];
  for (const [key, info] of out.verifications) {
    verificationsAsArray.push({ key, ...info });
  }

  let upgraded: ContactRecord | null = null;
  if (Array.isArray(body.source_rows)) {
    upgraded = aggregateContacts(body.source_rows, out.verifications);
  }

  await logAuditEvent("verify_contact", "scanner_verify", record.bbl || "unknown", auth, {
    bbl: record.bbl,
    calls_made: out.calls_made,
    budget_skipped: out.budget_skipped,
    by_kind: out.audit.reduce((acc: Record<string, number>, a) => {
      acc[a.kind] = (acc[a.kind] || 0) + 1;
      return acc;
    }, {}),
  });

  return NextResponse.json({
    bbl: record.bbl,
    calls_made: out.calls_made,
    budget_skipped: out.budget_skipped,
    audit: out.audit,
    verifications: verificationsAsArray,
    upgraded_record: upgraded, // null if caller passed `record` not `source_rows`
  }, { headers: { "Cache-Control": "private, no-store" } });
}
