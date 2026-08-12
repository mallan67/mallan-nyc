// lib/open-houses/upcoming-open-houses.ts
//
// Canonical resolver for UPCOMING MALLAN open houses, used to attach a `nextOpenHouse` banner to
// listing cards across every surface (homepage Featured, agent page, Mallan exclusives) — and the
// single source of truth for the open-house SCOPE constants shared with app/api/open-houses/route.ts.
//
// Two sources (Maya's architecture, 2026-06-23):
//   - Trestle OpenHouse feed, scoped to MALLAN's office (RLS/Cotality listings).
//   - Local `showing` table (website-only Mallan exclusives).
//
// Compliance rules (REBNY/UCBA):
//   - PUBLIC + ACTIVE + FUTURE open houses only.
//   - Broker/Private/Cancelled excluded.
//   - ComingSoon listings never have a public open house (UCBA Art. I §16).
//   - Display gate honored (idxPlusPreFiltered for the REBNY feed; website-only bypass for exclusives).
//   - NO agent phone/email — this returns only date/time/type/keys.
//
// Twin-id matching: #4D exists as the website-only exclusive SL-0007 (where Featured/exclusive cards
// read it) AND as the RLS listing RLS20099289 (where the Cotality open house lives). A plain
// listing-id join would miss it. So we index by BOTH the listing id AND a normalized address key
// (streetNumber+streetName+unitNumber) and match on either.

import { getAccessToken } from '@/lib/idx/auth';
import prisma from '@/lib/prisma';
import { evaluateDisplayGate } from '@/lib/compliance/gates';
import { DISPLAYABLE_STATUSES } from '@/lib/idx/db-to-public-dto';

// ── Shared scope constants (imported by app/api/open-houses/route.ts too — single source of truth).

// The open-houses surfaces show MALLAN Real Estate's open houses ONLY. Scope the Trestle feed to
// Mallan's office MLS id. DISTINCT from lib/syndication/mallan-identity.ts's MALLAN_OFFICE_MLS_IDS,
// which is intentionally EMPTY and load-bearing for the syndication HOLD (invariant I.5) — do NOT
// consolidate. Verified live 2026-06-23: ListOfficeMlsId '7041' = "MAllan Real Estate Inc".
export const MALLAN_OH_OFFICE_MLS_IDS = ['7041'] as const;

// Open-house-eligible statuses: Active + ActiveUnderContract. ComingSoon is excluded — a Coming Soon
// listing must have NO public open house (UCBA Art. I §16; the showing write path also rejects it).
export const OPEN_HOUSE_ELIGIBLE_STATUSES = DISPLAYABLE_STATUSES.filter((s) => s !== 'ComingSoon');

/** A LOCAL open house is Mallan's own only when the listing is a website-only Mallan exclusive
 *  (rls_eligible=false) or carries the Mallan CRM exclusive prefix (SL-/RL-). Synced RLS listings are
 *  served via the office-scoped Cotality feed instead. */
export function isMallanOwnedLocalListing(l: { rls_eligible?: boolean | null; listing_id?: string | null }): boolean {
  if (l.rls_eligible === false) return true;
  return /^(SL|RL)-/i.test(String(l.listing_id || ''));
}

/** Format a Trestle ISO time (e.g. "2026-06-28T12:00:00.000-04:00") in Eastern. NYC open houses
 *  always display ET — without an explicit timeZone the server's UTC zone renders noon as 4 PM. */
