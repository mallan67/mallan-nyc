## VALIDATOR AUDIT — the 6 contract-adjacent validators

Ground truth used throughout: `data/cotality-contract/contract.compact.json` (probe_mode=`light`, metadata_sha `a60bcbbd…`, acquired 2026-09-08T06:26:36Z, 17 resources / 1,456 fields / 31 navigations) + `data/cotality-contract/lookups.live.json`. I verified `node scripts/cotality/generate-contract-types.mjs --check` → **CHECK OK, exit 0** — the committed `lib/cotality/generated/contract.ts` is byte-identical to a regeneration of the committed snapshot. Authority state/health = **HEALTHY**, one pending observed change (`Property.City` member `Espíritu Santo`).

---

# 1. `scripts/ops-health.js` (`npm run ops:health`)

**1. WHAT IT CHECKS.** Read-only Neon Postgres operational health: DB size/growth, `sync_state` freshness, REBNY RLS §2.05 retention violations, archive backlog, Neon branch-prune cron health, media-sync cursor/coverage/R2 mirror, `listings` dead-tuple ratio, plan-cap upgrade triggers. Exit 0/1/2.

**2. AUTHORITY TODAY: does NOT import the live Cotality contract.** Requires at `scripts/ops-health.js:68-72` are `@prisma/client`, `./branch-prune-health`, `./r2-retry-health`, `./media-image-health`, `./archive-backlog-predicate`. `grep -n "cotality" scripts/ops-health.js` returns only two SQL string literals (`:547`, `:560`, the `%cotality.com%` URL host match). It is a CommonJS script and `lib/cotality/live-contract.ts` / `lib/listings/mallan-status.ts` are ESM/TS — that is the mechanical reason the lists below are re-typed rather than imported.

**3. HARDCODED LISTS.**

