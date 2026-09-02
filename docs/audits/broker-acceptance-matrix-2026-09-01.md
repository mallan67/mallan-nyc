# Broker acceptance matrix — authenticated Search

**Date:** 2026-09-01
**Branch:** `fix/neon-p0-event-driven-wake-2026-08-16`
**Head:** `e860aa5d` (P0 corrections) — audit began at `50f848e9`
**Preview:** `mallan-nyc-git-fix-neon-p0-event-driven-wake-2026-08-16-mallan.vercel.app`
**Production main at the time of the failing acceptance test:** `2a83952a`

The standard this matrix answers to: **no visible enabled control may silently
do nothing, and no core broker criterion may sit disabled while Search is called
complete.**

Every provider verdict below comes from an HTTP response received from
`api.cotality.com` on 2026-09-01. Raw captures:
`artifacts/p0-search-acceptance/identity-probes.json` (19 probes) and
`artifacts/p0-search-acceptance/disabled-control-claims.json` (7 probes).

---

## 1. The two P0 defects

| | Open House | Media / photos |
|---|---|---|
| **Symptom** | Today · This Weekend · Next 7 · Next 30 · Custom all disabled, "not supported by the search backend" | 141 listings → 0 photos; 200 listings → 0 photos; `/api/media/proxy` 404s |
| **Root cause** | The authenticated route had NO OpenHouse code. The message was literally true. | The row carried the provider key (`wid`) and the browser sent `lid` instead; the endpoint then re-derived the key through `prisma.listing`, which misses for every live-Cotality result. Separately, 4 of 6 views emitted no media identity at all. |
| **Provider verdict** | **SUPPORTS IT.** `$count` 1993; `OpenHouseDate ge X and le Y` → 1970; `+ OpenHouseStatus eq 'Active'` accepted; `$orderby` accepted. `OpenHouse.ListingKey → Property.ListingKey` = 1, `→ Property.ListingId` = 0. | **HEALTHY.** `ResourceRecordKey eq <ListingKey>` → 30/23/8 = PhotosCount exactly. MediaURL dereferenced to `image/jpeg`, 364,369 bytes, `MediaStatus=Active`, `IEDY=true`. |
| **Status now** | **WORKING** — membership settled before count and pagination; fails closed on provider failure (503) and on an unresolvable window (400). | **WORKING** — `?keys=` answered on `ResourceRecordKey` with no DB round-trip; all photo-bearing views emit `data-listing-key`. |

---

## 2. Every remaining disabled control, classified

Four categories, as required: **WORKING** · **BLOCKED WITH VERIFIED PROVIDER
REASON** · **PRODUCT DECISION REQUIRED** · **REMOVE FROM UI**.

### BLOCKED WITH VERIFIED PROVIDER REASON

These were previously disabled on an *assumed* provider limitation. Each is now
proven, with the provider's own message.

| control | probe | provider response |
|---|---|---|
| **Transit search** | `$filter=Latitude ge 40.70 and Latitude le 40.80` | **HTTP 400** — "Results from 'RLS' has been suppressed (provider Level) as field Latitude cannot be used". Selected `Latitude`/`Longitude` also return `null`. |
| **Manhattan grid** | same | **HTTP 400**, same suppression |
| **Days on Market** | `$filter=DaysOnMarket le 30` and `$orderby=DaysOnMarket desc` | **HTTP 400** — "field DaysOnMarket cannot be used". Both filter AND sort refused. |

The Days on Market reason previously read "Cotality filter/sort behaviour …
unproven". It is now proven, and the control text says so. `UNVERIFIED` became
`PROVIDER_REJECTED` — those are different states and the difference is recorded
rather than collapsed.

### PRODUCT DECISION REQUIRED

The provider answers these. The block is a Mallan semantic decision, and must
be owned as one rather than described as a provider limitation.

