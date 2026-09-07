# STEP 3 — FORBIDDEN-AUTHORITY AND COMPETING-SEARCH LEDGER

> **EVIDENCE ONLY — NOT product/system authority.** This file records an impact graph. It does
> not define architecture, requirements or plan. Decisions and status belong in the canonical
> execution-state authority. Do not turn this into a master plan.
>
> **Tree of record:** `search/browser-integration-2026-09-05` @ `60817b3d` (pushed, Preview READY).
> Every Cotality name below is verified against the live authorized API. Mallan-owned concepts
> are labelled **MALLAN**. Unverified items are labelled **UNVERIFIED** and drive nothing.
>
> **No Step 4 deletion is authorized by this document.**

---

## PART 1 — DISPLAY-GATE CONTRADICTION — **OPEN**

### 1.1 Accepted as PROVEN

- Mallan defines `Draft` / `Incomplete` / `Pending` / `Hold` as non-public lifecycle statuses.
- `computeGateColumns` (`lib/idx/trestle-mapper.ts`) can write `idx_display_yn = true` for them
  because it excludes only **terminal** statuses.
- The canonical public DTO separately **allowlists** `Active` / `ComingSoon` /
  `ActiveUnderContract` (`lib/idx/db-to-public-dto.ts:247`, applied `:315`) and therefore
  rejects `Pending`.
- **No `Pending` production mutation is authorized.** Measured read-only: Active 7,595 ·
  Withdrawn 6,975 · Closed 6,090 · **Pending 5,799** · ComingSoon 7.

### 1.2 Explicitly NOT proven — gate correction stays OPEN

- ❌ That **every** consumer of `idx_display_yn` independently enforces status.
- ❌ That `lib/compliance/public-listing-filter.ts` is safe to delete on a zero-consumer grep
  alone. A static grep does not exclude dynamic import, string-keyed access, re-export, or
  reference from generated/held surfaces. **Deletion requires a negative test.**

### 1.3 The three enforcers (semantics differ)

| Enforcer | File:line | Mechanism | `Pending` | Static consumers |
|---|---|---|---|---|
| `DISPLAYABLE_STATUSES` | `lib/idx/db-to-public-dto.ts:247` | **ALLOWLIST** | rejected | **4 live** |
| `PUBLIC_LISTING_GATE` | `lib/compliance/public-listing-filter.ts:24` | **DENYLIST** `notIn TERMINAL_STATUSES` | **would pass** | 0 found — UNPROVEN |
| `PORTAL_LISTING_GATE` | `lib/compliance/public-listing-filter.ts:40` | **no status check** | **would pass** | 0 found — UNPROVEN |

Live readers of the allowlist: `app/api/listings/route.ts:444,1409` ·
`app/api/listings/[id]/route.ts:249` · `app/api/agents/[slug]/listings/route.ts:313` ·
`lib/open-houses/upcoming-open-houses.ts:38`.

### 1.4 Collateral findings

1. `public-listing-filter.ts` `TERMINAL_STATUSES` (`:13`) lists `Sold`, `Rented`, `Cancelled`,
   `TemporarilyOffMarket` — **none is a live `StandardStatus` member** — and carries BOTH
   `Cancelled` and `Canceled`.
2. `DISPLAYABLE_STATUSES` allows `ActiveUnderContract`, which appears in **0 stored rows**.
3. `STATUS_DISPLAY` (`db-to-public-dto.ts:250`) maps `Sold`, not a live member.

---

## PART 2 — RESO

### 2.1 Distribution — 18,321 occurrences, 174 files

| Category | Files | Occurrences | Nature |
|---|---|---|---|
| Snapshot / generated | 16 | **17,192 (94%)** | false authorities + captured provider documents |
| CRM (**HELD**) | 30 | 598 | browser catalogue + forms |
| Docs | 43 | 234 | terminology |
| Scripts | 22 | 154 | tooling namespace |
| **Application code** | **34** | **74** | see 2.2 |
| Tests | 23 | 46 | assertions + guards |
| Other | 6 | 23 | package.json, prisma comments |

### 2.2 Application code — **72 of 74 are COMMENTS**

Every occurrence in `lib/**`, `app/**`, `mcp/**` was read. Only **two** are code symbols:

| # | File:line | Symbol | Responsibility | Readers | Writers | Class | Destination |
|---|---|---|---|---|---|---|---|
| 1 | `lib/compliance/rebny-validator.ts:40,147` | `compliance.reso: boolean` | **Date-format check** — its own comment says "RESO is vocabulary only — this is a format check, not an authority" | **NONE found.** `grep compliance.reso` → 0 hits. **Write-only field** | `:147` `reso: resoCompliant` | **TERMINOLOGY + dead output field** | Rename to what it measures (`dateFormat`) or remove. Requires negative test — a write-only field may be consumed by an untyped browser reader |
| 2 | `mcp/trestle-fields/index.ts:170,176,192,430,654` | namespace parsing + `standardName` | Parses the provider's raw type namespace to classify enums; surfaces the provider annotation | MCP tool output | — | **RAW PROVIDER DATA at L1** | Legitimate raw-boundary parsing. The literal must be constructed programmatically so the token does not appear in the tree |

**The other 72 are prose.** Representative: `lib/compliance/dto.ts:20`, `index.ts:5`,
`rebny-validator.ts:7`, `rls-enforcement.ts:12`, `lib/crm/listing-form-mapping.ts:15` all carry
the banner *"RESO = vocabulary only"* — a doctrine line that is itself the thing being retired.

**Already removed on the lane (verify before citing older audits):**
- `lib/idx/mapping.ts` **does not exist** — `mapRESOToInternal` is gone.
- `lib/compliance/rebny-ucba-rules.ts:19` records that the *"RLS overrides RESO/IDX"* authority
  order is **obsolete**; `rebny-validator.ts:20` records the *"UCBA > RLS > RESO/IDX > Internal"*
  order is **deleted**. The 6-tier doctrine reported in a main-based audit is **already gone here**.