| file:line | literal | class |
|---|---|---|
| `scripts/ops-health.js:225` | `status: { in: ['Closed','Sold','Rented','Leased','Withdrawn','Expired','Canceled','Cancelled','Delete'] }` | **ENUM/status claim** — must come from Cotality (+ the repo's legacy-alias map) |
| `scripts/ops-health.js:243` | same 9-element array (terminal + NULL `status_changed_at` gauge) | **ENUM/status claim** |
| `scripts/ops-health.js:296` | same 9-element array (`terminal_since` clock gauge) | **ENUM/status claim** |
| `scripts/ops-health.js:89-117` | `THRESHOLDS` (`storage_free_cap_mb: 10_240`, `compute_free_cap_hours: 300`, `branch_count_critical: 4000`, `media_cursor_stale_hours: 2`, `listing_media_coverage_critical_pct: 30`, …) | **Neither** — Neon plan/ops configuration |
| `scripts/ops-health.js:529,534` | `LOWER(COALESCE(lm.media_type,'')) IN ('photo','image','')` | **ENUM claim** on a Mallan column derived from Cotality `Media.MediaCategory` |
| `scripts/ops-health.js:547,549,558,560,…` | `media->0->>'url'`, `media->0->>'MediaURL'`; host literals `%r2.dev%`, `%images.mallan.nyc%`, `%cotality.com%`, `%corelogic.com%` | **FIELD claim** (`MediaURL` is a raw Cotality key) + config (hosts) |
| `scripts/archive-backlog-predicate.js:27` | `ARCHIVE_TERMINAL_STATUSES = ["Closed","Sold","Rented","Leased","Withdrawn","Expired","Canceled","Cancelled","Delete"]` | **ENUM/status claim** |

Which statuses are *terminal* (`{Closed, Withdrawn, Expired, Canceled, Delete}`) is correctly a **RULE** and lives in `lib/listings/mallan-status.ts:91`. Only the token *spellings* are a Cotality claim.

**4. DRIFT ALREADY PRESENT.**

- **No retired status word present.** I checked for `ACTIVE` / `COMING_SOON` / `OFF_MARKET` / `UNKNOWN` screaming-case and none appear. `Cancelled` (two L) *is* present at `:225`, `:243`, `:296` and `archive-backlog-predicate.js:27` — but that is **correct**, deliberate legacy read-compatibility: `lib/listings/mallan-status.ts:49-55` maps `Cancelled→Canceled`, `Sold|Rented|Leased→Closed`, and `TERMINAL_STATUS_FILTER_VALUES` (`:93`) expands to exactly those 9 spellings in exactly that order. I recomputed it — **the three inline arrays and `ARCHIVE_TERMINAL_STATUSES` all currently match `TERMINAL_STATUS_FILTER_VALUES` byte-for-byte.**
- **Unguarded duplicate (the live defect).** `tests/runtime/ops-health-archive-backlog.test.ts:77` asserts `ARCHIVE_TERMINAL_STATUSES === TERMINAL_STATUS_FILTER_VALUES` — but it **only guards `scripts/archive-backlog-predicate.js`**. Nothing reads `scripts/ops-health.js` source. The three inline copies at `:225/:243/:296` — the two that produce the **`critical` REBNY §2.05 compliance issue** — are unguarded. When the held status-token correction plan (`docs/operations/evidence-2026-09-08/lifecycle/status-token-correction-plan.sql`) rewrites the legacy rows and `LEGACY_STORAGE_ALIASES` shrinks, `archive-backlog-predicate.js` will be caught by its test and these three will silently keep filtering on dead spellings. A §2.05 violation count that silently narrows is a compliance-visible failure mode.
- **`'image'` is a phantom enum token.** `ops-health.js:529,534`. Live `Media.MediaCategory` members are `Addendum, AerialView, AgentPhoto, BrandedVirtualTour, Disclosure, Document, FloorPlan, Map, OfficeLogo, OfficePhoto, Other, Photo, RentalDocuments, Restriction, Survey, Topography, UnbrandedVirtualTour, Video`; live `Media.MediaType` members are file formats (`Jpeg, Png, …`). `'image'` is in neither vocabulary. It mirrors `lib/media/listing-media-resolver.ts:218`, so it is consistent with the app — but it is an unverifiable token in a compliance-adjacent SQL predicate.
- **Raw Cotality field read outside the boundary.** `MediaURL` at `:547/:549/:558/:560`. `data/cotality-contract/boundary.json` lists 26 allowed modules, none under `scripts/`. Confirmed the census can never see it: `scripts/cotality/authority/impact.mjs:41` — `return f.startsWith('lib/') || f.startsWith('app/')`. `boundary-baseline.json` holds 482 keys across 61 files, **0 of them under `scripts/`**. So a Cotality rename of `MediaURL` produces zero blast-radius signal for this file.

**5. CAN IT BE WIRED TO COTALITY? — Partly.**
- *Yes, cheaply:* replace the three inline arrays with `require('./archive-backlog-predicate').ARCHIVE_TERMINAL_STATUSES` (already CommonJS, already test-guarded). One-line change ×3, zero behaviour change today (I verified the sets are identical), and it collapses four copies to one guarded copy. Nothing breaks.
- *Better:* emit a generated CommonJS mirror of `TERMINAL_STATUS_FILTER_VALUES` from `lib/listings/mallan-status.ts` so `archive-backlog-predicate.js` stops hand-typing it too.
- *No, for the JSONB reads:* `media->0->>'MediaURL'` reads legacy rows written by a retired code path; it cannot be typed against the contract from SQL. The realistic fix is to add `scripts/` to the boundary census scan roots (`impact.mjs:41`) so at least the read is *inventoried*.

**6. VACUOUS / SOURCE-TEXT CHECKS.**
- `:317-321` `prisma.listingsArchive.count()` in a `try` that swallows any `does not exist` error — the `listings_archived_total` gauge silently vanishes rather than degrading to an explicit UNVERIFIED.
- `:159-208` sync section catches a missing-table error and sets `report.sync.state = 'pre_migration'` — a whole section can go dark without raising an issue.
- Not vacuous but worth stating plainly: **`ops:health` runs in no workflow and no git hook.** `grep -rn "ops:health" .github/workflows/ .githooks/` → no match. It is operator-invoked only, so the §2.05 `critical` never gates anything automatically.

---

# 2. `scripts/health/probe.ts` (`npm run health:probe`)

**1. WHAT IT CHECKS.** Refreshes the AUTO tier of `docs/PROJECT-HEALTH-DASHBOARD.md` between `HEALTH:AUTO` markers: git HEAD, open PR count, PR #465 state, Neon canonical branch identity via `neonctl`, `neon:verify` drift, cron cadence from `vercel.json`, and (only with a canonical `DATABASE_URL`) listing counts, sync freshness/outcome, and a feed-bloat invariant. Every probe degrades to ⚪ rather than throwing.

**2. AUTHORITY TODAY: does NOT import the live Cotality contract.** Its only local import is `./health-status` (`scripts/health/probe.ts:20`). No `lib/cotality/*` import anywhere.

**3. HARDCODED LISTS.**

| file:line | literal | class |
|---|---|---|
| `scripts/health/probe.ts:32-35` | `NEON_PROJECT="hidden-mountain-87248164"`, `NEON_ORG="org-wild-king-99967357"`, `NEON_DEFAULT_BRANCH="br-crimson-frog-adr7g9gt"`, `CANONICAL_ENDPOINT="ep-cold-waterfall-adno3ao2"` | **Neither** — Neon identity; matches CLAUDE.md §B exactly |
| `scripts/health/probe.ts:190` | `prisma.syncState.findUnique({ where: { resource: "Property" } })` | **RESOURCE claim** — should come from the contract |
| `scripts/health/probe.ts:208` | `WHERE status='Closed' AND first_active_date IS NULL AND agent_id IS NULL AND idx_display_yn=false` | **ENUM/status claim** |
| `scripts/health/probe.ts:209` | `listing_id NOT LIKE 'SL-%' AND listing_id NOT LIKE 'RL-%'` | Neither — Mallan listing-id convention |
| `scripts/health/probe.ts:74` | `gh pr view 465` | UI configuration (and stale — see 4) |
| `scripts/health/probe.ts:149-151` | `"/api/cron/one-cycle-preflight"`, `"*/10 * * * *"`, `"/api/cron/db-keepalive"` must be absent | Neither — cron config |
| `scripts/health/health-status.ts:14` | `LISTINGS_FLOOR = 100_000` | Neither — sanity floor |
| `scripts/health/health-status.ts:74-77` | `"error"`, `"partial"`, `"ok"` | Neither — Mallan `sync_state.last_run_status` vocabulary |

**4. DRIFT ALREADY PRESENT.**

- **`status='Closed'` at `:208` under-counts by design-accident.** This is the "feed-bloat invariant" whose whole point is that it must be **0**, and it is a 🔴 alarm when non-zero. `'Closed'` is a correct live `StandardStatus` member — but the repo's own canonical mapping (`lib/listings/mallan-status.ts:49-55`) says legacy rows storing `'Sold'`, `'Rented'`, `'Leased'` **mean `Closed`**, and `ops-health.js` (same session's validator) filters on all four. A never-active third-party bloat row stored with the legacy spelling is invisible to this probe. Two validators in this same set disagree about what "Closed" is in the `listings.status` column. This is the highest-value drift I found in `probe.ts`.
- **Mislabelled cell — "Cron cadence (live Cotality)" (`:152`, and the ⚪ fallback at `:172`).** The probe reads `vercel.json` off disk. It touches nothing Cotality and nothing live. The dashboard row name asserts a live-provider fact the probe never acquired.
- **`gh pr view 465` (`:74`) is permanently stale.** #465 merged 2026-07-02; the `MERGED` branch at `:77-82` is now the only reachable path, so the row prints a fixed historical notice forever and the CI-rollup branch at `:84-90` is dead code.
- **`resource: "Property"` (`:190`) is unverified.** `Property` is `accessible` (HTTP 200, 757 fields) in the contract. Correct today, but a hand-typed provider resource name with no contract check.

