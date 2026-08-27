/**
 * Reusable T+180 archive core (Gate 6, board #415).
 *
 * Single source of truth for the archive ELIGIBILITY predicate, the archive SUMMARY build, and the
 * per-row STRIP, so the nightly cron (app/api/cron/data-retention/route.ts) and the controlled
 * operator drain (scripts/drain-archive-backlog.ts) run BYTE-FOR-BYTE the same logic Gate 5
 * validated — no drift between the two callers.
 *
 * This module performs NO writes on import and holds NO Prisma client; callers inject it.
 * The 500/run cap stays in the cron route (NOT here) — see T180_BATCH_CAP in the route.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { resolveListingAgentInfo, AGENT_TYPED_SELECT, ResolvableListingAgent } from "@/lib/listings/agent-info-resolver";

/** Mirror of the cron route's TERMINAL_STATUSES (kept in sync by tests). */
export const ARCHIVE_TERMINAL_STATUSES = [
  "Closed",
  "Sold",
  "Leased",
  "Rented",
  "Withdrawn",
  "Expired",
  // BOTH SPELLINGS. `Canceled` (one L) is the live Cotality value and is what
  // the Trestle sync writes raw into `listings.status`; `Cancelled` (two Ls)
  // is the value Mallan invented and what the CRM write path stored. This list
  // goes straight into a Prisma `status: { in: [...] }`, so a spelling it lacks
  // is a row it never sees - no error, no log, just silence. Before this, every
  // row the PROVIDER marked canceled was invisible to both the T+30 media strip
  // and the T+180 archive.
  "Canceled",
  "Cancelled",
] as const;

export const ARCHIVE_CUTOFF_DAYS = 180;

export type ArchiveClock = "terminal_since" | "status_changed_at";

type JsonObject = Record<string, unknown>;
function asObject(v: unknown): JsonObject {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {};
}
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the eligibility `where` for the T+180 archive, identical to the cron route.
 * `terminal_since` is the stable clock (flag ON); `status_changed_at` is the legacy clock (flag OFF).
 * NULL clock fails `{ lt }` (NULL < ts is NULL) → never auto-archived (fail-safe; no invented dates).
 */
export function archiveEligibilityWhere({ now, clock }: { now: Date; clock: ArchiveClock }): Prisma.ListingWhereInput {
  const cutoff = new Date(now.getTime() - ARCHIVE_CUTOFF_DAYS * 24 * 60 * 60 * 1000);
  const dateEligibility =
    clock === "terminal_since" ? { terminal_since: { lt: cutoff } } : { status_changed_at: { lt: cutoff } };
  return {
    status: { in: [...ARCHIVE_TERMINAL_STATUSES] },
    sync_status: { not: "archived" },
    ...dateEligibility,
  };
}

/** The columns the archiver must SELECT (typed-first agent attribution + raw_data for close terms). */
export const ARCHIVE_SELECT = {
  id: true,
  listing_id: true,
  mls_id: true,
  status: true,
  listing_type: true,
  property_type: true,
  property_sub_type: true,
  list_price: true,
  bedrooms_total: true,
  bathrooms_full: true,
  bathrooms_half: true,
  living_area: true,
  borough: true,
  neighborhood: true,
  city: true,
  postal_code: true,
  days_on_market: true,
  address: true,
  ...AGENT_TYPED_SELECT,
  raw_data: true,
  created_at: true,
} satisfies Prisma.ListingSelect;

/** The candidate row shape produced by ARCHIVE_SELECT (loosely typed so both callers + tests fit). */
export interface ArchiveCandidateRow {
  id: bigint | number;
  listing_id: string;
  mls_id?: string | null;
  status: string;
  sync_status?: string | null;
  listing_type: string;
  property_type?: string | null;
  property_sub_type?: string | null;
  list_price?: Prisma.Decimal | number | string | null;
  bedrooms_total?: number | null;
  bathrooms_full?: number | null;
  bathrooms_half?: number | null;
  living_area?: Prisma.Decimal | number | string | null;
  borough?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  postal_code?: string | null;
  days_on_market?: number | null;
  address?: unknown;
  raw_data?: unknown;
  created_at?: Date | null;
  list_agent_full_name?: string | null;
  list_office_name?: string | null;
  list_agent_email?: string | null;
  list_agent_direct_phone?: string | null;
  list_office_mls_id?: string | null;
  list_agent_mls_id?: string | null;
  co_list_office_mls_id?: string | null;
  co_list_agent_mls_id?: string | null;
  agent_info?: unknown;
}

