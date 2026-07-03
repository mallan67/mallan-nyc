# R2 Storage/Cost INVENTORY Audit — 2026-06-12

**Question (Maya):** exact object count and storage by prefix — no guesses. Suspicion: "R2 storage itself is probably not huge; Neon is more likely the real recurring cost."

**Status:** READ-ONLY. R2 side = 1 × HeadBucket + **264 × ListObjectsV2** (full pagination, MaxKeys=1000) — NO puts, NO deletes, NO lifecycle changes. DB side = SELECT-only against canonical prod (`hidden-mountain` / `ep-cold-waterfall-adno3ao2`), fail-closed host guard passed, session forced `default_transaction_read_only = on`.

**DO NOT COMMIT this file** (stays untracked alongside the probe scripts).

**Artifacts (untracked, `scripts/__` throwaway pattern, DO NOT COMMIT):**
- `scripts/__r2-inventory-2026-06-12.mjs` — main probe (R2 list + DB cross-reference)
- `scripts/__r2-inventory-2026-06-12.json` — **full persisted inventory** `{key, size, prefix}` × 263,618 — reusable by the later media-duplication audit
- `scripts/__r2-inventory-2026-06-12-summary.json` — machine-readable summary (every number below)
- `scripts/__r2-inventory-2026-06-12-orphan-adjust.mjs` / `…-orphan-exact.mjs` — drain-reclaim adjustment probes

Operator re-run command (if needed): `node scripts/__r2-inventory-2026-06-12.mjs` (reuses the cached inventory JSON if present — does not re-spend List calls).

---

## 0. TL;DR

| Metric | Value |
|---|---|
| Total objects | **263,618** (264 List calls spent) |
| Total stored | **123.71 GB** (132,832,522,989 bytes) |
| Est. storage cost | (123.71 − 10 free) × $0.015 = **$1.71/mo** |
| Est. ops cost | **~$0** steady-state; worst case ~$0.45/mo during the current RC1 drain burst |
| **Total R2 ≈ $1.7–2.2/mo** | vs **Neon Launch $19/mo** → **Neon is ~10× the R2 bill** |
| Cleanup candidates (NO deletion now) | ~**104,800 objects / ~50.1 GB** (post-drain safe set) |

**Verdict on Maya's suspicion: confirmed in dollars, wrong in gigabytes.** The bucket is much bigger than every prior estimate (123.7 GB actual vs the 06-10 audit's 30–50 GB guess; 12× the free tier) — but at R2 pricing that is still under $2/month. The real recurring cost is Neon's $19/mo Launch plan fee (see `docs/audits/r2-neon-cost-audit-2026-06-10.md` §2).

---

## 1. Total object count + storage (report items 1–2)

- Bucket: `mallan-images` (verified via HeadBucket; account endpoint per `lib/images/r2.ts` env config).
- **263,618 objects · 123.71 GB**, captured 2026-06-12 via full paged `ListObjectsV2` — **264 List calls** (Class A; ≈ $0.0012 spent on this audit).
- The 06-10 audit's "plausible 128K–200K objects / 30–50 GB" is superseded: actual average object size is **514 KB** in `photos/` (not the assumed 250 KB), which is why GB landed 2.5× above the top estimate.

## 2. Prefix tree (report item 3 — real top-level prefixes, measured)

| Prefix | Objects | GB | Avg size | What it is |
|---|---|---|---|---|
| `photos/` | 244,313 | **119.804** | 514 KB | Trestle listing photos, deterministic `photos/{listingId}/{order}.jpg` |
| `floorplans/` | 19,085 | 3.888 | 214 KB | Floorplans (namespace split per `buildMediaR2Key`) |
| `listings/` | 219 | 0.018 | 86 KB | CRM/Mallan-exclusive upload variants (`SL-000x/…-hero/-card/-thumb.webp`) |
| `test/` | 1 | 0.000 | 2 B | `test/ping.txt` (ops-r2-health self-test residue) |

**Prefixes that do NOT exist:** `crm/`, `temp/`, `tmp/`, `legacy/`, `thumbnails/`, `variants/` — the tasking's hypothesized prefixes are not real; the tree above is the complete top level. Thumbnail/variant objects live inside `listings/` as `-thumb/-card/-hero.webp` suffixes.

