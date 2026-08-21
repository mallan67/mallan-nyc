# Handoff — authenticated backend Search (#618)

**Head `b064ea66` · 26 commits ahead of production `a0db2dac` · draft, preview-only.**
Public consumer Search is **zero-delta** against production and must stay that way.

---

## HARD RULES IN FORCE

1. **Public consumer Search is OUT OF SCOPE and zero-delta** — `app/search`,
   `SearchFilterPanel`, `/api/listings`, `lib/search/public-listing-*`,
   `lib/search/types.ts`. Verify with a `git diff` against production before every commit.
   It may be read as *evidence*; it may not be modified.
2. **`public/crm/**` IS in scope** — that is the authenticated CRM frontend. Do not confuse
   the directory name with the public product.
3. **No production Neon during the acceptance hold.** Preview never proves Production.
   Anything needing Neon is marked UNVERIFIED, never guessed.
4. No schema change, migration, backfill, env change, destructive DB/R2 op, or production
   deploy without explicit Maya authorization.
5. **Live authenticated Cotality is the only provider-data authority.** No field is VERIFIED
   from metadata existence, an old audit, a committed census, or a code comment.
6. **RED first.** Prove the defect against the current head before correcting it.
7. **THE COTALITY API IS THE ONLY SOURCE.**
   REBNY RLS is the MLS / rules body the listing is filed with. It is NOT the API, NOT the
   source of any field, and NOT an architectural source term. Never write "Cotality/RLS" as
   though they were one system contract. Write `Cotality ListingId`, never "RLS ListingId" —
   the field belongs to the Cotality API contract.
   - Where a Cotality response carries a raw historical string (e.g. `ListingId` values
     prefixed `RLS…`, or `OriginatingSystemName = RLS`), **preserve it exactly at the
     provider boundary** as provenance — and never promote it into a Mallan layer, provider
     name, documentation taxonomy or new code.
   - "REBNY RLS" stays only where it genuinely means REBNY as a body (its rules, UCBA,
     display obligations, a provider-health tracker), and in EXISTING identifiers that
     cannot be renamed without a schema or public-surface change — `rls_eligible`,
     `rls:validate`, `isMallanRlsReturnCopy` (already documented as legacy naming).
   - This was corrected on 2026-08-21 after these documents repeatedly said "RLS ListingId"
     and "RLS display gates", treating the MLS body as the data source.

### Safe invocation for any verification script

```
vercel env run -e preview --git-branch=fix/neon-p0-event-driven-wake-2026-08-16 -- npx tsx <script>
```

`-e production` injects the production `DATABASE_URL`, so any script importing Prisma
silently hits production Neon. That is how the first acceptance window was contaminated.
See `.cache/search-p0/SAFE-INVOCATION.md`.

---

## ARCHITECTURE ESTABLISHED

**Four authenticated workflows over ONE verified mapping layer:** SALE · RENTAL · CMA ·
BUILDING. Four UI/business contracts, not four engines and not one collector with tab
branching. Basic and Advanced are two depth-views of one criteria state.

**Authority hierarchy — do not add a second authority:**

| layer | role |
|---|---|
| `canonical/field-registry.ts` | THE Search mapping authority — owns the criterion |
| `canonical/amenity-vocabulary.ts` | subordinate exact-token table only |
| `data/cotality-live-token-census.json` | dated evidence, never authority |
| `scripts/search/verify-live-search-contract.mts` | verifies the registry against live Cotality |

**Factual authority is resolved per LISTING, not fixed per field.** `list_price` is
Mallan-authored on a local listing and Cotality-authored on third-party inventory.
`authorityResolution` is mandatory (`fixed` · `by_listing_authority` · `mallan_derived` ·
`unresolved`); a static `sourceAuthority` only where authorship is permanent.
`resolve-factual-authority.ts` resolves instances; `AttributionEnvelope` carries the answer.

**A suppressed Mallan-office representation may supply PROVIDER EVIDENCE ONLY.** Authorable
facts, Mallan-derived facts, CRM state, ACRIS facts and unresolved contracts are all refused
with `NON_CANONICAL_SOURCE`. Authorship and permission-to-supply are different things.

**UNRESOLVED is not a synonym for `mallan_derived`** and never acquires authority by
fallback.

