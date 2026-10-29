/**
 * Tenancy helpers shared by every ActiveLease reader and writer
 * (app/api/crm/active-leases, app/api/crm/rentals/leases, lease-tracker, lifecycle engine).
 *
 * Found 2026-10-27 in the running app:
 *   - the create and single-record routes spread the Prisma row into the response; BigInt ids
 *     (landlord_lead_id, tenant_lead_id, agent_id, nested landlord.id / tenant.id) made
 *     JSON.stringify throw AFTER the row was inserted or updated, so the CRM showed "Failed"
 *     and the agent clicked again — 425 Park Avenue South 4D exists four times.
 *   - neither create route checked for an existing tenancy, so a retry after that failure, a
 *     double click or a timeout inserted a duplicate.
 *
 * The natural key of a tenancy is the landlord, the unit (normalised address + unit) and the
 * term (start day, end day). No schema change: the key is resolved here before an insert.
 */
import { createHmac } from "crypto";
import prisma from "@/lib/prisma";
import { serializeBigInts } from "@/lib/api/serialize";

/** Returned (409, code lease_term_locked) when a date change is sent for an open tenancy without correction: true. */
export const LEASE_TERM_LOCKED_MESSAGE =
  "The recorded lease term is history. Record a renewal as a new term (POST /renew), or send correction: true to fix a typo in the dates.";

/** The outreach types the lease outreach route implements — the Lease Tracker menus are built from this list. */
export const LEASE_OUTREACH_TYPES = [
  "sell_inquiry", "buy_inquiry", "renewal", "market_update", "90d_checkin", "60d_checkin", "30d_checkin",
] as const;
export type LeaseOutreachType = (typeof LEASE_OUTREACH_TYPES)[number];

/** Types a client can decline (Lead.nurture_paused): buying / selling solicitations. Renewal and check-ins are about the tenancy itself. */
export const DECLINABLE_OUTREACH_TYPES: ReadonlySet<string> = new Set(["sell_inquiry", "buy_inquiry", "market_update"]);

/**
 * Proof that exactly this email (lease, target, type, recipient, subject, body) was previewed by this
 * agent today. The send call must carry it back, so a send is never possible without a preview.
 */
export function outreachPreviewToken(parts: {
  lease_id: string; target: string; type: string; recipient: string; subject: string; html: string; agent_id: string; day?: string;
}): string {
  const day = parts.day ?? dayKey(new Date());
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "mallan-lease-outreach-preview";
  return createHmac("sha256", secret)
    .update([parts.lease_id, parts.target, parts.type, parts.recipient.toLowerCase(), parts.subject, parts.html, parts.agent_id, day].join("\u0001"))
    .digest("hex");
}

export type TenancyKey = {
  landlord_lead_id: bigint;
  address: string;
  unit?: string | null;
  lease_start_date: Date;
  lease_end_date: Date;
};

/** "425  Park Avenue South " → "425 park avenue south" */
export function normalizeAddress(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** "#4D" / " 4d " / "" → "4d" / null */
export function normalizeUnit(value: unknown): string | null {
  const s = String(value ?? "").trim().replace(/^#/, "").replace(/\s+/g, " ").toLowerCase();
  return s === "" ? null : s;
}

const STREET_WORDS: Record<string, string> = {
  w: "west", e: "east", n: "north", s: "south", st: "street", ave: "avenue", av: "avenue", blvd: "boulevard",
  pl: "place", rd: "road", dr: "drive", ln: "lane", ct: "court", pkwy: "parkway", sq: "square", ter: "terrace",
};

/**
 * Loose building key for matching a REBNY/RLS address to a recorded tenancy: house number plus the
 * next two street tokens, abbreviations expanded, ordinals stripped, any trailing unit ignored.
 * "425 PARK Avenue S 4D" and "425 Park Avenue South" → "425 park avenue"; "36 W 85TH Street 2" and
 * "36 West 85th Street" → "36 west 85". The unit is compared separately (normalizeUnit).
 */
export function addressKey(value: unknown): string {
  const tokens = String(value ?? "").toLowerCase().replace(/[.,#]/g, " ").split(/\s+/).filter(Boolean).map((t) => {
    const ord = t.match(/^(\d+)(st|nd|rd|th)$/);
    if (ord) return ord[1];
    return STREET_WORDS[t] ?? t;
  });
  return tokens.slice(0, 3).join(" ");
}

/** Calendar day (UTC) of a date, for comparing terms typed as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a lease date from a request body; null when unreadable. */
export function parseLeaseDate(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function dayBounds(d: Date): { gte: Date; lt: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  return { gte: start, lt: end };
}

/**
 * The tenancy that already exists for this landlord, unit and term, whatever its status.
 * Prisma cannot normalise text, so candidates are read by landlord and term and the
 * address / unit are compared here.
 */
export async function findExistingTenancy(key: TenancyKey): Promise<{ id: bigint; status: string } | null> {
  const candidates = await prisma.activeLease.findMany({
    where: {
      landlord_lead_id: key.landlord_lead_id,
      lease_start_date: dayBounds(key.lease_start_date),
      lease_end_date: dayBounds(key.lease_end_date),
    },
    select: { id: true, status: true, address: true, unit: true },
    orderBy: { id: "asc" },
  });
  const address = normalizeAddress(key.address);
  const unit = normalizeUnit(key.unit);
  const hit = candidates.find((c) => normalizeAddress(c.address) === address && normalizeUnit(c.unit) === unit);
  return hit ? { id: hit.id, status: hit.status } : null;
}

export type LeaseUrgency = "expired" | "critical" | "high" | "medium" | "low";

export function daysToExpiry(leaseEnd: Date, now: Date = new Date()): number {
  return Math.ceil((leaseEnd.getTime() - now.getTime()) / 86_400_000);
}

export function leaseUrgency(days: number): LeaseUrgency {
  if (days < 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= 60) return "high";
  if (days <= 90) return "medium";
  return "low";
}

/** True when the term has ended and the row still says active / pending (the outcome was not recorded). */
export function isEndedButOpen(lease: { status: string; lease_end_date: Date }, now: Date = new Date()): boolean {
  return (lease.status === "active" || lease.status === "pending") && daysToExpiry(lease.lease_end_date, now) < 0;
}

/**
 * One JSON-safe shape for every ActiveLease response: BigInt → string, Decimal → number,
 * nested landlord / tenant / agent ids included, plus days_to_expiry and urgency.
 */
export function serializeLease<T extends { lease_end_date: Date; status: string }>(lease: T, now: Date = new Date()) {
  const days = daysToExpiry(lease.lease_end_date, now);
  return {
    ...serializeBigInts(lease),
    days_to_expiry: days,
    urgency: leaseUrgency(days),
    ended_but_open: isEndedButOpen(lease, now),
  };
}
