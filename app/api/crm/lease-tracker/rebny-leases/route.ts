/**
 * GET /api/crm/lease-tracker/rebny-leases
 *
 * The signed leases where Mallan represented the landlord, read LIVE from Cotality (REBNY RLS):
 * Property rows whose list-side office is Mallan (lib/listings/mallan-source-identity.ts,
 * ListOfficeMlsId '7041' = "MAllan Real Estate Inc", verified live 2026-10-27), PropertyType
 * ResidentialLease, StandardStatus Closed. Each row is matched to the tenancies already in the
 * Lease Tracker (building key + unit, then the term) and carries the suggested tenancy values for
 * "Add to tracker": address, unit, monthly rent = ClosePrice, start = AvailabilityDate (else
 * CloseDate), end = start + 12 months when the licence serves no LeaseTerm (term_assumed: true —
 * the agent confirms the dates from the signed lease). Nothing is written here.
 *
 * What the licence serves for these rows (live 2026-10-27, 23 closed rentals): ClosePrice,
 * CloseDate, AvailabilityDate, ListingContractDate, OffMarketDate, the list agent and office;
 * LeaseTerm, LeaseAmount and OwnerName exist in $metadata but are null on every Mallan row. The
 * tenant and landlord names are therefore never read from RLS: the landlord comes from Mallan's
 * own listing record (owner_client) when one exists, otherwise the agent picks the client.
 *
 * ?months=N limits to leases closed in the last N months (default: all).
 *
 * Every page is read: the provider-fetch foundation (lib/idx/fetch.ts fetchFromTrestle) follows
 * @odata.nextLink; an agent's own REBNY member id is part of the query so the agent's leases are found
 * however many the office has. No owner, tenant or client information is ever sent to Cotality.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getAccessToken } from "@/lib/idx/auth";
import { fetchFromTrestle } from "@/lib/idx/fetch";
import { serializeBigInts } from "@/lib/api/serialize";
import { MALLAN_LIST_OFFICE_MLS_IDS } from "@/lib/listings/mallan-source-identity";
import { addressKey, dayKey, normalizeUnit } from "@/lib/crm/leases";

/** Rows a page (the provider's page), and the most the route reads in one answer (25 pages). */
const PAGE_SIZE = 200;
const MAX_ROWS = 5000;

export const RLS_LEASE_SELECT = [
  "ListingId", "ListingKey", "StandardStatus", "MlsStatus",
  "UnparsedAddress", "StreetNumber", "StreetName", "UnitNumber", "City", "PostalCode",
  "ListPrice", "ClosePrice", "CloseDate", "AvailabilityDate", "ListingContractDate", "OffMarketDate",
  "LeaseTerm", "LeaseAmount", "LeaseAmountFrequency",
  "ListAgentMlsId", "ListAgentFullName", "ListOfficeMlsId", "ListOfficeName",
  "BuyerAgentMlsId", "BuyerAgentFullName", "BuyerOfficeName",
].join(",");

type RlsRow = {
  ListingId: string; ListingKey?: string | null; StandardStatus?: string | null; MlsStatus?: string | null;
  UnparsedAddress?: string | null; StreetNumber?: string | null; StreetName?: string | null; UnitNumber?: string | null;
  City?: string | null; PostalCode?: string | null;
  ListPrice?: number | null; ClosePrice?: number | null; CloseDate?: string | null; AvailabilityDate?: string | null;
  ListingContractDate?: string | null; OffMarketDate?: string | null;
  LeaseTerm?: string | null; LeaseAmount?: number | null; LeaseAmountFrequency?: string | null;
  ListAgentMlsId?: string | null; ListAgentFullName?: string | null; ListOfficeMlsId?: string | null; ListOfficeName?: string | null;
  BuyerAgentMlsId?: string | null; BuyerAgentFullName?: string | null; BuyerOfficeName?: string | null;
};

const DAY = 86_400_000;
/** A recorded tenancy whose start is within this many days of the RLS start is the same term. */
const SAME_TERM_WINDOW_DAYS = 120;

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.length === 10 ? v + "T00:00:00Z" : v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Building address without the unit. Cotality serves `UnparsedAddress` as "425 PARK Avenue S 4D"
 * (street with suffix and direction, unit last) but `StreetName` as the bare name ("PARK"), so the
 * unparsed form minus the trailing unit is the address; StreetNumber + StreetName is the fallback.
 */
export function buildingAddress(r: RlsRow): string {
  let addr = (r.UnparsedAddress ?? "").trim().replace(/\s+/g, " ");
  const unit = (r.UnitNumber ?? "").trim();
  if (addr && unit && addr.toLowerCase().endsWith(" " + unit.toLowerCase())) addr = addr.slice(0, addr.length - unit.length - 1).trim();
  if (addr) return addr;
  const num = (r.StreetNumber ?? "").trim();
  const name = (r.StreetName ?? "").trim();
  return `${num} ${name}`.replace(/\s+/g, " ").trim();
}