Distinct `{prefix}/{listing}` directories: **35,241**.

## 3. DB reference sets (schema read first)

R2-pointer columns confirmed from `prisma/schema.prisma`: `listing_media.r2_key` + `listing_media.media_url_cached` (ListingMedia, lines 2335–2354), plus safety-net pointers `listings.primary_photo_r2_key` / `primary_photo_url` (line 488–489) and legacy `listings.media` JSON URLs.

- `listing_media` rows with an R2 pointer: **127,792** → **126,817 distinct keys** (120,668 referenced by active rows). Status counts: active 163,626 rows (120,751 with r2_key — **42,875 active rows not yet mirrored**, RC1 drain in flight), deleted 7,345 (7,040 with r2_key).
- All DB pointers combined (listing_media + primary_photo + legacy media JSON): **139,101 distinct keys**.
- **Every DB-referenced key exists in the bucket (0 missing)** — no broken `media_url_cached` at the storage layer.

Note the drain effect: on 06-10 there were 81,918 active rows; today 163,626. The DB side is mid-backfill — every orphan figure below is a **snapshot** and shrinks as the drain claims more deterministic keys.

## 4. Objects NOT referenced by `listing_media` (report item 4)

| Set | Objects | GB |
|---|---|---|
| Not referenced by `listing_media` (r2_key ∪ media_url_cached) | **136,801** | **64.00** |
| Strict orphans — no DB pointer anywhere (also checked primary_photo_* + legacy media JSON) | **124,517** | **58.59** |
| └─ of which **pending drain reclaim** (deterministic future keys of the 42,875 unmirrored active rows — KEEP) | 25,854 | 12.64 |
| └─ **adjusted true orphans** (post-drain) | **98,663** | **45.95** |
| └─ of which path listing-id unknown to `listings` entirely | 75 | 0.04 |

The true-orphan population is the legacy `migrateMediaToR2` era (128K+ uploads, zero production delete path — `deleteFromR2` callers: health-check only) minus what the current pipeline re-claimed.

## 5. Objects referenced ONLY by tombstoned rows (report item 5)

- **6,149 objects / 4.12 GB** are referenced only by `status='deleted'` rows (no active reference).
- **142 wrong-tombstone resurrection set: protected.** The keep set was loaded from `scripts/__strike-dryrun-2026-06-12-live-evidence.json` (142 STILL-LIVE lm_ids) + `…-evidence.json` (their r2_keys/cached URLs + deterministic `photos/{id}/{index}.jpg` keys) → 142 protected keys. **Intersection with the tombstone-only set today: 0 objects** — but the guard stays in the cleanup-candidate math, and because the resurrection re-sync (cleanup step 1) will re-activate rows, **this set must be recomputed after steps 1–3 of Maya's 2026-06-12 cleanup order before any strike**.

## 6. Objects of blocked/gated listings (report item 6 — compliance-sensitive)

- **74,856 objects / 34.27 GB** belong to listings that are `sync_status LIKE 'gated:%'` (88,165 listings) or `idx_display_yn = false` (91,571 listings).
- **Compliance flag (no action taken — R2 changes HELD):** the bucket is public via `pub-*.r2.dev` (verified: `R2_PUBLIC_URL` is an r2.dev domain, not a custom domain). Site pages gate at the listing level and do not link these objects, but anyone holding/guessing a deterministic URL (`photos/{listingId}/{order}.jpg`) can fetch a gated listing's photo directly. This is a REBNY display-gate adjacency issue to weigh in the (HELD) cleanup design — e.g., deleting gated-listing objects, or moving to a custom domain + access rules. Read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` before any remediation.

## 7. Mallan-exclusive objects (report item 7)

- **229 objects / 0.019 GB** under SL-/RL- listing ids: `listings/SL-0001/...-{hero,card,thumb}.webp` upload variants, `floorplans/SL-0004/…`, `photos/SL-…`. Negligible storage; these are first-party (non-Trestle) and outside REBNY removal authority — **excluded from all cleanup-candidate sets**.

## 8. Storage cost (report item 8)

