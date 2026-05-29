# Sales-Form Media — Cotality/IDX Plus + REBNY UCBA Audit

> Generated 2026-05-29. **Audit only — no code, no PR.** Grounded in Cotality/IDX Plus normalized media rules (canonical) + REBNY UCBA advertising/display requirements. RealPlus is NOT treated as source of truth. No listing-identity/canonical-URL code touched. No SL-0004 rename. No Sentinel-L change (one future-detector recommendation noted in §9).
>
> Scope: Sales form media section (`public/crm/SALE-FORM-REDESIGN.html`) + backend media persistence + public media display. Evidence includes a real-browser (Playwright) capture of SL-0004's production detail page.

---

## 0 · Headline finding

**There are TWO parallel, inconsistent media models, and CRM-created listings use the non-Cotality one.**

| Model | Who writes it | Shape | Used by |
|---|---|---|---|
| **`listing_media` table** (Cotality-shaped) | Trestle sync (`lib/media/media-sync-service.ts`) | `media_key` (unique), `resource_record_key`, `media_type`, `media_category`, `media_classification`, `order`, `preferred_photo_yn`, R2 cache, timestamps | IDX/third-party listings |
| **`listing.media` JSON** (legacy flat) | **CRM upload** (`app/api/crm/listings/[id]/media/upload/route.ts`) | `{ url, thumbUrl, heroUrl, caption, order, type:"photo"(hardcoded), uploadedAt, contentHash }` | **Mallan CRM exclusives (SL-/RL-)** |

SL-0004 has **0 `listing_media` rows, 17 `listing.media` JSON items** (verified). So every CRM exclusive's media flows through the legacy JSON path, which **lacks `media_key`, `preferred_photo_yn`, `MediaCategory`, `ImageOf`, and a real `MediaType`** — the exact Cotality fields the media contract is built on. The public reader (`db-to-public-dto.ts`) does `listing_media rows ? resolveListingMediaFromRows : resolveListingMedia(JSON)`, so CRM exclusives render from the impoverished JSON shape.

This is the root of most failure classes below (wrong hero, no stable id, no preferred flag, floor-plan-as-photo, reorder-lost).

---

## 1 · Cotality / IDX Plus media contract (canonical)

Verified against `data/rebny-rls-property-fields.csv` (Media resource) + `data/RLS-FIELD-REGISTRY.md` + `.claude/skills/rebny-compliance/SKILL.md` §4.

**Media resource (per-item rows):**
| Field | Type | Meaning |
|---|---|---|
| `MediaKey` / `MediaKeyNumeric` | id | **Stable unique id per media item** |
| `ResourceRecordKey` | id | Links media → `Property.ListingKey` (use this, NEVER `ResourceRecordID`) |
| `MediaURL` | string | The image/document URL |
| `MediaType` | enum | Cotality's literal `MediaType` is the **file format** (`Jpeg`/`Png`/`Pdf`/`Mp4`/…; metadata.xml:11372-11467) — NOT `Photo`/`FloorPlan`/`Video`. Our `media_type` *column* stores the content kind (`Photo`/`FloorPlan`/`Video`) derived from `MediaCategory`, matching the Trestle sync convention. |
| `MediaCategory` | enum | content kind — dedicated members `Photo`(11), `FloorPlan`(6), `Video`(17), `Document`(5), … (metadata.xml:11276-11340). **`FloorPlan` is its OWN member, not `Document`.** |
| `ImageOf` | String List | room/subject (Kitchen, LivingRoom, …) — caption/long-description analog |
| `Order` | Number | per-item sort order |
| `PreferredPhotoYN` | Boolean | **the hero/primary flag** |
| `MediaModificationTimestamp` | Timestamp | per-item change detection |
| `ShortDescription` / `LongDescription` | string | caption (must obey UCBA — no agent info) |

**Property resource (listing-level):** `PhotosChangeTimestamp` (high-level photo-change trigger — NOT a sort order), `PhotosCount`, `VideosCount`, `VirtualTourURLBranded`/`Branded2`/`Branded3`, `VirtualTourURLUnbranded`/`Unbranded2`/`Unbranded3`. *(No standalone `VideoURL` field appears in the IDX Plus CSV — confirm before relying on one; video typically rides `VirtualTourURL*` or Media rows with `MediaType=Video`.)*

**Cotality classification rules:** FloorPlans ship under `/Media/Property/DOCUMENT-{Gif|Jpeg|Png|Pdf}/…` URLs with `MediaCategory=FloorPlan` and `MediaClassification=Document` (the `DOCUMENT-` URL segment is the file-storage path, NOT the `MediaCategory` value); `MediaCategory` is sometimes null even for floor plans (the resolver already compensates via the URL pattern + `MediaClassification`). Virtual tours are Property-level URL fields, not Media rows, in most REBNY feeds.