/** Monthly rent from the closed price (else list price); a placeholder price (< $100, e.g. "$1") is not a rent. */
export function monthlyRent(r: RlsRow): number | null {
  const v = r.ClosePrice && r.ClosePrice > 0 ? r.ClosePrice : (r.ListPrice && r.ListPrice > 0 ? r.ListPrice : null);
  return v != null && v >= 100 ? v : null;
}

/** Suggested term from what RLS serves: start = AvailabilityDate else CloseDate; end = start + LeaseTerm months (12 assumed). */
export function suggestedTerm(r: RlsRow): { start: Date | null; end: Date | null; months: number; term_assumed: boolean } {
  const start = parseDate(r.AvailabilityDate) ?? parseDate(r.CloseDate);
  const served = typeof r.LeaseTerm === "string" ? r.LeaseTerm.match(/(\d+)/) : null;
  const months = served ? Math.max(1, parseInt(served[1], 10)) : 12;
  if (!start) return { start: null, end: null, months, term_assumed: !served };
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate() - 1));
  return { start, end, months, term_assumed: !served };
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const officeIds = [...MALLAN_LIST_OFFICE_MLS_IDS];
  if (officeIds.length === 0) {
    return NextResponse.json({ error: "Mallan's REBNY office id is not configured" }, { status: 503 });
  }
  const months = parseInt(req.nextUrl.searchParams.get("months") ?? "", 10);

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: "Cotality authentication failed", detail: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }

  const officeFilter = officeIds.map((id) => `ListOfficeMlsId eq '${id.replace(/'/g, "''")}'`).join(" or ");
  let filter = `(${officeFilter}) and PropertyType eq 'ResidentialLease' and StandardStatus eq 'Closed'`;
  if (Number.isFinite(months) && months > 0) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    filter += ` and CloseDate ge ${since.toISOString().slice(0, 10)}`;
  }
  // An agent sees the leases they listed: the agent's own REBNY member id (ListAgentMlsId — the public professional
  // identifier the RLS feed itself carries on every row) is part of the query, so the agent's rows are found however
  // many the office has. The broker sees the office's. Nothing about owners, tenants or clients is ever sent to Cotality:
  // the filter carries the office ids, the property type, the status, a close-date floor and the agent's member id.
  let mine: string | null = null;
  if (auth.role !== "BROKER") {
    const me = await prisma.agent.findUnique({ where: { id: auth.userId }, select: { trestle_mls_id: true } });
    mine = me?.trestle_mls_id ? String(me.trestle_mls_id) : null;
    if (!mine) {
      return NextResponse.json({
        source: "cotality_rls_live", office_mls_ids: officeIds, filter, total: 0, count: 0, untracked: 0, has_more: false,
        fetched_at: new Date().toISOString(), leases: [], note: "No REBNY member id on this agent record: nothing can be attributed.",
      });
    }
    filter += ` and ListAgentMlsId eq '${mine.replace(/'/g, "''")}'`;
  }

  // Every page: the provider-fetch foundation (lib/idx/fetch.ts) follows @odata.nextLink until the answer is exhausted
  // (PAGE_SIZE rows a page, MAX_ROWS in all — has_more says when the office has more than that).
  let fetched: Awaited<ReturnType<typeof fetchFromTrestle>>;
  try {
    fetched = await fetchFromTrestle({
      filter, select: RLS_LEASE_SELECT.split(","), orderby: "CloseDate desc", top: PAGE_SIZE, maxTotal: MAX_ROWS, count: true, timeoutMs: 20_000,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const m = detail.match(/\((\d{3})\)/);
    return NextResponse.json({ error: m ? `Cotality answered ${m[1]}` : "Cotality did not answer", detail: detail.slice(0, 300) }, { status: 502 });
  }
  let rows = fetched.records as unknown as RlsRow[];
  // The answer is checked, not trusted: only the agent's own rows are shown to the agent.
  if (mine) rows = rows.filter((r) => String(r.ListAgentMlsId ?? "") === mine);
  void token;

  // Tenancies already recorded, keyed by building + unit
  const leases = await prisma.activeLease.findMany({
    where: auth.role !== "BROKER" ? { agent_id: auth.userId } : {},
    select: {
      id: true, address: true, unit: true, status: true, lease_start_date: true, lease_end_date: true, monthly_rent: true,
      landlord: { select: { id: true, first_name: true, last_name: true } },
      tenant: { select: { id: true, first_name: true, last_name: true } },
      tenant_name: true,
    },
  });
  type LeaseRow = (typeof leases)[number];
  const byKey = new Map<string, LeaseRow[]>();
  for (const l of leases) {
    const k = addressKey(l.address) + "|" + (normalizeUnit(l.unit) ?? "");
    const arr = byKey.get(k) ?? [];
    arr.push(l);
    byKey.set(k, arr);
  }

  // The landlord, when Mallan's own listing record names the owner
  const ids = rows.map((r) => r.ListingId).filter(Boolean);
  const keys = rows.map((r) => r.ListingKey).filter((k): k is string => typeof k === "string" && k.length > 0);
  const local = ids.length
    ? await prisma.listing.findMany({
        where: { OR: [{ listing_id: { in: ids } }, ...(keys.length ? [{ mls_id: { in: keys } }] : [])] },
        select: { listing_id: true, mls_id: true, owner_client: { select: { id: true, first_name: true, last_name: true, email: true } } },
      })
    : [];
  const ownerByListing = new Map<string, { id: bigint; first_name: string; last_name: string; email: string | null }>();
  for (const l of local) {
    if (!l.owner_client) continue;
    ownerByListing.set(l.listing_id, l.owner_client);
    if (l.mls_id) ownerByListing.set(l.mls_id, l.owner_client);
  }

  const out = rows.map((r) => {
    const address = buildingAddress(r);
    const unitNorm = normalizeUnit(r.UnitNumber);
    const candidates = byKey.get(addressKey(address) + "|" + (unitNorm ?? "")) ?? [];
    const term = suggestedTerm(r);
    const sameTerm = term.start
      ? candidates.find((l) => Math.abs(l.lease_start_date.getTime() - term.start!.getTime()) <= SAME_TERM_WINDOW_DAYS * DAY)
      : undefined;
    const describe = (l: LeaseRow) => ({
      lease_id: l.id, lease_status: l.status, lease_start_date: dayKey(l.lease_start_date), lease_end_date: dayKey(l.lease_end_date),
      monthly_rent: l.monthly_rent == null ? null : Number(l.monthly_rent),
      landlord: l.landlord ? { id: l.landlord.id, name: `${l.landlord.first_name} ${l.landlord.last_name}`.trim() } : null,
      tenant: l.tenant ? `${l.tenant.first_name} ${l.tenant.last_name}`.trim() : (l.tenant_name ?? null),
    });
    const tracking = sameTerm
      ? { status: "tracked" as const, ...describe(sameTerm) }
      : candidates.length
        ? { status: "tracked_other_term" as const, ...describe(candidates[0]), other_terms: candidates.map(describe) }
        : { status: "untracked" as const };
    const owner = ownerByListing.get(r.ListingId) ?? (r.ListingKey ? ownerByListing.get(r.ListingKey) : undefined) ?? null;
    const rent = monthlyRent(r);
    return {
      listing_id: r.ListingId,
      listing_key: r.ListingKey ?? null,
      standard_status: r.StandardStatus ?? null,
      address,
      unit: r.UnitNumber ? String(r.UnitNumber).trim() : null,
      city: r.City ?? null,
      postal_code: r.PostalCode ?? null,
      monthly_rent: rent,
      list_price: r.ListPrice ?? null,
      close_date: r.CloseDate ? String(r.CloseDate).slice(0, 10) : null,
      availability_date: r.AvailabilityDate ? String(r.AvailabilityDate).slice(0, 10) : null,
      listing_contract_date: r.ListingContractDate ? String(r.ListingContractDate).slice(0, 10) : null,
      off_market_date: r.OffMarketDate ? String(r.OffMarketDate).slice(0, 10) : null,
      lease_term: r.LeaseTerm ?? null,
      list_agent: { mls_id: r.ListAgentMlsId ?? null, name: r.ListAgentFullName ?? null, office: r.ListOfficeName ?? null },
      tenant_side: { agent_mls_id: r.BuyerAgentMlsId ?? null, agent: r.BuyerAgentFullName ?? null, office: r.BuyerOfficeName ?? null },
      suggested: {
        address,
        unit: r.UnitNumber ? String(r.UnitNumber).trim() : null,
        monthly_rent: rent,
        lease_start_date: term.start ? dayKey(term.start) : null,
        lease_end_date: term.end ? dayKey(term.end) : null,
        months: term.months,
        term_assumed: term.term_assumed,
        landlord: owner ? { id: owner.id, name: `${owner.first_name} ${owner.last_name}`.trim(), email: owner.email } : null,
      },
      tracking,
    };
  });

  return NextResponse.json(serializeBigInts({
    source: "cotality_rls_live",
    office_mls_ids: officeIds,
    filter,
    total: fetched.odataCount ?? rows.length,
    count: out.length,
    untracked: out.filter((r) => r.tracking.status === "untracked").length,
    has_more: fetched.hasMore,
    fetched_at: new Date().toISOString(),
    leases: out,
  }));
}
