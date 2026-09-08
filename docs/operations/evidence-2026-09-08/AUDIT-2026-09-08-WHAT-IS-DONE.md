# Audit 2026-09-08 — what is actually done (branch `search/browser-integration-2026-09-05`)

Authority: the live Cotality (Trestle) IDX Plus feed `Trestle-11371-20`, measured — not a repo constant, not a
prior report. Every "fixed" below has a test that failed before the change. Nothing was pushed; nothing in
production was mutated; no schema, env, cron or `.github/workflows/**` file changed.

## 1. The four owner rulings (the morning of 2026-09-08)

| Ruling | What changed | Commit |
|---|---|---|
| 1 — Cotality is the current provider; RLS is the old framing | The validators judge field existence and vocabulary by the live contract only; REBNY's reference list (`Lookup.SystemReferences`) became an advisory; the 20 `rls:validate` errors were classified (none a REBNY compliance binding). Then, the same day: the whole old RLS / RESO / RealPlus reference system was removed and the 16 binding defects corrected (§2, §3). | `6c041c77`, this commit |
| 2 — "Delisted" is not a status; the word is **Off Market** | Presence is a fact (`listings.sync_status = 'off_feed'`, `terminal_since` = the off-feed clock); the last verified provider status is preserved; nothing manufactures Withdrawn / Cancelled / Expired / Hold; `lifecycleFromStoredRow` renders `off_market` for an on-market provider stage that left the feed; the reconciler, the retention archive and every public / CRM reader converged; `lifecycle/off-market-correction-plan.sql` (dry run) restores the 6,962 mislabelled production rows | `78e559e1` |
| 3 — DOM is two clocks | `lib/compliance/dom-tracker.ts` is the one rule: the market clock (later of `OnMarketDate` / `ActivationDate` → contract signed = `PurchaseContractDate` on Pending / Closed, rental fallback `CloseDate`; never `PendingTimestamp`) and the Coming Soon clock (`ContractStatusChangeDate` → `ActivationDate`, 14-day rule); accruing set {Active, ActiveUnderContract}; the provider's `DaysOnMarket` (null on every sampled row) never feeds a clock; UCBA rules, reports, CMA, mapper and DTOs consume the one rule (`dom-one-rule-wiring` ratchet) | `78e559e1` |
| 4 — Media has different owners | `Media.ResourceName` + `ResourceRecordKey` decide the owner (Property / Building / Member / Office / Contacts); listing galleries take Property media only; the sync counts and skips foreign owners; the resolver, hydrate, fetch, media batch and agent-listing routes converged (`media-owner-wiring` ratchet) | `a5f28289` |

## 2. The old provider reference system is gone and cannot come back

`docs/operations/evidence-2026-09-08/provider-system/REMOVAL-2026-09-08.md` lists every file removed (the REBNY
CSVs / workbook / registries, the `$metadata` snapshot, the RESO drift / audit artifacts, the bindings and rename
JSON, `compliance/fields.json` / `lookups.json` / `rls-required.json`, the master-reference doc, every generator and
validator that read them, the RESO toolkit, the dead CRM rule files), every consumer re-based on the live contract
(ten snapshot tests → `tests/runtime/cotality-contract-facts.ts`; the MCP field tool live-only; `idx-validate`,
the coverage matrix, the smoke test, the guardrails, `compliance/rules/active.json`, the enum-compliance test), the
form-binding rename (`data-rls-field` → `data-cotality-field`, `data-rls-ignore` → `data-mallan-ignore`, ≈1,900
attributes; the legacy spelling is a validator ERROR; `data-rls-viewer` stays, pinned by the held workflow), the
`package.json` commands removed and `trestle:diff` repointed at `cotality:authority detect`, and the agent
instructions / pointer docs (`CLAUDE.md`, `AGENTS.md`, the REBNY skill, four agents, the compliance index, the
charter, the Cotality references, README, project docs, `compliance/*.md`) that now name the live contract as the
only field authority. RealPlus is nowhere a current system.

The proof: `tests/runtime/no-legacy-provider-system.test.ts` (69 assertions) — no removed file exists, nothing
under the code / config / test / form / agent-instruction roots names one, no command runs one, no script reads or
writes a provider catalogue CSV / workbook / XML, the MCP has no fallback, the six CRM surfaces carry the current
binding names only, the rule manifest and the agent instructions point at the live contract.

## 3. The four CRM forms round-trip, proven in a real DOM

`docs/operations/evidence-2026-09-08/forms/DOMAIN-FORMS-ROUNDTRIP.md`. `tests/runtime/crm-form-dom-roundtrip.test.ts`
loads each page into jsdom, fills every editable control, saves through the REAL `POST` / `PATCH` handlers
(enforcement gate included), reloads through the page's own loader and compares every control — create → save →
reload → edit → save → reload — for the sale and rental entry forms, and opens each WITH-TOOLS viewer the way the
CRM does.

- Rental entry form: restored 57 of 266 saved controls on edit; eight checkbox groups lost their selection at
  save; the address went out under a legacy key the enforcement gate cannot see (every RLS-eligible rental blocked);
  furnished terms, units, new-construction, two gates and the activation date were never sent; a blank lot size (0)
  triggered REBNY AREA-UNITS-003 on every apartment; `6+` bedrooms, `Incomplete`, participant-only, the display
  intent and the exclusive expiry reloaded wrong. All fixed; the two binding defects corrected.
