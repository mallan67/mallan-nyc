# Sales-Form Media — P0 Implementation Plan (concise)

> Source of truth: `docs/crm/sales-form-media-cotality-ucba-audit-2026-05-29.md`. **Plan only — no code.**
> Scope: **CRM sales form media only** · Cotality/IDX Plus media contract · UCBA compliance · public-render consistency.

---

## 1 · Current media model problem
CRM-created listings store media as a **flat `listing.media` JSON** (`{url, thumbUrl, heroUrl, caption, order, type:"photo"(hardcoded), contentHash}`) written by `app/api/crm/listings/[id]/media/upload/route.ts`. Trestle/IDX listings use the **Cotality-contract `listing_media` table** (`media_key`, `media_type`, `media_category`, `order`, `preferred_photo_yn`, …). SL-0004 = 0 table rows / 17 JSON items. The JSON shape lacks `media_key`, `preferred_photo_yn`, `media_category`/`ImageOf`, and a real `media_type`. Consequences (all verified in the audit):
- **Wrong hero** — no `preferred_photo_yn`; hero = first-uploaded (the cityscape on SL-0004).
- **Reorder is a no-op** — `/media-order` writes `raw_data.media_order`, which the display resolver never reads (and CRM items have no id to reference).
- **No stable id** — delete/reorder are fragile.
- **Floor-plan-as-photo** — `type` hardcoded `"photo"`; only `caption='Floor Plan'` saves classification.

## 2 · Required Cotality-contract CRM media contract
CRM media must carry the same fields the public resolver + syndication already understand:
| Field | Meaning | Today (CRM JSON) |
|---|---|---|
| `media_key` | stable unique id per item | ❌ missing |
| `media_type` | `Photo` / `FloorPlan` / `Video` | ❌ hardcoded `photo` |
| `media_category` | content kind (`Photo`/`FloorPlan`/`Video` — mirrors Cotality `MediaCategory`; `ImageOf` room/subject tag is separate, P1) | ❌ missing |
| `order` | per-item display order | ⚠️ upload sequence only |
| `preferred_photo_yn` | the hero flag | ❌ missing |
| `media_url` (+ R2 variants) | image URL | ✅ present |
| `caption` (`ShortDescription`) | UCBA-clean caption | ⚠️ unscanned |
| `media_modification_timestamp` | per-item change | ❌ missing |

**Decision (locked by Maya 2026-05-29):** **Unify CRM uploads onto the existing `listing_media` table** — syndication-ready; the public resolver already reads it via `resolveListingMediaFromRows`. Implication: the CRM upload/order/delete write paths target `listing_media` (not `listing.media` JSON), and the public DTO path for CRM exclusives switches from the JSON branch to the rows branch. ⚠️ This touches DB write paths / schema — **held surface**: requires explicit Maya go + `NEON.md` discipline before any migration/`prisma` work.

## 3 · P0 functional requirements (the M1–M4 cluster)
1. **Cotality-contract storage (M1):** CRM uploads persist `media_key`, `media_type`, `order`, `preferred_photo_yn`, `media_category` — via the `listing_media` table (or enriched JSON per the decision above).
2. **Real hero (M2):** a `preferred_photo_yn` is set per listing; the resolver already honors it (`providerOrder=-1`). Exactly one preferred photo. Fixes hero everywhere incl. OpenGraph.
3. **Persistent reorder (M3):** drag-order writes the per-item `order` the **public resolver actually reads** (not `raw_data.media_order`); reload + public render reflect it.
4. **Stable id (M4):** every CRM media item has a `media_key`; delete removes exactly one item and survives reload; reorder references real ids.
5. **Floor-plan typing (M5, P0-adjacent):** set `media_type='FloorPlan'` from the upload, not hardcoded — floor plans never become the hero and land in the floor-plan group.

## 4 · P0 UX requirements
1. **"Set as main photo" (hero) control** on each photo → writes `preferred_photo_yn`; clear visual "COVER" badge on the chosen one.
2. **Drag-to-reorder that sticks** — visible order numbers; persists to the field the public page reads; success/failure toast already exists.
3. **Photo vs Floor Plan are distinct** in the UI and stay distinct on save/reload.
4. **Delete is reliable** — removes one item, does not reappear after autosave/reload.
5. **No "save the listing first" friction for the hero/order actions** on already-saved listings (uploads already require a saved listing — unchanged).
6. (Captions/room tag UI = P1, not P0.)