### 2.3 The 94% — false authorities vs captured documents

| Artifact | Occ. | Actual responsibility | Class | Replacement |
|---|---|---|---|---|
| `artifacts/metadata.xml` | 14,553 | captured `$metadata`; **PROVEN STALE** (2,005,977 B vs live 1,946,777 B) | **CAPTURED PROVIDER DOC used as authority** | Live `$metadata` via the single Cotality authority. **Cannot be refreshed** — a live pull reintroduces the token |
| `compliance/lookups.json` | 1,994 | picklist snapshot, literal `"reso"` key per value | **FALSE AUTHORITY** | live `Lookup` via `lib/cotality/live-contract.ts` |
| `compliance/fields.json` | 449 | field snapshot + `_meta.resoToRlsRenames` | **FALSE AUTHORITY** | same |
| `data/rebny-rls-property-fields.csv` | 63 | 902-field snapshot | **FALSE AUTHORITY** | same |
| `data/rebny-rls-property-lookup.csv` | 2 | picklist snapshot | **FALSE AUTHORITY** | same |
| `artifacts/schema-audit.{md,json}` | 111 | generated by `scripts/reso/schema-audit.js` | **GENERATED OUTPUT** | delete with its generator |
| `compliance/rules/reso-rls-renames.json` | 4 | **0 of 23 renames valid** (13 would corrupt, 5 fiction, 5 would 400) | **FALSE AUTHORITY** | **DELETE, no replacement** — Cotality returns fields under the names it returns them under |

**Blocking dependency (unchanged):** `scripts/idx-validate.js` (`:203,214,336,406`) and
`scripts/test-rls-bindings.js` (`:59,73`) READ the CSVs and `metadata.xml`, and both are in the
required pre-commit chain. `mcp/trestle-fields/index.ts:36,331` falls back to `metadata.xml`
silently on any non-2xx — the banned snapshot-as-authority pattern; correct behaviour is to fail
loudly. **Snapshots cannot be deleted until those readers are migrated.**

---

## PART 3 — REALPLUS

### 3.1 Application code: **ZERO**

No `lib/**`, `app/**`, `src/**` file contains any spelling. Remaining occurrences are:
docs/compliance prose (~90), **guard tests that assert its absence**
(`tests/runtime/provider-authority-census.test.ts` ×8,
`mallan-listing-architecture-guardrail.test.ts` ×1, `cotality-reference-doc-guard.test.ts` ×1),
`public/crm/data/search-fields-schema.json` ×1 (**HELD**), `compliance/rules/active.json` ×1.

The guard tests are **allies** — they must be UPDATED to keep banning the term, never deleted.
`cotality-reference-doc-guard.test.ts` **positively asserts a doc CONTAINS the literal**, so
stripping the doc without updating the test turns CI red.

### 3.2 The derivative concept — `rebnyListingUrl`

| | |
|---|---|
| **Definition** | `lib/crm/listing-urls.ts:77` — `const rebnyListingUrl = isActive ? publicUrl : null;` |
| **Actual responsibility** | It **is `publicUrl`**, nulled unless status ∈ {Active, ComingSoon, ActiveUnderContract}. Carries **no distinct information**. |
| **Cotality field?** | **NO.** No such field exists. |
| **Mallan-owned field?** | **NO** — not a stored column. `grep -rin "real ?plus" prisma/` → 0. Computed per request. |
| **Genuine REBNY requirement?** | The **workflow** is real: the agent needs the public listing URL to supply to REBNY for an Active listing. The **field** is not — it duplicates `publicUrl`. |
| **Writers** | `app/api/crm/listings/route.ts:645,664` · `crm/listings/[id]/route.ts:589` · `crm/listings/[id]/status/route.ts:395` |
| **Readers** | `public/crm/SALE-FORM-REDESIGN.html:8122-8140` — read-only copy input `#saleRebnyListingUrlInput`, rendered only when `finalStatus === 'Active'` (**the browser already re-checks Active at `:8123`**) |
| **Tests** | `lib/crm/__tests__/listing-urls-address-gate.test.ts` (4 assertions) · `lib/crm/listing-publish-contract.ts:6` |
| **Class** | **DUPLICATE** of `publicUrl` + status |
| **Destination** | Browser consumes `publicUrl` and keeps its existing Active check; drop the server field |
| **Downstream breakage** | The sale form's copy panel; `listing-publish-contract.ts`; 4 test assertions |
| **Proof before removal** | Direct test that the form still renders the URL for Active; negative test that no response key by that name returns; **`public/crm/**` is HELD — migration must be authorized** |

---

## PART 4 — RLS-AS-PROVIDER

### 4.1 `rls_eligible` — **PROVEN TRUE COMPLIANCE. KEEP.**

`lib/compliance/rls-eligibility.ts:11-15` defines it as **UCBA Art. I §5(F)** distribution
eligibility:

- Mixed-use ≤5 units → RLS-eligible per UCBA §5(F)
- Mixed-use >5 units → website-only
- Pure commercial → website-only
- Explicit opt-out (`rls_eligible=false`) → website-only

| | |
|---|---|
| Columns | `prisma/schema.prisma:462` (`Listing`), `:2623` (`ListingSearchProjection`); indexes `:590`, `:2647` |
| Meaning | **May this listing be distributed to REBNY RLS** — a compliance obligation |
| Class | **TRUE COMPLIANCE (L5)** |
| Action | **KEEP the name and the columns. No schema change. No migration.** |

This is precisely the permitted meaning of RLS. Same verdict for `lib/compliance/rls-eligibility.ts`.

### 4.2 `lib/compliance/rls-enforcement.ts`

Write-path validation (mandatory fields, content scanning). Carries its own
`TERMINAL_STATUSES = new Set(["Closed"])` (`:222`) — **one member only**, so `Expired`,
`Withdrawn` and `Canceled` pass its check. Class: **TRUE COMPLIANCE with a defective status set**.
Action: keep the module, reconcile the status set in the Part 1 gate work. **UNVERIFIED:** its
full reader list.

