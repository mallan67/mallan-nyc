# OpenHouse resource contract — PR #647 raw-mapper convergence (2026-10-02)

Split out of `docs/audits/raw-mapper-media-contract-resolution-2026-10-02.md` per Maya's
instruction: each Cotality resource gets its own verified contract, since fields, enums,
permissions, and rows differ by resource — the same mistake (verifying one resource,
assuming it generalizes) can recur otherwise. Lighter-weight pass than Property/Media — one
dedicated agent, not a full parallel workflow.

Structured per the required template: **RAW COTALITY RESOURCE CONTRACT → CANONICAL MALLAN
STORAGE FIELDS → DOWNSTREAM PROJECTION → CURRENT DEFECT/GAP → PROOF.**

---

## 1. RAW COTALITY RESOURCE CONTRACT

`OpenHouse` is its own entity set (47 fields total per earlier Master Plan-adjacent counts;
not independently re-verified field-by-field in this pass — scope was the join key and the
fields three live consumers actually read). Confirmed live via `mcp__trestle-fields__*`:

- `ListingId` — nullable String(255), the join key all three consumer files use.
- `ListingKey` — nullable String(20); `ListingKeyNumeric` — Int64; neither selected by any
  current consumer.
- `OpenHouseDate` — Date(10), nullable.
- `OpenHouseStartTime` / `OpenHouseEndTime` — DateTime, nullable.
- `OpenHouseStatus` — Enum, 3 values: `Active, Canceled, Ended`.
- `OpenHouseType` — Enum, 9 values: `Broker, InPersonAndLivestreamBroker,
  InPersonAndLivestreamPublic, LivestreamBroker, LivestreamOffice, LivestreamPublic, Office,
  Private, Public`. Three of these (`Public`, `LivestreamPublic`,
  `InPersonAndLivestreamPublic`) are genuinely public-facing; the other six are
  agent/broker/office-only.
- `AppointmentRequiredYN` — Boolean, nullable.
- `OpenHouseRemarks` — String(12000), nullable.

No population-rate data was gathered for this resource in this pass — population claims
below are about which code paths read which fields, not row counts.

---

## 2. CANONICAL MALLAN STORAGE FIELDS

No dedicated `open_house` DB table was identified in this pass — all three consumer files
query Cotality live, per-request, rather than reading a persisted Mallan copy. There is
therefore no raw-vs-projected storage distinction to verify here (unlike Media's
`listing_media.media_category` vs `.media_type`); the gap/defect analysis below is entirely
about the live query construction itself.

---

## 3. DOWNSTREAM PROJECTION

Three consumers, three independent query constructions against the same raw resource:

- `app/api/open-houses/route.ts` — the dedicated public open-house listing surface.
- `lib/open-houses/upcoming-open-houses.ts` — feeds a "next open house" card/banner.
- `app/api/listings/route.ts` — adds an `openHouse=true` boolean filter to general listing
  search (both a DB-first path and a Trestle-fallback path).

---

## 4. CURRENT DEFECT/GAP

**PROVEN_RESOURCE_GAP:** `app/api/listings/route.ts`'s `openHouse=true` filter (both its
DB-first path and Trestle-fallback path) queries only
`OpenHouseDate ge <date> and OpenHouseStatus eq 'Active'` — it does **not** add
`OpenHouseType eq 'Public'`, unlike the other two consumer files, which both do and cite UCBA
Art. I §16 in their own comments ("Broker-only and Private events are not for consumer
display"). A listing whose only current `OpenHouse` row is `Private`/`Broker`/`Office`-typed
would still satisfy this filter and get surfaced as having an open house to public search —
the live `OpenHouseType` enum (Section 1) confirms six non-public values exist to leak. Not
confirmed against an actual live row with this exact shape in this pass — classified as a
resource-gap (the query construction is demonstrably incomplete against the live contract),
not a confirmed live failure.

**PROVEN_RESOURCE_GAP:** where `OpenHouseType eq 'Public'` IS filtered (the other two
files), it is an exact match against the single literal `'Public'` — missing the two other
genuinely public live values, `LivestreamPublic` and `InPersonAndLivestreamPublic`. A
livestream-only or hybrid public open house would be silently excluded from `/open-houses`
and the "next open house" banner.

**LEGACY_UNVERIFIED:** all three files join via `ListingId eq '<Property.ListingId>'` only;
`OpenHouse.ListingId` is nullable, and `ListingKey`/`ListingKeyNumeric` exist as alternates
but are never selected or used as a fallback join key by any of the three. The schema shape
makes a null-`ListingId` row legal; nothing in this pass proves Cotality actually emits one
for Mallan's listings today. (A related dead-code note: `app/api/open-houses/route.ts`'s
`fetchMallanListingRefs` computes a `keys` value that is never destructured at its call
site — consistent with the join being `ListingId`-only in practice.)

**CORRECT:** the core per-row fields each file reads (`OpenHouseDate`, start/end time,
`OpenHouseStatus`, `AppointmentRequiredYN`, `OpenHouseRemarks`) match the live
types/nullability in Section 1 with no mismatch found.

---

## 5. PROOF

Live field/type/enum facts confirmed via `mcp__trestle-fields__trestle_list_fields(resource="OpenHouse")`
and `trestle_lookup_field("OpenHouseType", resource="OpenHouse")` this session. Consumer code
read directly from `app/api/open-houses/route.ts`, `lib/open-houses/upcoming-open-houses.ts`,
and `app/api/listings/route.ts` at/near PR #647 HEAD. No live-row execution or captured-row
fixture exists for this resource — the same open item noted in the Media contract document
applies here: this session's tools query live `$metadata`/picklists, not row data.