## 5 · Files likely touched
- `app/api/crm/listings/[id]/media/upload/route.ts` — write Cotality-contract media (key/type/order/preferred/category).
- `app/api/crm/listings/[id]/media-order/route.ts` — persist `order` to the resolver-read location.
- `app/api/crm/listings/[id]/media/[mediaId]/route.ts` (delete) — key on `media_key`.
- `lib/media/listing-media-resolver.ts` — ensure CRM rows/items flow through the same classify→sort→preferred pipeline.
- `prisma/schema.prisma` — only if writing to `listing_media` for CRM rows (⚠️ schema/NEON discipline — Maya approval + `NEON.md`).
- `public/crm/SALE-FORM-REDESIGN.html` — hero selector, reorder wiring, floor-plan typing (visual layer already on the new `forms.css`).
- `lib/idx/db-to-public-dto.ts` — confirm CRM media now resolves identically to Trestle rows.

## 6 · Tests required
- **Round-trip unit/runtime:** upload → media item has `media_key`, real `media_type`, `order`, and (when chosen) `preferred_photo_yn`.
- **Hero test:** selected photo (not upload[0]) is `isPrimary` in the DTO and on the detail page + OpenGraph.
- **Reorder test:** changing order persists and the public resolver returns the new order after reload.
- **Delete test:** delete by `media_key` removes exactly one item; not present after reload.
- **Floor-plan test:** floor plan has `media_type='FloorPlan'`, never primary, grouped separately.
- **Playwright (real browser):** SL-0004 — set a real hero, verify the detail-page hero changes; reorder, verify order; no console errors.
- **Regression gates:** `npm run crm:test` (39/39), `npm run ucba:audit` (REGRESSIONS 0), `npm run idx:validate` (0 critical), `npm run compliance-check` (0 BLOCKER+STRICT).

