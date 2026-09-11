# Media has different owners (owner ruling 2026-09-08)

Maya's ruling: `Media.ResourceName` includes Member, Property, Building, Office, Contacts; `Media.ResourceRecordKey`
links to the owning resource. MEMBER → agent photos (never mixed into listing photos); PROPERTY → listing photos / floor
plans / videos / tours / documents with ordering and primary-photo semantics; BUILDING → building media (never copied
into every unit; a detail page may display it in a separate Building section, provenance stays Building). Office and
Contacts: no invented features, nothing discarded or flattened.

## 1. What the feed delivers (live, 2026-09-08)

| Fact | Measured | Consequence |
|---|---|---|
| `Media.ResourceName` vocabulary | 5 published members: Building, Contacts, Member, Office, Property (`CotalityEnum_ResourceName`); filterable; populated on 2,000,898 rows | the owner axis is an exact provider fact |
| `ResourceName eq 'Property'` | **2,002,862** rows | listing media |
| `ResourceName eq 'Building'` | **62** rows — 31 distinct `ResourceRecordKey` (7-digit numeric BuildingKeys), all `MediaCategory` Photo / Jpeg / Active, `Order` 1–5 | building media exists on the feed today |
| `ResourceName eq 'Member'` / `'Office'` / `'Contacts'` / null | **0** rows each | no agent, office or contact media is delivered today |
| Member photo fields | `MemberPreferredMedia` populated 0; `Member($expand=Media)` → empty | agent portraits cannot come from the feed |
| Collision probe (3 BuildingKeys) | `Media` Property rows under the key: 0 · `Property.ListingKey eq key`: 0 · Building rows: 4 / 1 / 6 | a BuildingKey never addresses a Property; ListingKeys are 10-digit |
| `Property($expand=Media($filter=ResourceName eq 'Property';$select=…))` | accepted live (rows returned with `ResourceName: "Property"`) | the navigation is Property-scoped and the owner can be selected |
| `Building` entity set | HTTP 403 "Resource … Building not available"; `Property.BuildingKey` / `BuildingKeyNumeric` suppressed (null) | **Building media cannot be joined to any Mallan building page today** — the only key is one the feed does not deliver on Property |

## 2. The model (`lib/media/listing-media-resolver.ts` — the one interpreter of provider Media rows)

| | |
|---|---|
| `MEDIA_OWNERS` / `MediaOwner` | the five live members, compile-checked against the generated contract |
| `MEDIA_SELECT_FIELDS` | now carries `ResourceName` — every Media query (top-level and `$expand`) returns the owner |
| `mediaOwnerOf(row)` | the exact member or null; never inferred from a key shape |
| `PROPERTY_MEDIA_FILTER` / `mediaOwnerFilter(owner)` | the owner predicate for top-level Media queries |
| `resolveListingMedia` | a LISTING gallery keeps Property rows only (a Building / Member / Office / Contacts row arriving under a listing key is dropped, never rendered as a unit photo); `ResolvedMedia.owner` names the owner; a `listing_media` table row is Property by construction |
| `partitionMediaByOwner(rows)` | splits rows by owner without discarding any context (for a future Building section) |

Consumers: `lib/search/engine/hydrate.ts`, `lib/idx/fetch.ts` (`fetchListingMedia`), `app/api/media/batch/route.ts` (both
modes), `app/api/agents/[slug]/listings/route.ts`, `lib/idx/media-sync.ts` (`defaultFetchMedia`) add `ResourceName eq
'Property'` to their top-level Media filters; the three `Property($expand=Media(...))` sites are Property-scoped by the
navigation and now select the owner. `upsertListingMedia` writes Property rows only and counts a foreign owner
(`skippedForeignOwner`) instead of storing it as a listing photo.

Agent photos are Mallan-owned files (`Agent.photo` → `/images/agents/…`, `lib/agents/avatar.ts`); the Member context is
reserved in the model and no consumer reads listing media for a portrait.

Tests: `lib/media/__tests__/media-owner.test.ts`, `lib/media/__tests__/media-select-fields.test.ts` (ResourceName in
the one select), `lib/idx/__tests__/media-sync-upsert.test.ts` (foreign owner never written), `tests/runtime/media-owner-wiring.test.ts`.

## 3. Not invented, and held

- **No Building section renders media**: the join key is not delivered (§1), so displaying the 62 Building rows on a
  building page would require a key Mallan does not have. The provenance is preserved in the model; the reader is not
  invented. When `Property.BuildingKey` is entitled, `mediaOwnerFilter('Building')` + `ResourceRecordKey eq
  <BuildingKey>` is the query.
- **Office / Contacts**: 0 rows live; the owners exist in the model and are never flattened into Property media.
- **Held**: `lib/idx/sync.ts` keeps three literal Media selects without the owner predicate (IDX-sync hold);
  `public/crm/js/**` renders whatever `/api/media/batch` returns (Property-scoped now).