**Forbidden:** `ResourceRecordID` for media joins (may duplicate across MLOs → wrong photos). `Media/All` endpoint (deprecated).

---

## 2 · REBNY UCBA / advertising compliance for media

| Requirement | Rule | Status in repo |
|---|---|---|
| No agent info in media | UCBA Art. I §5(C): no agent name/contact/URL/watermark/logo in photos, floor plans, videos, **or captions** | Form shows the §5(C) notice (compliant). **No automated scan** of captions/`ShortDescription` for agent info. |
| Correct broker attribution | NY DOS §175.25 + UCBA: CRM exclusive = Mallan; never a wrong/“MAllan”-typo office on a CRM-owned row | Out of media scope (handled by the agent-identity PR), but media captions must not embed other-broker branding. |
| No misleading duplicate media | Don't show the same physical unit twice with different media | Addressed by listing dedupe (PR #269); media itself shouldn't duplicate within a listing (see §6 dup finding). |
| Address suppression → media | If `internet_address_display_yn=false`, the **address must not leak via media caption / filename / URL** | **Gap:** the resolver does NOT strip/scan captions for address; CRM filenames/captions are agent-entered. No enforcement. |
| Public display permission | Only displayable listings show media | Media has no independent gate; it inherits the listing's display gate (correct). |

---

## 3 · Current Sales-form media UI (`public/crm/SALE-FORM-REDESIGN.html`)

| Element | Behavior | Issue |
|---|---|---|
| Photo upload (`salePhotoInput`) | multipart → `/media/upload`; client dedup by name+size; preview grid | OK, but no per-photo category/room, no “set as hero”. |
| **`salePhotoSortOrder`** field | `data-rls-field="PhotosChangeTimestamp"` | **WRONG** — sort order is per-item `Media.Order`, not the Property-level `PhotosChangeTimestamp` timestamp. |
| **Hero/primary selector** | "First photo = hero. Drag to reorder." | **No explicit hero selector**; relies on order. Drag-reorder persists to `raw_data.media_order` which the **display resolver ignores** (§4) → reorder has no public effect. |
| Floor plan upload (`saleFloorplanInput`) | sends `caption:'Floor Plan'` | Upload route hardcodes `type:"photo"` (§4); only the **caption** marks it a floor plan. Fragile. |
| Video URL (`saleVideoUrl`) | `data-rls-field="VirtualTourURLBranded"`, help says `VideoURL` | label/attr/canonical disagree; saved as raw `saleVideoUrl` (not a canonical field). |
| **Branded tour (`saleMatterportUrl`)** | labeled "Branded", `data-rls-field="VirtualTourURLUnbranded2"` | **Branded mapped to Unbranded2.** Collides with `saleVirtualTourUnbranded2`. |
| Tour fields | `saleVirtualTourUnbranded`/`2`/`3` | only `VirtualTourURLUnbranded` is mapped to a canonical key in collect; `Branded2`/`Branded3` have no inputs. |
| Delete (`removeServerMedia`) | `DELETE /media/{mediaId}` | CRM JSON items have **no stable id** → which `mediaId`? (§6 "deleted media returns"). |
| Save draft / autosave / publish | media uploaded separately via `/media/upload` (not in `collectSaleFormData`) | media not part of the form draft payload → edit-load relies on server media. |

---

## 4 · Backend media persistence

- **`/media/upload`** writes `listing.media` JSON: `type:"photo"` **hardcoded** (floor plans included), `order = orderParam ?? media.length` (upload sequence), **no `media_key`, no `preferred_photo_yn`, no `MediaCategory`/`ImageOf`**. Dedup by **SHA-256 `contentHash`** (exact only; near-dups pass). EXIF/GPS stripped, 3 WebP variants → R2. ✅ good hygiene, ❌ non-Cotality shape.
- **`/media-order`** writes `raw_data.media_order = [ids]`. **The display resolver never reads `raw_data.media_order`** — it sorts by `media[].order` + class. So **reorder does not change public order/hero**. And CRM JSON items have **no id** for `ordered_media_ids` to reference reliably.
- **`listing_media` table** (Cotality-shaped, has all the right fields) is populated by the **Trestle sync only**, not by CRM uploads.
- **`lib/media/listing-media-resolver.ts`** — single classify→sort→primary pipeline. Classifies CRM floor plans via `caption='Floor Plan'` (works). Sorts photo-first, then by `order`, honoring `PreferredPhotoYN` (`providerOrder = -1`). **CRM JSON never sets `PreferredPhotoYN`/`preferred`/`isPrimary`**, so the hero = first photo by upload order.
- **`lib/media/listing-card-media.ts`** — `getHeroPhoto` checks the `mediaType` field; CRM JSON uses `type` (not `mediaType`), so a raw-JSON consumer sees `mediaType=''` → treats everything as photo. Cards consume the **DTO** (resolved `mediaType`), so this is mitigated on the card path but is a latent trap for any raw-JSON consumer.
- **`db-to-public-dto.ts` / `public-dto.ts`** — `listing_media rows ? resolveListingMediaFromRows : resolveListingMedia(listing.media)`. CRM exclusives (0 rows) take the JSON path.
- **OpenGraph image** (detail page): `listing.media.find(Photo)?.url || listing.media[0]?.url` → same wrong-hero exposure on social shares.