## 7 · Explicitly out of scope
- P1/P2 items: caption capture + UCBA/address caption scan (M9), tour/video field remapping (M6–M8), perceptual-dup dedup (M10), OpenGraph polish (M11), room/`ImageOf` tagging UI.
- The **CSS/Liquid form rollout** (separate branch/PR #275) — not touched here.
- **Auth / login / sessions / middleware** — not touched.
- **Dashboard / WITH-TOOLS / dev** forms — not touched.
- Listing-identity / canonical-URL code (already shipped).
- Rental form media (follows after sales, per the audit's "sales first" order).
- No syndication export changes (held).

---

## 8 · Schema-fit report (required first step — 2026-05-29, no code)

### A. `listing_media` columns available
`id`, `listing_id`(FK→Listing.listing_id, cascade), `media_key`(**@unique**), `resource_record_key`, `resource_record_id`, `media_url_original`(Text), `media_url_cached`(Text), `media_type`(**NOT NULL**), `media_category`, `media_classification`, `order`(Int=0), `preferred_photo_yn`(Bool=false), `media_modification_ts`, `modification_ts`, `photos_change_ts_snapshot`, `r2_key`, `width`, `height`, `r2_last_attempt_at`, `r2_attempts`, `status`(='active'), `created_at`, `updated_at`.

### B. CRM fields that map DIRECTLY
| CRM media need | Column |
|---|---|
| public R2 URL (card/hero) | `media_url_cached` (+ `media_url_original`) |
| photo/floorplan/video | `media_type` = `Photo`/`FloorPlan`/`Video` |
| content kind | `media_category` (`Photo`/`FloorPlan`/`Video` — mirrors Cotality `MediaCategory`) |
| display order | `order` |
| hero flag | `preferred_photo_yn` |
| soft delete | `status` (`active`/`deleted`) |
| R2 object key | `r2_key` |
| dimensions | `width`/`height` (`optimizeImage()` returns both) |
| upload time | `media_modification_ts`=now; `created_at`/`updated_at` auto |
| listing link | `listing_id` |

### C. Fields needing GENERATED values
- **`media_key`** → `crm:{listing_id}:{sha256(originalBuffer).slice(0,24)}` — gives a **stable id AND content-dedup** (the `@unique` constraint rejects a re-upload; replaces the old JSON `contentHash` 409 logic). The `crm:` prefix keeps CRM rows in a separate namespace from Trestle feed `MediaKey`s.
- **`resource_record_key`** → `listing_id` (or null) for CRM rows (Trestle uses the real feed key).
- **`order`** → from upload sequence / reorder.
- **`preferred_photo_yn`** → default false; true on the one the agent sets as main.

### D. Fields with NO native column — and the call (no schema change)
- **caption / `ShortDescription`** → not on the table. **Not required for P0** (caption capture is P1). Floor-plan classification uses `media_type='FloorPlan'` + `media_category='FloorPlan'` + `media_classification='Document'`, **not** a caption string. → no schema change. *(Corrected 2026-05-29: `media_category` mirrors Cotality's dedicated `FloorPlan` member; `Document` is the `MediaClassification` member, not the category — verified against artifacts/metadata.xml.)*
- **content_hash** → not on the table. **Folded into `media_key`** (deterministic from the buffer hash); `@unique` enforces dedup. → no schema change.

### E. Schema change needed? → **NO.** Option 1 is fully implementable schema-free for P0. *(If a future P1 needs a stored free-text caption/description on the row, that is the only thing that would require a column — I will STOP and present that exact reason then, not now.)*

### F. Migration path for existing CRM JSON media (SL-0004 = 17 items)
Idempotent **dry-run-default** script (`--apply` gated, Maya-approved prod write only):
1. For each CRM exclusive (SL-/RL-) with `listing.media` JSON, build a `listing_media` row per item: `media_key=crm:{id}:{contentHash||sha256[:24]}`, `media_url_cached=heroUrl||url`, `media_type` from `type`/`caption` (`'Floor Plan'`→`FloorPlan`, else `Photo`), `media_category`, `order=item.order ?? index`, `preferred_photo_yn=false` (agent sets hero after), `r2_key` if derivable, `width/height` if known, `status='active'`, `media_modification_ts=now`.
2. Skip if `media_key` exists (idempotent).
3. **Keep `listing.media` JSON intact** (read-compat during migration; resolver prefers rows when present).
4. Print before/after counts; `--apply` only on your go.
5. **Trestle-synced rows untouched** (separate `crm:` key namespace; SL-0004 isn't in the feed anyway).

### G. P0 implementation steps (when approved)
1. **Upload route** → insert a Cotality-contract `listing_media` row (not `listing.media` JSON); dedup via `media_key` unique (P2002 → 409).
2. **Order route** → `UPDATE listing_media.order` per `media_key` (replace `raw_data.media_order`, which the resolver ignores).
3. **NEW delete route** `media/[mediaId]/route.ts` → soft-delete (`status='deleted'`) by `media_key`. *(None exists today — delete is a 404.)*
4. **Set-as-main** → `preferred_photo_yn=true` on one `media_key`, `false` on siblings.
5. **Floor plan** → `media_type='FloorPlan'`; resolver already excludes non-photos from hero.
6. **Form** → hero selector, drag-reorder → order route, floor-plan kept distinct; edit-load reads server rows.
7. **Public DTO** → already `rows ? resolveListingMediaFromRows : JSON`; once CRM writes rows, exclusives resolve via the rows branch.

### H. Tests
Round-trip (row has key/type/order/preferred); hero = chosen (not upload[0]) incl. OG; reorder persists to public; delete by `media_key` → status='deleted', gone after reload; floor plan never primary; **media_key uniqueness/dedup**; **set-as-main flips siblings false**; migration **dry-run** output correct; Playwright on SL-0004 (set hero/reorder → detail page reflects); gates `crm:test` / `ucba:audit` / `idx:validate` / `compliance-check`.

### I. Verification item — COTALITYLVED 2026-05-29: Trestle sync will NOT touch `crm:` rows
Traced `upsertListingMedia` (`lib/idx/media-sync.ts:367`) + orchestrator `runMediaSync`:
1. **Feed-driven** — `runMediaSync` iterates Trestle `ListingKey`s and fetches media by `ResourceRecordKey eq '{listingKey}'`; CRM exclusives are not in the feed → `upsertListingMedia` is never called with a CRM `listing_id`.
2. **`tombstoneVanished` forced `false` in prod** (`media-sync.ts:1385`; test "runMediaSync — tombstoneVanished is forced false"); the `notIn` bulk-tombstone (484-503) runs only in unit tests; `true` is set nowhere outside tests.
3. **Explicit-delete** tombstones only specific feed `media_key`s, never `crm:` keys.

**Verdict: SAFE** — `crm:` rows are unreachable by the sync. Optional hardening (not required, Trestle code left untouched per guardrail #10): add `media_key: { not: { startsWith: 'crm:' } }` to the two tombstone `where` clauses.

### Transition design (avoids a partial-rows regression)
The public resolver prefers `listing_media` rows **when any exist**. To avoid a listing that has JSON media + one new row rendering only the new row, the **upload route lazily imports the listing's existing `listing.media` JSON into rows (idempotent) before adding the new row**, so the rows set is always complete. The bulk migration script is the same import over all CRM exclusives. Legacy `listing.media` JSON is left intact (ignored once rows exist).

---
**Next step:** your go to start P0 coding (schema-free, on a new branch). No DB migration. No rental/dashboard/auth/identity. If anything forces a schema change mid-build, I stop and present the exact reason first.