### 4.3 Provider-shaped RLS still to classify

`lib/idx/auth.ts:2` — *"OAuth2 client credentials flow for Trestle/REBNY RLS API"* → **RLS-as-API,
must go (comment only)**. Plus the provider-literal boundary items:
`OriginatingSystemName = "RLS"` (591,550/591,550 rows), `OriginatingSystemSubName = "RLS_REBNY"`,
`ListingId` prefix `RLS…`, and `app/api/cron/feed-reconcile/route.ts` `listing_id startsWith "RLS"`
— **RAW PROVIDER DATA**, to be interpreted once at the adapter and never re-derived by consumers.
**Do NOT rewrite provider `ListingId` values.**

---

## PART 5 — IDX-AS-PROVIDER

### 5.1 `lib/idx/**` responsibility split (measured)

| File | Lines | odata refs | fetch() | Actual responsibility | Class |
|---|---|---|---|---|---|
| `auth.ts` | 121 | 0 | 1 | OAuth token acquisition + cache | **CANONICAL — already the sole token authority** |
| `fetch.ts` | 765 | 15 | 1 | second HTTP client + query builder | **DUPLICATE** → engine `provider-client.ts` |
| `sync.ts` | 2,903 | 6 | 4 | listing ingestion | CONSUMER — keep, migrate transport |
| `media-sync.ts` | 4,470 | 11 | 2 | media ingestion | CONSUMER — keep, migrate transport |
| `media-pagination.ts` | 68 | 2 | 0 | media paging only | **SPECIALIZED** — distinct semantics, keep |
| `cursor/keyset-cursor.ts` | 110 | 0 | 0 | keyset cursor | **SPECIALIZED** — keep |
| `trestle-mapper.ts` | 1,288 | 0 | **0** | provider→Mallan mapping | **CANONICAL mapper — no HTTP, clean separation** |
| `cotality-telemetry.ts` | 166 | 1 | 0 | telemetry | fold into the single client |

**`Cotality OAuth authority = 1` is ALREADY MET** — every authenticating path imports
`lib/idx/auth.ts`.

**IDX Plus that legitimately stays:** the licence entitlement (`Trestle-11371-20`, DataSystem
`Name` = "IDX Plus feed for Mallan Real Estate Inc"), IDX display rules, `idx_display_yn` as a
compliance gate. **Directories are NOT to be renamed blindly** — the split above is by
responsibility, not by folder.

---

## PART 6 — COMPETING PROVIDER / SEARCH PATH CENSUS

Every file on the lane touching the Cotality OData surface. `client` = token source.
`query` = who builds the OData query.

### 6.1 BACKEND — actionable in this program

| # | Path | Resource | Client | Query | Class | Destination | Negative test required |
|---|---|---|---|---|---|---|---|
| B1 | `lib/search/engine/provider-client.ts` | — | idx/auth | **engine** | **CANONICAL** | — | — |
| B2 | `app/api/crm/sales/prospects/[id]/comps/route.ts` | Property | idx/auth | **OWN** | **DUPLICATE** | `executeSearch()` | own query builder cannot return |
| B3 | `app/api/crm/sales/prospects/[id]/research/route.ts` | Property | idx/auth | **OWN** | **DUPLICATE** | `executeSearch()` | same |
| B4 | `app/api/crm/sales/prospects/[id]/pitch-packet/route.ts` | — | idx/auth | **OWN** | **DUPLICATE** | `executeSearch()` | same |
| B5 | `app/api/crm/sales/prospects/[id]/pdf/route.ts` | — | idx/auth | **OWN** | **DUPLICATE** | `executeSearch()` | same |
| B6 | `app/api/cron/prospect-triggers/route.ts` | Property | idx/auth | **OWN** | DUPLICATE | engine client | same |
| B7 | `app/api/cron/feed-reconcile/route.ts` | Property | idx/auth | **OWN** | CONSUMER (ingestion) | engine client; **also holds `startsWith("RLS")` → adapter** | provider-literal check cannot recur outside the adapter |
| B8 | `app/api/buildings/search/route.ts` | Property | idx/auth | **OWN** | **OBSOLETE — `Building` is HTTP 403** | Property address fields or **MALLAN** | route cannot query a `Building` resource |
| B9 | `lib/idx/fetch.ts` | Media, Property | idx/auth | idx/fetch | **DUPLICATE client** | engine `provider-client.ts` | second client cannot be reached |
| B10 | `lib/idx/media-sync.ts` | Media, Property | idx/auth | **OWN** | CONSUMER | engine client | — |
| B11 | `lib/idx/sync.ts` | Media | idx/auth | idx/fetch | CONSUMER | engine client | — |
| B12 | `lib/idx/one-cycle-preflight.ts` | — | — | idx/fetch | CONSUMER | engine client | — |
| B13 | `lib/idx/cotality-telemetry.ts` | — | — | idx/fetch | CONSUMER | fold in | — |
| B14 | `lib/idx/media-pagination.ts` | — | — | idx/fetch | **SPECIALIZED — keep** | — | — |
| B15 | `lib/search/canonical/live-truth.ts` | **Lookup** | — | OWN | **DUPLICATE vocabulary reader** | `lib/cotality/live-contract.ts` | two readers cannot coexist |
| B16 | `lib/search/canonical/field-registry.ts` | OpenHouse | — | OWN | DUPLICATE field registry | same | same |
| B17 | `lib/market-report/generator.ts` | — | — | idx/fetch | **OBSOLETE — type filters not live** | delete | filters cannot return |
| B18 | `lib/listings/mallan-form-contract.ts` | — | — | OWN | **MALLAN** form contract | keep | — |

### 6.2 SHARED — actionable only with public non-regression proof

| # | Path | Resource | Query | Class |
|---|---|---|---|---|
| S1 | `app/api/media/batch/route.ts` | Media | OWN | CONSUMER |
| S2 | `lib/open-houses/upcoming-open-houses.ts` | OpenHouse, Property | OWN | SPECIALIZED CONSUMER |
| S3 | `app/api/open-houses/route.ts` | OpenHouse, Property | idx/fetch | CONSUMER |

