# Coming Soon Visibility Audit (report-only) — 2026-06-06

> **Mode: REPORT ONLY.** No code edits, no DB mutation, no env/deploy, no media/
> backfill changes. Separate from #363 and the PR-Media Backfill Preview (#364).
> This is a **search/Featured status-policy** issue, not a media issue.

## Trigger

Production homepage **Featured Listings** shows a Coming Soon card —
**345 E 81st Street, #14B** ($2,495,000, Yorkville) — with **no usable photo**
(placeholder house icon) and a blue banner **"Coming Soon. No Showings or Open
House Permitted."** Maya: *"it's on featured listing, it should not be on display
at all."* Same policy gap also lets Coming Soon into default Buy/Rent search.

---

## 1. Where ComingSoon enters search/Featured (exact file:line)

| Surface | Location | Behavior |
|---|---|---|
| Canonical status set | `lib/compliance/status.ts:187` `ACTIVE_DISPLAY_VALUES` | `[Active, ActiveUnderContract, ComingSoon]` — the default for every search filter |
| Default search where | `lib/search/listing-access-decision.ts:53-62` `normalizeSearchStatuses(undefined)` → returns all 3; `:64-72` `buildSearchDisplayWhere()` | No status param ⇒ status `IN (Active, ActiveUnderContract, ComingSoon)` |
| DB search builder | `lib/search/public-listing-db.ts:14` `ALLOWED_PUBLIC_STATUSES`; `:178` `status: buildSearchDisplayWhere().status`; `:281-288` `statuses`/`status` params are **opt-in** | Default includes ComingSoon; user can narrow but nothing defaults to Active-only |
| Trestle search builder | `lib/search/public-listing-trestle.ts:28-30` `ALLOWED_STATUSES` + default OData `(StandardStatus eq 'Active' or 'ComingSoon' or 'ActiveUnderContract')` | Same default on the Trestle-direct path |
| API fallback path | `app/api/listings/route.ts:1170` `status: buildSearchDisplayWhere().status` | Numbered-address / Trestle-direct fallback also defaults to all 3 |
| Displayable gate | `lib/idx/db-to-public-dto.ts:180` `DISPLAYABLE_STATUSES = ['Active','ComingSoon','ActiveUnderContract']` | A ComingSoon row passes the per-row "displayable" check |
| **Featured (homepage)** | `app/components/FeaturedListings.tsx:387-405` builds `/api/listings?...` with **no `status` param** and **no photo filter**; `lib/featured/featured-ordering.ts` only orders (no status/photo filter) | **Inherits the all-3 default → ComingSoon flows into Featured; photoless rows render with `LISTING_PLACEHOLDER_IMAGE`** (`FeaturedListings.tsx:106-111`) |
| Search page UI | `app/search/page.tsx:340,368,449,665` `filters.statuses` | An **opt-in** pill filter ("Coming Soon"/"Under Contract"); empty ⇒ API default (all 3). No Active-only default. |

**Mechanism of the screenshot:** Featured → `/api/listings` (no status) → default set
includes ComingSoon → `orderFeaturedListings` doesn't drop it → `PhotoGallery`
falls back to the placeholder when `getValidPhotoMedia` is empty → photoless
Coming Soon card on the homepage.

## 2. How "Coming Soon" + "no showings" are represented

- **Status field:** RESO `StandardStatus = 'ComingSoon'`, persisted in
  `listings.status` (and mirrored `mls_status`). Normalized by
  `isComingSoonStatus()` (`lib/compliance/status.ts:182`, `ComingSoonBadge.tsx`).
- **The "No Showings or Open House Permitted" text is NOT data-driven.** It is the
  **UCBA Art. I §16(C) mandated badge** rendered purely from
  `status === 'ComingSoon'`:
  - `app/components/ComingSoonBadge.tsx` (Featured uses this, `FeaturedListings.tsx:260`)
  - `app/components/SearchListingCard.tsx:69-79` `formatComingSoonBadge` (a **second**
    copy of the same UCBA text — duplication worth consolidating).
  - Branch logic: `comingSoonDate || activationDate` present ⇒ "…until {date}",
    else ⇒ "…Permitted". It does **not** read `ShowingInstructions` or any
    OpenHouse field.
- **`ShowingInstructions` / `OpenHouse` / `FirstShowingDate`:** per the compliance
  index (`docs/compliance/COMPLIANCE-CANONICAL-INDEX.md:68`), **IDX Plus does NOT
  include `FirstShowingDate`** (phantom field). So "no showings" is an **inference
  from the ComingSoon status + the UCBA rule**, not a live showings/open-house feed
  value. `comingSoonDate` is derived in `db-to-public-dto.ts:297-299`
  (`isComingSoon ? activationDate`).
- **`raw_data` remarks:** not the source of the banner; the banner is status-only.

## 3. Is ComingSoon required/allowed by RLS / IDX display rules?

- **No rule requires Coming Soon to appear in search or Featured.** REBNY RLS / IDX
  Plus does not mandate inclusion of ComingSoon inventory in any consumer surface.
- **The only mandate is conditional:** *if* a Coming Soon listing **is** displayed,
  the UCBA Art. I §16(C) badge (exact phrasing) **must** be shown — penalty
  schedule **$500 → $2,000 → $10,000 → 30-day suspension** for omission
  (`ComingSoonBadge.tsx` header). That badge is already implemented and rendering.
- **Therefore hiding Coming Soon from Featured / making it opt-in in search is
  COMPLIANT.** (Fail-closed check: no canonical file found that requires ComingSoon
  display; the index treats ComingSoon only as a *badge* gate, not an inclusion
  mandate. If a contrary RLS rule surfaces, STOP and re-evaluate before shipping.)

