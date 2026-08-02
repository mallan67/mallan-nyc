# Vercel Image Optimization — billing evidence for PR #591

**Date:** 2026-08-01
**Team:** `mallan` (`team_kZQh5NYLyrOKqffK0r9EXf4E`), created 2025-08-11
**Why this file exists:** PR #591's original billing paragraph asserted the
account's pricing model in prose with nothing attached. A reviewer correctly
objected that an unattached claim is not proof. This is the captured response,
the method, and — explicitly — the limits of what it does and does not settle.

---

## Method

Read-only `GET https://api.vercel.com/v2/teams`, authenticated with the token
the already-logged-in Vercel CLI stores locally
(`%APPDATA%/com.vercel.cli/Data/auth.json`). No token was requested from Maya,
none is reproduced here, and nothing was written. The call was made twice —
2026-07-31 and again 2026-08-01 after the CLI rotated its token — and returned
the same values both times.

Re-run it with:

```
npx vercel whoami            # refreshes the CLI token if stale
# then GET /v2/teams with that token and read teams[slug=mallan].billing
```

---

## Captured values

### Plan and model

| Field | Value |
|---|---|
| `billing.plan` | `pro` |
| `billing.billingVersion` | `2` |
| `billing.planIteration` | `plus` |
| `billing.status` | `active` |
| `billing.platform` | `stripe` |
| `billing.plusMigrationEnabled` | `false` |
| Current period | 2026-07-25T07:00:00Z → 2026-08-25T07:00:00Z |

### Image-related invoice items — the complete set

Filtering `billing.invoiceItems` for any key matching `/image/i` returns exactly
three, and no others:

```
imageOptimizationTransformation    iad1 unit price 0.00005
imageOptimizationCacheRead         iad1 unit price 0.0000004
imageOptimizationCacheWrite        iad1 unit price 0.000004
```

An exact-key search for legacy source-image billing
(`imageOptimization`, `sourceImages`, `imageOptimizationSourceImages`,
`sourceImage`) returns **NONE**.

### Independent cross-check against published Pro rates

The account's own per-unit prices convert exactly to Vercel's published
transformation-model Pro rates:

| Item | Account unit price (`iad1`) | Converts to | Published Pro rate |
|---|---|---|---|
| Transformation | `$0.00005` | **$0.05 / 1,000** | $0.05 / 1,000 ✅ |
| Cache read | `$0.0000004` | **$0.40 / 1,000,000** | $0.40 / 1M ✅ |
| Cache write | `$0.000004` | **$4.00 / 1,000,000** | $4 / 1M ✅ |

`iad1` is the correct region for this app — Vercel's own optimizer error
responses for mallan.nyc carry `iad1::` request IDs.

Regional rates vary; the account's price matrix ranges up to `$0.0000812`
per transformation (`gru1`, ≈$0.0812/1,000). Traffic served from another
region would bill at that region's rate.

### Included allocation

```
includedAllocationUsd: { quantity: 20, highestQuantity: 20, price: 0 }
```

→ **$20/month of usage credit.**

### Spend controls

```
controls: {
  analyticsSampleRateInPercent: 100,
  analyticsSpendLimitInDollars: 500
}
```

→ The only configured control is an **Analytics** spend limit. There is **no
image-optimization spend limit and no usage-notification threshold** in this
object.

`entitlements: {}` — empty.

---

## What this settles

1. The account is **Pro on `billingVersion: 2`**.
2. Its image billing line items are **transformation + cache-read + cache-write
   only**, with **no legacy source-image item present**.
3. Its per-unit prices **match the published transformation-model Pro rates
   exactly**, which independently corroborates (1) and (2).
4. The included credit is **$20/month**.
5. **No image-specific spend limit or notification threshold is configured.**

## What this does NOT settle

1. **Current usage counters.** Transformations, cache reads, cache writes, and
   remaining credit for the period could not be retrieved. Eleven
   endpoint/format combinations were tried; `/v1/usage` rejects every date
   format attempted (`invalid_from_date` for epoch-ms, ISO-8601, ISO without
   ms, `YYYY-MM-DD`, and unix seconds), and
   `/v1/teams/{id}/billing`, `/v1/billing/invoices`, `/v1/teams/{id}/invoices`,
   `/v1/data-cache/usage`, `/v1/observability/usage` and `/account/usage` all
   return 404. **These must be read from the dashboard:
   Vercel → mallan → Usage → Image Optimization.**
2. **How much of the $20 credit is already consumed by other resources.** The
   credit is shared across functions, data transfer, ISR, image optimization
   and other metered products — it is *not* reserved for images. Whether image
   optimization produces an incremental charge depends on total account usage,
   which is part of (1).
