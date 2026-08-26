# MALLAN CONTINUOUS EXECUTION STATE

**Updated:** 2026-08-17
**Purpose:** survive a context reset without restarting the investigation.

> **IF YOU ARE A NEW SESSION, DO THIS AND NOTHING ELSE FIRST:**
> 1. **🛑 STOP GATE — read `docs/architecture/COTALITY-API-AND-MALLAN-LOCAL-INPUT.md`**
>    before ANY listing / provider / data work, and before reading any mapping, field list,
>    comment, audit, test or snapshot. **Existing code is NOT provider authority.**
>    A listing has exactly TWO origins: **LIVE AUTHENTICATED COTALITY API** and
>    **MALLAN REAL ESTATE LOCAL INPUT**. `Cotality API` is the one external provider name.
>    Verify with `npm run cotality:startup-gate`.
> 2. Read `MALLAN-PLATFORM-MASTER-PLAN.md` (frozen PR #595, read-only authority).
> 3. Read this file.
> 4. Verify `pwd`, repo, branch, HEAD, `git status`, `git diff --stat`.
> 5. Resume from **§10 EXACT NEXT ACTION**.
>
> **DO NOT start a new audit.** The audits are done and recorded below.

---

## 1. AUTHORIZED WORKSPACE

| | |
|---|---|
| Repo | `mallan67/mallan-nyc` |
| Only authorized mutation checkout | `C:\Users\MayaAllan\Desktop\mallan-nyc` |
| Branch | `fix/neon-p0-event-driven-wake-2026-08-16` |
| PR | **#618** — OPEN, DRAFT, unmerged |
| Pushed base | **`220c7e9dec047bb903d5dab7b12b00c6e953be86`** |
| Local work | UNCOMMITTED on top of that SHA |

**One-final-SHA rule:** do not push intermediate commits to report progress. One commit, one push, after all authority corrections are complete.

---

## 2. UNCOMMITTED LOCAL WORK

`git diff --stat HEAD` → **10 files changed, 554 insertions(+), 197 deletions(-)** plus 5 untracked.

Modified:
```
app/api/crm/listings/route.ts
lib/crm/personal-participation.ts
lib/crm/__tests__/personal-participation.test.ts
lib/idx/trestle-mapper.ts
lib/listings/mallan-source-identity.ts
prisma/schema.prisma
tests/runtime/crm-list-page-cap.test.ts
tests/runtime/crm-media-canonical-readers.test.ts
tests/runtime/crm-my-listings-filter.test.ts
tests/runtime/mallan-rls-return-copy-suppression.test.ts
```
Untracked (all intentional):
```
lib/idx/buyer-participation-mapper.ts
lib/idx/__tests__/buyer-participation-mapper.test.ts
prisma/migrations/20260817190000_add_buyer_participation/migration.sql
scripts/backfill-buyer-participation.ts
tests/runtime/crm-my-listings-pagination.test.ts
```

Pre-existing untracked files under `artifacts/`, `docs/audits/`, `docs/superpowers/`, `scripts/verify-r2-usage.ts` are **not mine** — leave them alone.

---

## 3. TEST COUNTS (current local state, all green)

```
type-check   0 errors
runtime      4,386 passed  (282 suites)
lib/idx      1,078 passed  (57 suites)
lib/search     641 passed
lib/crm         49 passed
```
Gates last run green on the pushed SHA: `lint` 0 errors · `rls:validate` 0 errors/0 unknown · `compliance-check` 95/0 · `ucba:audit` 46/46, 0 regressions · `idx:validate` 0 critical · `crm:test` 39/39. **Re-run all before the final commit.**

---

## 4. ALREADY SHIPPED IN `220c7e9d` (do not redo)

- **My Listings P0**: `trestleClosed` had no participation test (522 rows, 387 agents, 65 offices); BROKER skipped the only ownership constraint; `updated_at desc + take 200` crowded out Mallan rows. Reproduced: 200 rows / 200 Closed / 0 the caller's / 0 SL-.
- **D — publication eligibility** moved into `fetchFromDB` pre-DTO/pre-cache; source-class aware.
- **E-0 — media display authorization** across 11 executable readers.
- **E — provenance vs public**: locator rotation + PhotosChangeTimestamp emit zero tags; gallery→listing; hero→listing+building+shard.
- **CRM media closure** — 4 writers through `closeMediaWrite`.
- **sitemap** — `force-dynamic` overwrote `revalidate`→0; now a tagged cached read.
- **reset-sync** — disabled (410).

---

## 5. LOCAL WORK SINCE `220c7e9d`

### 5.1 Source-authority correction (RELEASE BLOCKER — fixed)
`isMallanLocalListing` (canonical owner) fell back to `rls_eligible === false` as an AUTHORSHIP test. That conflates Visibility with Source (master plan §4) and propagated to every consumer.

Fixed: authorship is the `listing_id` namespace (`SL-`/`RL-`) only.

Production proof: `prefix only = 7`, `prefix OR rls_eligible=false = 7`, `reclassified = 0`, `mallan_authored_but_rls_eligible = 0`.

Also removed from `mallanAuthoredScope`, `isMallanAuthoredRow`, and the discredited `rls_eligible: asc` ordering.

### 5.2 Pagination defect (INTRODUCED BY ME, then fixed)
The Mallan-first merge originally ran `mallanFirst` only at `offset === 0` and let the provider query `skip: offset` into the FULL union → duplicates and omissions on page 2.

Now an ordered concatenation:
```
M            = count(Mallan-authored ∩ same filters)
mallanSkip   = min(offset, M)
mallanTake   = clamp(M - offset, 0, limit)
providerSkip = max(0, offset - M)
providerTake = limit - mallanTake
```
`providerWhere = AND[union, NOT mallanScope]` — explicitly personal participation AND NOT Mallan-authored.

**Controlled-revert proof:** naive math fails 4 tests (PAGE 2, FINAL PAGE, UNION IS EXACT, SMALL PAGES); correct math passes **9/9** in `tests/runtime/crm-my-listings-pagination.test.ts` (real handler, Prisma mock with genuine skip/take).

### 5.3 Buyer-side participation — CODE COMPLETE, production mutation held
- `prisma/schema.prisma`: 4 nullable TEXT columns — `buyer_agent_mls_id`, `co_buyer_agent_mls_id` (INDIVIDUAL → personal participation) and `buyer_office_mls_id`, `co_buyer_office_mls_id` (OFFICE → brokerage only).
- `prisma/migrations/20260817190000_add_buyer_participation/migration.sql` — additive, nullable, no index, rollback documented.
- `lib/idx/buyer-participation-mapper.ts` — canonical mapper, wired into `mapTrestleToPrisma`.
- `scripts/backfill-buyer-participation.ts` — dry-run default, verifies columns, **never creates a Listing row**, emits no cache tags.
- `participationWhere` queries all four INDIVIDUAL roles. Office roles are stored but NEVER used for personal participation.

**Rollout is EXPAND-FIRST:** apply migration → verify → dry-run backfill → execute backfill → deploy the audited SHA. Deploying before the migration reproduces the 2026-04-19 silent-drift incident (`vercel.json` runs `prisma generate` only; migrations are manual — NEON.md Trap #1).

### 5.4 Provider-value semantics — blacklist removed from the resolver
Comparison is exact (`'NONMEMBER' !== '39361'`). `TM61/62/63` were wrongly classified as sentinels and that was reverted — each spans exactly one office (7991) and is shaped like a genuine identity, so classifying them would DROP real participation.

---

## 6. COTALITY EVIDENCE LEDGER (live, read-only, 2026-08-17)

Base `https://api.cotality.com/trestle`, OAuth client_credentials. **Credentials are in the process environment — never printed, never committed.**

| Query | Result |
|---|---|
| `/odata/$metadata` | HTTP 200 |
| `StandardStatus` enum | `Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn` |
| counts by status | Active 8,205 · Pending 6,103 · Closed 576,810 · ComingSoon 1 · rest 0 |
| `StandardStatus eq 'Sold'\|'Leased'\|'Rented'\|'Cancelled'` | **HTTP 400** — invalid enum members |
| `StandardStatus eq 'OFFEROUT'\|'UnderContract'` | **HTTP 400** |
| Media sample n=5,000 | `MediaKey` 5000/5000 distinct · `RecordSignature` 4,931 distinct · `MediaObjectID` 4,788 populated · `OriginalMediaUrl`/`ImageWidth`/`ImageHeight`/`MediaAlteration`/`Permission` **0/5000** |
| `MediaStatus` enum / observed | enum `Active, Deleted, Other`; `eq 'Deleted'` → **0** of 1,969,243 |
| Media `InternetEntireListingDisplayYN` | `eq false` 278,927 · `eq true` 1,690,352 · `eq null` 62 · `ne false` 1,690,414 (= true+null, so `ne false` keeps nulls) |
| IELD mixed within a listing | **0 of 4,132 listings** → listing-level flag |
| listings with false media present in Property feed | **0 of 55** |
| Locator rotation, 32 MediaKeys × 4 cohorts | differing path segments `-2,-1` on **32/32**; 0/32 unchanged; 0 structured fields moved |
| Aged locator re-fetch | 22.8–24.8 min → **HTTP 200 with NO auth header** |
| `PhotosChangeTimestamp` | populated 199/200; batch-stamped (different listings, different PhotosCount, identical stamp) |
| Buyer fields (500 Closed) | `BuyerAgentMlsId` 500/500 · `BuyerOfficeMlsId` 500/500 · `CoBuyerAgentMlsId` 2/500 · `BuyerAgentFullName` **0/500** |
| Buyer vocabulary | 473 numeric · 18 `NONMEMBER` · 9 `TM61/62/63` |
| Backfill predicate completeness | `CoBuyer ne null AND Buyer eq null` → **106** · `BuyerOffice ne null AND Buyer eq null` → **370** |
| Maya (39361) | list 36 · co-list 0 · buyer 6 · co-buyer 0 · **union 38** |
| Maya attribution check | 0 of 12 contaminating rows; 6/6 of her rows → `ListAgentFullName "Maya Allan"`, office "MAllan Real Estate Inc" |
| `NONMEMBER` shape | 8,216 rows, `BuyerOfficeMlsId` ∈ {`NONMEMBER`, null} |
| `TM61/62/63` shape | 25/40/12 rows, **all office 7991** |

### Production Neon (read-only, `hidden-mountain-87248164`)
| Query | Result |
|---|---|
| SL-/RL- rows | 7 — **SL-0004 and SL-0007 are `Active`**; other 5 `Withdrawn`; all `agent_id=1`, `rls_eligible=false`, `last_synced_from_trestle=null` |
| `trestleClosed` population | 522 · 387 distinct list agents · 65 offices |
| newer than SL-0007 / SL-0004 | 426 / 489 |
| exact API window reproduction | 200 rows, 200 Closed, **0 Maya's**, 0 SL- |
| corrected predicate | **43 rows** — 36 Cotality list-side, 7 SL- (2 Active), **0 strangers** |
| terminal writes last 7d | 492, of which **492 (100%)** had a provider `modification_timestamp` change; 0 without; avg lag 0.0 days |
| listings total / updated 24h | 25,214 / 1,589 |
| Agent identity | `agents.id=1` Maya Allan, role **BROKER**, `trestle_mls_id='39361'`; two other agents have `trestle_mls_id=null` |

---

## 7. AUTHORITY MATRIX — completed findings

- `lib/idx/fetch.ts:629 fetchListingMedia` — **DUPLICATE_AUTHORITY**. Own inline classifier; 6 consumer call sites; keys hero ordering off `PreferredPhotoYN` and floorplan/video classification off `ShortDescription`, **both 0/7 in that sample**.
- `lib/idx/sync.ts:1284` and `:2715` — near-byte-identical duplicate media reconcilers.
- `lib/idx/sync.ts:1931 backfillEmptyMedia` — third inline copy; writes legacy `Listing.media` JSON; no caller.
- 201 of 339 `IDX_PLUS_SELECT_FIELDS` are null across 25 sampled rows.
- `Property.Permission` = `'IDX'` 25/25; `Media.Permission` 0/7.
- Cotality returns an UNREQUESTED field `X_MediaStream`.
- **7 consumer request paths call Cotality live**: `agents/[slug]/listings`, `idx/search`, `media/batch`, `public-building-data`, `listings/similar`, `open-houses`, `listings/[id]`.
- Wake sources: 20 Vercel crons (only `one-cycle-preflight` `*/10`, and it is **Neon-free on the skip path** — imports only `fetchFromTrestle` + `redis`); GitHub `live-site-cron` hourly hits `/`, `/search`, `/api/health`, `/sitemap.xml`.
- TTL classification: 6 EVENT_DRIVEN_SAFE, 10 EXPLICIT_TTL_REQUIRED (wall-clock inside cached bodies).

---

## 8. OUTSTANDING GATES BEFORE THE FINAL SHA

1. **Remove remaining `NONMEMBER` semantics from the mapper.** Preserve the raw value; label it *observed provider value — semantics not verified from Cotality*. No sentinel set, no business decision.
2. **`Agent.trestle_mls_id` verification = RELEASE GATE.** Census every writer; prove the stored value originates from and resolves to the verified individual Cotality identity; prove office/team/nonmember values cannot enter it. Personal participation depends on it.
3. **Media URL identity.** `locatorIdentityIgnoringRotation` parses path segments. Observed URL shape is **not** a Cotality contract. Prefer structured provider identity/change fields (`MediaKey`, `RecordSignature`, `MediaModificationTimestamp`).
4. **Media duplicate authority.** Do NOT retire `fetchListingMedia` on a 0/7 sample or source similarity. Need authorized metadata + real population for the exact fields/classes it handles, plus both reconcilers' full call graphs and side effects.
5. **Source/visibility sweep.** Classify every use of `rls_eligible`, `idx_display_yn`, `status`, office identity, `agent_id`, `mls_id` as Identity / Source / Authority / Visibility.
6. **SL-/RL- invariant.** Prove every Mallan creator emits it, no Cotality writer can mint it, return-copy reconciliation never rewrites it. Pin with tests.
7. **Neon impact of multi-query My Listings.** Bounded SQL count, no N+1, no new wake amplification.
8. **Consumer parity before retiring any live Cotality read.** No shrink of Search / agent-history / building / media coverage.

---

## 9. PRODUCTION HOLDS — NOT CROSSED

- No schema migration applied · no backfill executed · no production data mutation · no R2 mutation · no deploy · no merge.
- `reset-sync` remains disabled; never run it.
- Neon **PITR is 6 hours** (live-verified 2026-07-05), not 7 days.
- Rollout order when authorized: **apply migration → verify → dry-run backfill → execute backfill → deploy audited SHA → verify SHA**.

---

## 10. EXACT NEXT ACTION

1. Strip `NON_AGENT_SENTINELS` semantics from `lib/idx/buyer-participation-mapper.ts`; keep raw preservation; relabel as observed-not-verified. Update its tests.
2. Census `Agent.trestle_mls_id` writers; establish verified provenance; add tests.
3. Replace URL-path-parsing identity in `lib/idx/media-sync.ts` with structured provider fields, or prove the URL contract from Cotality.
4. Media duplicate-authority resolution with full call-graph tracing.
5. Source/visibility conflation sweep.
6. Re-run the full grouped battery + all compliance gates.
7. **One** commit, **one** push, rewrite the PR body once to the final SHA.

---

## 11. #618 SEARCH ENGINE — PENDING PROTECTED-BOUNDARY REQUIREMENT (2026-08-26)

**One env var is required and has NOT been set. It needs Maya's authorization.**

| Item | Value |
|---|---|
| Variable | `SEARCH_CONTINUATION_SECRET` |
| Purpose | HMAC seal for the Search pagination continuation token |
| Minimum | 32+ random bytes; any string ≥16 chars is accepted by the code |
| Scope | Preview first. Not Production — Production is a separate authorization. |
| Status | **NOT SET.** Runtime mode is `bounded_rescan`. |

### Why it is needed

The continuation token carries a keyset position — sort key, phase, boundary
value, boundary `ListingKey`, survivors consumed. It grants no access to
unauthorized listings (criteria, Mallan return-copy suppression, distribution
gates and dedupe are all re-applied server-side on every request), but it does
control **which authorized rows a broker is told belong to the next page**.
Silently altering or skipping a brokerage result sequence is an integrity
problem in its own right, so the token is sealed or it is not offered.

### Why an existing secret was not reused

The repo has exactly three HMAC authorities and all are business-specific:

- `lib/auth/reset-token.ts` — password reset
- `lib/email/unsubscribe-token.ts` — CAN-SPAM one-click unsubscribe
- `lib/tracking/listing-token.ts` — per-lead click tracking, and it **falls back
  to `CRON_SECRET`**, the cron endpoint-authorization secret

Keying a public, high-volume read path off any of those would tie unrelated
rotation schedules together and, in the `CRON_SECRET` case, collapse a
privileged-execution secret into anonymous traffic. `SESSION_SECRET` and
`NEXTAUTH_SECRET` are referenced in code but appear in **no** `.env.example` and
**no** Vercel env backup, so they are not provisioned either.

### Behaviour until it is set — fail-closed, not degraded-silently

- `isContinuationAvailable()` returns `false`
- no token is minted, so the tamperable surface does not exist unsigned
- the response reports `continuationAvailable: false`,
  `continuationMode: "bounded_rescan"`
- deep sequential traversal falls back to the bounded rescan, which is bounded
  by `PROVIDER_READ_CEILING` (60,000 provider rows per request)

**Consequence, stated plainly:** until this is authorized, a result universe
larger than roughly 60,000 provider rows cannot be paged to its end. The
response says so rather than pretending otherwise.

### Search consistency contract (provider fact, not a Mallan choice)

Verified live 2026-08-26: the Cotality service exposes EntitySets only — no
`$delta`, no `deltatoken`, no snapshot endpoint — and `@odata.nextLink` is a
plain `$skip=N`.

| Condition | Guarantee |
|---|---|
| Provider universe stable between requests | No duplicates, no gaps |
| Provider mutates between requests | Live-moving universe: a row whose sort value moves behind the boundary is missed; one that moves ahead may repeat |
| Provider snapshot isolation | **UNAVAILABLE** |

Keyset removes distance-from-start instability. It cannot freeze a live feed and
no cursor design can. Compare/CMA selections are therefore durable by
`ListingKey`, never by position.
