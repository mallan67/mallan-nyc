// /api/crm/listing-campaigns/recipients — POST (multipart/form-data)
//
// Parse an uploaded recipient list (CSV / TSV / XLSX) for a listing campaign and
// return normalized, de-duplicated recipients plus review counts. Read-only: it
// parses the file and checks suppression, but writes nothing and sends nothing.
//
// The CRM uploads here first to show the operator a review screen
// (valid / duplicate / invalid / missing / suppressed) BEFORE the send route is
// ever called with the reviewed recipients[].

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { parseRecipientFile, filterSuppressedRecipients } from "@/lib/email/recipient-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB — a 250-row list is a few KB.

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a `file` field." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No `file` provided." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (max 2MB)." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseRecipientFile(buffer, file.name || "list.csv");
  } catch {
    return NextResponse.json({ error: "Could not parse the file. Upload a CSV or XLSX with an email column." }, { status: 400 });
  }

  const { kept, suppressed } = await filterSuppressedRecipients(parsed.recipients, {
    lead: {
      findMany: (args: unknown) =>
        prisma.lead.findMany(args as Prisma.LeadFindManyArgs) as unknown as Promise<{ email: string }[]>,
    },
  });

  return NextResponse.json({
    recipients: kept, // reviewed, deliverable list the send route will re-validate
    counts: {
      ...parsed.counts,
      suppressed: suppressed.length,
      deliverable: kept.length,
    },
    invalidSamples: parsed.invalidSamples,
    suppressedSamples: suppressed.slice(0, 10).map((r) => r.email),
  });
}
