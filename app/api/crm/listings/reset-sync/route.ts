// POST /api/crm/listings/reset-sync
// ONE-TIME USE: Delete all existing listings, then re-sync from Trestle.
// Broker-only. Searches by BOTH MLS ID and State License Number on both sides of deals.
//
// After use, this endpoint can be removed.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { fetchFromTrestle } from "@/lib/idx/fetch";
import { mediaUpdatePatch, complianceUpdatePatch } from "@/lib/idx/sync";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";
import { mapTrestleToPrisma, checkDistributionGates, validateHistoricalFields } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import type { Prisma } from "@prisma/client";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) {
    return NextResponse.json({ error: "IDX not enabled or missing credentials" }, { status: 503 });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { id: true, license_no: true, trestle_mls_id: true, full_name: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 422 });
  }

  const mlsId = agent.trestle_mls_id; // "39361"
  const licenseNo = agent.license_no;  // "10311201806"
  const log: string[] = [];

  if (!mlsId && !licenseNo) {
    return NextResponse.json({ error: "Agent has no MLS ID or license number" }, { status: 422 });
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 1: Clear the PROVIDER-SOURCED listings (clean slate for the re-pull)
  // ══════════════════════════════════════════════════════════════
  //
  // THIS USED TO BE A TABLE TRUNCATION. Every delete below was
  // `deleteMany({})` — all listings, all actions, all showings, all comments,
  // all price history, all marketing activity, all protected periods — followed
  // by a repopulate that pulls from COTALITY ONLY.
  //
  // So a single broker action destroyed every Mallan-authored `SL-`/`RL-`
  // listing along with its owner link, media, comments, showings and price
  // history, and none of it came back: Cotality never had them, because Mallan
  // authored them. Cotality cannot restore a row it never held.
  //
  // The wipe is now scoped to the rows a Cotality re-sync can actually rebuild.
  // Mallan-authored rows are identified by the same canonical signals the rest
  // of the repo uses — `SL-`/`RL-` listing_id prefix, or `rls_eligible = false`
  // for website-only inventory — and dependents are scoped to the same id set
  // instead of being truncated globally (preserving the listing while
  // truncating its comments would be the same loss wearing a smaller number).
  //
  // This is a NARROWING of a destructive operation: it deletes strictly less
  // than before, and nothing previously kept is now removed.
  log.push("Step 1: Clearing provider-sourced listings...");

  const providerSourcedWhere = {
    AND: [
      { NOT: { listing_id: { startsWith: "SL-" } } },
      { NOT: { listing_id: { startsWith: "RL-" } } },
      { NOT: { rls_eligible: false } },
    ],
  };

  let deletedListingCount = 0;
  const providerRows = await prisma.listing.findMany({
    where: providerSourcedWhere,
    select: { id: true },
  });
  const providerIds = providerRows.map((r) => r.id);
  log.push(`  ${providerIds.length} provider-sourced listings in scope (Mallan-authored rows preserved)`);

  if (providerIds.length > 0) {
    const scoped = { listing_id: { in: providerIds } };
    const [delActions, delShowings, delComments] = await Promise.all([
      prisma.clientListingAction.deleteMany({ where: scoped }),
      prisma.showing.deleteMany({ where: scoped }),
      prisma.comment.deleteMany({ where: scoped }),
      prisma.priceHistory.deleteMany({ where: scoped }),
      prisma.marketingActivity.deleteMany({ where: scoped }),
    ]);
    log.push(`  Deleted dependents: ${delActions.count} actions, ${delShowings.count} showings, ${delComments.count} comments`);

    await prisma.protectedPeriod.deleteMany({ where: scoped }).catch(() => {});
    const delListings = await prisma.listing.deleteMany({ where: { id: { in: providerIds } } });
    deletedListingCount = delListings.count;
    log.push(`  Deleted ${delListings.count} provider-sourced listings`);
  } else {
    log.push("  Nothing to delete");
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 2: Pull ALL listings from Trestle where agent appears
  // Search by: ListAgentMlsId, BuyerAgentMlsId, ListAgentStateLicense, BuyerAgentStateLicense
  // ══════════════════════════════════════════════════════════════
  log.push("Step 2: Pulling from Trestle...");

  // Build comprehensive agent identity filter
  const conditions: string[] = [];
  if (mlsId) {
    const escaped = mlsId.replace(/'/g, "''");
    conditions.push(`ListAgentMlsId eq '${escaped}'`);
    conditions.push(`BuyerAgentMlsId eq '${escaped}'`);
  }
  if (licenseNo) {
    const escaped = licenseNo.replace(/'/g, "''");
    conditions.push(`ListAgentStateLicense eq '${escaped}'`);
    conditions.push(`BuyerAgentStateLicense eq '${escaped}'`);
  }

  const agentFilter = `(${conditions.join(" or ")})`;
  log.push(`  Agent filter: ${agentFilter}`);

  // Pull ALL statuses in one query
  const filter = agentFilter;
  log.push(`  Full filter: ${filter}`);

  let totalFetched = 0;
  let upserted = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  try {
    // PR-S.1c (2026-05-15): `expandMedia: true` was rejected by Trestle with
    // HTTP 400 in production. CRM reset-sync now pulls structured data only;
    // media is backfilled by the media-sync cron after upsert.
    // P1C1: hoisted so the fetch and the RC2 media patch below can never
    // silently diverge — if someone flips this to true, media writes resume.
    const EXPAND_MEDIA = false;
    const result = await fetchFromTrestle({
      filter,
      maxTotal: 2000,
      expandMedia: EXPAND_MEDIA,
      orderby: "ModificationTimestamp desc",
    });

    totalFetched = result.totalFetched;
    log.push(`  Trestle returned ${totalFetched} records`);

    for (const raw of result.records) {
      try {
        const validation = validateHistoricalFields(raw);
        if (!validation.valid) {
          log.push(`  Skip: ${String(raw.ListingId || "?")} missing ${validation.missingFields.join(",")}`);
          continue;
        }

        const gates = checkDistributionGates(raw);
        const mapped = mapTrestleToPrisma(raw);

        if (!gates.displayable) {
          mapped.sync_status = `gated:${gates.reason}`;
        }

        // Phase C: strip the legacy agent_info JSON from the create spread; the 8
        // typed columns remain in typedOnlyMapped. mapped.agent_info stays in memory
        // for the UPDATE branch's typed derivation below.
        const { agent_info: _agentInfoJson, ...typedOnlyMapped } = mapped;
        // Archive eligibility clock (#446): set terminal_since on non-terminal→terminal,
        // clear on terminal→active, never bump on terminal re-sync. UPDATE fetches the
        // existing status so a re-synced row flipping into/out of terminal is captured.
        const existingForClock = await prisma.listing.findUnique({
          where: { listing_id: mapped.listing_id },
          select: { status: true },
        });
        const terminalSinceCreate = computeTerminalSincePatch({
          previousStatus: undefined,
          newStatus: mapped.status,
          raw_data: mapped.raw_data as Record<string, unknown>,
          features: mapped.features as Record<string, unknown>,
          // #446: ExpirationDate is stripped from mapped.raw_data (PRIVATE_FIELDS); feed the
          // original un-stripped Trestle record's ExpirationDate as the Expired fallback (not persisted).
          expirationDateFallback: raw.ExpirationDate as string | undefined,
        });
        const terminalSinceUpdate = computeTerminalSincePatch({
          previousStatus: existingForClock?.status,
          newStatus: mapped.status,
          raw_data: mapped.raw_data as Record<string, unknown>,
          features: mapped.features as Record<string, unknown>,
          // #446: ExpirationDate is stripped from mapped.raw_data (PRIVATE_FIELDS); feed the
          // original un-stripped Trestle record's ExpirationDate as the Expired fallback (not persisted).
          expirationDateFallback: raw.ExpirationDate as string | undefined,
        });
        await prisma.listing.upsert({
          where: { listing_id: mapped.listing_id },
          create: {
            ...typedOnlyMapped,
            agent_id: agent.id,
            list_price: mapped.list_price,
            living_area: mapped.living_area,
            address: mapped.address as Prisma.InputJsonValue,
            features: mapped.features as Prisma.InputJsonValue,
            media: mapped.media as Prisma.InputJsonValue,
            compliance: mapped.compliance as Prisma.InputJsonValue,
            raw_data: mapped.raw_data as Prisma.InputJsonValue,
            ...terminalSinceCreate,
          },
          update: {
            agent_id: agent.id,
            mls_id: mapped.mls_id,
            status: mapped.status,
            ...terminalSinceUpdate,
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
            idx_display_yn: mapped.idx_display_yn,
            internet_entire_listing_display_yn: mapped.internet_entire_listing_display_yn,
            internet_address_display_yn: mapped.internet_address_display_yn,
            participant_only: mapped.participant_only,
            owner_opt_out: mapped.owner_opt_out,
            address: mapped.address as Prisma.InputJsonValue,
            features: mapped.features as Prisma.InputJsonValue,
            // P1C1 (RC2 semantics): media was NOT fetched (EXPAND_MEDIA=false →
            // mapped.media is always []) — OMIT the key on UPDATE so existing
            // listings.media is preserved instead of being stomped to [].
            // CREATE above is unchanged (new row, nothing to preserve).
            ...mediaUpdatePatch(mapped.media, EXPAND_MEDIA),
            // S1 (#445 Codex P1): OMIT compliance on UPDATE so CRM/syndication-authored
            // keys (validation_result, approvals) are preserved — never stomped to {}.
            ...complianceUpdatePatch(),
            // Phase C: agent_info JSON no longer persisted; only the 8 typed columns,
            // still derived from the in-memory mapped.agent_info.
            ...typedAgentColumnsFromJson(mapped.agent_info as Record<string, unknown>),
            raw_data: mapped.raw_data as Prisma.InputJsonValue,
            modification_timestamp: mapped.modification_timestamp,
            listing_contract_date: mapped.listing_contract_date,
            last_synced_from_trestle: mapped.last_synced_from_trestle,
            sync_status: mapped.sync_status,
          },
        });

        // H1 Tier-1 dual-write — projection upsert via canonical builder.
        // Failure is non-fatal so the reset-sync loop continues across the
        // full Trestle batch; ops:projection-backfill heals on next run.
        try {
          await dualWriteProjectionForListingId(prisma, mapped.listing_id);
        } catch (projErr) {
          console.warn(
            `[Reset-Sync] projection dual-write failed for ${mapped.listing_id}:`,
            projErr instanceof Error ? projErr.message : projErr,
          );
        }

        upserted++;
      } catch (err) {
        errors++;
        const lid = String(raw.ListingId || "unknown");
        const msg = err instanceof Error ? err.message : "unknown";
        errorDetails.push(`${lid}: ${msg}`);
        console.error(`[Reset-Sync] Error upserting ${lid}:`, err);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.push(`  Trestle fetch error: ${msg}`);
    return NextResponse.json({ error: `Trestle fetch failed: ${msg}`, log }, { status: 502 });
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 3: Summary
  // ══════════════════════════════════════════════════════════════
  const totalInDb = await prisma.listing.count();
  const byStatus = await prisma.listing.groupBy({
    by: ["status"],
    _count: { status: true },
  });
  const byType = await prisma.listing.groupBy({
    by: ["listing_type"],
    _count: { listing_type: true },
  });

  const statusSummary: Record<string, number> = {};
  for (const row of byStatus) statusSummary[row.status] = row._count.status;

  const typeSummary: Record<string, number> = {};
  for (const row of byType) typeSummary[row.listing_type] = row._count.listing_type;

  log.push(`Step 3: Done. ${totalInDb} listings in DB.`);
  log.push(`  By status: ${JSON.stringify(statusSummary)}`);
  log.push(`  By type: ${JSON.stringify(typeSummary)}`);
  if (errorDetails.length > 0) log.push(`  Errors: ${errorDetails.slice(0, 10).join("; ")}`);

  await logAuditEvent("listings_reset_sync", "listing", "bulk", auth, {
    deleted: deletedListingCount,
    // Recorded explicitly: this operation is SCOPED, and the audit trail must
    // show that Mallan-authored inventory was deliberately left in place rather
    // than leaving a reader to infer it from a count.
    scope: "provider-sourced only; Mallan-authored SL-/RL- and website-only rows preserved",
    fetched: totalFetched,
    upserted,
    errors,
    totalInDb,
    statusSummary,
    typeSummary,
  }, req.headers.get("x-forwarded-for") || "unknown");

  return NextResponse.json({
    success: true,
    agent: agent.full_name,
    mlsId,
    licenseNo,
    deleted: deletedListingCount,
    fetched: totalFetched,
    upserted,
    errors,
    totalInDb,
    statusSummary,
    typeSummary,
    log,
  });
}
