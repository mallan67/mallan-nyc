// /api/portal/documents — Seller/Landlord document access
//
// Portals Tier A P0 — fail-loud on unsafe scope.
//
// Previous behavior compared `Listing.address` (JSON object) against
// `Deal.property_address` (free-text string) via Prisma `IN` filter. The
// type mismatch silently returned 0 rows — so seller portals showed an
// empty Documents tab even when the agent had uploaded disclosures or
// contracts. Worse: even if the JSON-vs-string mismatch were fixed, the
// underlying scope (agent_id + property_address string match) leaks
// across clients who share an agent and overlapping address strings.
//
// Until the schema gains a client-scoped FK on Deal or Document, this
// route fails loud (HTTP 501) instead of silently returning an empty
// or unsafe list. The seller knows to ask their agent rather than
// assume nothing was uploaded; the agent has a clear signal that
// portal documents are pending the schema fix.
//
// TODO(SCHEMA-GAP-001): Add `Deal.client_id BigInt? @map("client_id")` FK
// to Lead (or `Document.client_id`) so seller/landlord portal documents
// can be FK-scoped instead of address-matched. Tracked as Tier C item.
// Once landed, this route resumes returning the document list.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      documents: [],
      unavailable: true,
      code: "PORTAL_DOCUMENTS_PENDING_CLIENT_SCOPE",
      message:
        "Portal documents require client-scoped deal/document linkage before they can be safely shown.",
    },
    { status: 501 }
  );
}