/**
 * The exact one-way strip applied to the live row. `raw_data` becomes JSON `null` (Prisma.JsonNull,
 * NOT SQL NULL); `media`→[]; `compliance`→{}; `sync_status`→'archived'. The row is KEPT (FK integrity).
 */
export const ARCHIVE_STRIP_DATA: Prisma.ListingUpdateInput = {
  sync_status: "archived",
  raw_data: Prisma.JsonNull,
  media: [] as unknown as Prisma.InputJsonValue,
  compliance: {} as unknown as Prisma.InputJsonValue,
};

/** Build the `create` summary for listings_archive — typed-first agent attribution, close terms from raw_data. */
export function buildArchiveSummaryCreate(l: ArchiveCandidateRow): Prisma.ListingsArchiveCreateInput {
  const addr = asObject(l.address);
  const raw = asObject(l.raw_data);
  const resolvedAgent = resolveListingAgentInfo(l as unknown as ResolvableListingAgent);

  const streetNumber = str(addr.StreetNumber);
  const streetName = str(addr.StreetName);
  const unit = str(addr.UnitNumber);
  const addressLine =
    [[streetNumber, streetName].filter(Boolean).join(" "), unit ? `Apt ${unit}` : null]
      .filter(Boolean)
      .join(", ") || null;

  const listingKey = l.mls_id || l.listing_id;

  return {
    listing_key: listingKey,
    listing_id: l.listing_id,
    mls_id: l.mls_id ?? null,
    status: l.status,
    listing_type: l.listing_type,
    property_type: l.property_type ?? null,
    property_sub_type: l.property_sub_type ?? null,
    close_price: num(raw.ClosePrice),
    close_date: raw.CloseDate ? new Date(String(raw.CloseDate)) : null,
    list_price: l.list_price ?? null,
    original_list_price: num(raw.OriginalListPrice),
    bedrooms_total: l.bedrooms_total ?? null,
    bathrooms_full: l.bathrooms_full ?? null,
    bathrooms_half: l.bathrooms_half ?? null,
    living_area: l.living_area ?? null,
    borough: l.borough ?? null,
    neighborhood: l.neighborhood ?? null,
    city: l.city ?? null,
    postal_code: l.postal_code ?? null,
    address_line: addressLine,
    list_agent_full_name: resolvedAgent.fullName || str(raw.ListAgentFullName),
    list_office_name: resolvedAgent.officeName || str(raw.ListOfficeName),
    days_on_market: l.days_on_market ?? null,
    original_created_at: l.created_at ?? null,
  };
}

export interface ArchiveOneResult {
  /** true = the row was stripped + summarized. */
  ok: boolean;
  /** true = eligibility drifted between SELECT and write (e.g. reactivated/already-archived/aged-out)
   *  → nothing was stripped and NO summary was written. Not an error. */
  skipped?: boolean;
  error?: string;
}

/**
 * Archive ONE listing atomically with an in-transaction eligibility RE-CHECK.
 *
 * The strip is destructive, so we do NOT trust the SELECT snapshot: inside the write transaction we
 * re-assert the EXACT archive predicate (`eligibilityGuard` — terminal status ∧ not archived ∧ the
 * T+180 clock) via a guarded `updateMany`. If the row reactivated (terminal→Active), was archived by
 * another path, or aged out of the window between SELECT and here, the guard matches 0 rows → we strip
 * NOTHING and write NO summary (returns skipped). Only when exactly the guarded row is stripped do we
 * upsert its summary (idempotent — a pre-existing listing_key no-ops). On failure, a
 * `listings_archive_move` sync_error is recorded and ok:false is returned (caller continues).
 */
export async function archiveOneListing(
  prisma: PrismaClient,
  row: ArchiveCandidateRow,
  eligibilityGuard: Prisma.ListingWhereInput,
): Promise<ArchiveOneResult> {
  const summary = buildArchiveSummaryCreate(row);
  try {
    const stripped = await prisma.$transaction(async (tx) => {
      const upd = await tx.listing.updateMany({
        where: { ...eligibilityGuard, id: row.id as bigint },
        data: ARCHIVE_STRIP_DATA,
      });
      if (upd.count === 0) return false; // eligibility drift → strip nothing, write no summary
      await tx.listingsArchive.upsert({
        where: { listing_key: summary.listing_key },
        create: summary,
        update: {}, // idempotent — pre-existing listing_key no-ops
      });
      return true;
    });
    return stripped ? { ok: true } : { ok: false, skipped: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.syncError
      .create({
        data: {
          resource: "listings_archive_move",
          listing_id: row.listing_id,
          listing_key: row.mls_id ?? null,
          error_code: "archive",
          error_msg: msg.slice(0, 2000),
        },
      })
      .catch(() => {});
    return { ok: false, error: msg };
  }
}