123.71 GB − 10 GB free tier = 113.71 GB billable × $0.015/GB-month = **$1.706/month**.
After the full safe cleanup (§10): ~73.6 GB → ~**$0.95/month**. R2 cannot reach $0 while mirroring the active photo set (~120K objects ≈ 60+ GB at the measured 514 KB average).

## 9. Operations cost (report item 9)

**Class A (PUT/LIST — $4.50/M past 1M free):**
- Steady-state mirror rate (pre-drain, from `listing_media` mirrored-rows/day): 7–90/day → ≤ 3K PUTs/mo ≈ 0.3% of free. $0.
- Current RC1 drain burst (06-09 → 06-12): 6,050–23,909 new mirrored rows/day created (16K–37K rows/day touched) → if sustained a full month ≈ 0.7–1.1M Class A — at/just past free; **worst case ≈ $0.45/mo, and the drain is finite** (42,875 rows left).
- This audit: 264 List + 1 HeadBucket ≈ $0.001.

**Class B (GET/HEAD — $0.36/M past 10M free):**
- Sync HEADs (`existsInR2`, 1 per mirror attempt): steady ~9K/mo; drain era ~0.9M/mo. Far inside free.
- Public serving (verified, not assumed): `media_url_cached` rows store `https://pub-….r2.dev/...` and `R2_PUBLIC_URL` is the r2.dev dev domain — **NOT a custom domain, therefore NOT cached by Cloudflare's CDN** (and rate-limited). `next.config.js` whitelists both `*.r2.dev` and `images.mallan.nyc` for `next/image`, so optimizer-cached views absorb most traffic; only optimizer misses hit R2 as Class B GETs. Egress is free regardless (R2 has no egress fee). Likely < 10M/mo → $0; heavy bot crawl worst case = low single dollars. The dormant `images.mallan.nyc` custom domain would make GETs CDN-cached — that change is **HELD** (env-var + Cloudflare).

**Total estimated R2 bill ≈ $1.7–2.2/month.** If the Cloudflare invoice is materially higher, it is a subscription line item (Workers Paid / zone plan), not R2 usage — unchanged from the 06-10 audit §3.4.

## 10. Safe future cleanup candidates (report item 10 — NO deletion now; R2 cleanup HELD + runs LAST per Maya's 2026-06-12 order)

| Candidate bucket | Objects | GB |
|---|---|---|
| True orphans (no DB pointer, NOT pending drain reclaim) | 98,663 | **45.95** |
| Tombstone-only objects (excl. the 142-set — intersection 0 today, guard retained) | 6,149 | **4.12** |
| `temp/` | 0 | 0 |
| `legacy/` | 0 | 0 |
| `test/ping.txt` | 1 | 0.000 |
| **Total safe-candidate (post-drain recompute required)** | **~104,813** | **~50.07** |

**Must-KEEP carve-outs baked into the math:** the 142 wrong-tombstone resurrection keys; the 25,854 objects (12.64 GB) matching deterministic keys of unmirrored active rows (drain will re-claim them); all 229 SL-/RL- exclusive objects.

**Sequencing (Maya directive 2026-06-12, canonical at `docs/superpowers/plans/2026-06-10-phase1-media-loop-closures-plan.md` Amendment):** 1) resurrect the 142 → 2) strike the 10 → 3) 366-key re-sync → 4) re-evaluate M4 → **5) R2 orphan cleanup LAST**, recomputed fresh from a new ListObjectsV2 diff at execution time. Each step separately Maya-gated.

---

## 11. Method notes / assumptions

- Sizes are exact (summed `Size` from ListObjectsV2), not estimates. No sampling.
- "Gated objects" attribution: by DB reference where available, else by the deterministic key's path segment (`{ns}/{listingId}/…`); 75 orphan objects have listing-ids unknown to `listings` (counted as orphans, not gated).
- Mirror-rate/day uses `listing_media.updated_at`/`created_at` — `updated_at` moves on any update, so drain-day figures are upper bounds for PUTs.
- All numbers are a 2026-06-12 snapshot taken while the RC1 drain is actively mutating `listing_media` — orphan/tombstone sets MUST be recomputed immediately before any (HELD, Maya-gated) cleanup execution.

*Generated 2026-06-12. Probe scripts untracked. Do not commit without Maya approval.*
