// POST /api/crm/listings/reset-sync
// ONE-TIME USE: Delete all existing listings, then re-sync from Trestle.
// Broker-only. Pulls historical (closed/expired/hold/withdrawn) + active listings.
//
// After use, this endpoint can be removed.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { syncAgentHistory } from "@/lib/idx/sync";
import { fetchFromTrestle, buildAgentAllFilter } from "@/lib/idx/fetch";
import { mapTrestleToPrisma, checkDistributionGates, validateHistoricalFields } from "@/lib/idx/trestle-mapper";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import type { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) {
    return NextResponse.json({ error: "IDX not enabled or missing credentials" }, { status: 503 });
  }

  // Get the broker's agent record
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { id: true, license_no: true, trestle_mls_id: true, full_name: true },
  });

  if (!agent || !agent.trestle_mls_id) {
    return NextResponse.json({ error: "Agent not found or missing trestle_mls_id" }, { status: 422 });
  }

  const agentMlsId = agent.trestle_mls_id;
  const log: string[] = [];

  // ══════════════════════════════════════════════════════════════
  // STEP 1: Delete all existing listings (clean slate)
  // ══════════════════════════════════════════════════════════════
  log.push("Step 1: Deleting existing listings...");

  // Delete dependent records first (FK constraints)
  const [delActions, delShowings, delComments, delPriceHistory, delMarketing] = await Promise.all([
    prisma.clientListingAction.deleteMany({}),
    prisma.showing.deleteMany({}),
    prisma.comment.deleteMany({}),
    prisma.priceHistory.deleteMany({}),
    prisma.marketingActivity.deleteMany({}),
  ]);
  log.push(`  Deleted dependents: ${delActions.count} actions, ${delShowings.count} showings, ${delComments.count} comments, ${delPriceHistory.count} price history, ${delMarketing.count} marketing`);

  // Delete protected period records
  await prisma.protectedPeriod.deleteMany({}).catch(() => {});

  // Now delete all listings
  const delListings = await prisma.listing.deleteMany({});
  log.push(`  Deleted ${delListings.count} listings`);

  // ══════════════════════════════════════════════════════════════
  // STEP 2: Sync ALL listings from Trestle (all statuses)
  // ══════════════════════════════════════════════════════════════
  log.push("Step 2: Syncing from Trestle...");

  // 2A: Historical listings (Closed, Expired, Hold, Withdrawn)
  log.push("  2A: Historical listings (Closed/Expired/Hold/Withdrawn)...");
  const historicalResult = await syncAgentHistory({
    agentMlsId,
    agentDbId: agent.id,
    maxRecords: 2000,
  });
  log.push(`  Historical: fetched=${historicalResult.total_fetched}, upserted=${historicalResult.upserted}, errors=${historicalResult.errors}`);

  // 2B: Active + Coming Soon + Under Contract listings
  log.push("  2B: Active listings...");
  const activeFilter = buildAgentAllFilter(agentMlsId);
  // Override to only get active statuses (historical already handled above)
  const activeOnlyFilter = `${activeFilter} and (StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'Pending')`;

  let activeUpserted = 0;
  let activeErrors = 0;
  let activeFetched = 0;

  try {
    const activeResult = await fetchFromTrestle({
      filter: activeOnlyFilter,
      maxTotal: 500,
      expandMedia: true,
      orderby: "ModificationTimestamp desc",
    });
    activeFetched = activeResult.totalFetched;

    for (const raw of activeResult.records) {
      try {
        const validation = validateHistoricalFields(raw);
        if (!validation.valid) continue;

        const gates = checkDistributionGates(raw);
        const mapped = mapTrestleToPrisma(raw);
        if (!gates.displayable) {
          mapped.sync_status = `gated:${gates.reason}`;
        }

        await prisma.listing.upsert({
          where: { listing_id: mapped.listing_id },
          create: {
            ...mapped,
            agent_id: agent.id,
            list_price: mapped.list_price,
            living_area: mapped.living_area,
            address: mapped.address as Prisma.InputJsonValue,
            features: mapped.features as Prisma.InputJsonValue,
            media: mapped.media as Prisma.InputJsonValue,
            compliance: mapped.compliance as Prisma.InputJsonValue,
            agent_info: mapped.agent_info as Prisma.InputJsonValue,
            raw_data: mapped.raw_data as Prisma.InputJsonValue,
          },
          update: {
            agent_id: agent.id,
            mls_id: mapped.mls_id,
            status: mapped.status,
            listing_type: mapped.listing_type,
            property_type: mapped.property_type,
            property_sub_type: mapped.property_sub_type,
            list_price: mapped.list_price,
            bedrooms_total: mapped.bedrooms_total,
            bathrooms_full: mapped.bathrooms_full,
            bathrooms_half: mapped.bathrooms_half,
            living_area: mapped.living_area,
            borough: mapped.borough,
            neighborhood: mapped.neighborhood,
            city: mapped.city,
            postal_code: mapped.postal_code,
            address: mapped.address as Prisma.InputJsonValue,
            features: mapped.features as Prisma.InputJsonValue,
            media: mapped.media as Prisma.InputJsonValue,
            compliance: mapped.compliance as Prisma.InputJsonValue,
            agent_info: mapped.agent_info as Prisma.InputJsonValue,
            raw_data: mapped.raw_data as Prisma.InputJsonValue,
            modification_timestamp: mapped.modification_timestamp,
            listing_contract_date: mapped.listing_contract_date,
            last_synced_from_trestle: mapped.last_synced_from_trestle,
            sync_status: mapped.sync_status,
          },
        });
        activeUpserted++;
      } catch (err) {
        activeErrors++;
        console.error("[Reset-Sync] Active upsert error:", err);
      }
    }
  } catch (err) {
    log.push(`  Active fetch error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  log.push(`  Active: fetched=${activeFetched}, upserted=${activeUpserted}, errors=${activeErrors}`);

  // ══════════════════════════════════════════════════════════════
  // STEP 3: Summary
  // ══════════════════════════════════════════════════════════════
  const totalInDb = await prisma.listing.count();
  const byStatus = await prisma.listing.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  const statusSummary: Record<string, number> = {};
  for (const row of byStatus) {
    statusSummary[row.status] = row._count.status;
  }

  log.push(`Step 3: Complete. ${totalInDb} listings in DB.`);
  log.push(`  By status: ${JSON.stringify(statusSummary)}`);

  await logAuditEvent("listings_reset_sync", "listing", "bulk", auth, {
    deleted: delListings.count,
    historical: historicalResult,
    active: { fetched: activeFetched, upserted: activeUpserted, errors: activeErrors },
    totalInDb,
    statusSummary,
  });

  return NextResponse.json({
    success: true,
    agent: agent.full_name,
    agentMlsId,
    deleted: delListings.count,
    historical: {
      fetched: historicalResult.total_fetched,
      upserted: historicalResult.upserted,
      errors: historicalResult.errors,
    },
    active: {
      fetched: activeFetched,
      upserted: activeUpserted,
      errors: activeErrors,
    },
    totalInDb,
    statusSummary,
    log,
  });
}
