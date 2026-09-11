# Ownership authority + behavioural proof (2026-09-09)

Answers the two cautions in Maya's review:

> *"The expiration ownership predicate is still structurally wrong… `rls_eligible=false` still does not prove
> Mallan ownership. That remains a future corruption risk and needs a negative behavioral test."*
>
> *"Several tests are still source-text tests, not functional proof… The final proof must execute the query/DTO
> behavior and verify returned records — not merely match source text."*

The migration remains held. Nothing was migrated, committed, or pushed.

---

## 1. `rls_eligible = false` is not proof of ownership — fixed

**Why the old rule was wrong.** `rls_eligible` is an *input* to `computeGateColumns`
(`lib/idx/trestle-mapper.ts:908`, `const rls_eligible = input.rls_eligible !== false`), not a provenance fact the
feed asserts. Its meaning is "commercial / website-only, not RLS inventory". Trestle never serializes it, so a
pure feed row defaults to `true` — but nothing structurally stopped a third-party **commercial** row from being
ingested with `false`, and the moment one was, it would be classified Mallan-owned. The listing-expiration cron
would then write `expiration_date`, `idx_display_yn` and `modification_timestamp` onto another brokerage's
listing, and send that brokerage's agent a "your exclusive is expiring" email. That is the exact hazard the
cron's own header says it was fixed to prevent.

**The one canonical rule** now lives in `lib/listings/exclusive-agent-assignment.ts`:

- the `SL-`/`RL-` prefix stays definitive on its own, because Mallan's CRM assigns it and the feed cannot mint one;
- the `rls_eligible === false` arm additionally requires the **absence of provider provenance**
  (`last_synced_from_trestle`, `list_office_mls_id`, `mls_id`).

`isMallanExclusiveListing`, `isMallanLocalListing` and `buildMallanOwnedListingWhere` all delegate to it, so the
three implementations can no longer drift. `classifyDbListing` was also corrected: its `website-only` branch ran
*before* the canonical check, so narrowing the canonical check alone would have been a no-op and a third-party
commercial row would still have carried the "Mallan Exclusive" badge on the homepage — a 19 NYCRR 175.25 claim
about another brokerage's listing.

**Verified read-only against production (27,031 listings).** Pure future-safety tightening, zero behaviour change
on current data:

| Measure | Rows |
|---|---:|
| `rls_eligible = false` | 7 |
| …of those carrying the Mallan `SL-`/`RL-` prefix | 7 |
| …of those carrying any provider provenance | 0 |
| Rows selected by the OLD rule | 7 |
| Rows selected by the NEW rule | 7 |

## 2. The negative test, verified red before green

`tests/runtime/mallan-ownership-authority.test.ts` — 12 tests. Nothing in it matches source text.

- A third-party **commercial** row (`rls_eligible = false`, Trestle-synced, foreign office) is not Mallan-owned.
- Each provenance signal alone disqualifies ownership.
- The in-memory predicate and the Prisma `where` form are driven over the **same** fixture rows and must agree
  row-for-row, so the two forms cannot drift apart silently.
- The **real listing-expiration cron handler is executed** against an in-memory Prisma that evaluates the `where`
  it is actually given. The test then inspects which listings received a `ProtectedPeriod` and which rows were
  updated. Only the Mallan rows are touched.

**Proof it catches the defect:** reverting the predicate to the old rule turns **8 of the 12 red**; restoring it
returns all 12 green. It was watched failing before it was accepted.

## 3. Source-regex assertions replaced with behaviour

| Test | Was | Now |
|---|---|---|
| `r2-lifecycle-validator` | grepped media-sync for the literal `MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES.map((p) =>` | executes `buildMallanOwnedListingWhere()` and checks the prefix branches **are** the canonical export |
| `media-sync-r21-mirror-policy` | asserted the exact `OR` shape, including the wrong bare `{ rls_eligible: false }` arm | runs the `where` over fixture rows and proves the third-party commercial row is refused |
| `off-feed-presence-contract` (Closed DOM) | claimed "every surface" because four files contained `getCurrentDom`/`marketDom` | executes the shared public projection and inspects the DOM it returns; the file scan that remains is renamed to the narrow wiring claim it can actually support |

New shared helper `tests/helpers/prisma-where-evaluator.ts` lets any suite run a real `where` clause over fixture
rows. It **throws** on an unrecognised operator rather than defaulting to "matches", so a new clause can never
silently evaluate to "selects everything" and turn a regression green.

**The false pass that prompted this was real and is fixed.** A regex matched `idx_display_yn: true` in the
compliance-audit route's `select` list rather than its `where` clause. Patterns are now anchored to the where
clause, which is what put that test back to red before the route was fixed.

## 4. Green

| Check | Result |
|---|---|
| `npx jest` (full, one non-overlapping run) | 497 suites, 8,842 passed, 0 failed |
| `npx tsc --noEmit` | 0 errors |
| `rls:validate` | 0 errors, PASS |
| `compliance-check` | 95 passed, 0 failed |
| `ucba:audit` | 0 REGRESSIONS |
| `idx:validate` | 0 critical |
| `crm:test` | 37/37 |

Five failures surfaced by the first integrated run were all fixed: the `Off Market — reason unknown` label in the
portal test, the two source-regex tests above, a dead primary key in the sale form's `BackOnMarketDate` field map
(it worked only through its fallback), and a Cotality boundary-ratchet violation in the new prospects comps route,
which now interprets provider rows through the canonical lifecycle instead of reading `StandardStatus` and
`PropertyType` directly.

## 5. Known remaining, not done

A read-only survey found **seven** implementations of the ownership concept, not three. Three were collapsed and
`classifyDbListing` was corrected. These remain and are recorded rather than silently left:

- `lib/featured/featured-ordering.ts:61` and `lib/idx/public-dto.ts:377` read ownership **transitively** through
  `_source === 'exclusive'`. Both are now fed correctly by the fixed `classifyDbListing`, so the homepage badge
  exposure is closed, but neither reads the canonical rule directly.
- `lib/open-houses/upcoming-open-houses.ts:67` still reads `rls_eligible === false` directly.
- Inline duplicates in `lib/search/public-listing-db.ts:227`, `app/listing/[...slug]/page.tsx:462,567`.
- `lib/search/public-listing-db.ts:333` (`sort=exclusives`) still uses the `agent_id != null` signal the charter
  forbids. Its own field registry admits this.
- **Pre-existing data drift:** `listing_search_projection.is_exclusive` is true on 40 rows while only 7 listings
  satisfy the canonical rule. The 33 extras are Mallan RLS return-copies written under the old `agent_id` rule;
  one carries office `51`, which is not Mallan's office at all. Historical, not ongoing — the projection writer
  now uses the canonical helper. It is a data correction and therefore held with the migration.
- `lib/media/media-coverage-bucket.ts:73` cannot see provenance columns; tightening it needs a signature change.

**On absent provenance columns.** Several read paths (for example `/api/listings`) do not select the provenance
columns. There the predicate reads `undefined`, treats it as "no provenance", and returns the same answer as
before. That direction is deliberate and documented in the code: for media authority the fail-closed answer is
"Mallan-owned", because a Mallan listing whose photos an agent deleted must never resurrect from the legacy JSON.
The database `where` form is unaffected, because SQL evaluates the real column values. Do not "fix" the in-memory
default into a throw or a fail-open without widening every caller's select first.
