/**
 * PATCH /api/crm/sales/comps/criteria
 *
 * Update comp criteria for a listing. Agent adjusts filters from CRM,
 * then re-fetches comps with new criteria.
 *
 * Body: { listing_id: string, criteria: CompCriteria }
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import type { CompCriteria } from "@/lib/comps";
import type { Prisma } from "@prisma/client";
import { safeJson } from "@/lib/api/safe-json";
import {
  listingCapabilities,
  CAPABILITY_DENIED,
  CAPABILITY_LISTING_SELECT,
} from "@/lib/auth/listing-capabilities";

export async function PATCH(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { listing_id, criteria } = body as { listing_id?: string; criteria?: CompCriteria };

  if (!listing_id || !criteria) {
    return NextResponse.json({ error: "listing_id and criteria required" }, { status: 400 });
  }

  // Validate criteria structure
  if (!criteria.building || !criteria.area) {
    return NextResponse.json({ error: "criteria must include building and area" }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { listing_id },
    select: { ...CAPABILITY_LISTING_SELECT },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Association level, deliberately NOT local-only. `comp_criteria` is
  // Mallan-authored internal analysis: the Trestle mapper never writes it, so
  // it is not a source-derived field, and neither comps writer stamps
  // `modification_timestamp`, so it cannot poison the incremental cursor.
  // Running comps against a third-party row is legitimate CMA work.
  if (!listingCapabilities(auth, listing).mayViewHistory) {
    return NextResponse.json(CAPABILITY_DENIED.ACCESS, { status: 403 });
  }

  await prisma.listing.update({
    where: { listing_id },
    data: { comp_criteria: JSON.parse(JSON.stringify(criteria)) as Prisma.InputJsonValue },
  });

  await logAuditEvent(
    "comp_criteria_updated",
    "listing",
    listing_id,
    auth,
    { criteria },
  );

  return NextResponse.json({ listing_id, criteria });
}