---

## LIVE-VERIFIED FACTS (exhaustive unless stated)

| fact | evidence |
|---|---|
| `BuildingKey` / `BuildingKeyNumeric` | declared, **populated 0 of 8,056**; `GET /Building` → **403**. Building identity must be Mallan-derived |
| `Property.Permission` | **MULTI-enum** (`Multi.ListingPermission`); `IDX,SyndicateOptOut` occurs live; `OwnerOptOut` is NOT a member |
| bath components | `BathroomsHalf` non-zero on 2,023/8,103; quarter components present but **ZERO**; `BathroomsTotalInteger` is NOT a derivable function of the parts (best hypothesis 98.8%) → contract is `full + half/2` |
| `PropertyCondition` | populated **0/8,110** exhaustively — `renovated` unavailable |
| `NewConstructionYN` · `GarageYN` | live filterable Booleans (951 / 2,630) — the registry previously denied both |
| `PetsAllowedYN` | filterable but **populated ZERO** — the multi-enum parse must stay |
| `LivingAreaUnits` | `SquareFeet` on 8,104/8,104 — no normalization needed |
| Mallan-office rows | 35 total, **2 search-eligible**; `SourceSystemName`/`SourceSystemKey` **0/35** — no Mallan identifier round-trips |
| coordinates | Cotality **declares** `Latitude`/`Longitude`; usable population **UNVERIFIED**. Populated today by the **US Census** geocoder — never Google |

---

## THE TWO OPEN STRUCTURAL DEFECTS

### 1. Authenticated Search is provider-only — the primary conflict

`/api/idx/search` contains **no `prisma.listing` reference at all**. It is 100%
provider-sourced, takes `finalTotal` from `result.odataCount` (route.ts:323), and runs
`upsertBuildingFromSearchResult` on the live path (route.ts:207).

So a Mallan-authored listing reaches broker Search **only** through its Cotality
representation — which the listing-authority contract says to suppress. Two committed
contracts that cannot both hold.

> Applying suppression to `/api/idx/search` without sourcing the local canonical listing
> would REMOVE MALLAN'S OWN LISTINGS FROM MALLAN'S OWN BROKER SEARCH.

Required universe: local canonical + third-party Cotality − Mallan-office representations,
as ONE identity/count/pagination universe. Not "Cotality minus Mallan rows"; not two
searches merged in browser JS; **not a per-criterion fallback to Trestle**.

### 2. Source-class / audience eligibility

`PROJECTION_DISPLAY_GATE` begins `rls_eligible: true`, so **Mallan website-only local
listings (`rls_eligible=false`) are excluded** — that gate was shaped for alert replay and
public redistribution. Client-alert eligibility must not define what a broker can search.
One canonical query foundation with an audience policy; never two engines. **Do not change
that gate blindly.**

---

## COMPLETED

- Public Search reverted to production and the canonical layer decoupled from it
- `FIELD_REGISTRY` made the single authority; stale claims corrected from live
- Amenity semantic leak closed — `Concierge` never becomes `doorman`, and no substitute
  observation key is invented either
- `Permission` multi-enum unified across reader (`gates.ts`) and writer (`trestle-mapper`),
  compliance owning the token primitive
- Bath contract frozen on exhaustive evidence; rendered to Prisma AND OData from one definition
- Provenance model: `authorityResolution` + instance resolver + typed `AudienceObligation`
- **Suppression & location impact graph** — 42 traced consumer rows
- **Projection capability gap matrix** — 39 controls extracted mechanically
- **Projection-gate suppression fix** (RED-first) — reuses `excludeMallanRlsReturnCopies()`
  through the existing `listing` relation; fixes Saved Search count/execute and alert replay
- Behavioural source-class tests + execution proof that `findMany`/`count` share one predicate
- Live contract verifier, proven to FAIL on injected drift
- Committed-tree import scanner (catches the class that broke the build once)

`type-check` 0 · search+compliance+api **1,249/1,249** · compliance-check 95/0 ·
`rls:validate` UNKNOWN 0 · `ucba:audit` 0 REGRESSIONS

---

## NEXT, IN ORDER

