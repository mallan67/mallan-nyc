# Cotality Status/Field Truth Audit — 2026-07-05

**Type:** comprehensive, read-only. **No code changed.** Every value below was checked against the **live Cotality API** (`api.cotality.com/trestle`, OAuth + `$metadata` + `$count`), pulled 2026-07-05 — not a snapshot, not a copy.

## THE LAW (Maya directive, 2026-07-05)
> **The live Cotality API is the sole authority for every listing status, field name, and picklist value. Never assume. Never use a snapshot or a copied list. Never spot-check — if a value is wrong in one place it is almost certainly wrong in the copies elsewhere, so verify the whole surface.** Any hardcoded status/field/enum in the repo is a *derived copy* that must either be verified against the live API or eliminated.

## Live authority (pulled 2026-07-05, provenance-proven)
- `StandardStatus` (11, the only OData-filterable status field): `Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn`
- `MlsStatus` (18, NOT filterable / provider-suppressed): adds `AttorneyReview, CanceledRelisted, CompSold, Contingent, Leased, OptionPeriod, Terminated`
- `Permission` (19): `AgentOnly, CompSold, DownPaymentResourceNo, DownPaymentResourceYes, FirmOnly, History, Idx, IDX, MemberInactive, Officeidxoptout, OfficeInactive, OfficeOnly, OfficeSuspended, PhotoOptedOut, Private, Public, SyndicateOptOut, Vow, VOW` — **no `OwnerOptOut`, no `Owner Opt-Out`, no `ParticipantOnly`**
- `PropertyType` (13): `BusinessOpportunity, CommercialLease, CommercialSale, DisasterReliefRental, Farm, HighRise, Land, ManufacturedInPark, MultiFamily, Residential, ResidentialIncome, ResidentialLease, Specialty` — **all camelCase, no spaces; there is no `Residential Lease`, no `Residential Income`, no bare `Commercial`**
- Live feed reality: the disseminated feed carries `StandardStatus ∈ {Active, Closed, Pending, ComingSoon}` only (Closed = 573,420 ≈ 97%); sale = `PropertyType Residential`, rental = `ResidentialLease`. `Sold`/`Rented` exist in **no** Cotality enum.
- Full 181-enum reference captured live at pull time (working copy; the API remains the authority).

---

## Category A — LIVE-BREAKING (real user-facing bugs, verified against live)

**A1. `'Residential Lease'` (with a space) in live OData queries → 0 rental rows.** Live value is `ResidentialLease`. Four sites silently return empty for rentals:
- `app/api/market/route.ts:152` (rental market stats)
- `app/api/listings/similar/route.ts:219` (rental "similar" comps)
- `lib/market-report/generator.ts:136` (rental market reports)
- `scripts/status-snapshot.js:128` (ops rental counter)

**A2. The IDX validator encodes wrong canon → can't catch A1.** `scripts/idx-validate.js:468` lists `'Residential Income'` (should be `ResidentialIncome`) and `'Commercial'` (not a live PropertyType). A self-defeating validator.

**A3. Public-search subtype facets map to non-existent `PropertySubType` values** → facets under-return. `lib/search/public-listing-db.ts:20-22` maps `Townhouse→"SingleFamilyTownhouse"`, `"New Development"→"NewConstruction"`; neither is in the live 75-value enum. CRM outbound subtype values (`SingleFamilyTownhouse`, `MultiFamilyTownhouse`) may reject at RLS submission (confirm vs REBNY picklist).

---

## Category B — COMPLIANCE, HIGH-PRIORITY, NEEDS REBNY/TRESTLE CONFIRMATION (fail-closed — do NOT remove any gate on this audit alone)

**B1. Owner-Opt-Out (Gate 1) keys on values that don't exist in the live `Permission`/`MlsStatus` enums.** Every site tests `Permission == 'OwnerOptOut'` / `'Owner Opt-Out'` / `MlsStatus == 'OwnerOptOut'` — **none exist live** — so Gate 1's value path can never match live Trestle data:
- `lib/compliance/gates.ts:137,140` (canonical `isOwnerOptOut`, widest blast radius)
- `lib/idx/trestle-mapper.ts:1040-1043` (primary ingest)
- `lib/compliance/normalizer.ts:90` (writes the DB `owner_opt_out` column → always `false` for Trestle rows)
- `lib/compliance/rls-enforcement.ts:407-410`, `lib/idx/media-sync.ts:1215-1217`
- Consequence: owner-opt-out listings are protected only incidentally by **Gate 3** (`InternetEntireListingDisplayYN=false`, which IS valid and works) or by REBNY's claimed upstream pre-filter.
- **This is a Class B/C question (live field-truth + REBNY rule), NOT a licence to delete the gate.** Two possibilities: (a) `OwnerOptOut` is a transcription artifact and opt-out is genuinely handled by Gate 3 + pre-filter (gate is safe-but-dead), or (b) a real compliance gap. Resolve by confirming with REBNY/Trestle how owner opt-out is expressed on the IDX Plus feed, and whether any live row carries an opt-out `Permission`. Until then the gate stays (fail-closed).

**B2. Phantom `Permissions` (plural) field read as a fallback** in `gates.ts:117`, `trestle-mapper.ts:1037`, `media-sync.ts:1187/1213`. Live property is `Permission` (singular); the plural read is always `undefined`.