### 6.3 PUBLIC — evidence only, DO NOT MUTATE under this backend scope

| # | Path | Resource | Query |
|---|---|---|---|
| P1 | `app/api/listings/route.ts` | OpenHouse | idx/fetch |
| P2 | `app/api/listings/[id]/route.ts` | — | — |
| P3 | `app/api/listings/similar/route.ts` | Property | idx/fetch |
| P4 | `app/api/listings/suggest/route.ts` | — | idx/fetch |
| P5 | `app/api/listings/building/route.ts` | Property | **OWN** |
| P6 | `app/api/market/route.ts` | Property | **OWN** |
| P7 | `app/api/agents/[slug]/listings/route.ts` | Media | idx/fetch |
| P8 | `lib/buildings/public-building-data.ts` | Property | **OWN** — Building is 403 |
| P9 | `lib/search/public-listing-trestle.ts` | — | idx/fetch |

### 6.4 Authority counts on the lane

| Responsibility | Target | Actual |
|---|---|---|
| Cotality OAuth | 1 | **1 ✅** `lib/idx/auth.ts` |
| Cotality HTTP client | 1 | **3 families** — engine (1), `idx/fetch` (9 consumers), OWN (11) |
| Query builder | 1 | **3 families**, 11 hand-rolled |
| Pagination | 1 | 3 — engine `walkProvider`, `media-pagination`, `keyset-cursor` (**two are legitimately distinct**) |
| Vocabulary reader | 1 | **2** — `cotality/live-contract.ts`, `search/canonical/live-truth.ts` |
| Provider→Mallan mapper | 1 | **2** — `idx/trestle-mapper.ts`, `search/crm-idx-mapper.ts` (`lib/idx/mapping.ts` already gone) |
| Backend Search executor | 1 | **1 ✅** `executeSearch()` — but 6 backend routes bypass it |

### 6.5 UNVERIFIED — must not drive any deletion

- Full reader set of `lib/compliance/rls-enforcement.ts`.
- Whether `compliance.reso` is read by any untyped browser consumer.
- Whether `PUBLIC_LISTING_GATE` / `PORTAL_LISTING_GATE` are reachable dynamically.
- Exact resource for B4/B5 (`pitch-packet`, `pdf`) — they authenticate but no `odata/<Resource>`
  literal was found; they may compose queries indirectly.


---

## PART 7 — `Property.Permission` = `Private` → `participant_only` (OWNER RULING 2026-09-07)

### 7.1 The ruling, and what the verified contract supports

| Statement | Status |
|---|---|
| **`Private` is a Cotality `Property.Permission` value** | **VERIFIED** against the authorized contract. `ListingPermission` publishes 18 members and `Private` is one of them. Live `Lookup` query, `ResourceName eq 'Property' and FieldName eq 'Permission'`. |
| **Mallan interprets `Private` as REBNY members / participants only** | **OWNER RULING.** This is a Mallan/REBNY **compliance** interpretation of a provider fact — not a provider-published meaning. |
| **`participant_only` is derived from `Permission` TOKEN MEMBERSHIP** | Implemented in `derivePermissionGates`. `Permission` is a Multi-Enum (`NumOccurrences = 20`), so `'IDX,Private'` is participant-only exactly as `'Private'` is. Equality would be structurally wrong. |
| **`owner_opt_out` is NOT derived from `Private`** | The two are **separate decisions and must never be conflated**. `OwnerOptOut` is not a published `ListingPermission` member and `MlsStatus` carries no such sentinel (both verified live), so **no provider fact can express owner opt-out**. It remains Mallan-side only (`_mallanPermission`, `listings.owner_opt_out`). |
| **No meaning is inferred for any other `Permission` value** | Only `IDX` (display) and `Private` (participant-only) have proven meanings. Every other member fails closed for display and carries **no** Mallan decision. Any further member semantics must be **separately proven** against the authorized Cotality contract before being read. |

### 7.2 The contradiction that was closed

`mapTrestleToPrisma` hardcoded `participantOnly = false` for provider rows while
`lib/compliance/normalizer.ts derivePermissionBooleans` had always read the Mallan side as
`participant_only: mallanPermission === 'Private'`. The same token meant participant-only on one
side and nothing on the other. Both sides now resolve through the **one canonical interpreter**,
`derivePermissionGates`. Corrected in `4f742c0e`; stale authority text corrected in the
follow-up consistency pass.

### 7.3 READ-ONLY stored-row census — **ZERO mismatches, no backfill required**

Production `hidden-mountain-87248164`, branch `main`. `SELECT … GROUP BY` only. **No mutation.**

| Measure | Count |
|---|---|
| `listings` rows | **26,476** |
| rows with a `raw_data->>'Permission'` value | **22,293** (proves the JSON path resolves — the zeros below are genuine) |
| provider says `Private` | **0** |
| stored `participant_only = true` | **0** |
| **mismatch: provider `Private` but stored `false`** | **0** |
| **mismatch: provider not `Private` but stored `true`** | **0** |

Every distinct stored `Permission` value:

| value | rows | stored `participant_only=true` |
|---|---|---|
| `IDX` | 22,284 | 0 |
| `null` | 4,183 | 0 |
| `IDX,OfficeInactive` | **6** | 0 |
| `IDX,SyndicateOptOut` | **3** | 0 |

**Zero is proven, not assumed:** `Private` occurs in none of the four values present. Stored
`participant_only` is `false` on all 26,476 rows and is therefore already consistent with the
corrected rule. **No production correction is required today and none is authorized.**

### 7.4 Multi-value Permission is REAL in production — validates token membership

Nine stored rows carry comma-delimited Permission (`IDX,OfficeInactive` ×6,
`IDX,SyndicateOptOut` ×3). A 4,000-row live API sample showed only `IDX`; the stored corpus
exposes the multi-value form. **This is empirical proof that token membership — not string
equality — is the correct implementation.** Those 9 rows also correctly fail closed for display
(`idxPermitted = false`, since not every token is `IDX`).

