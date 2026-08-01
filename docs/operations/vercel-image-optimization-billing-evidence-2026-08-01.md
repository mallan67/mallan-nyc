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

## Cost scenarios (transformation model, `iad1`, ~10,249 active listings)

Gross metered amounts, **before** the shared $20 credit. These are scenarios,
not bounds — actual usage is demand-driven.

| Scenario | Transformations | Transform cost | Cache-write cost | Gross |
|---|---|---|---|---|
| Every hero, 1 width | 10,249 | $0.51 | $0.04 | **$0.55** |
| Every hero, 3 widths | 30,747 | $1.54 | $0.12 | **$1.66** |
| Every hero, all 5 widths | 51,245 | $2.56 | $0.20 | **$2.77** |
| 3 photos/listing, all 5 widths | 153,735 | $7.69 | $0.61 | **$8.30** |
| 1,000,000 cache reads | — | — | — | **$0.40** |

A transformation is billed when a browser first requests a specific photo at a
specific width; the 31-day `minimumCacheTTL` then serves subsequent requests as
cache reads. Lazy-loaded cards never scrolled into view are never transformed.
The five configured widths are *candidates* — a given browser selects one per
image, so "all five widths" only occurs across a mix of viewports and DPRs
over time.

Only ~3 distinct widths were observed across the full tested matrix
(390/1440 viewports × DPR 1/2 × four view modes): 384, 640, 828, 1080, 1200
appear, but never more than one per image per client.

---

## Recommendation

Do **not** set a hard spend limit. Vercel's Spend Management can pause
production projects when a hard cap is reached, which would take mallan.nyc
offline — an unacceptable failure mode for a brokerage site whose listings
carry regulatory display obligations.

Instead:

1. Enable **Image Optimization usage notifications** with a low warning
   threshold.
2. Leave automatic project pausing **disabled**.
3. Record the current counters (see "does not settle" #1) before merge.
4. Re-check usage after the first full production cycle with real traffic.