1. **`propertySubType` translator** — column exists and is populated; only the translator is
   missing. Use **verified live enum semantics**; do NOT copy the current
   `contains(PropertySubType, …)` behaviour.
2. **`listingId` as identity resolution** — NOT a scalar filter. Classify the provider ID,
   resolve the canonical twin for a Mallan-office representation, return the LOCAL listing;
   no-twin/ambiguous stays suppressed with an integrity defect. Otherwise searching your own
   Cotality `ListingId` returns ZERO. Note the VALUES carry a raw `RLS…` prefix — that is
   provider provenance, not evidence that the field belongs to REBNY RLS.
3. Remaining A/B translator gaps (arbitrary year range).
4. Inspect C/D facts before promoting anything — no schema growth is justified by the matrix.
5. **Live census of the E rows**, in order: achieved rent (`LeaseAmount` /
   `TotalActualRent`) · assessment (`TaxOtherAnnualAssessmentAmount`) · price/SF
   (`CustomProperty.PricePerArea` + unit) · owner opt-out writer · maintenance FAMILY (fees +
   frequencies + `CommonInterest`) · NYC geography · `Latitude`/`Longitude` population.
6. Define source-class-aware Search eligibility (defect 2).
7. One authenticated result DTO + sort + pagination contract. Do NOT copy
   `crm-idx-mapper.ts` into a second projection mapper. Sorting must run on the canonical
   universe BEFORE page boundaries.
8. Population readiness + freshness gates.
9. **Only then** cut `/api/idx/search` over.

Also queued: campaign identity boundary (`/api/crm/listing-campaigns` resolves a raw
client-supplied `listing_id` with no identity check — a caller can address the suppressed
duplicate directly); Media identity-then-authority; the design exploration (durable under
`docs/search/`, prototypes in `.cache/`).

---

## CI

#618 is stacked on the **moving** #620 branch. CI tests the synthetic merge, so a #620
failure appears red on #618, and **a rerun replays the same merge rather than recomputing
it**. Diagnose by reading the merge-ref parents:

```
git fetch origin refs/pull/618/merge:refs/remotes/pr618merge --force
git log -1 --format=%p refs/remotes/pr618merge
```

Production is the only frozen SHA. Never hard-code either moving head.

---

## KEY DOCUMENTS

- `docs/search/SEARCH-P0-CRITERIA-MATRIX-2026-08-19.md`
- `docs/search/MALLAN-RETURN-COPY-RECONCILIATION-EVIDENCE-2026-08-21.md`
- `docs/search/SUPPRESSION-AND-LOCATION-IMPACT-GRAPH-2026-08-21.md`
- `docs/search/PROJECTION-CAPABILITY-GAP-MATRIX-2026-08-21.md`
- `.cache/search-p0/SAFE-INVOCATION.md` · `PRODUCTION-TRAFFIC-RECORD.md` (gitignored)

---

## RECURRING FAILURE MODES FROM THIS SESSION

Worth reading before continuing — each cost a correction cycle:

- **Asserting a mechanism instead of reading one.** "Google geocoding" was invented; the repo
  uses US Census. Same class as `achieved_rent = mallan_derived` before probing `LeaseAmount`.
- **Trusting a code comment as field truth.** "Cotality supplies no coordinates" came from a
  comment, not a probe.
- **Hand-summarising an inventory.** "29 controls" hid 10 range-table controls, five of which
  were then filed as unsupported. Extract mechanically.
- **String assertions passed off as behavioural proof.** Asserting a `where` contains `"SL-"`
  proves nothing about row inclusion.
- **Committing working-tree state that isn't yours.** Broke the build once by staging a file
  importing an untracked module; `type-check` and `jest` both passed locally.
- **Solving a leak by relocating it.** Removing `doorman` and inventing `concierge-present`
  created a second unregistered vocabulary.
- **Letting the MLS body drift into the source name.** Three documents said "RLS ListingId",
  "RLS display gates" and "the system contract is Cotality/RLS". The Cotality API is the only
  source; REBNY RLS is a rules body. Raw `RLS…` values in a response are provenance to
  preserve at the boundary — never a licence to name the source that way. This is the
  CLAUDE.md STOP GATE rule, and it eroded gradually rather than in one wrong statement,
  which is what made it hard to notice.