---

## 5 · Public display surfaces

| Surface | Media source | Hero logic |
|---|---|---|
| Listing detail (`app/listing/[...slug]/page.tsx`) | `resolveListingMedia*` + Trestle photo backfill | `isPrimary` (first photo after sort) — but order = upload seq for CRM |
| FeaturedListings / SearchListingCard | PublicListingDTO `media[]` (resolved) | `getHeroPhoto` (first photo by order) |
| Agent page cards | PublicListingDTO | same |
| SimilarListings | PublicListingDTO | same |
| Sitemap | no media | n/a |
| OpenGraph/social | `listing.media.find(Photo)` | first photo |

All hero paths converge on **“first photo by `order`”**, and CRM `order` is upload sequence → the cityscape (verified on SL-0004's production hero screenshot).

---

## 6 · Known failure classes — checked

| Failure class | Present? | Why |
|---|---|---|
| First image / hero not guaranteed | **YES (P0)** | No `preferred_photo_yn` on CRM media; no hero selector; hero = first-uploaded (cityscape on SL-0004). |
| Placeholder despite uploaded photos | Low risk | `getHeroPhoto` falls to placeholder only if no valid photo URL; SL-0004 renders photos. |
| Duplicate photos from repeated upload | **YES (P1)** | Playwright: 22 imgs / 21 unique → 1 dup. SHA-256 dedup catches exact re-uploads; near-dups + legacy pre-hash dups remain. |
| Existing media re-uploaded as new | Partial | contentHash dedup → exact re-upload returns 409 (good); a re-encoded/renamed same-photo bypasses. |
| Floor plans classified as photos | **YES (P1)** | Upload hardcodes `type:"photo"`; only `caption='Floor Plan'` saves it; card raw-JSON path keys on `mediaType` (empty for CRM). |
| Virtual tour treated as photo / ignored | **YES (P1)** | Tour URL field mis-mappings (§3); branded→unbranded2; not consistently surfaced. |
| Media order lost on save/reload | **YES (P0)** | `/media-order` writes `raw_data.media_order`; resolver ignores it. Reorder has no public effect. |
| Deleted media returns after autosave/reload | **YES (P1)** | Delete keys on a `mediaId` CRM JSON items don't stably have; soft-delete/restore semantics unclear. |
| Public card/detail pulls RLS-dup media | Mitigated | Listing dedupe (PR #269) suppresses the IDX dup; CRM row's own media shows. |
| Media URL private/expired/non-public | Low (CRM) / Medium (Trestle) | CRM → R2 public URLs. Trestle → proxied; R2 mirror has 404-retry/strike logic. |
| Raw Cotality media vs CRM media conflict | **YES (P0, architectural)** | Two parallel models (§0); CRM uses non-Cotality JSON. |
| No stable MediaKey / id | **YES (P0)** | CRM JSON items have no `media_key`/id → delete + reorder are fragile. |
| Missing sort_order / preferred flag | **YES (P0)** | CRM JSON has `order` (upload seq) but no `preferred_photo_yn`. |
| Address-suppressed listing leaks address in media/caption/url | **YES (P1, compliance)** | No caption/filename scan for address; agent-entered captions unguarded. |
| Mobile card uses different image source than desktop | Not observed | Both consume the same DTO `media[]`; needs a mobile-viewport Playwright pass to confirm. |

---

## 7 · Output table (per surface/field)

| # | Surface / field | Current behavior | Expected (Cotality/IDX Plus) | UCBA/compliance | File/function | FE / BE | Failure risk | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|---|---|---|
| M1 | CRM media storage | `listing.media` JSON, flat | Cotality-shaped rows (`media_key`,`media_type`,`order`,`preferred_photo_yn`,`media_category`) | — | upload route + `listing_media` | BE | wrong-hero, no id, reorder-lost, classify | Write CRM uploads to `listing_media` (or add the missing fields to JSON + read them) | round-trip: upload→row has key/type/order/preferred | **P0** |
| M2 | Hero / preferred photo | hero = first by upload order (cityscape) | `PreferredPhotoYN` marks hero | — | upload + resolver + form | FE+BE | wrong hero everywhere incl OG | Add a **“set as main photo”** selector → persist `preferred_photo_yn`; resolver already honors it | hero = selected, not upload[0] | **P0** |
| M3 | Media order persistence | `/media-order`→`raw_data.media_order` (ignored by resolver) | per-item `Order` drives display | — | media-order route + resolver | BE | reorder no-op | Persist order onto the media rows/items the resolver reads (or make resolver read `media_order`) | reorder → public order changes | **P0** |
| M4 | Stable media id | none (CRM JSON) | `MediaKey` per item | — | upload + delete + order | BE | delete/reorder fragile | Assign a stable id (`media_key`) per CRM media item | delete by id removes exactly one; survives reload | **P0** |
| M5 | Floor-plan type | `type:"photo"` hardcoded; caption-only signal | `MediaType=FloorPlan` / `MediaCategory` | — | upload route | BE | floor plan as hero/photo | Set `media_type='FloorPlan'` from the upload’s `mediaType`, not hardcode | floor plan never primary; in Floor-Plan tab | **P1** |
| M6 | `salePhotoSortOrder`→`PhotosChangeTimestamp` | mis-mapped | per-item `Order` | — | SALE-FORM `:3917` | FE | meaningless field | Remap to per-photo order (or remove; use drag-order) | field maps to Order | P1 |
| M7 | Branded tour→`Unbranded2` | mis-mapped + collision | `VirtualTourURLBranded` | — | SALE-FORM `:3961` | FE | wrong canonical tour field | Fix mapping; add Branded2/3 inputs | tour fields map 1:1 | P1 |
| M8 | Video URL fields | label/attr/save disagree | `VirtualTourURL*` / Media `Video` | — | SALE-FORM `:3930-3936` | FE | video lost/mis-saved | Reconcile to confirmed canonical fields | video round-trips | P1 |
| M9 | Captions / `ImageOf` | not captured; no scan | `ImageOf` + UCBA-clean caption | §5(C) + address suppression | upload + form | FE+BE | agent-info / address leak | Capture room/category; scan caption for agent info + address | scanner blocks agent name/address in caption | P1 |
| M10 | Duplicate media | SHA-256 exact only | one entry per unique media | no misleading dup | upload route | BE | dup cards/gallery | Backfill-dedup legacy; consider perceptual hash | no dup srcs for SL-0004 | P1 |
| M11 | OpenGraph image | `media.find(Photo)` (upload order) | preferred photo | — | detail `generateMetadata` | BE | wrong social hero | Use the resolved primary (`isPrimary`) | OG image = hero | P2 |

---

## 8 · Scope guidance for the implementation PR (when approved)

- The **P0 cluster (M1–M4)** is one coherent fix: give CRM media a Cotality-compatible shape (stable id, `media_type`, `order`, `preferred_photo_yn`) + a **hero selector** + make **reorder feed the display resolver**. This fixes wrong-hero, reorder-lost, delete-fragility, and the architectural split together.
- The **form field mis-mappings (M6–M8)** are the same class as the PR #270 radio/checkbox work — mechanical, FE-only.
- **M9 (UCBA caption/address scan)** is a compliance add — route through the existing Fair-Housing/RLS scanners.
- Do **not** bundle the listing-identity/canonical-URL code (already shipped) unless a media dependency surfaces.

---

## 9 · Sentinel-L (future detector recommendation only — no change now)

A media-integrity detector worth adding later: flag any CRM media write that sets `type` without a real `media_type`, any hero path that picks `media[0]` without consulting `preferred_photo_yn`, and any media-order write that targets a field the public resolver doesn't read.

---

## 10 · TL;DR

- **Two media models; CRM exclusives use the non-Cotality JSON one** → the root of the media problems.
- **P0:** no `preferred_photo_yn`/hero selector (wrong hero — verified cityscape), reorder writes a field the resolver ignores (reorder no-op), no stable `media_key` (delete/reorder fragile), CRM media not in the Cotality-shaped table.
- **P1:** floor-plan `type` hardcoded to photo, tour/video field mis-mappings, exact-only dedup (1 dup on SL-0004), no caption UCBA/address scan.
- **No code yet.** Awaiting your review of this table before any implementation.