### 7.5 Standing constraint

If `Private` ever appears in the feed, `participant_only` will be written `true` on the next sync
through `mapTrestleToPrisma`. A stored-row reconciliation for pre-existing rows remains
**authorization-held** and is not triggered by this census, which found nothing to reconcile.


---

## PART 8 — `lib/compliance/rls-eligibility.ts` (scoped closure)

### 8.1 Provider-looking values — every one verified live before retention

| Value | Field tested | Live? | Action |
|---|---|---|---|
| `CommercialLease`, `CommercialSale` | PropertyType | **VERIFIED** (13 members) | kept |
| `Residential`, `ResidentialLease` | PropertyType | **VERIFIED** | kept |
| **`Commercial`** | PropertyType | **NOT a member** | **branch REMOVED** — it *is* a live `PropertySubType`, a different field |
| `MixedUse`, `Office`, `Retail` | PropertySubType | **VERIFIED** (76 members) | kept |
| `Apartment`, `Condominium`, `CoOwnership`, `DeededParking`, `Duplex`, `Loft`, `MultiFamily`, `Quadruplex`, `SingleFamilyResidence`, `Timeshare`, `Townhouse`, `Triplex`, `UnimprovedLand` | PropertySubType | **VERIFIED** | kept |
| **`Condo`** | PropertySubType | **NOT a member** | **REMOVED.** The Mallan form value `Condo` maps to `PropertySubType: Apartment` + `CommonInterest: Condominium` (`listing-form-mapping.ts:81`), so it never reaches the classifier post-mapping |
| **`CommunityApartment`** | PropertySubType | **NOT a member** | **REMOVED.** It is a live **`CommonInterest`** member — a field confusion |
| **`GardenApartment`, `UnitDuplex`, `UnitQuadruplex`, `UnitTriplex`** | PropertySubType | **NOT members** | **REMOVED** — and emitted nowhere in the tree |

**Zero unverified provider-looking classifications remain.**

### 8.2 What reaches the classifier — PROVEN

Both callers reassign `body = applyServerFormMapping(...).body` **before** classifying
(`app/api/crm/listings/route.ts:272` then `:282`; `[id]/route.ts:142` then `:146`/`:156`), and
that mapping **refuses unknown values rather than defaulting them**. So the payload carries
**post-server-mapping live Cotality vocabulary** — not a raw provider record and not the raw
browser form. The `@param … (RESO field names)` docstring was wrong on both counts and now
describes the actual layer.

### 8.3 Fact ownership

| Fact | Owner |
|---|---|
| `PropertyType`, `PropertySubType`, `NumberOfUnitsTotal` | **COTALITY** (live-verified) |
| `listings.rls_eligible`, `commercial_sub_type` (`schema.prisma:463`), `commercial_ownership` (`:464`), InHouse listing types | **MALLAN** |
| 5-unit threshold for professional/retail units in residential property | **REBNY/UCBA Art. I §5(F)** — verified verbatim at `data/UCBA-2026-Requirements.md:57` |

`commercialOwnership` is **accepted but never read** by the function body. Documented, not
removed, so the call sites stay untouched by this scoped change.

### 8.4 RETRACTED — the CREATE enforcement claim was FALSE

**An earlier version of this section (commit 13f14ad1) claimed the CRM CREATE path skips
mandatory REBNY/UCBA validation. THAT WAS WRONG.** It stopped tracing at
`validateListing(body)` and never checked what followed.

**Actual CREATE flow (`app/api/crm/listings/route.ts`):**
1. `classifyRlsEligibility(...)` — `:282`
2. `if (rlsEligible) { validateListing(body) }` — `:294`
3. **`assertRlsCompliantPayload(body, {listingType, isNewDevelopment, currentStatus, rlsEligible,
   mixedUseSmallBuilding})`** — `:311`, **inside the same block**
4. `if (!enforcement.passed) return 422` — `:318`

**CREATE enforces the mandatory gate.** The missing second argument to `validateListing` proves
nothing on its own. The test asserting otherwise has been corrected, and CREATE enforcement was
not weakened. The BUILDING-001 citation correction in 8.4-old stands — that part was right.

### 8.4b THE REAL BOUNDARY — `isCrmCreated` on PATCH and status transition

**Claim in the source:** *"Fail closed: require the agent to provide NumberOfUnitsTotal … the
field is already required for MixedUse/MultiFamily in rebny-ucba-rules.ts BUILDING-001."*

**Both halves fail:**

1. **The citation is FALSE.** BUILDING-001 requires `BuildingAreaTotal`, `TaxAnnualAmount`,
   `LotSizeArea`, `LotSizeDimensions`. It does **not** require `NumberOfUnitsTotal`. The field
   *is* mandatory — via `REBNY_UCBA_RULES.requiredFields.agentSubmitted`.
2. **That mandatory set is never enforced on the CRM write paths for a CRM-created listing.**
   - `validateListing(listing, rls?)` runs the required/conditional gate **only `if (rls)`**
     (`rebny-validator.ts:85`).
   - CRM **CREATE** calls `validateListing(body)` — **no context** (`listings/route.ts:294`).
   - CRM **PATCH** calls `validateListing(merged)` — **no context** (`[id]/route.ts:240`) — and
     its separate `assertRlsCompliantPayload` gate is skipped when `isCrmCreated`
     (`!listing.mls_id`, `[id]/route.ts:193-194`).
   - Only `crm/listings/[id]/validate` and `crm/compliance/audit` pass the context.

**Consequence:** a CRM-created mixed-use listing with no `NumberOfUnitsTotal` classifies
`rlsEligible = true` / `mixedUseSmallBuilding = true` and persists with `rls_eligible = true` and
an unknown unit count. Because `rls_eligible` is a first-class input to `computeGateColumns`,
`true` is the **more permissive** display outcome. The intent was fail-closed; the effect is
fail-open for a building that may exceed the §5(F) 5-unit threshold.

