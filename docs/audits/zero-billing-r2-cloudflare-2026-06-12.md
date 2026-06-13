# ZERO-BILLING Audit — R2 / Cloudflare side — 2026-06-12

**Question (Maya):** R2 is expected to be FREE — prove why it charges. Duplicate/old buckets? Wrong bucket connected? Paid Cloudflare features unrelated to R2?

**Status:** STRICT READ-ONLY. R2 side = ListBuckets (denied) + HeadBucket + GetBucketLocation + GetBucketLifecycleConfiguration/Cors GET attempts + 1 public HTTP GET of an existing 2-byte object. **Zero writes, zero deletes, zero lifecycle/settings changes.** Main-bucket size numbers REUSED from the cached `scripts/__r2-inventory-2026-06-12.json` — no re-listing of the 264 pages. DB side = SELECT-only against canonical prod (`ep-cold-waterfall-adno3ao2`, fail-closed host guard passed, `default_transaction_read_only = on`). No secret values printed anywhere — names + masked fragments only.

> **COMMITTED 2026-06-12 per Maya option A (PR #398)** — this document is intentionally tracked as
> durable evidence for the P2-MONEY plan. It contains no secrets (topology IDs, the public r2.dev
> domain, variable NAMES, storage numbers, conclusions only). **The probe scripts listed below stay
> UNTRACKED / operator-held** — they read `.env` and are deliberately not in the repo, so a fresh
> clone will NOT have them; the rerun command requires the operator's local copies. The
> load-bearing facts are inlined in this document, so it is self-contained without the probes
> (Codex #398).

**Probe artifacts (operator-held, `scripts/__` throwaway pattern, NOT in the repo):**
- `scripts/__zero-billing-r2-2026-06-12.mjs` — main probe (bucket enumeration + DB host extraction)
- `scripts/__zero-billing-r2-2026-06-12-results.json` — machine-readable results
- `scripts/__zero-billing-r2-2026-06-12-calibrate.mjs` — HeadBucket-403 semantics calibration
- `scripts/__zero-billing-r2-2026-06-12-vercel-env.mjs` — Vercel env var NAME listing (no values)
- `scripts/__zero-billing-r2-2026-06-12-envdiff.mjs` — local-vs-backup env equality (no values)

Operator re-run (requires the operator's local probe scripts above — absent in a fresh clone):
`node scripts/__zero-billing-r2-2026-06-12.mjs`

---

## 0. TL;DR

| Question | Answer | Evidence class |
|---|---|---|
| Why does R2 charge? | **Storage: 123.71 GB stored vs 10 GB free → ≈ $1.71/mo.** Ops ≈ $0. That is the entire evidenced R2 charge. | Measured (06-12 full inventory) |
| Duplicate/old bucket? | **None visible to the app's credentials** — but the token is bucket-scoped, so S3-side enumeration is impossible. The setup runbook's planned name `mallan-nyc-media` was never the real bucket (`mallan-images` is). **Dashboard check required** to rule out a forgotten second bucket. | S3-probe + calibration; operator gap flagged |
| Wrong bucket connected? | **No.** Production provably reads/writes `mallan-images` via `pub-c05d…r2.dev` — single domain across 135,954 DB rows, zero foreign/old R2 hosts in data. | Proven (DB + live HTTP) |
| Second Cloudflare account? | **No evidence of one.** Single `R2_ACCOUNT_ID` (`085032…`, masked) everywhere; identical in the pre-repoint backup; no hardcoded ids in code/docs. | Exhaustive repo grep |
| Paid CF features unrelated to R2? | **mallan.nyc DNS is NOT on Cloudflare (Porkbun NS)** → no CF zone plan (Pro/WAF/custom-domain) can exist for the site domain. Workers/Images/Stream not queryable with S3-only keys → **operator checklist §5**. | DNS resolved live; operator gap flagged |
| Path to $0? | **True $0 is impossible while R2 hosts the photo set.** Post-cleanup floor ≈ 73.6 GB → ≈ $0.95/mo. $0 requires < 10 GB, i.e. deleting/serving production media elsewhere. If the invoice shows materially more than ~$2/mo, the excess is a non-R2 line item — invoice check decides. | Arithmetic on measured GB |

---

## 1. Bucket enumeration (check 1)

**`ListBuckets` → AccessDenied.** The R2 API token is bucket-scoped (exactly as `docs/r2-setup.md` §4 prescribes: "Specify bucket… do NOT use Apply to all buckets"). Good security; bad for auditing.

**HeadBucket fallback, with calibration.** Naive reading: 403 on `mallan-nyc-media`/`mallan-media`/`mallan-nyc` would suggest those buckets exist. **Calibration probe disproved this:** two random, guaranteed-nonexistent names (`zz-calibration-nonexistent-*`) also returned HTTP 403. **Under a bucket-scoped R2 token, 403 carries zero existence information.** Fail-closed conclusion: the S3 API cannot enumerate this account's buckets; only the dashboard can.

| Bucket | Exists? | Objects | GB | Location | Lifecycle | Public access |
|---|---|---|---|---|---|---|
| `mallan-images` | **YES** (HeadBucket 200) | **263,618** | **123.71** | **ENAM** (Eastern North America — matches Vercel iad1) | **Not readable** (GET → 403; token lacks bucket-config read). R2 default = no lifecycle → objects live forever. Operator-verify. | r2.dev public (proven by live GET §4); custom domain: none. Settings page = operator-verify |
| `mallan-nyc-media` (runbook name) | **UNKNOWN** — repo evidence says it was only ever a *planned* name (`docs/r2-setup.md` §2, `memory/REFACTOR-2026-04-25.md`); the bucket actually provisioned was `mallan-images` (every env file since at least the 2026-06-02 backup). | — | — | — | — | **Operator check #1: dashboard → R2 → Overview. If a `mallan-nyc-media` bucket exists with objects, it is the forgotten-duplicate $-win.** |
| any other bucket | UNKNOWN (enumeration impossible with these keys) | — | — | — | — | Same operator check |

Size source for `mallan-images`: cached full inventory `scripts/__r2-inventory-2026-06-12.json` (captured 2026-06-12T21:46Z, 264 ListObjectsV2 pages) — not re-listed today, per tasking.

## 2. Account id (check 2)

- `R2_ACCOUNT_ID` = `085032…` (masked; 32 hex chars). Sole source: `.env.local` (and Vercel env). Endpoint is built only as `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` (`lib/images/r2.ts:29`).
- **No second account id anywhere:** repo-wide greps for `[a-f0-9]{32}\.r2\.cloudflarestorage\.com` (0 hits), `dash.cloudflare.com/<hex>` (0 hits), `CLOUDFLARE|CF_API|CF_TOKEN|CF_ACCOUNT` (1 hit — a prose mention in the 06-10 audit, not a credential).
- `.env.local.backup-before-repoint` (2026-06-02): **all five R2_* values byte-identical to current** (compared programmatically, values never printed).
- **Verdict: single Cloudflare account in evidence.** A second account could only exist entirely outside this repo — the §5 checklist covers it (log into dash.cloudflare.com and check which accounts the email can see).

## 3. Env var comparison by NAME (check 3)

| Name | `.env.local` | backup (06-02) | `.env.example` | Code default | Vercel |
|---|---|---|---|---|---|
| `R2_ACCOUNT_ID` | `085032…` (32ch) | identical | empty | none — `lib/images/r2.ts` **throws if unset** (fail-closed) | Encrypted, **one entry → Development + Preview + Production**, created ~123d ago (≈2026-02-09) |
| `R2_ACCESS_KEY_ID` | `8935…` (32ch) | identical | empty | none (throws) | same single entry |
| `R2_SECRET_ACCESS_KEY` | `a94e…` (64ch) | identical | empty | none (throws) | same single entry |
| `R2_BUCKET_NAME` | `mallan-images` | identical | `mallan-images` | none (throws) | same single entry |
| `R2_PUBLIC_URL` | `https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev` | identical | placeholder | none (throws) | same single entry |

- No other R2/S3 endpoint vars exist (`R2_ENDPOINT`, `S3_*`, `R2_PUBLIC_BASE_URL`: 0 hits).
- **Preview-vs-production divergence: impossible by construction.** `vercel env ls` shows exactly ONE row per R2 name spanning all three environments — a single shared value. A preview deploy reads the same bucket as production.
- Only doc drift: `docs/r2-setup.md` says the bucket should be named `mallan-nyc-media`; reality is `mallan-images`. Cosmetic unless the dashboard reveals both exist (§1).

## 4. PROOF production uses the intended bucket (check 4)

SELECT-only, canonical prod, host-guard passed:

- `listing_media.media_url_cached` (135,954 rows with a value): **exactly one base host — `https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev` (100%)**. No second r2.dev hash, no r2.cloudflarestorage URLs, no old domains.
- Legacy `listings.media` JSON r2.dev hosts: **same single host.**
- `listings.primary_photo_url`: only `https://api.cotality.com` (Trestle-direct, not R2 — expected; the R2 pointer is `primary_photo_r2_key`).
- Domain→bucket mapping proven live: `GET https://pub-c05d…r2.dev/test/ping.txt` → **HTTP 200, 2 bytes, body `ok`** — exactly the `test/ping.txt` object the 06-12 inventory captured inside `mallan-images`. The public domain serves the env-configured bucket.
- These rows are written by production crons running on Vercel env vars → production writes to and serves from `mallan-images`. **No old base URLs anywhere in data.**

## 5. Cloudflare paid features unrelated to R2 (check 5)

- **No `CLOUDFLARE_API_TOKEN` / `CF_*` credential exists anywhere in the repo or env files** — only S3-scoped R2 keys. Workers/Images/Stream/zone subscriptions are therefore **not queryable from here**; do not guess.
- **DNS fact (resolved live):** `mallan.nyc` NS = `salvador/curitiba/fortaleza/maceio.ns.porkbun.com` — **the zone is on Porkbun, NOT Cloudflare and NOT Vercel DNS.** Consequence: **no Cloudflare zone-plan subscription (Pro $25/WAF/etc.) can exist for mallan.nyc** — that whole class of suspected charge is ruled out for the site domain. (`images.mallan.nyc` does not resolve — the custom media domain remains dormant/unbound, consistent with serving via r2.dev.)

**Operator checklist (dash.cloudflare.com, ~5 min, read-only):**
1. **Account picker (top-left):** how many accounts does mayad67@gmail.com see? More than one → check each one's Billing. (Only possible second-bill source left.)
2. **Billing → Invoices:** open the latest invoice; read each line item. Expected: "R2 storage ≈ $1.7". Anything else (Workers Paid $5/mo, Images, Stream, R2 Data Catalog, paid Logpush) is the unexplained delta.
3. **R2 → Overview:** count the buckets. Expected: exactly one, `mallan-images`. A `mallan-nyc-media` or other bucket with objects = forgotten duplicate → its deletion is the real $-win (Maya-gated; R2 changes HELD).
4. **R2 → mallan-images → Settings:** confirm public access = r2.dev only, no custom-domain add-ons; **Lifecycle rules: confirm NONE** (token couldn't read it — expected default is none, meaning nothing ever expires).
5. **Workers & Pages → Plans:** confirm Free plan (no $5/mo Workers Paid).
6. **R2 → mallan-images → Metrics:** storage GB should read ≈ 123.7 — cross-checks this audit.

## 6. EXACT path to $0 (check 6 — recommendations only, NO action taken)

**Honest answer: R2 cannot reach $0 while it hosts the production photo set.** 123.71 GB of listing photos vs a 10 GB free tier. The math:

| Step | GB after | $/mo after |
|---|---|---|
| Today | 123.71 | **$1.71** |
| Execute the post-C6 ~50.1 GB safe cleanup (orphans + tombstone-only; HELD, runs LAST per Maya's 06-12 order, recomputed post-drain) | ≈ 73.6 | **≈ $0.95** |
| $0 | < 10 | Only by deleting ~95% of media or moving hosting — not compatible with serving 15.9K IDX-displayable listings' photos from R2 |

| Resource | Provider | Plan/tier | Monthly charge | Why charging | Used by prod? | Evidence | Safe action to $0 | Risk | Maya approval |
|---|---|---|---|---|---|---|---|---|---|
| `mallan-images` bucket storage | Cloudflare R2 | Pay-as-you-go (free tier 10 GB) | **≈ $1.71** | 123.71 GB stored − 10 free = 113.71 × $0.015 | **YES** — sole media store, proven §4 | 06-12 full inventory + §4 | Cleanup → ~$0.95; $0 impossible while hosting media | Cleanup deletes wrong objects if run before drain completes → recompute first; HELD | **YES** |
| R2 operations (Class A/B) | Cloudflare R2 | Free allowances 1M/10M | **≈ $0** (worst case ~$0.45 during finite RC1 drain burst) | Inside free tier | YES | 06-12 audit §9 | None needed | — | n/a |
| Possible duplicate bucket (`mallan-nyc-media`?) | Cloudflare R2 | unknown | **unknown — likely $0 (probably never created)** | Only if it exists with objects | NO (nothing references it) | §1 — S3-unenumerable; runbook-name drift | Operator check #3; if found non-empty → delete (HELD, Maya-gated) | None if confirmed unreferenced (no DB URL points anywhere but pub-c05d…) | **YES** |
| CF zone plan for mallan.nyc | Cloudflare | — | **$0 — cannot exist** | Zone is on Porkbun, not CF | — | Live NS lookup §5 | None | — | n/a |
| Workers / Images / Stream / other CF subs | Cloudflare | unknown | **unknown — unqueryable with S3 keys** | Only if a sub was enabled during setup | NO repo usage of any | No CF API token exists; repo-wide grep clean | Operator checklist §5 items 2+5; cancel unused | None to prod (nothing in repo calls Workers/Images/Stream) | Maya manual |
| Second Cloudflare account | Cloudflare | — | **no evidence of one** | — | — | §2 single account id everywhere | Operator check #1 (account picker) | — | Maya manual |

**Bottom line:** if the Cloudflare invoice reads ≈ $1.7–2.2/mo, the bill is fully explained by photo storage and the only lever is the (HELD) cleanup → ~$0.95/mo floor. If the invoice is materially higher, the delta is a subscription line item findable in 5 minutes via the §5 checklist — it is not R2 usage.

---

*Generated 2026-06-12. All probes read-only; probe scripts operator-held/untracked (not in repo). This document committed per Maya option A (PR #398).*
