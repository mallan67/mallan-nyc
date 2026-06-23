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

// ── Public shape ───────────────────────────────────────────────────────────

/** Light open-house shape attached to a listing DTO for the card banner. ET times. */
export interface NextOpenHouse {
  date: string;       // "2026-06-28"
  startTime: string;  // "12:00 PM" (Eastern)
  endTime: string;    // "1:00 PM" (Eastern)
  type: string;       // "Public" (only public events are ever surfaced)
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
    params.set('$select', 'OpenHouseKey,ListingKey,ListingId,OpenHouseDate,OpenHouseStartTime,OpenHouseEndTime,OpenHouseType');
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
        type: 'Public',
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
      if (!displayable) continue;
      const addr = (l.address || {}) as Record<string, string>;
      const timeParts = (s.time || '').split('-').map((t) => t.trim());
      out.push({
        listingId: l.listing_id || '',
        addressKey: normalizeAddressKey({ streetNumber: addr.streetNumber, streetName: addr.streetName, unitNumber: addr.unitNumber }),
        date: s.date.toISOString().split('T')[0],
        startTime: timeParts[0] || '',
        endTime: timeParts[1] || '',
        type: 'Public',
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
  // Compare by date, then a rough start-time ordering (string compare on "h:mm AM/PM" is unreliable,
  // but date is the dominant key; ties keep the first seen, which is acceptable for "next").
  return a.date <= b.date ? a : b;
}

/** Build a per-request index of upcoming Mallan open houses, keyed by listing id AND address key.
 *  Keeps the SOONEST open house per key. Safe to call once per request and reuse across listings. */
export async function getOpenHouseIndex(): Promise<OpenHouseIndex> {
  const entries = await getEntries();
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
 *  there is none. `address` accepts the structured shape used by the listing DTOs. */
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
  for (const id of [listing.id, listing.listing_id, listing.listingId, listing.mlsId]) {
    if (id && index.byListingId.has(String(id))) return index.byListingId.get(String(id)) || null;
  }
  if (listing.address) {
    const key = normalizeAddressKey(listing.address);
    if (key && index.byAddressKey.has(key)) return index.byAddressKey.get(key) || null;
  }
  return null;
}