**NOT FIXED HERE — out of this file's scope.** The correction belongs in the CRM write paths
(supplying the `rls` context, or narrowing `isCrmCreated`), which this task explicitly excluded.
Reported for authorization.

### 8.5 Files changed / proof

Changed: `lib/compliance/rls-eligibility.ts`; added
`lib/compliance/__tests__/rls-eligibility-live-vocabulary.test.ts` (41 tests).

Proof: new suite **41/41**; downstream `lib/compliance` + `lib/crm` + `lib/listings` +
crm-patch-rls-gate **614 passed / 3 failed** (the 3 are the pre-existing untracked Part 1
`display-gate-status-allowlist.test.ts`); `tsc --noEmit` clean; compliance-check **95/0**;
idx:validate **1,199 pass, 0 critical**; ucba:audit **0 REGRESSIONS**; rls:validate unchanged at
**12 pre-existing errors** (the held CRM form-vocabulary defects).

### 8.6 UNVERIFIED / still open

- Whether any consumer reads `RlsEligibilityResult.reason` as a machine value rather than prose.
- The CREATE/PATCH enforcement gap above (reported, authorization-held).
- Part 1 display-gate correction remains OPEN.


---

## PART 9 — THE `isCrmCreated` COMPLIANCE BOUNDARY (proven, not yet corrected)

### 9.1 The two exemptions

| Route | Guard | Line |
|---|---|---|
| CRM PATCH | `if (effectiveRlsEligible && !isDraftLike && !isCrmCreated)` | `crm/listings/[id]/route.ts:193` |
| Status transition | `if (listing.rls_eligible && !isCrmCreated)` | `crm/listings/[id]/status/route.ts:189` |

`isCrmCreated = !listing.mls_id` in both.

### 9.2 The stated rationale is FALSE against the canonical model

`status/route.ts:184-187` says: *"CRM-created listings (mls_id=null) are Mallan exclusives
published to mallan.nyc only — **they never go to Trestle**, so skip the 48-field check."*

`lib/listings/mallan-source-identity.ts:16-20` states the canonical model:

> *"Mallan submits its exclusive to REBNY RLS (through the brokerage's REBNY submission channel,
> OUTSIDE this system), and the listing **returns to Mallan through Cotality as an `RLS*` row**."*

**Mallan-created listings DO reach REBNY RLS.** The premise is obsolete.

### 9.3 ROOT CAUSE — provenance used as a proxy for destination

`mls_id === null` records **where the row was created**. `rls_eligible` records **whether the
listing is destined for REBNY RLS**. They are different facts.

Both guards already test `rls_eligible` correctly. The `&& !isCrmCreated` term then **overrides**
that declaration: a listing the classifier declared RLS-eligible has its mandatory-field gate
skipped purely because Mallan authored it.

**RETRACTED:** an earlier version of this paragraph said `isMallanExclusiveListing()` uses "a
different and correct discriminator". **That was WRONG** — see Part 10. It keys off the
`SL-`/`RL-` prefix, which is the same category error.

### 9.4 Consequences (behaviour traced, not yet corrected)

- **CREATE** enforces (§8.4). So a Mallan listing is compliant *at creation*.
- **PATCH** skips → a compliant listing **can be edited into an invalid state** and saved.
- **Status transition** skips → a Draft can reach **Active / ComingSoon without the mandatory
  set**, because the only other guard is `listing.rls_eligible`.
- Display consequence: `rls_eligible` is a first-class input to `computeGateColumns`, so a
  `true` row that reaches Active becomes publicly displayable through the four live readers in
  Part 1 §1.3.

**Not corrected here.** The fix must preserve Draft editing while blocking display-ready
transitions — the narrowest candidate is dropping `&& !isCrmCreated` from the status route and
keeping the `isDraftLike` exemption on PATCH. That is a route change and is authorization-held.

### 9.5 `lib/compliance/rls-enforcement.ts` — corrected

Hard-coded catalogue at `:312-316` verified against the live contract and **replaced with
`liveEnumMembers("PropertyType")`**:

- contained **`Commercial`**, which is **NOT** a live PropertyType member (it is a live
  *PropertySubType* — a different field);
- **omitted 5 live members**: `BusinessOpportunity`, `DisasterReliefRental`, `HighRise`,
  `ManufacturedInPark`, `Specialty` — so a legitimate listing carrying any of them was warned
  "non-standard".

`ucbaRef: "RESO Data Dictionary"` → `"Cotality live contract — Property.PropertyType"`. The
module header no longer says "RESO = vocabulary only". If the live contract is unavailable the
branch now warns **nothing** rather than guessing a vocabulary.

**UNVERIFIED / untouched in this file:** `TERMINAL_STATUSES = new Set(["Closed"])` at `:222` —
one member only, so `Expired` / `Withdrawn` / `Canceled` pass its check. Belongs to the Part 1
terminal-status reconciliation, not to this scope.

### 9.6 EVIDENCE LOST — must not be forgotten

`lib/compliance/__tests__/display-gate-status-allowlist.test.ts` (untracked agent artifact,
3 failing tests documenting the Part 1 gate defect) **no longer exists on disk**. Suites are
green because the test is gone, **NOT** because the defect was fixed. Part 1 remains OPEN and
now has no test pinning it. Its content is preserved in
`docs/operations/evidence-2026-09-07/agent-display-gate-lifecycle-proposal.patch`.


---

## PART 10 — `SL-`/`RL-`, `rls_eligible`, and `rls-enforcement.ts` — RE-EVALUATED

Prompted by owner challenge 2026-09-07. Two of my earlier statements were wrong.

### 10.1 `SL-` / `RL-` mean SALE LISTING / RENTAL LISTING — a type prefix, not a permission

`lib/listings/mallan-form-contract.ts:437`: *"Generated by POST route: **SL- for sales, RL- for
rentals**"*. It marks **where the row was created and which product it is**. It says nothing
about RLS distribution.