**5. CAN IT BE WIRED TO COTALITY? — Partly.**
- *Yes:* `probe.ts` is TypeScript with `@/lib` resolution available. Replace `status='Closed'` with a parameterised `IN` built from `storageStatusesFor(['Closed'])` (`lib/listings/mallan-status.ts:74`), and assert `resource: "Property"` via `assertAccessible('Property')` from `lib/cotality/contract.ts:109`. Nothing breaks — the query is read-only and the widened `IN` can only make the invariant *more* correct.
- *No:* Neon identity, thresholds, cron paths and the PR number are not Cotality facts and must not be sourced from it.

**6. VACUOUS / SOURCE-TEXT CHECKS.**
- **`tryProbe` (`:41-43`) is a blanket `catch {}`.** A genuine drift that throws for any reason other than the one anticipated silently becomes ⚪ "unavailable". The dashboard cannot distinguish "tool missing" from "assertion threw".
- **`:159-171` media-backfill cell asserts on file existence + `vercel.json` text**, never on behaviour. `existsSync("app/api/cron/media-backfill/route.ts")` is a source-text claim standing in for "the route is not deployed".
- **`:113-129` shells `npx tsx scripts/neon-verify.ts` and reads only the exit code**, mapping "no numeric status" (npx/tsx ENOENT) to ⚪. Honest, but it means the 12/12 Neon-facts claim in the rendered evidence string at `:126` is printed from a **hardcoded sentence**, not from the verifier's output.
- **Not read-only.** `:247` `writeFileSync(DASH, …)`. I did **not** run it, per the read-only constraint. Worth stating because CLAUDE.md describes `health:probe` as "(read-only)".
- Runs in **no** workflow.

---

# 3–5. `trestle:audit:all` — the three coverage audits

## 3a. `scripts/audit-form-trestle-coverage.ts` (`npm run trestle:audit-forms`)

**1. WHAT IT CHECKS.** Parses 6 CRM HTML files, collects `data-cotality-field` bindings and unbound `<input|select|textarea>` ids, and cross-references them against a **live** `$metadata` pull plus a live `CustomProperty?$top=20` sample. Emits ORPHAN_BINDING / UNBOUND_INPUT / UNCOVERED_FIELD; exits 1 on any orphan.

**2. AUTHORITY TODAY: does NOT import the committed contract.** It fetches `${TRESTLE_BASE}/odata/$metadata` at `:86` and regexes it at `:116-125`. That is *live* authority, which is legitimate — but it bypasses `lib/cotality/contract.ts` entirely, so it gets no `filterable` / `populated` / `access` facts and no compile-time checking.

**3. HARDCODED LISTS.**

| file:line | literal | class |
|---|---|---|
| `scripts/audit-form-trestle-coverage.ts:52` | `RESOURCES = ['Property','CustomProperty','Member','Office','Media','PropertyUnitTypes','OpenHouse']` | **RESOURCE claim** — contract declares 17 |
| `:57-68` | `FORM_FILES` (6 paths) | UI configuration — all 6 exist, verified |
| `:200-215` | `REBNY_CUSTOM_FIELDS` — 40 names, `AttendanceType … ViewRemarks` | **FIELD claim** |
| `:250` | detail string `"…not present on any of the 7 live Trestle resources"` | duplicated magic number |
| `:269-271` | prefix strip `/^(sale|rental|bldg|building|adv|comp)/i` | heuristic config |

**4. DRIFT ALREADY PRESENT.**

- **🔴 LIVE FAILURE, confirmed by running it. `npm run trestle:audit-forms` → exit 1, 5 ORPHAN_BINDINGs:**
  ```
  SALE-FORM-REDESIGN.html   auction_yn
  SALE-FORM-REDESIGN.html   auction_type
  SALE-FORM-REDESIGN.html   auction_start_date
  SALE-FORM-REDESIGN.html   auction_end_date
  SALE-FORM-REDESIGN.html   auction_terms_url
  ```
  Sources at `public/crm/SALE-FORM-REDESIGN.html:761,767,777,782,787`. I confirmed against the committed contract that **no live Cotality resource declares any field matching `/auction/i`** — zero hits across all 17 resources. These are Mallan-local concepts (`lib/compliance/rls-enforcement.ts:671-763` treats `auction_yn` as a Mallan RLS obligation) wearing a `data-cotality-field` attribute. Exactly the "a form control bound to it is a Mallan concept mis-bound to a provider field" case that `lib/cotality/live-contract.ts:93-99` warns about. **This means `trestle-live-audit.yml` has been failing and opening a `trestle-drift` issue every scheduled day.**
  - Related Class-A defect in the same chain: `lib/compliance/rls-enforcement.ts:677,681` fall back to `payload.AuctionYN` / `payload.AuctionTermsUrl` — **phantom PascalCase Cotality names**, absent from every live resource.