export function formatEasternTime(time: string | null | undefined): string {
  if (!time) return '';
  try {
    const d = new Date(time);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
    }
    const m = time.match(/(\d{1,2}):(\d{2})/);
    if (m) {
      const h = parseInt(m[1], 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${h12}:${m[2]} ${ampm}`;
    }
  } catch { /* fall through */ }
  return time;
}

// ── Canonical appointment-type resolver (single source of truth) ─────────────
// One helper decides the consumer-facing PUBLIC open-house designation, so the API, the shared card
// resolver, the /open-houses cards and the listing sidebar all agree. Appointment-only is detected
// from the ACTUAL production data contract (verified live against Cotality 2026-07-16):
//   - local sale-form showings persist a `[ByAppointment]` marker at the START of showing.notes
//     (saveSaleOpenHouse in public/crm/SALE-FORM-REDESIGN.html);
//   - Cotality OpenHouse rows are OpenHouseType='Public' WITH the boolean AppointmentRequiredYN=true
//     (NOT OpenHouseType='Private'); OpenHouseRemarks free-text is a defensive fallback.
// Broker/Office/Private events are excluded UPSTREAM (feed `OpenHouseType eq 'Public'` filter + the
// local `type='openhouse'` gate), so this only ever chooses between the two PUBLIC designations.
export type PublicOpenHouseType = 'Public' | 'By Appointment';

/** True when the raw open-house signals mark an appointment-only (but still public) event. */
export function isByAppointment(input: {
  notes?: string | null;
  appointmentRequired?: boolean | null;
  remarks?: string | null;
}): boolean {
  if (input.appointmentRequired === true) return true;
  if (/^\s*\[ByAppointment\]/i.test(String(input.notes || ''))) return true;
  if (/\bby\s+appoint?ment\b|\bby\s+appt\b/i.test(String(input.remarks || ''))) return true;
  return false;
}

/** Canonical public open-house designation: 'By Appointment' or 'Public'. */
export function resolvePublicOpenHouseType(input: {
  notes?: string | null;
  appointmentRequired?: boolean | null;
  remarks?: string | null;
}): PublicOpenHouseType {
  return isByAppointment(input) ? 'By Appointment' : 'Public';
}

/** Parse "h:mm AM/PM" (Eastern, as produced by formatEasternTime) to minutes-since-midnight for
 *  chronological tie-breaking within a day. Unparseable → end-of-day so a missing time never sorts
 *  BEFORE a real one. */
export function parseTimeToMinutes(t: string | null | undefined): number {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return 24 * 60;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3] || '')) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

/** Chronological comparator for open houses: earliest calendar date first (YYYY-MM-DD is
 *  lexicographically sortable and timezone-safe), then earliest start time. On an exact same-slot
 *  tie, prefer the 'By Appointment' designation so a generic 'Public' twin can never erase it.
 *  Negative → `a` is earlier/preferred. */
export function compareChronological(a: NextOpenHouse, b: NextOpenHouse): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const am = parseTimeToMinutes(a.startTime);
  const bm = parseTimeToMinutes(b.startTime);
  if (am !== bm) return am - bm;
  const aAppt = a.type === 'By Appointment' ? 0 : 1;
  const bAppt = b.type === 'By Appointment' ? 0 : 1;
  return aAppt - bAppt;
}

/** Normalized address key for twin-safe matching: streetNumber+streetName+unitNumber, lowercased,
 *  alphanumeric only, with street-type words (street/ave/…) and directionals dropped so
 *  "400 E 90TH Street #4D" and "400 90th St, 4D" collapse to the same key. Empty string if no usable
 *  address (callers must treat '' as "no key" — never match on empty). */
export function normalizeAddressKey(parts: {
  streetNumber?: unknown;
  streetName?: unknown;
  unitNumber?: unknown;
}): string {
  const STOP = new Set(['st', 'street', 'ave', 'avenue', 'rd', 'road', 'blvd', 'boulevard', 'dr', 'drive', 'ln', 'lane', 'pl', 'place', 'ct', 'court', 'e', 'w', 'n', 's', 'east', 'west', 'north', 'south']);
  const tok = (v: unknown) =>
    String(v ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !STOP.has(t));
  const num = tok(parts.streetNumber);
  const name = tok(parts.streetName);
  const unit = tok(parts.unitNumber);
  const key = [...num, ...name, ...unit].join('');
  return key;
}

/** Case-tolerant RESO street parts from a stored listing `address` JSON. CRM/local listings persist
 *  the address in RESO **PascalCase** (`StreetNumber`/`StreetName`/`UnitNumber`…), while some legacy
 *  rows use camelCase. Reading only one casing produced an EMPTY address for CRM listings, which the
 *  open-house `hasData` filter then dropped — the SL-0007 P1 bug. Shared by the public open-house
 *  route (display address) and the local banner path (address-key). Returns '' per missing part. */
export function pickAddressParts(address: unknown): {
  streetNumber: string;
  streetDirPrefix: string;
  streetName: string;
  streetSuffix: string;
  streetDirSuffix: string;
  unitNumber: string;
  postalCode: string;
} {
  const a = (address && typeof address === 'object' && !Array.isArray(address) ? address : {}) as Record<string, unknown>;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = a[k];
      if (v !== null && v !== undefined && String(v).trim().length > 0) return String(v).trim();
    }
    return '';
  };
  return {
    // Canonical RESO PascalCase FIRST; camelCase only as a legacy fallback. The CRM PATCH merges new
    // PascalCase keys over the existing address JSON without deleting old camelCase keys
    // (app/api/crm/listings/[id]/route.ts), so a mixed row can carry both — the PascalCase value is
    // the current one. camelCase-first would surface the stale value (Codex #463).
    streetNumber: pick('StreetNumber', 'streetNumber'),
    streetDirPrefix: pick('StreetDirPrefix', 'streetDirPrefix'),
    streetName: pick('StreetName', 'streetName'),
    streetSuffix: pick('StreetSuffix', 'streetSuffix'),
    streetDirSuffix: pick('StreetDirSuffix', 'streetDirSuffix'),
    unitNumber: pick('UnitNumber', 'unitNumber', 'unit'),
    postalCode: pick('PostalCode', 'postalCode', 'zip'),
  };
}

/** Twin-match key for OPEN HOUSES: the canonical street key PLUS the ZIP. Two physically distinct
 *  units that normalize to the same street key — e.g. "400 E 90th #4D" vs "400 W 90th #4D" (the
 *  directional is dropped as a stop-word by normalizeAddressKey) — must NOT collide, so the ZIP
 *  disambiguates cross-town addresses (E 90th=10128 vs W 90th=10024). Returns '' when there is no
 *  usable street (never a ZIP-only key → no false match). A property's two twin representations
 *  (local SL-0007 ↔ Cotality RLS20099289) share street+unit+ZIP, so the match is preserved.
 *  (Codex #464 — the page DTO does not expose the directional separately, so ZIP is the shared
 *  discriminator available to both the route and the listing page.) */
export function openHouseTwinKey(p: {
  streetNumber?: unknown;
  streetName?: unknown;
  unitNumber?: unknown;
  postalCode?: unknown;
}): string {
  // Require a COMPLETE, discriminating address before emitting a match key: street NUMBER + street
  // NAME + a full 5-digit ZIP. Otherwise return '' → the panel falls back to exact listingId only.
  // This prevents partial-key collisions: a unit-number-only key (`4d`) would collide across unrelated
  // "#4D" units, and a missing ZIP (`40090th4d|`) would re-open the E/W collision. (Codex #464)
  const streetNumber = String(p.streetNumber ?? '').trim();
  const streetName = String(p.streetName ?? '').trim();
  const zip = String(p.postalCode ?? '').replace(/\D/g, '').slice(0, 5);
  if (!streetNumber || !streetName || zip.length < 5) return '';
  const base = normalizeAddressKey({ streetNumber, streetName, unitNumber: p.unitNumber });
  if (!base) return '';
  return `${base}|${zip}`;
}

/** The address-key to expose on a listing DETAIL page for twin-safe open-house matching — non-empty
 *  ONLY for Mallan-owned LOCAL exclusives (SL-/RL-), whose open house may be deduped under a different
 *  (Cotality RLS-twin) listingId in the Mallan-only /api/open-houses feed. Every other page returns ''
 *  so the address-key fallback can NEVER cross-attribute a Mallan open house onto a non-Mallan/other-
 *  brokerage listing that merely shares the same address slug (the 3-brokerage co-listing case where
 *  identical slugs resolve to distinct listing ids — app/listing/[...slug]/page.tsx). Mallan RLS
 *  listings match their own feed entry by exact listingId, so they don't need (and don't get) the
 *  address-key fallback. (Codex #464) */
export function listingPageOpenHouseKey(listing: {
  id?: string | null;
  listing_id?: string | null;
  address?: { streetNumber?: unknown; streetName?: unknown; unitNumber?: unknown; postalCode?: unknown } | null;
}): string {
  const listingId = String(listing.id ?? listing.listing_id ?? '');
  if (!isMallanOwnedLocalListing({ listing_id: listingId })) return '';
  const a = listing.address ?? {};
  return openHouseTwinKey({ streetNumber: a.streetNumber, streetName: a.streetName, unitNumber: a.unitNumber, postalCode: a.postalCode });
}

// ── Public shape ───────────────────────────────────────────────────────────

/** Light open-house shape attached to a listing DTO for the card banner. ET times. */
export interface NextOpenHouse {
  date: string;       // "2026-06-28"
  startTime: string;  // "12:00 PM" (Eastern)
  endTime: string;    // "1:00 PM" (Eastern)
  type: string;       // canonical public designation: "Public" | "By Appointment" (never Broker/Private)
}

interface UpcomingEntry extends NextOpenHouse {
  listingId: string;
  addressKey: string;
  source: 'trestle' | 'local';
}

export interface OpenHouseIndex {
  byListingId: Map<string, NextOpenHouse>;
  byAddressKey: Map<string, NextOpenHouse>;
  /** total upcoming entries — lets callers skip the per-listing match loop when there are none. */
  size: number;
}

// ── Trestle (RLS/Cotality) source ────────────────────────────────────────────

async function fetchMallanListingIds(token: string, base: string): Promise<string[]> {
  const officeFilter = MALLAN_OH_OFFICE_MLS_IDS.map((id) => `ListOfficeMlsId eq '${id}'`).join(' or ');
  const statusFilter = OPEN_HOUSE_ELIGIBLE_STATUSES.map((s) => `StandardStatus eq '${s}'`).join(' or ');
  const params = new URLSearchParams();
  params.set('$filter', `(${officeFilter}) and (${statusFilter})`);
  params.set('$select', 'ListingId');
  params.set('$top', '200');
  const res = await fetch(`${base}/odata/Property?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.value || []).map((r: Record<string, unknown>) => String(r.ListingId || '')).filter(Boolean);
}

async function fetchTrestleUpcoming(): Promise<UpcomingEntry[]> {
  try {
    const token = await getAccessToken();
    const base = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
    const mallanIds = await fetchMallanListingIds(token, base);
    if (mallanIds.length === 0) return [];
    const today = new Date().toISOString().split('T')[0];
    const listingScope = mallanIds.map((id) => `ListingId eq '${id.replace(/'/g, "''")}'`).join(' or ');

    const params = new URLSearchParams();
    params.set('$filter', `OpenHouseDate ge ${today} and OpenHouseType eq 'Public' and OpenHouseStatus eq 'Active' and (${listingScope})`);
    // AppointmentRequiredYN + OpenHouseRemarks carry the "By Appointment" signal (see
    // resolvePublicOpenHouseType). Verified live: appt-only Mallan open houses are Public with
    // AppointmentRequiredYN=true, not a distinct OpenHouseType.
    params.set('$select', 'OpenHouseKey,ListingKey,ListingId,OpenHouseDate,OpenHouseStartTime,OpenHouseEndTime,OpenHouseType,AppointmentRequiredYN,OpenHouseRemarks');
    params.set('$orderby', 'OpenHouseDate asc');
    params.set('$top', '50');
    // Property expand: gate fields + address for the twin-safe address key.
    params.set('$expand', 'Property($select=StreetNumber,StreetName,UnitNumber,Permission,InternetEntireListingDisplayYN,InternetAddressDisplayYN,StandardStatus,MlsStatus,CloseDate)');

    const res = await fetch(`${base}/odata/OpenHouse?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out: UpcomingEntry[] = [];
    for (const r of (data.value || []) as Record<string, unknown>[]) {
      // Property is a collection-valued nav → returned as an array; unwrap the first element.
      const propRaw = r.Property;
      const prop = ((Array.isArray(propRaw) ? propRaw[0] : propRaw) || {}) as Record<string, unknown>;
      // idxPlusPreFiltered: REBNY pre-filtered feed — null IELD = displayable (fail-OPEN).
      if (!evaluateDisplayGate(prop, { idxPlusPreFiltered: true }).displayable) continue;
      const listingId = String(r.ListingId || r.ListingKey || '');
      out.push({
        listingId,
        addressKey: normalizeAddressKey({ streetNumber: prop.StreetNumber, streetName: prop.StreetName, unitNumber: prop.UnitNumber }),
        date: String(r.OpenHouseDate || '').split('T')[0],
        startTime: formatEasternTime(r.OpenHouseStartTime as string),
        endTime: formatEasternTime(r.OpenHouseEndTime as string),
        type: resolvePublicOpenHouseType({
          appointmentRequired: r.AppointmentRequiredYN as boolean | null,
          remarks: r.OpenHouseRemarks as string | null,
        }),
        source: 'trestle',
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Local (website-only Mallan exclusives) source ────────────────────────────

async function fetchLocalUpcoming(): Promise<UpcomingEntry[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const showings = await prisma.showing.findMany({
      where: { type: 'openhouse', date: { gte: today }, status: { not: 'cancelled' } },
      include: {
        listing: {
          select: {
            listing_id: true,
            status: true,
            address: true,
            rls_eligible: true,
            owner_opt_out: true,
            participant_only: true,
            internet_entire_listing_display_yn: true,
            internet_address_display_yn: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    });
    const out: UpcomingEntry[] = [];
    for (const s of showings) {
      const l = s.listing;
      if (!l || !isMallanOwnedLocalListing(l)) continue;
      // Website-only exclusive bypass (rls_eligible=false): displayable on a displayable status.
      const displayable =
        l.rls_eligible === false
          ? OPEN_HOUSE_ELIGIBLE_STATUSES.includes(l.status)
          : evaluateDisplayGate({
              status: l.status,
              owner_opt_out: l.owner_opt_out,
              participant_only: l.participant_only,
              internet_entire_listing_display_yn: l.internet_entire_listing_display_yn,
              internet_address_display_yn: l.internet_address_display_yn,
            }).displayable;
      // Codex #472 r15: require an open-house-ELIGIBLE status on BOTH branches so the
      // FEED matches the RSVP-linkage predicate (isLocalOpenHousePubliclyEligible) —
      // otherwise the RLS branch would expose a ComingSoon/Pending open house the RSVP
      // path (correctly) refuses to link, dropping every RSVP for that shown event.
      if (!displayable || !OPEN_HOUSE_ELIGIBLE_STATUSES.includes(l.status)) continue;
      const addr = pickAddressParts(l.address);
      const timeParts = (s.time || '').split('-').map((t) => t.trim());
      out.push({
        listingId: l.listing_id || '',
        addressKey: normalizeAddressKey({ streetNumber: addr.streetNumber, streetName: addr.streetName, unitNumber: addr.unitNumber }),
        date: s.date.toISOString().split('T')[0],
        startTime: timeParts[0] || '',
        endTime: timeParts[1] || '',
        // Sale-form By-Appointment events persist as type='openhouse' with a `[ByAppointment]` notes
        // marker (saveSaleOpenHouse); resolve that marker to the public designation.
        type: resolvePublicOpenHouseType({ notes: s.notes }),
        source: 'local',
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Cache + public API ───────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // open houses change infrequently; one fetch per warm instance / 5 min
let cache: { at: number; entries: UpcomingEntry[] } | null = null;

async function getEntries(): Promise<UpcomingEntry[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.entries;
  const [trestle, local] = await Promise.all([fetchTrestleUpcoming(), fetchLocalUpcoming()]);
  const entries = [...trestle, ...local].filter((e) => e.date);
  cache = { at: now, entries };
  return entries;
}

function earlier(a: NextOpenHouse, b: NextOpenHouse): NextOpenHouse {
  // Earliest by date, then start time; on an exact same-slot tie, By Appointment is preferred so the
  // designation is preserved when a Public twin occupies the same slot (compareChronological).
  return compareChronological(a, b) <= 0 ? a : b;
}

/**
 * Optional date restriction for the index.
 *
 * Search needs "has an open house THIS weekend" / "on this date", not merely
 * "has one upcoming". Without a window, an open-house search matches any future
 * event, which is a different question from the one the filter asks.
 */
export interface OpenHouseWindow {
  /** Exact day, `YYYY-MM-DD`. */
  date?: string;
  /** Inclusive lower bound, `YYYY-MM-DD`. */
  from?: string;
  /** Inclusive upper bound, `YYYY-MM-DD`. */
  to?: string;
  /** The coming Saturday–Sunday. When today IS Sat/Sun, the CURRENT weekend. */
  weekend?: boolean;
  /** Reference day for `weekend`, `YYYY-MM-DD`. Defaults to today; injectable so
   *  the resolution is testable without freezing clocks. */
  today?: string;
}

const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve `weekend` to an inclusive [from, to] pair. UTC arithmetic on the date
 * string only — no local-timezone drift, since entry dates are plain ISO days.
 *
 * Sat(6)/Sun(0) resolve to the weekend already in progress rather than skipping
 * a week, so a Saturday shopper searching "this weekend" sees today's events.
 */
export function resolveWeekend(today: string): { from: string; to: string } {
  const ref = new Date(`${today}T00:00:00Z`);
  const dow = ref.getUTCDay(); // 0 Sun … 6 Sat
  const satOffset = dow === 0 ? -1 : 6 - dow;
  const sat = new Date(ref.getTime() + satOffset * DAY_MS);
  return { from: isoDay(sat), to: isoDay(new Date(sat.getTime() + DAY_MS)) };
}

/** True when an entry's ISO day falls inside the window. No window ⇒ always true. */
export function dayInWindow(day: string, window?: OpenHouseWindow): boolean {
  if (!window) return true;
  if (window.date) return day === window.date;
  let { from, to } = window;
  if (window.weekend) {
    const w = resolveWeekend(window.today ?? isoDay(new Date()));
    from = from ?? w.from;
    to = to ?? w.to;
  }
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Build a per-request index of upcoming Mallan open houses, keyed by listing id AND address key.
 *  Keeps the SOONEST open house per key. Safe to call once per request and reuse across listings.
 *
 *  `window` is optional and existing no-argument callers are unchanged: without
 *  it every upcoming entry is indexed exactly as before. `size` reflects the
 *  WINDOWED entry count, so the caller's "skip the match loop when empty"
 *  shortcut stays correct for a windowed index. */
export async function getOpenHouseIndex(window?: OpenHouseWindow): Promise<OpenHouseIndex> {
  const all = await getEntries();
  const entries = window ? all.filter((e) => dayInWindow(e.date, window)) : all;
  const byListingId = new Map<string, NextOpenHouse>();
  const byAddressKey = new Map<string, NextOpenHouse>();
  for (const e of entries) {
    const light: NextOpenHouse = { date: e.date, startTime: e.startTime, endTime: e.endTime, type: e.type };
    if (e.listingId) {
      const prev = byListingId.get(e.listingId);
      byListingId.set(e.listingId, prev ? earlier(prev, light) : light);
    }
    if (e.addressKey) {
      const prev = byAddressKey.get(e.addressKey);
      byAddressKey.set(e.addressKey, prev ? earlier(prev, light) : light);
    }
  }
  return { byListingId, byAddressKey, size: entries.length };
}

/** Match a listing to its next open house via id OR normalized address (twin-safe). Returns null when
 *  there is none. `address` accepts the structured shape used by the listing DTOs.
 *
 *  #4D bug (400 E 90th): the listing-id map and the address-key map can each resolve a DIFFERENT
 *  event for the same property — the local Wednesday walk-in under the SL-0007 listing-id, and the
 *  earlier Cotality Sunday By-Appointment under the shared address key. This previously RETURNED the
 *  first id match (Wednesday) without ever comparing the address twin. We now collect BOTH candidates
 *  and return the chronologically earliest (compareChronological: date → start time → prefer By
 *  Appointment on a tie), so Sunday correctly wins. */
export function findNextOpenHouse(
  listing: {
    id?: string | null;
    listing_id?: string | null;
    listingId?: string | null;
    mlsId?: string | null;
    address?: { streetNumber?: unknown; streetName?: unknown; unitNumber?: unknown } | null;
  },
  index: OpenHouseIndex,
): NextOpenHouse | null {
  if (index.size === 0) return null;
  const candidates: NextOpenHouse[] = [];
  for (const id of [listing.id, listing.listing_id, listing.listingId, listing.mlsId]) {
    if (!id) continue;
    const hit = index.byListingId.get(String(id));
    if (hit) candidates.push(hit);
  }
  if (listing.address) {
    const key = normalizeAddressKey(listing.address);
    if (key) {
      const hit = index.byAddressKey.get(key);
      if (hit) candidates.push(hit);
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (compareChronological(c, best) < 0 ? c : best));
}