- Sale entry form (Maya's working form — changes are additive): five modal-sourced facts went to the server empty
  (a required co-op field among them); three Yes/No selects were typed as booleans (tax abatement could never be
  true); the first-showing time was lost; 30+ townhouse figures and the building-profile selects never came back;
  "East" street directions were refused by the live-enum boundary since 2026-09-06 (422 on save, both forms). All
  fixed; the four binding defects corrected (CurrentUse members, FireplaceYN + the FIREPLACE-001 details, the
  syndication intent key).
- Once the proof ran as an RLS-eligible condo (the enforcement gate live), both entry forms showed why an
  RLS-eligible save had been failing: the REBNY-mandatory `YearBuilt`, `ElevatorsTotal`, `SubdivisionName`
  (sale) and `TaxLot`, `YearBuilt` (rental) were mapped before the building modal was collected and went out
  empty; `ListAgentMlsId` went out empty from both forms (the session identity sits outside the collector's
  container); the sale form never sent `LivingAreaUnits` and did not cascade the subordinate gates under opt-out;
  and the DG-003 gate read the provider permission key the 2026-09-06 mapping removes, blocking every owner-opt-out
  sale. All fixed with tests (`rls-enforcement-mallan-permission.test.ts` red → green).
- The two viewers had never executed: a literal `</script>` in a string and an unterminated string (both in HEAD)
  killed their scripts, and the boot blanked the page before the API answered. Fixed; one projection per page; every
  saved fact restored onto the 338 / 417 shared controls; 60 phantom hydrate targets removed.

## 4. The audit after everything

| Check | Result | What it proves |
|---|---|---|
| `npx tsc --noEmit --incremental false` | 0 errors | the program type-checks against the generated live contract |
| `npm run rls:validate` | **0 errors**, 53 advisories, 0 missing (was 20 → 16 → 0) | every form binding is a live Cotality field or a declared Mallan key with live values; a legacy attribute would be an error |
| `npm run validate:form-rls` (CI) | exit 0 | the CI cross-check on the two entry forms |
| `npm run compliance-check` | 95 pass / 0 fail | static rules (BLOCKER + STRICT) |
| `npm run ucba:audit` | 46 pass / 0 fail / 0 regressions | the UCBA checklist |
| `npm run idx:validate` | 0 critical / 6 warnings | static IDX pipeline checks |
| `node scripts/ci/guardrails.mjs` | PASS | prohibited terms, deprecated hosts |
| `npm run crm:test` | 37 / 37 | the CRM smoke suite (built page rebuilt with `npm run crm:build`) |
| Jest, every project | **490 suites / 8,530 tests passed · 0 failed** (6 suites / 32 tests skipped) | including the no-legacy ratchet (70 assertions), the DOM round-trip proof (RLS-eligible, gate live) and the DG-003 test |
| Adversarial verification (six read-only lenses + a skeptic per finding) | 24 findings confirmed on the first pass, every one fixed before the commit (`provider-system/REMOVAL-2026-09-08.md` §4b); the held workflow prose and the memory files are the recorded residuals | the tree was reviewed against the ruling, not only against the tests I wrote |
| Cotality boundary ratchet | 482 file::field keys (baseline regenerated), 0 new | no new raw provider read outside the boundary |
| Select-authority ratchet | green | one selection authority per resource |
| Search coverage matrix (regenerated) | static-defect register: `rental-rules-status-vocabulary` RESOLVED, `no-round-trip-test` and `patch-bypasses-contract` NOT REPRODUCED; still CONFIRMED and recorded: `viewer-phantom-targets` (15 UI-container ids per viewer, not listing facts), `manage-listings-closed-rejected`, `compliance-allowed-phantoms`, `rent-vs-buy-synthetic-price`, `crm-calculators-no-category-guard`, `status-vocabularies-multiplied`, `cma-own-provider-mapping` (the next refactor) | the register never hides a defect |

Each check proves what its row says and nothing else: none of them queries the live feed; the live facts in §1
were measured with `npm run cotality:query` during the session and are dated in the domain notes.

## 5. What did not change, and why

- `lib/idx/sync.ts` (held), `.github/workflows/**` (read-only: `trestle-live-audit.yml:170` still *mentions* the
  removed CSV refresher in a comment; the command it runs is the authority CLI), `.claude/settings.local.json`,
  schema, env, crons, production data.
- Dated evidence, audits and handoffs keep their historical text; they are history, not pointers.
- Nothing pushed: this branch is local commits ahead of `origin/search/browser-integration-2026-09-05`.

## 6. Decisions Maya owns (one list)

1. Authorize the production correction plan for the 6,962 Off Market rows (`lifecycle/off-market-correction-plan.sql`, dry run) and the projection backfill.
2. Back-on-market interval policy for the market clock (a listing that returns after an off-feed gap: continue or restart).
3. Public rendering of DOM (which clock, if any, the public listing page shows).
4. Pending-rental contract semantics: 8 of 354 live Pending rentals carry no `PurchaseContractDate` (the fallback is `CloseDate` on Closed).
5. Whether `SyndicateOptOut` / `OfficeInactive` withdraw IDX display permission — ask rlssupport@rebny.com.
6. The advisories: `LivingAreaSource`, `BusinessType`, `SyndicateTo`, `AvailableLeaseType` are exact Cotality fields REBNY's input references no member of — whether REBNY accepts them is a business question.
7. The viewers show the entry forms' shared controls; 67 sale / 27 rental entry-only controls are not on the viewers by design — add or leave.
8. The real save of tomorrow's rental listing against production is the one step the proof cannot run here.
9. Release the held sync lines (`expandCustomProperty: true`, the three literal Media selects) when ready.
10. "push" — nothing has been pushed.