| control | provider verdict | the open decision |
|---|---|---|
| **Maintenance / carrying cost** | **SUPPORTED** — `AssociationFee ge 500 and le 2000` → count **3229**, with `AssociationFeeFrequency: "Monthly"` | What Mallan means by "monthly carrying cost". `AssociationFee` alone is not it, and the frequency vocabulary has not been enumerated. Note a sampled row carries `AssociationFee: 0` — a real zero, which any `\|\|`-style presence check would silently convert to "unknown". |
| **Net rent range** | not probed — derived figure | Net rent has no canonical criterion. Needs a definition before it can have an executor. |
| **Building dimension ranges** | not probed | No canonical criterion owns them. |
| **Date ranges (10 controls)** | not probed | No canonical criterion owns them; the engine never reads the controls. |
| **People / office search (8 controls)** | not probed | Agent, broker, office, team, contact are not canonical Search criteria. |
| **Financing % (rental)** | — | The contract offers `max_financing_percent` to SALE only. Correct as scoped. |

### CORRECTLY SCOPED — Building Search

Building Search returns **buildings**, so listing-level criteria do not belong
in it. These four are right as they stand:

- **Unit** — `UnitNumber` is a Property (listing) field
- **Listing ID** — identifies a listing, not a building
- **Keyword** — searches `Property.PublicRemarks`, listing description text
- **Parking** — `GarageYN` is not generic Parking; the equivalence is unproven

This is also why `listing_key` was reverted from `broker_input` to
`non_search_fact` at this head: promoting it would have inserted "Provider
Listing Key" into `BuildingCriteria` among others, and no broker types one.

### REMOVE FROM UI

**None proposed.** Every disabled control now carries either a verified provider
refusal or a named product decision. Removal is Maya's call, not a cleanup.

---

## 3. What is proven, and what still needs a broker session

**Proven without a session** (this head, this date):

- Provider facts above — all live HTTP, captured with resource, `$select`,
  `$filter`, status, count and sample.
- `Search + runtime` **6917 passed**; the 4 remaining failures are pre-existing
  and owned by other lanes. `CRM 46/46`. `compliance 95/95`.
  `UCBA 46 PASS / 0 REGRESSIONS`. `RLS 0 errors`. `IDX 0 critical`.
  `type-check 0 errors from tracked files`.
- Local bundle: disablement string **0**, `data-listing-key` **10**,
  `media/batch?keys=` **1**.
- Preview auth posture UNWEAKENED: `/crm` → **307**,
  `POST /api/auth/dev-login` → **404**, `/api/media/batch` → **401**.

**NOT proven, and not claimed:**

- The rendered broker UI at 390 / 768 / 1440. `/crm` is behind auth (307) and
  `/crm/index-built.html` is too, so the DEPLOYED bundle could not be inspected
  from here. The local bundle was verified and is built from this commit.
- That a photo renders on a real card in a real browser.
- The specific cause of the observed `/api/media/proxy` 404s. Freshly-read
  MediaURLs returned HTTP 200. `lib/idx/media-sync.ts:939` records that the
  signed MediaURL **rotates**, and `ListingMedia` persists
  `media_url_original`/`media_url_cached`, so a rotated-then-replayed URL is a
  live hypothesis — **UNVERIFIED**, not traced to an originating Media record.

The remaining proof needs one authenticated session, captured by Maya:

```
npx playwright codegen --save-storage=.cache/crm-e2e-storage.json <PREVIEW>/crm
PLAYWRIGHT_BASE_URL=<PREVIEW> CRM_E2E_STORAGE_STATE=.cache/crm-e2e-storage.json \
  npx playwright test tests/e2e/authenticated-open-house-and-media.spec.ts
```

`.cache/crm-e2e-storage.json` is gitignored — confirmed by `git check-ignore -v`,
which resolves it to `.gitignore:102`. It must stay local, never be committed,
never be printed in logs, and be deleted once the acceptance proof is captured.

No `ALLOW_DEV_LOGIN` on Preview. No weakening of the `NODE_ENV` guard. No
bypass. No credentials in the repo, in test files, or in chat.