3. **The dashboard's own pricing-model display.** The invoice-item shape is
   strong evidence, but the authoritative operator-facing view is
   Settings → Billing → Image Optimization. If that screen shows source-image
   billing instead, this analysis must be redone — see the contingency in the
   PR body.

---

## Cost scenarios — REVISED 2026-08-01 (six widths, measured populations)

**Two corrections to the first version of this table.** It used a **five**-width
ladder (the premium change made it **six**: 384/448/640/828/1080/1280), and it
used **10,249** as the listing population — a figure from
`PLATFORM-ISSUE-REGISTRY.md:81` dated 2026-07-01.

Populations re-measured directly against production Neon on 2026-08-01:

| Population | Count | Query basis |
|---|---|---|
| All listing rows | 24,190 | `listings` |
| Passing display gates | 15,694 | `idx_display_yn` + `participant_only` + `owner_opt_out` |
| **Displayable WITH ≥1 active photo** | **15,104** | the correct "hero" population |
| **Total displayable active photos** | **211,556** | the correct "all photos" ceiling |

Gross metered amounts at `iad1` ($0.00005/transformation, $0.000004/cache
write), **before** the shared $20 credit:

| Scenario | Transformations | Transform | Cache write | Gross |
|---|---|---|---|---|
| Every hero, 1 width | 15,104 | $0.76 | $0.06 | **$0.82** |
| Every hero, 3 widths | 45,312 | $2.27 | $0.18 | **$2.45** |
| Every hero, all 6 widths | 90,624 | $4.53 | $0.36 | **$4.89** |
| 3 photos/listing, all 6 widths | 271,872 | $13.59 | $1.09 | **$14.68** |
| **Ceiling — every displayable photo × 6 widths** | **1,269,336** | **$63.47** | **$5.08** | **$68.55** |
| 1,000,000 cache reads | — | — | — | **$0.40** |

The ceiling row is stated deliberately. It is **not** a forecast — reaching it
would require every one of 211,556 photos to be requested at all six widths —
but it is the honest upper edge, and it sits above the $20 credit. The
realistic rows do not.

### What actually triggers a charge

A transformation is billed when a browser first requests a specific
**(source, width, quality)** triple; the 31-day TTL then serves repeats as
cache reads. Cards render one carousel photo at a time, and lazy-loaded cards
never scrolled into view are never transformed — so real usage tracks the
hero-focused rows, not the ceiling.

The six widths are *candidates*: a given client selects exactly one per image.
"All six" only accrues across a mix of viewports and DPRs over time. Across the
full tested matrix (390/1440 × DPR 1/2 × four view modes) each client selected
one width per image, spanning 384/448/640/828/1080/1280.

### The q=75 → q=85 switch is a one-time re-population

Quality is part of the cache key, so raising it **abandons the entire existing
q=75 card cache**. The scenario figures above therefore are not an abstract
model — they are the actual one-time re-population cost that will be incurred
as traffic touches each source-width pair at the new quality. After that,
repeats are cache reads.

---

## Recommendation

Do **not** set a hard spend limit. Vercel's Spend Management can pause
production projects when a hard cap is reached. Every card, featured card,
compare tile and hero now routes through `/_next/image`, so a pause would
break imagery **site-wide** — an unacceptable failure mode for a brokerage
site whose listings carry regulatory display obligations. Alerting is the
correct control; automatic pausing is not.

1. Enable **Image Optimization usage notifications** with a low warning
   threshold.
2. Leave automatic project pausing **disabled**.
3. Re-check usage after the first full production cycle with real traffic.

### These are monitoring, not merge gates

Per Maya's direction 2026-08-01, the three outstanding billing items —
current usage counters, dashboard pricing confirmation, and notification
setup — are **post-merge monitoring**, not blockers. The evidence above
materially supports transformation/cache billing; the dashboard remains the
easiest operator-facing confirmation but is not a precondition.

The modelled cost does not justify holding a picture repair.

## What this PR does NOT fix

`#591` is a premium **card-image delivery** improvement. It is not the closure
of all picture problems:

- **Stale source URLs (#586).** If `media_url_original` is left unrefreshed on
  active, unmirrored, parked rows, the DTO hands the optimizer an obsolete
  Cotality URL. The image is then stale or dead **at source** — nothing in the
  optimizer or its cache can fix that. Requires the media-freshness hotfix.
- **Detail thumbnail strip.** `ListingMediaGallery.tsx:222` renders
  `img.thumbUrl || img.url`, and `thumbUrl` is byte-identical to `url`, so an
  88×60 thumbnail downloads the full available file. Wasteful, not blurry.
  Separate bounded follow-up: optimize the strip only, ~192–256 physical px,
  q=85, leaving the main viewer and fullscreen lightbox untouched.