**The codebase already rejected using it as a permission, twice, in writing:**

- `lib/idx/db-to-public-dto.ts:390-402` — *"**A prefix is not a permission.** Only inventory that
  is genuinely outside RLS (`rls_eligible === false`) may bypass the IDX address gate; an
  RLS-backed row must always honour it."* It records that the prefix bypass previously **exposed
  street address, unit, coordinates and slug for RLS-eligible listings carrying an explicit
  `internet_address_display_yn = false` seller opt-out**, and that
  `app/listing/[...slug]/page.tsx:455-461` independently found and reverted the same bypass.
- `lib/compliance/campaign-distribution-gate.ts:70` — *"The listing-id prefix is **NOT
  consulted**: an `SL-`/`RL-` listing that is RLS-eligible is RLS-backed."*

**Still using the prefix as an exclusivity marker:**
`lib/listings/exclusive-agent-assignment.ts:110-115` — `isMallanExclusiveListing()` returns
`true` for ANY `SL-`/`RL-` prefix (`:112`) before testing `rls_eligible === false` (`:113`), and
the constant is named `MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES` (`:55`). `lib/listings/assigned-agent.ts:4`
and `lib/auth/listing-capabilities.ts:48` repeat the framing.
That function governs **agent assignment**, not display, so the blast radius differs from the
address-gate case — **UNVERIFIED whether it is harmful there**; it needs its own trace. Recorded
as a category error, not asserted as a live defect.

**`isCrmCreated = !listing.mls_id` (Part 9) is the same error class in a third place:** an
identity/provenance marker used as a permission.

### 10.2 `rls_eligible` is NOT a Cotality field — and cannot be

**Verified: absent from all 757 live Property fields** (`rls_eligible`, `RlsEligible`,
`RLSEligible` all absent).

That is correct and necessary. Cotality serves listings; it has no field expressing *"may Mallan
distribute this listing to REBNY RLS."* That is a **Mallan business decision constrained by
REBNY/UCBA Art. I §5(F)**.

It is the load-bearing discriminator for at least three gates:

| Consumer | Use |
|---|---|
| `campaign-distribution-gate.ts` | `isRlsBackedForCampaign` = `rls_eligible !== false` |
| `db-to-public-dto.ts` | the ONLY legitimate address-suppression bypass |
| `computeGateColumns` | first-class display-gate input |

Removing it leaves no way to distinguish website-only inventory from RLS-backed inventory, and
the address opt-out gate loses the only value two modules certify as safe to key on.

**Category corrected TWICE, then WITHDRAWN — see Part 12.** Part 4 called it
**MALLAN-OWNED STORAGE OF A REBNY/UCBA COMPLIANCE DECISION** — not a provider fact, and not a
compliance rule itself. The name is lawful under the vocabulary rule (RLS = compliance).

### 10.3 `lib/compliance/rls-enforcement.ts` — what it actually is

`MANDATORY_FIELDS = REBNY_UCBA_RULES.requiredFields.agentSubmitted` (`:62`). It validates the
**agent-submitted mandatory field set required before REBNY RLS submission** — a REBNY/UCBA
compliance validator. It is **not** a provider module and makes no feed claim, so its name is
lawful (RLS = compliance).

Consumers: CREATE (`crm/listings/route.ts:311`), PATCH (`[id]/route.ts:194`), status transition
(`[id]/status/route.ts:190`), `rebny-validator.ts:87`, and referenced by
`crm/listing-sends/route.ts:157`.

**Its defect was embedded provider vocabulary, not its purpose** — a hard-coded PropertyType
catalogue containing a phantom (`Commercial`) and missing 5 live members. Corrected in `0b1918ed`
to read `liveEnumMembers("PropertyType")`.

**Still UNVERIFIED in that file:** `TERMINAL_STATUSES = new Set(["Closed"])` (`:222`) — one
member, so `Expired` / `Withdrawn` / `Canceled` pass its check.


---

## PART 11 — INDEPENDENT MALLAN PUBLISHING (owner requirement, 2026-09-07)

**Owner statement:** listings currently reach the feed from another system until the feed is
ready for Mallan exclusives. The requirement is to **add listings and publish them on mallan.nyc
independently — edit at will, feature them, attach open houses — without waiting for the feed
round-trip.**

### 11.1 This already works today, for website-only inventory

| Capability | Mechanism | Feed dependency |
|---|---|---|
| Mark a listing website-only | listing type `InHouse` / `InHouseInternal` / `InHouseWebOnly` → `explicitOptOut` → `rls_eligible = false` (`crm/listings/route.ts:277`, `[id]/route.ts:150`) | none |
| Publish / change status freely | all three RLS gates test `rls_eligible` first, so a website-only listing is **skipped** at CREATE (`:311`), PATCH (`:193`) and status (`:189`) | none |
| Attach open houses | `local-open-house-eligible.ts:31` — a website-only Mallan listing uses a **status-only** displayable check instead of the full `evaluateDisplayGate` | none |
| Feature on the homepage | `listings.featured` Boolean (`schema.prisma:58`) + `featured_configs` | none |
| Coexist with the returned feed row | `select-open-houses.ts:7-9` handles the twin case — the same property as a local `SL-…` exclusive AND a returned feed row, matched by address rather than listing id | handled |

**No code change is required to add, edit, feature or attach open houses to a Mallan-authored
website-only listing.**

### 11.2 The real constraint is UCBA, not the software

`data/UCBA-2026-Requirements.md:51` — **Art. I Sec. 5, Simultaneous Distribution**:

> *"Must disseminate to RLS **simultaneously with ANY public dissemination** or first showing,
> whichever is earlier."*

So publishing an **RLS-eligible** listing on mallan.nyc *is* public dissemination and triggers the
simultaneous RLS submission obligation. A genuinely **website-only** listing carries no such
obligation. The distinction is `rls_eligible`, and it is a REBNY rule — not something the code
invented and not something the code may waive.

### 11.3 CORRECTION to the Part 9 recommendation