- **`trestle:audit:all` currently runs only 1 of its 3 audits.** `package.json` — `"trestle:audit:all": "npm run trestle:audit-forms && npm run trestle:audit-server && npm run trestle:audit-resources"`. `audit-forms` exits 1 today, so `&&` short-circuits and `audit-server` + `audit-resources` **never execute** under the documented aggregate command. (The CI workflow escapes this only because it runs them as three separate `continue-on-error` steps.)
- **`RESOURCES` (`:52`) omits 10 of the 17 contract resources**, including `PropertyRooms` (accessible, 39 fields), `Field`/`Lookup`/`Model` (all accessible), plus `Building`, `Teams`, `TeamMembers`, `PropertyGreenVerification`, `HistoryTransactional`, `Enumeration`. A binding to a `PropertyRooms`-only field would be falsely reported ORPHAN. *(I checked the current 155 unique bindings — 0 are affected today, so this is latent, not active.)*
- **The 40-name `REBNY_CUSTOM_FIELDS` list is sourced from a document that no longer exists.** The comment at `:196-199` cites `CLAUDE.md` section *"CustomProperty.CustomFields (41 REBNY fields in JSON string)"*. `grep -n "CustomFields" CLAUDE.md AGENTS.md` → **no match**; CLAUDE.md was rebuilt 2026-05-20 and has no such section. The list is also self-inconsistent: the comment says 41, the array has 40. I verified none of the 40 is a declared field on any contract resource (correct — they are JSON-blob keys inside `CustomProperty.CustomFields`, which *is* declared). But nothing verifies them against anything, and they are **unioned into the live oracle at `:217-220`**, so a retired blob key silently continues to certify a binding as valid.
- **Soundness hole: `allLiveFields` conflates declared `$metadata` field names with sampled JSON-blob keys** (`:189` + `:217-220`). The sibling script explicitly documents this hazard for its drift guard (`audit-server-trestle-coverage.ts:285-291`) and uses a separate `liveSchemaFields` set — this script never makes that distinction.

**5. CAN IT BE WIRED TO COTALITY? — Yes, mostly.**
- Replace the `$metadata` fetch + regex (`:85-125`) with `COTALITY_RESOURCES` / `isCotalityField` from `lib/cotality/contract.ts` — that removes the hardcoded 7-resource list, gives all 17 for free, and makes the script **runnable in PR CI without credentials**. What it loses: fresh-vendor-drift detection (the contract is a dated snapshot). Best shape: contract for the offline gate, live pull only in the daily cron.
- `REBNY_CUSTOM_FIELDS` **cannot** be contract-sourced — the contract models `CustomProperty.CustomFields` as one `Edm.String`, not its keys. Either widen the compiler to census blob keys, or move the list to a dated, provenance-carrying `data/` file. Leaving 40 hand-typed names citing a deleted doc is the defect.

**6. VACUOUS CHECKS.**
- **`STALE_BINDING` is declared and counted but never produced.** Declared `:171`, documented `:8-11`, referenced in the section header `:238`, and reported at `:321` as `findings.filter(f => f.kind === 'STALE_BINDING').length`. `grep` confirms **no `findings.push` ever sets it**. The JSON output has emitted `"stale_binding": 0` since the file was written. The variable that *is* used is misleadingly named `stale` at `:354` while filtering `ORPHAN_BINDING`.
- **`UNBOUND_INPUT` asserts on name-similarity, not behaviour, and is pure noise.** Live run: **560 hits**. Sample: 20 identical `<input[type=checkbox]> id="" matches live Trestle Property.BusinessType` — all with an **empty `id`**, matching only on a shared checkbox-group `name`. It never gates (exit code ignores it) and it drowns the 5 real orphans.
- **`UNCOVERED_FIELD`: 1,105 findings**, emitted every run, gating nothing. `--resource` filters this class only (`:292`), not the classes that matter.
- **Requires LIVE network + `IDX_CLIENT_ID`/`IDX_CLIENT_SECRET`** (`:47-50` hard-exits). **Cannot run in PR CI.**

## 3b. `scripts/audit-server-trestle-coverage.ts` (`npm run trestle:audit-server`)

**1. WHAT IT CHECKS.** Asserts a fixed set of gate/key field names exist on live `$metadata`; greps 10 server directories for forbidden/phantom field names, downgrading hits framed by an "intent marker" comment; and runs a live-drift guard for a forbidden name that has become real.

**2. AUTHORITY TODAY: does NOT import the committed contract.** Live `$metadata` fetch at `:116`, regexed at `:119-131`. It *does* import the pure guard module `scripts/trestle-forbidden-fields` at `:33-37` — and that module **is** contract-guarded, indirectly, by `lib/idx/__tests__/forbidden-fields-live-parity.test.ts` (which reads the committed contract via `tests/runtime/cotality-contract-facts.ts:19-20`). That is the single best authority link in this whole set.

**3. HARDCODED LISTS.**