**B3. `IDXEntireListingDisplayYN` referenced in executed code** at `lib/compliance/rls-enforcement.ts:414-419` (a "legacy guard"). Live field is `InternetEntireListingDisplayYN`; the phantom name matches nothing live.

**B4. Correct-and-verified:** Participant-Only (Gate 2) = `Permission == 'Private'` — `'Private'` **exists** live, correct everywhere. Gates 3–6 (`InternetEntireListingDisplayYN`, `InternetAddressDisplayYN`, terminal-status §2.05, ComingSoon) use valid live field names.

---

## Category C — SYSTEMIC LATENT (one wrong source copied ~12×; mostly dead today, but a false data model)

**Root: `lib/compliance/status.ts:33-46`** mints non-Cotality status values (`Sold`, `Rented`, `Leased`) and misspells `Cancelled` (live = `Canceled`, one L), then rewrites the correct live spelling INTO the wrong one (`INPUT_TO_CANONICAL`; `trestle-mapper.ts STATUS_ALIASES {canceled:'Cancelled'}`). ~12 files copied this model:

| File:line | Set | Bad values |
|---|---|---|
| `lib/compliance/status.ts:33-46,138-146,193-201` | `Status` enum + `TERMINAL_STATUSES` | `Sold, Rented, Leased, Cancelled`; missing `Hold` |
| `lib/idx/trestle-mapper.ts:618-626` | `TERMINAL_STATUSES` (idx_display gate) | same; missing `Hold` |
| `lib/compliance/public-listing-filter.ts:13-31` | `TERMINAL_STATUSES` (public `notIn`) | `Sold, Rented, Cancelled, TemporarilyOffMarket, OwnerOptOut` (last two aren't statuses at all) |
| `app/api/cron/data-retention/route.ts:27` | `TERMINAL_STATUSES` (T+180 archive) | same 7; missing `Hold` |
| `lib/retention/archive-terminals.ts:16-24` | `ARCHIVE_TERMINAL_STATUSES` | same 7 |
| `scripts/archive-backlog-predicate.js:26-34` | `ARCHIVE_TERMINAL_STATUSES` | same 7 |
| `app/api/cron/feed-reconcile/route.ts:80-83` | `TERMINAL_STATUSES` | same 7 |
| `scripts/reconcile-ghosts.js:61-64` | `TERMINAL_STATUSES` | same 7 |
| `lib/syndication/eligibility.ts:96-104` | `TERMINAL_STATUSES` (hand-copied) | same 7 |
| `lib/crm/status-mapping.ts:120-131` | `TERMINAL_STATUSES` | `Sold, Cancelled`; missing `Closed, Leased, Rented, Hold` |
| `lib/scanner/trestle-off-market-filter.ts:57-66` | off-market/closed sets | `Cancelled` + `Canceled` (redundant), `Sold` |

**Live effect today:** because the disseminated feed only carries `{Active, Closed, Pending, ComingSoon}`, the invented tokens (`Sold`/`Rented`/`Leased`) are **dead entries** — they match nothing, so no active row is wrongly archived. **Latent bug:** the `Canceled`→`Cancelled` rewrite means if the non-normalizing raw path (`trestle-mapper.ts:963`) ever stores a live `Canceled`, every terminal gate (display §2.05 + T+180 archive) misses it. And `Hold` (a real off-market StandardStatus) is treated as non-terminal everywhere.

**Clean (verified):** every string actually sent to the live Cotality OData API (`lib/idx/fetch.ts`, `lib/search/public-listing-trestle.ts`, `lib/search/crm-idx-filter.ts`, feed-reconcile seed) uses only valid, correctly-spelled values. The rot is in the *internal* model, which is why live queries kept working and the drift went unnoticed.

Also note: two different "sale" filter definitions coexist (`PropertyType ne 'ResidentialLease'` vs `eq 'Residential'`) — equivalent on today's REBNY-only feed, but the `ne` form misclassifies `CommercialLease`/`DisasterReliefRental` as sale if those types ever appear.

---

## The single-source fix (recommended — collapses "everyone's version in a different place")
1. **Generate one canonical Cotality-enum module from the live API** (a script that OAuths, pulls `$metadata`, and writes `lib/cotality/enums.generated.ts`), and have every gate/filter/set import from it. No hand-maintained status/field lists anywhere.
2. **Separate "Cotality feed values" from "internal workflow labels"** — the CRM pipeline can keep `Sold/Rented/Leased` as *internal* labels, but they must never sit in a set that is compared against a Cotality-sourced `status`.
3. **Fix the spelling at the source** (`Canceled`, one L) and normalize live→canonical without rewriting the live spelling; add `Hold`.
4. **Delete `'Residential Lease'` (space) everywhere** and make the IDX validator check against the generated enum so drift can't recur.
5. **Resolve B1 with REBNY/Trestle** before touching Gate 1.

**None of the above is done here — this is a report.** No fixes, no gate changes, no flags, no env/Neon/migrations, #473 untouched. Every fix is Maya-gated, and the compliance items (Category B) additionally require REBNY/Trestle confirmation and stay fail-closed until then.
