/**
 * PATCH /api/crm/sales/comps/criteria
 *
 * Update comp criteria for a listing. Agent adjusts filters from CRM,
 * then re-fetches comps with new criteria.
 *
 * Body: { listing_id: string, criteria: CompCriteria | null }
 *
 * Every `statuses` entry is resolved through the LISTING transaction mapping before it is stored: a live
 * Cotality StandardStatus token, or exactly that transaction canonical label (a sale "Sold" -> Closed, a sale
 * "In Contract" -> Pending, a rental "Rented" -> Closed). Anything else - the other transaction word, a legacy
 * spelling ("Cancelled"), an old display name ("Under Contract"), a CRM workflow word ("LeaseSigned") - is
 * refused with the offending value and NOTHING is written (Maya, 2026-09-08 / 2026-09-09). `criteria: null`
 * clears the stored criteria so the next fetch regenerates the token defaults.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { validateCompCriteria, compTransactionOf, isCompCriteriaError } from "@/lib/comps";
import type { CompCriteria } from "@/lib/comps";
import { transactionTypeFromProvider } from "@/lib/listings/canonical-lifecycle";
import { Prisma } from "@prisma/client";
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
  const { listing_id, criteria } = body as { listing_id?: string; criteria?: CompCriteria | null };

  if (!listing_id || criteria === undefined) {
    return NextResponse.json({ error: "listing_id and criteria required" }, { status: 400 });
  }

  // Validate criteria structure (null is the explicit "clear" and skips the shape check)
  if (criteria !== null && (!criteria.building || !criteria.area)) {
    return NextResponse.json({ error: "criteria must include building and area" }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { listing_id },
    select: { ...CAPABILITY_LISTING_SELECT, listing_type: true, property_type: true },
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

  // The listing transaction decides the vocabulary: listing_type first (the Mallan fact the agent edits),
  // falling back to the live PropertyType. Neither known -> nothing is resolved and nothing is written.
  const transaction = compTransactionOf((listing as { listing_type?: unknown }).listing_type)
    ?? transactionTypeFromProvider((listing as { property_type?: unknown }).property_type);
  if (criteria !== null && !transaction) {
    return NextResponse.json({
      error: `Listing ${listing_id} has no known transaction - comp status criteria cannot be resolved`,
      code: "COMP_TRANSACTION_UNKNOWN",
    }, { status: 400 });
  }

  let resolved: CompCriteria | null = null;
  if (criteria !== null) {
    try {
      resolved = validateCompCriteria(criteria, transaction!);
    } catch (err) {
      if (isCompCriteriaError(err)) {
        return NextResponse.json(
          { error: err.message, code: err.code, value: err.value, scope: err.scope, transaction },
          { status: 400 },
        );
      }
      throw err;
    }
  }

  await prisma.listing.update({
    where: { listing_id },
    data: {
      comp_criteria: resolved === null
        ? Prisma.DbNull
        : (JSON.parse(JSON.stringify(resolved)) as Prisma.InputJsonValue),
    },
  });

  await logAuditEvent(
    "comp_criteria_updated",
    "listing",
    listing_id,
    auth,
    { criteria: resolved, transaction },
  );

  return NextResponse.json({ listing_id, criteria: resolved, transaction });
}