| file:line | literal | class |
|---|---|---|
| `:54-65` | `SCAN_PATHS` — `lib/idx`, `lib/compliance`, `app/api/{listings,idx,media,buildings,agents,open-houses,market,cron}` | UI/scan configuration |
| `:75-83` | `MUST_EXIST_GATE_FIELDS = ['Permission','InternetEntireListingDisplayYN','InternetAddressDisplayYN','InternetAutomatedValuationDisplayYN','InternetConsumerCommentYN','StandardStatus','MlsStatus']` | **FIELD claim** |
| `:85-89` | `MUST_EXIST_KEY_FIELDS = ['ListingKey','ListingKeyNumeric','ListingId','ResourceRecordKey','ResourceRecordKeyNumeric','ModificationTimestamp','PhotosChangeTimestamp']` | **FIELD claim** |
| `:143` | `REBNY_CF` — the same 40 CustomFields names, re-typed a second time | **FIELD claim** (duplicate of the form audit's) |
| `:174-193` | `INTENT_MARKERS` — 18 regexes incl. `/CLAUDE\.md/i`, `/defensive(?:\s+only)?/i`, `/vendor[-\s]?confirmed/i` | RULE/policy (what counts as documented-intentional) |
| `scripts/trestle-forbidden-fields.ts:16-44` | `FORBIDDEN_FIELDS` — 17 entries | **FIELD claim**, contract-guarded ✅ |
| `scripts/trestle-forbidden-fields.ts:51-53` | `FORBIDDEN_LIVE_ALLOWLIST = {ResourceRecordID}` | RULE/policy |

**4. DRIFT ALREADY PRESENT.**

- **Wrong live enum member in the guidance string. `scripts/trestle-forbidden-fields.ts:35` and `:37`** both say `use Media resource (MediaCategory="Floor Plan")`. Live `Media.MediaCategory` members are **`FloorPlan`** — no space. `"Floor Plan"` is not a member. The same wrong spelling is in the comment at `:31-32` (`Photo / Floor Plan / Video / Virtual Tour`) and in **CLAUDE.md §D's last bullet**. `"Virtual Tour"` is also not a member — live members are `BrandedVirtualTour` / `UnbrandedVirtualTour`. This is the text the audit prints as the remediation instruction and that agents copy.
- **`MUST_EXIST_GATE_FIELDS` certifies a field the provider has suppressed.** `:79` `InternetEntireListingDisplayYN` — contract fact: `filterable: false, probeHttp: 400, populated: null`. The audit prints `✓` because the name is in `$metadata`. Existence ≠ usability, and the contract has `assertFilterable` precisely for this. Same for `:82` `MlsStatus` (`filterable: false, probeHttp: 400`), which the repo's own canonical module (`lib/listings/mallan-status.ts:30`) rules is "not filterable and null on every sampled row". The audit asserts `MlsStatus` **must exist** as a "RLS-side status" while the project's status domain says it must never be used as a status fact.
- **Soundness hole: `MUST_EXIST` is checked against `live.all`, which includes non-deterministic sampled blob keys.** `:226` and `:235` test `live.all.has(f)`. `live.all` was polluted at `:139` (sampled `CustomFields` keys) and `:144` (the hardcoded 40). So a gate field disappearing from `$metadata` would still print `✓` if a `CustomProperty` blob happened to carry that key. The script *documents this exact hazard* at `:285-291` and builds a clean `liveSchemaFields` at `:292-295` — then uses it only for the drift guard, not for the MUST_EXIST checks 60 lines above.
- **Stateful-regex bug → silent under-reporting of forbidden references.** `:255` creates `const re = new RegExp(…, 'g')` **once** per (file × forbidden field); `:261` then calls `re.test(line)` inside the `lines.forEach` at `:256`. `RegExp.prototype.test` with the `g` flag advances `lastIndex` on a match and only resets on a miss. After any hit, the next line is searched from a stale offset, so a forbidden reference near the start of the following line is skipped. This is a correctness defect in the guard's core loop.
- **`/CLAUDE\.md/i` as an intent marker (`:180`) is an unbounded escape hatch.** Any forbidden-field hit with the string `CLAUDE.md` within ±5 lines is downgraded from `FORBIDDEN_REFERENCE` (fatal) to `LEGACY_GUARD` (informational). Combined with `:260` skipping all comment-leading lines, most real hits can be silenced by a nearby comment.
- **Dangling citations to a deleted document.** `:19-20` cites `CLAUDE.md "Trestle Media API Rules — Vendor-Confirmed 2026-04-07"`; `:94-95` and `trestle-forbidden-fields.ts:8-9` cite `CLAUDE.md "Fields That DO NOT EXIST on Trestle - NEVER USE"`; `:196-199` in the form audit cites the CustomFields section; `trestle-forbidden-fields.ts:50` cites `CLAUDE.md vendor-confirmed 2026-04-07`. **`grep` over CLAUDE.md and AGENTS.md finds none of these strings.** Every provenance claim in the forbidden-field guard points at nothing.
- `FORBIDDEN_FIELDS` itself is **clean** — I re-verified all 17 against the contract: `IDXEntireListingDisplayYN`, `SyndicateYN`, `VOWEntireListingDisplayYN`, `VOWAutomatedValuationDisplayYN`, `VOWConsumerCommentYN`, `MoveInCostsAmountTotal`, `FirstShowingDate`, `PossessionDate`, `YearRenovated`, `VideoURL`, `FloorPlanURL`, `MatterportURL`, `InteractiveFloorPlanURL`, `ListingSocialMediaURL`, `BuildingSocialMediaURL` all absent from all 17 resources; `ResourceRecordID` present on `HistoryTransactional`+`Media` and correctly allowlisted. `MoveInCostsAmount`/`MoveInCostsComments` correctly removed (both live on `Property`). `SyndicateTo` (the suggested replacement) is live on 9 resources. `ActivationDate` (the `FirstShowingDate` replacement) is live on `Property`.

**5. CAN IT BE WIRED TO COTALITY? — Yes, and it is the highest-value rewire in the set.**
- Swap the live fetch for `cotalityFieldFact` / `isFilterable` from `lib/cotality/contract.ts`. `MUST_EXIST_GATE_FIELDS` then becomes a **filterability** assertion, not an existence one, which is the fact the code actually depends on — and it would immediately surface that `InternetEntireListingDisplayYN` and `MlsStatus` cannot be `$filter`ed. It also becomes creds-free and CI-runnable.
- What breaks: the `FORBIDDEN_NOW_LIVE` drift guard genuinely needs a fresh pull and must stay in the daily cron. Keep exactly that one check live; move everything else to the contract.
- Fix the `'g'` flag (`:255`) and de-duplicate `REBNY_CF` (`:143`) against the form audit's copy regardless.

**6. VACUOUS CHECKS.**
- **The entire documented `STALE_REFERENCE` scan does not exist.** The header (`:5-8`) promises: *"Extracts every CamelCase token that LOOKS like a Trestle field name (≥8 chars, starts uppercase, recognized fragment) and cross-checks against live Trestle metadata."* No such extraction is implemented. `STALE_REFERENCE` appears only in the type union at `:164` and is never pushed. Likewise `GATE_FIELD`, `KEY_FIELD`, `ATTRIBUTION`, `PII_MASK` (documented `:14-24`) are **not even in the union** — the audit's own header describes five categories, four of which are fiction and one of which is dead. Anyone reading the header believes server code is swept for unknown field names. It is not; only the 17 known-forbidden names are.
- **Requires LIVE network + creds** (`:48-51`). **Cannot run in PR CI.**

## 3c. `scripts/audit-trestle-non-property-resources.ts` (`npm run trestle:audit-resources`)

**1. WHAT IT CHECKS.** Greps `lib/idx`, `lib/compliance`, `app/api` for `/odata/<Resource>` URLs and `$expand=<Resource>($select=…)` blocks, extracts the `$select` field names, and verifies each exists on that resource in live `$metadata`.

**2. AUTHORITY TODAY: does NOT import the committed contract.** Live `$metadata` fetch at `:46`, regexed at `:48-57`.

**3. HARDCODED LISTS.**

| file:line | literal | class |
|---|---|---|
| `:24-28` | `RESOURCES = ['Member','Office','Media','OpenHouse','PropertyUnitTypes','Building','Teams','TeamMembers','PropertyGreenVerification','PropertyRooms','CustomProperty']` | **RESOURCE claim** |
| `:30` | `SCAN_PATHS = ['lib/idx','lib/compliance','app/api']` | scan configuration |
| `:122,124,126,127,150` | `$select` / `$expand` extraction regexes | text heuristics |
| `:118` | 30-line lookback window | heuristic constant |

**4. DRIFT ALREADY PRESENT.**

- **The list omits 4 resources that this subscription can actually read.** Missing vs. the contract: `Field` (accessible, 15 fields), `Lookup` (accessible, 15), `Model` (accessible, 8), `Property` (deliberately, by scope) — plus `Enumeration` and `HistoryTransactional`. `Field`/`Lookup`/`Model` are exactly the catalogues `scripts/cotality/authority/lib.mjs:133-136` queries with `$select=FieldKey|LookupKey|ModelKey`. A `$select` typo against `/odata/Lookup` in `lib/` or `app/` is invisible to this audit.
- **The list includes 4 resources this subscription cannot read:** `Building` (rejected, 403), `Teams` (rejected, 400), `TeamMembers` (rejected, 400), `PropertyGreenVerification` (rejected, 404). They are declared in `$metadata`, so `liveByResource.get()` resolves and the audit "checks" `$select` lists against resources that return an error on every request. The contract has `accessOf` / `assertAccessible` for precisely this; the audit has no concept of entitlement.
- No wrong field or enum literal found in the script itself.

**5. CAN IT BE WIRED TO COTALITY? — Yes, straightforwardly.** Replace `RESOURCES` (`:24-28`) with `COTALITY_RESOURCES.filter(r => r !== 'Property')` and replace `liveFields.has(bare)` (`:135`, `:159`) with `isCotalityField(resource, bare)`, plus an `accessOf(resource).state` note on rejected resources. Creds-free, CI-runnable, and it gains `Field`/`Lookup`/`Model` coverage. What breaks: loses same-day vendor-drift detection (mitigated — the contract snapshot is dated and the authority `detect` covers freshness).

**6. VACUOUS CHECKS.**
- **Silent skip on an unrecognised resource.** `:112-113` and `:154` — `if (!liveFields) continue;`. If the entity-type regex at `:48` fails to match (an `$metadata` formatting change, a resource renamed), the audit reports **`✓ Every $select … uses fields that exist`** and exits 0 having checked nothing. There is no "0 resources resolved → UNVERIFIED" guard.
- **Everything is a regex over source text.** `:110` (`/odata/<Resource>`), `:122-127` (`$select` string-literal shapes), `:150` (`$expand=…($select=…)`). A `$select` built from a variable, an array `.join(',')`, a template literal with an interpolation, or a `cotalityFields(...)` call is invisible — which is now the *dominant* shape in the codebase given `lib/cotality/contract.ts:75` exists. The `:134`/`:158` filter `if (/[^A-Za-z]/.test(bare)) continue;` also drops any name containing a digit or underscore.
- **`:103`** skips lines starting `//` or `*`, so a `$select` inside a template literal whose line begins with `*` is skipped.
- **Requires LIVE network + creds** (`:19-22`). **Cannot run in PR CI.**

---

# 6. `scripts/cotality/authority/cli.mjs` (`npm run cotality:authority` / `trestle:diff`)

**1. WHAT IT CHECKS.** The authority lifecycle: `init` (state from a full bundle), `status` (committed state + health), `detect` (4 live requests → UNCHANGED/CHANGED/UNVERIFIED), `refresh` (incremental live recompile → exact diff → blast-radius impact → BLOCK), `simulate`, `impact`, `boundary` (raw-Cotality-read census vs `boundary.json`), `report`. `npm run trestle:diff` = `cli.mjs detect`.

**2. AUTHORITY TODAY: it *is* the contract's authority layer.** Imports at `:16-33`: `../live-client.mjs`, `../contract-codegen.mjs`, and `./lib.mjs` (which reads `PATHS.compact` / `PATHS.lookups` / `PATHS.state` / `PATHS.health`, `lib.mjs:28-34`). Every resource and field name it handles comes from the live `$metadata` parse and the live `Field`/`Lookup`/`Model` catalogues. **No hardcoded provider field list anywhere in `cli.mjs`.**

**3. HARDCODED LISTS.**

| file:line | literal | class |
|---|---|---|
| `scripts/cotality/authority/lib.mjs:133-136` | catalogue resources `'Field'`, `'Lookup'`, `'Model'` and key fields `'FieldKey'`, `'LookupKey'`, `'ModelKey'` | **RESOURCE/FIELD claim** — all six verified present in the contract |
| `lib.mjs:70` | `maxTimestamp(rows, key = 'ModificationTimestamp')` | **FIELD claim** — live on all 17 resources ✅ |
| `lib.mjs:191-194` | `$select: 'ResourceName,FieldName,ModificationTimestamp'` on `Lookup` | **FIELD claim** — all three live on `Lookup` ✅ |
| `lib.mjs:494-502` | `REPAIR_STEPS` (canonical mapping → Sale/Rental execution → storage/projection → Saved Search → Reports → CMA → browser verification) | **RULE** — Maya's repair order, correctly not from Cotality |
| `lib.mjs` `SURFACE_RULES` (used at `:489`) | surface classification by file path | configuration |
| `cli.mjs:153-154` | `data/cotality-contract/boundary.json`, `boundary-baseline.json` | path configuration |
| `contract-codegen.mjs:58` | `normalizeResourceName` = strip `_` (`Custom_Property`→`CustomProperty`) | provider naming rule, live-derived |

**4. DRIFT ALREADY PRESENT.** **None found.** I verified every hardcoded name against the contract: `Field`/`Lookup`/`Model` are all `accessible` (HTTP 200); `Field.FieldKey`, `Lookup.LookupKey`, `Model.ModelKey`, `ModificationTimestamp`, `Lookup.ResourceName`, `Lookup.FieldName` all declared. `authority status` → exit 0, `HEALTHY`, watermarks field `2026-09-06T21:41:25Z` / lookup `2026-09-07T22:33:04Z` / model `2026-09-04T08:45:33Z`, one non-blocking `observed-value-added Property.City "Espíritu Santo"`.

Two **scope** gaps rather than value drift:

- **The impact/boundary engine cannot see `scripts/`.** `scripts/cotality/authority/impact.mjs:41` — `return f.startsWith('lib/') || f.startsWith('app/')` (plus `public/crm/js` word-matching at `:637`). `boundary-baseline.json` = 61 files / 482 keys / 794 sites, **0 under `scripts/`**. So a Cotality field change produces **no blast-radius entry for any of the six validators in this report**, including `ops-health.js`'s `MediaURL` read and every hardcoded list catalogued above. The validators are outside the very system that is supposed to quarantine field drift.
- **CI workflow description is stale.** `.github/workflows/trestle-live-audit.yml:103` names the step **"CSV vs live diff"** and `:108-113` describes `trestle:diff` as detecting *"CSV (field,resource) rows whose field no longer exists on live"*, pointing at `refresh-csv --prune`. `trestle:diff` is now `cli.mjs detect` — a 4-request watermark/hash comparison with no CSV anywhere. `:170` tells triagers to see `scripts/refresh-trestle-csv.ts`; **that file does not exist** (`ls` → No such file). A `trestle:diff` failure sends the operator to a deleted script.

**5. CAN IT BE WIRED TO COTALITY? — Already is; two small tightenings.**
- Assert the six catalogue names (`lib.mjs:133-136`) through `isCotalityField('Field','FieldKey')` etc. rather than string literals, so a provider rename of the catalogue key fails loudly instead of returning a confusing `UNVERIFIED` from `countSince`.
- Widen `impact.mjs:41` `isRepoSource` to include `scripts/`. That is the single change with the largest coverage payoff in this report — it puts every validator inside the blast radius. Cost: the census grows (`boundary-baseline.json` "may only shrink" rule at `cli.mjs:162-164` would need a one-time `--allow-growth` with Maya's authorization, which is a HELD action).

**6. VACUOUS CHECKS.** None found — this is the one component that fails closed by construction: `detect` returns `UNVERIFIED` on any acquisition error (`lib.mjs:138-140`), `refresh` throws on incomplete pagination (`lib.mjs:172`, `:190`, `:210`) and writes nothing, `countSince` throws unless `@odata.count` is a number (`lib.mjs:114`), and `readSnapshot` throws rather than defaulting (`lib.mjs:51`). Exit codes are meaningful (0 healthy/unchanged, 1 BLOCKED/CHANGED, 2 UNVERIFIED).

One caveat worth stating plainly per J.8: **`authority status` green proves only that the *committed* snapshot's health document says HEALTHY as of 2026-09-08T06:27Z. It proves nothing about the live feed today** — only `detect` / `refresh` do that, and both need network.

---

# 7. `scripts/cotality/generate-contract-types.mjs` (`npm run cotality:generate:check`)

**1. WHAT IT CHECKS.** `--check`: re-renders `lib/cotality/generated/contract.ts` in memory from the committed `contract.compact.json` + `lookups.live.json` and exits 1 unless byte-identical; also exits 1 if the snapshot is `schema-only`. `--from=<bundle>`: regenerates all three artifacts, refusing a schema-only bundle (`:71-74`) and refusing any accessible-resource field lacking a boolean `filterable` verdict (`:76-86`).

**2. AUTHORITY TODAY: it *produces* the contract.** Imports `compactFromBundle`, `renderContractTs` from `./contract-codegen.mjs` (`:20`); paths at `:23-25`.

**3. HARDCODED LISTS.** **None.** No field name, resource name, enum member, or status literal appears in the file. The only string constants are the three artifact paths and the flag names `--check` / `--from=` / `--allow-schema-only`.

**4. DRIFT ALREADY PRESENT.** **None.** I ran it: `CHECK OK: contract.ts matches snapshot (probe_mode=light, metadata_sha=a60bcbbd, acquired_at=2026-09-08T06:26:36.364Z)`, exit 0. **The committed contract is in sync with what the generator would produce.**

**5. CAN IT BE WIRED TO COTALITY? — N/A / already correct.** One gap: `--check` proves the generated TS matches the **committed snapshot**; it does **not** prove the snapshot matches the **live feed**. That second question is `cli.mjs detect`'s job, and only that command answers it. Neither the script nor its test asserts a **staleness bound** on `fingerprint.acquired_at` — a snapshot six months old would still pass `--check` cleanly. Adding a max-age assertion (fail or warn past N days) is the one meaningful hardening available here.

**6. VACUOUS CHECKS.** None. The refusals are real and fail-closed (`:54-57`, `:71-74`, `:83-86`).

---

# CROSS-CUTTING

### Which require LIVE network — i.e. what can never be enforced in PR CI

| command | network | creds | in PR CI? |
|---|---|---|---|
| `cotality:generate:check` | **none** | none | ✅ **yes** — via `tests/runtime/cotality-generated-contract.test.ts:20-27` (`execFileSync` of the generator) under `npx jest --ci` at `pr-check.yml:135` |
| `cotality:authority status` / `report` / `impact` / `simulate` / `boundary` | none | none | ❌ not wired to any workflow, but **could be** |
| `cotality:authority detect` (= `trestle:diff`) | **LIVE Cotality** (4 req) | `IDX_CLIENT_ID/SECRET` | ❌ daily cron only |
| `cotality:authority refresh` | **LIVE Cotality** (many req) | yes | ❌ manual |
| `trestle:audit-forms` | **LIVE Cotality** (`$metadata` + `CustomProperty?$top=20`) | yes, hard-exit `:47-50` | ❌ daily cron only |
| `trestle:audit-server` | **LIVE Cotality** (same) | yes, hard-exit `:48-51` | ❌ daily cron only |
| `trestle:audit-resources` | **LIVE Cotality** (`$metadata`) | yes, hard-exit `:19-22` | ❌ daily cron only |
| `ops:health` | **LIVE Neon** (`DATABASE_URL`, hard-exit `:61-66`) | DB URL | ❌ operator-only, no workflow |
| `health:probe` | `git`+`gh`+`neonctl`+**LIVE Neon**; **writes** the dashboard | mixed | ❌ operator-only, no workflow |

`grep -rn "ops:health\|health:probe\|cotality:generate:check\|cotality:authority" .github/workflows/ .githooks/` → **zero matches.** Only the three `trestle:audit-*` + `trestle:diff` appear, in `trestle-live-audit.yml` (daily 13:30 UTC, each `continue-on-error: true` with an aggregate gate, skipped entirely if the secrets are unset — `:59-79`).

**Net:** of the six validators, exactly **one** (`generate:check`) is enforced on every PR. Four of the remaining five are contract-adjacent checks that are structurally *un-enforceable* in CI **only because they fetch live `$metadata` for facts the committed contract already holds.** Rewiring the three `trestle:audit-*` scripts to `lib/cotality/contract.ts` would move all three into PR CI creds-free, leaving only `FORBIDDEN_NOW_LIVE` and `authority detect` in the daily live lane. That is the single structural change with the largest enforcement payoff.

### Active red / must-fix, ranked

1. **`trestle:audit-forms` is failing today (exit 1)** — 5 Mallan-local `auction_*` names carrying `data-cotality-field` in `public/crm/SALE-FORM-REDESIGN.html:761,767,777,782,787`; no live Cotality resource declares any `/auction/i` field. `trestle-live-audit.yml` has been opening a `trestle-drift` issue on every scheduled run. Related: phantom `AuctionYN` / `AuctionTermsUrl` fallbacks at `lib/compliance/rls-enforcement.ts:677,681`.
2. **`trestle:audit:all` runs 1 of 3 audits** — `&&` short-circuit in `package.json` behind the failure above.
3. **Wrong live enum member in remediation guidance** — `"Floor Plan"` (live: `FloorPlan`) at `scripts/trestle-forbidden-fields.ts:31,35,37` and CLAUDE.md §D; `"Virtual Tour"` (live: `BrandedVirtualTour`/`UnbrandedVirtualTour`).
4. **Stateful `/g` regex under-reports forbidden references** — `scripts/audit-server-trestle-coverage.ts:255` + `:261`.
5. **Documented scans that do not exist** — `STALE_REFERENCE`/`GATE_FIELD`/`KEY_FIELD`/`ATTRIBUTION`/`PII_MASK` (`audit-server:5-24`, `:164`); `STALE_BINDING` (`audit-form:8,171,321`).
6. **`MUST_EXIST` checked against a set polluted by sampled JSON-blob keys** — `audit-server:226,235` use `live.all`, not the clean `liveSchemaFields` the same file builds at `:292`.
7. **Existence asserted where filterability is the load-bearing fact** — `InternetEntireListingDisplayYN` and `MlsStatus` are both `filterable:false / HTTP 400` in the contract, printed `✓` by the audit.
8. **Three unguarded copies of the terminal-status list in `ops-health.js`** (`:225,243,296`) driving a `critical` §2.05 count; the test only guards the fourth copy.
9. **`probe.ts:208` feed-bloat invariant under-counts** by ignoring the legacy `Sold`/`Rented`/`Leased` spellings its sibling validator does include.
10. **`scripts/` is outside the boundary census and blast radius** — `impact.mjs:41`.
11. **Dangling provenance** — four separate citations to CLAUDE.md sections that no longer exist; `refresh-trestle-csv.ts` referenced by `trestle-live-audit.yml:170` and deleted; workflow step "CSV vs live diff" describes a command that no longer does that.

I ran only read-only reporters (`generate-contract-types.mjs --check`, `authority status`, `trestle:audit-forms`) plus local contract queries. I did not run `ops:health` (would wake the production Neon compute, against the cost-control policy) and did not run `health:probe` (it writes `docs/PROJECT-HEALTH-DASHBOARD.md`). No file was created, edited, or deleted.