## 4. Current UX

- **Default Buy/Rent search includes ComingSoon AND ActiveUnderContract** (no
  status param ⇒ all 3). There is no Active-only default.
- **A user filter exists** (`filters.statuses`) but is opt-in and only *narrows*;
  it does not flip the default to Active-only.
- **Featured Listings (homepage) includes ComingSoon and photoless listings** — no
  status or photo gate.
- **Totals + map markers include ComingSoon by default:** `/api/listings` computes
  `dbTotal` and the map/list payload from the **same** `where`
  (`buildPublicListingDbSearch`, default all 3), so ComingSoon inflates the result
  count and adds map markers on every default search. *(Class A inference from the
  shared where-builder; confirm with a live `/api/listings` probe before shipping.)*

## 5. Recommended policy

**Primary recommendation (matches Maya's): default surfaces show Active only;
Coming Soon is a deliberate, opt-in filter — and Featured never shows it.**

| Option | Description | Verdict |
|---|---|---|
| **A** | Exclude ComingSoon from **default** Buy/Rent search (default = Active, optionally + ActiveUnderContract) | **Recommended** for search default |
| **B** | Include ComingSoon only when the user explicitly selects the Coming Soon filter/tab | **Recommended** — pairs with A (infra already exists via `filters.statuses`) |
| **C** | Keep ComingSoon in results but require a usable photo + clearer badge | Insufficient alone for **Featured** (curated hero content should not show "no showings" inventory at all) |

**Featured Listings: stronger rule —** exclude ComingSoon **and** require ≥1 usable
Photo, unconditionally. Featured is curated; a photoless "no showings" card is the
worst placement.

## 6. Compliance risk

- **Hiding Coming Soon: allowed.** No RLS/IDX inclusion mandate (see §3).
- **Showing photoless, no-showings Coming Soon: not a compliance *violation*, but
  poor/again-arguably-misleading UX** — a buyer sees normal-looking inventory they
  cannot view. The mandated badge is present, so the legal floor is met; the
  product floor is not.
- **Must preserve the badge wherever Coming Soon IS shown** (opt-in filter results,
  detail pages). The fix must not remove `ComingSoonBadge` — only change *inclusion*.
- **No Fair-Housing / attribution / FARE impact** — this is status visibility only.

## 7. Proposed PR (for later approval — exact files + tests)

Two independent layers; **Layer 1 (Featured) is the faster, higher-impact, fully
isolated fix** and can ship before the write-gated media backfills.

### Layer 1 — Featured excludes ComingSoon + requires a usable photo
- `app/components/FeaturedListings.tsx`
  - Filter `generalListings` / `exclusives` (post-fetch, ~`:410-419`, before
    `orderFeaturedListings`) to drop `isComingSoonStatus(listing.status)` and any
    listing where `getValidPhotoMedia(listing.media).length === 0`.
  - Preferred: also pass `&statuses=Active` on the general fetch (`:387-405`) so the
    server doesn't ship ComingSoon to the client at all.
- Tests (new `tests/runtime/featured-coming-soon-exclusion.test.ts` + component test):
  - a ComingSoon listing is excluded from Featured output;
  - a photoless Active listing is excluded from Featured output;
  - an Active listing with photos is retained;
  - ordering/dedupe unchanged for the retained set.

### Layer 2 — default search is Active-only; ComingSoon is opt-in
- Introduce a **dedicated default** distinct from `ACTIVE_DISPLAY_VALUES` (which is
  also used by sitemap/projection/other gates — do **not** narrow it globally):
  - `lib/search/listing-access-decision.ts` — add `SEARCH_DEFAULT_STATUSES`
    (`[Active]`, or `[Active, ActiveUnderContract]` per Maya) and use it in
    `normalizeSearchStatuses(undefined)` / `buildSearchDisplayWhere()` default,
    leaving the **allowed** set (`ACTIVE_DISPLAY_VALUES`) intact so `statuses=ComingSoon`
    still works as an explicit opt-in.
  - Verify the Trestle path (`lib/search/public-listing-trestle.ts:28-30`) and the
    fallback (`app/api/listings/route.ts:1170`) consume the same default.
  - `app/search/page.tsx` — surface a "Coming Soon" tab/toggle (the `filters.statuses`
    plumbing at `:340,368,449,665` already exists) so users can opt in.
- Tests:
  - `/api/listings` with no `statuses` ⇒ **no** ComingSoon rows (default Active[-+AUC]);
  - `statuses=ComingSoon` ⇒ ComingSoon rows returned **and** badge renders;
  - `dbTotal` + map payload exclude ComingSoon by default (guards §4 inflation);
  - existing status-gate tests (`crm-status-mapping`, RLS draft-gate) stay green.

### Sequencing note
Layer 1 is **isolated from media/backfill and from #362** and is the fastest path
to remove the bad homepage card. Layer 2 is a small, well-tested default change.
Neither depends on the media-coverage/denorm backfills.

---

## Clean order (unchanged)

1. ✅ #363 merged (JSON-fallback safety).
2. ✅ PR-Media Backfill Preview (#364) — read-only, open.
3. **This Coming Soon visibility audit (report-only).**
4. Decide: Coming Soon **Layer 1** fix (fast, isolated) vs. the write-gated media
   backfills — they are independent; Layer 1 can proceed in parallel on approval.

> The site feels broken because search mixes **three separate foundation layers** —
> media coverage, duplicate canonicalization, and **listing-status policy**. This
> audit isolates the third. **Stop after report.**