Part 9 proposed dropping `&& !isCrmCreated` from the status route. **That recommendation is
narrowed and re-sequenced, not adopted as written.**

- Website-only listings are **already** skipped by `rls_eligible === false`, so they would be
  unaffected. The independent-publishing workflow above does not depend on `isCrmCreated`.
- Only **RLS-eligible Mallan-authored** listings would newly be gated — which is what UCBA §5
  requires.
- **BUT the classifier DEFAULTS to `rls_eligible = true`** in several branches (any residential
  subtype; `Residential`/`ResidentialLease` PropertyType; and "No PropertyType specified —
  default RLS-eligible (Draft)"). A listing the owner intends as website-only but has not
  explicitly marked would therefore be classified RLS-eligible and **blocked from going Active**.

**Required sequencing: make the website-only choice explicit and reliable at intake FIRST, then
tighten the status gate.** Tightening first would obstruct exactly the independent publishing the
owner asked to retain. Still authorization-held; nothing changed.

### 11.4 What must be preserved by any future change

1. A Mallan-authored **website-only** listing must remain addable, editable, publishable,
   featurable and open-house-capable **with no feed dependency and no RLS mandatory gate**.
2. `rls_eligible` must remain the discriminator — not `mls_id`, not the `SL-`/`RL-` prefix
   (Part 10).
3. Any tightening of the status gate must be preceded by an explicit, reliable website-only
   choice at intake, or it will block legitimate independent publishing.

---

## PART 12 — WHAT `rls_eligible` ACTUALLY MEANS TODAY (measured)

Owner challenge 2026-09-07, recorded at `docs/Backend Search/You are right. My earlier
analysis.txt`: if two or more meanings are packed into `rls_eligible`, there is a **data-model
defect underneath the terminology defect**. **Confirmed — four concerns, eight decision sites.**

**Parts 4 and 10 are both WITHDRAWN.** Part 4 called this "TRUE COMPLIANCE"; Part 10 called it
"Mallan-owned storage of a compliance decision". Neither is earned. The owner's distinction is
correct: *"REBNY/UCBA imposes a business/display rule"* and *"therefore Mallan needs an
`rls_eligible` field"* are different claims, and only the first was proven.

I also missed the mirror-image error: I catalogued prefix-used-as-permission three times but
walked past `mallan-source-identity.ts` using `rls_eligible === false` to establish
**PROVENANCE** — the same conflation in the opposite direction.

### 12.1 Every runtime reader and the decision it drives

| # | Reader | Decision | Concern |
|---|---|---|---|
| 1 | `db-to-public-dto.ts:301` `classifyDbListing` | `=== false` returns **`'website-only'`** as a provenance label, checked *before* `agent_id`/`owner_client_id`. Comment: *"tagged exclusive (Mallan-owned) by definition"* | **PROVENANCE** |
| 2 | `db-to-public-dto.ts:319` `filterDisplayableDbListings` | `=== false` → **`return true`**, bypassing Gates 2–5 | **DISPLAY BYPASS** |
| 3 | `media-sync.ts:2138` | mirror-admission scope, via `isMallanExclusiveListing` (prefix **OR** `=== false`) — who may enter the `crm:` media namespace | **MEDIA OWNERSHIP** |
| 4 | `listing-capabilities.ts:48` | `mallan-local` = *"Mallan-AUTHORED (`SL-`/`RL-` **or** `rls_eligible=false`)"* | **EDIT AUTHORITY** |
| 5 | `campaign-distribution-gate.ts:76` | `isRlsBackedForCampaign` = `!== false` | **DISTRIBUTION** |
| 6 | `db-address-decision.ts:71` | the only lawful address-suppression bypass | **ADDRESS DISPLAY** |
| 7 | `rls-enforcement.ts:323` | selects the PropertyType validation branch | **VALIDATION SCOPE** |
| 8 | `computeGateColumns` | first-class display-gate input | **DISPLAY GATE** |

**Four concerns — provenance/authorship (1, 3, 4); display and address gating (2, 6, 8);
distribution (5); validation scope (7) — all keyed off one Boolean.**

### 12.2 PROVEN CODE DEFECT — display-gate bypass (LATENT, measured)

`lib/idx/db-to-public-dto.ts:312-330`:

```
Gate 1: status                              <- applied
if (l.rls_eligible === false) return true;  <- EARLY RETURN
Gate 2: idx_display_yn                      <- BYPASSED
Gate 3: internet_entire_listing_display_yn  <- BYPASSED
Gate 4: owner_opt_out                       <- BYPASSED
Gate 5: participant_only                    <- BYPASSED
```

For a website-only listing the **only** gate applied is status. **`owner_opt_out` is an owner
instruction under UCBA Art. I §5(A) — "NO public dissemination at any time" — not an
RLS-distribution-only rule.** Bypassing it because a listing is off-RLS is a category error.
(`participant_only` is arguably meaningless off-RLS; `owner_opt_out` is not.)

**Read-only production census — `hidden-mountain-87248164` branch `main`, SELECT only:**

| Measure | Count |
|---|---|
| `rls_eligible = false` (website-only) | **7** |
| …with `owner_opt_out = true` | **0** |
| …with `participant_only = true` | **0** |
| …opted out AND display-ready | **0 — no current exposure** |
| `owner_opt_out = true` anywhere in `listings` | **0** |

**Real code defect, zero current exposure.** It becomes live the moment an owner opts out on a
website-only listing — precisely the inventory being published independently today.

### 12.3 Not established

- That the REBNY/UCBA rule requires a field **named** `rls_eligible`. The rule is real; the name,
  the type, and its carrying of four concerns are not thereby justified.
- That one Boolean can carry provenance, edit authority, media ownership, display bypass, address
  suppression, distribution eligibility and validation scope unambiguously.

**No refactor, rename or deletion proposed.** Per the owner document none is authorized until the
four audits — Search contract, identity/source authority, distribution/compliance, consumer
convergence — converge into one impact graph.
