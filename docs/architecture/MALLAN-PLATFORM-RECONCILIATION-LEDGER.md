# Mallan platform — reconciliation ledger

> **Stage F0 — COMPLETE INVENTORY SKELETON.** Every row below is inventoried but
> **not yet reasoned about**. Every disposition is literally `unresolved` and every
> maturity/implementation field is `unassessed`. That is deliberate: a ledger with
> invented dispositions would look like accounting while hiding the fact that no
> reconciliation decision has been made. **Zero reasoned dispositions are claimed in
> this commit.**


**Total inventoried requirements: 600**


## Totals by source

| source | rows |
|---|---:|
| `PR#579-capability-obligation` | 1 |
| `PR#579-capability-registry` | 11 |
| `PR#579-machinery` | 6 |
| `PR#579-plan` | 135 |
| `PR#579-program-registry` | 12 |
| `PR#585-.github/copilot-instructions.md` | 1 |
| `PR#585-AGENTS.md` | 13 |
| `PR#585-AI-START-HERE.md` | 5 |
| `PR#585-README.md` | 11 |
| `PR#585-plan` | 141 |
| `deep-audit` | 12 |
| `recovered-plan` | 243 |
| `safe-main` | 9 |
| **TOTAL** | **600** |

## Totals by requirement family

| family | rows |
|---|---:|
| `P585` | 171 |
| `P579` | 132 |
| `COT` | 17 |
| `LST` | 17 |
| `BIZ` | 14 |
| `AUDIT` | 12 |
| `PER` | 12 |
| `TXN` | 12 |
| `CAP` | 11 |
| `CMA` | 10 |
| `IAM` | 10 |
| `OPS` | 10 |
| `SEA` | 10 |
| `ARC` | 9 |
| `C` | 9 |
| `HYG` | 9 |
| `DOC` | 8 |
| `GATE` | 8 |
| `MKT` | 8 |
| `ACT` | 7 |
| `AGT` | 7 |
| `BRK` | 7 |
| `BUS` | 7 |
| `CRM` | 7 |
| `ERR` | 7 |
| `MAIN` | 7 |
| `AUZ` | 6 |
| `INT` | 6 |
| `PH` | 6 |
| `POL` | 6 |
| `TRN` | 6 |
| `VER` | 6 |
| `AUD` | 5 |
| `SEL` | 5 |
| `REB` | 3 |
| `NYC` | 1 |
| `P0` | 1 |
| `P1` | 1 |
| `P10` | 1 |
| `P11` | 1 |
| `P2` | 1 |
| `P3` | 1 |
| `P4` | 1 |
| `P5` | 1 |
| `P6` | 1 |
| `P7` | 1 |
| `P8` | 1 |
| `P9` | 1 |

## Structural validation

| check | required | actual |
|---|---|---:|
| duplicate requirement IDs | 0 | 0 |
| malformed rows | 0 | 0 |
| blank requirement text | 0 | 0 |
| blank source sections | 0 | 0 |
| unrepresented recovered identifiers | 0 | 0 |

## Field vocabulary

`disposition`: `retained` · `combined` · `corrected` · `historical_only` · `deferred_with_gate` · `rejected_with_reason` · `unresolved`

`implementation_status`: `not_started` · `planned` · `schema_only` · `partially_implemented` · `implemented` · `integrated` · `limited_release` · `production_proven` · `retiring` · `retired`


## Ledger

| requirement_id | source | source_commit_or_pr | source_section | requirement | canonical_destination | disposition | reason_or_evidence | dependency | maturity | implementation_status | verification_status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DOC-1 | recovered-plan | 6e8ea2d9 | ## DOC-1 | Single source of platform truth | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| DOC-2 | recovered-plan | 6e8ea2d9 | ## DOC-2 | Repository entry points | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| DOC-3 | recovered-plan | 6e8ea2d9 | ## DOC-3 | Amend in place | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| DOC-4 | recovered-plan | 6e8ea2d9 | ## DOC-4 | Source-document consolidation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| DOC-5 | recovered-plan | 6e8ea2d9 | ## DOC-5 | No silent document drift | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| DOC-6 | recovered-plan | 6e8ea2d9 | ## DOC-6 | Coverage before retirement | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| DOC-7 | recovered-plan | 6e8ea2d9 | ## DOC-7 | Appendices stay inside this file | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| DOC-8 | recovered-plan | 6e8ea2d9 | ## DOC-8 | Retired identifiers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AGT-1 | recovered-plan | 6e8ea2d9 | ## AGT-1 | Absolute exhaustiveness | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AGT-2 | recovered-plan | 6e8ea2d9 | ## AGT-2 | Strict boundary anchoring | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AGT-3 | recovered-plan | 6e8ea2d9 | ## AGT-3 | Thought explicitness | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AGT-4 | recovered-plan | 6e8ea2d9 | ## AGT-4 | Atomic continuation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AGT-5 | recovered-plan | 6e8ea2d9 | ## AGT-5 | No spot patching | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AGT-6 | recovered-plan | 6e8ea2d9 | ## AGT-6 | No assumption substitution | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AGT-7 | recovered-plan | 6e8ea2d9 | ## AGT-7 | Read before claiming | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BUS-1 | recovered-plan | 6e8ea2d9 | ## BUS-1 | What Mallan is building | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BUS-2 | recovered-plan | 6e8ea2d9 | ## BUS-2 | Current data boundary | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BUS-3 | recovered-plan | 6e8ea2d9 | ## BUS-3 | Static CRM is temporary | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BUS-4 | recovered-plan | 6e8ea2d9 | ## BUS-4 | One system does not mean one generic screen | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BUS-5 | recovered-plan | 6e8ea2d9 | ## BUS-5 | Mallan responsibility | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BUS-6 | recovered-plan | 6e8ea2d9 | ## BUS-6 | Repository boundary | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BUS-7 | recovered-plan | 6e8ea2d9 | ## BUS-7 | No dependency on external listing-entry products | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| REB-1 | recovered-plan | 6e8ea2d9 | ## REB-1 | REBNY responsibility | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| REB-2 | recovered-plan | 6e8ea2d9 | ## REB-2 | Effective dates | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| REB-3 | recovered-plan | 6e8ea2d9 | ## REB-3 | Fail closed on unclear REBNY requirements | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-1 | recovered-plan | 6e8ea2d9 | ## COT-1 | Cotality responsibility | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-2 | recovered-plan | 6e8ea2d9 | ## COT-2 | Evidence precedence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-3 | recovered-plan | 6e8ea2d9 | ## COT-3 | Live verification | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-4 | recovered-plan | 6e8ea2d9 | ## COT-4 | Field existence is not permission | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ARC-1 | recovered-plan | 6e8ea2d9 | ## ARC-1 | No client-side provider calls | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ARC-2 | recovered-plan | 6e8ea2d9 | ## ARC-2 | One application-service door | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ARC-3 | recovered-plan | 6e8ea2d9 | ## ARC-3 | No silent failure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-5 | recovered-plan | 6e8ea2d9 | ## COT-5 | No provider guessing | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-1 | recovered-plan | 6e8ea2d9 | ## LST-1 | No duplicate public matched pair | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-2 | recovered-plan | 6e8ea2d9 | ## LST-2 | No local provider mutation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-3 | recovered-plan | 6e8ea2d9 | ## LST-3 | No provider overwrite of Mallan workflow | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| POL-1 | recovered-plan | 6e8ea2d9 | ## POL-1 | Compliance fails closed, except where the feed is pre-filtered | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ERR-1 | recovered-plan | 6e8ea2d9 | ## ERR-1 | Empty is not an error | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| HYG-1 | recovered-plan | 6e8ea2d9 | ## HYG-1 | No deletion by grep alone | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-1 | recovered-plan | 6e8ea2d9 | ## OPS-1 | No unsupported completion claim | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-4 | recovered-plan | 6e8ea2d9 | ## LST-4 | Exact prefix definitions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-5 | recovered-plan | 6e8ea2d9 | ## LST-5 | Separate dimensions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-6 | recovered-plan | 6e8ea2d9 | ## LST-6 | Example | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-7 | recovered-plan | 6e8ea2d9 | ## LST-7 | Matched-pair behavior | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-8 | recovered-plan | 6e8ea2d9 | ## LST-8 | No authority handover | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-9 | recovered-plan | 6e8ea2d9 | ## LST-9 | Current implementation shortcut | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-10 | recovered-plan | 6e8ea2d9 | ## LST-10 | Match confidence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-11 | recovered-plan | 6e8ea2d9 | ## LST-11 | Ambiguity fails closed | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-12 | recovered-plan | 6e8ea2d9 | ## LST-12 | Provider-controlled facts | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-13 | recovered-plan | 6e8ea2d9 | ## LST-13 | Mallan-controlled facts | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-14 | recovered-plan | 6e8ea2d9 | ## LST-14 | Discrepancy handling | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-15 | recovered-plan | 6e8ea2d9 | ## LST-15 | Reconciliation controls | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-16 | recovered-plan | 6e8ea2d9 | ## LST-16 | Durable match relationship | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| LST-17 | recovered-plan | 6e8ea2d9 | ## LST-17 | Existing implementation, verified | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-6 | recovered-plan | 6e8ea2d9 | ## COT-6 | Preserve both provider identifiers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-7 | recovered-plan | 6e8ea2d9 | ## COT-7 | Media identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-8 | recovered-plan | 6e8ea2d9 | ## COT-8 | Photo-first and media integrity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-9 | recovered-plan | 6e8ea2d9 | ## COT-9 | Freshness | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-10 | recovered-plan | 6e8ea2d9 | ## COT-10 | Unknown provider values | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-11 | recovered-plan | 6e8ea2d9 | ## COT-11 | Everything provider-derived is pulled live | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-12 | recovered-plan | 6e8ea2d9 | ## COT-12 | Committed snapshots are caches | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-13 | recovered-plan | 6e8ea2d9 | ## COT-13 | Unreachable is not unchanged | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-14 | recovered-plan | 6e8ea2d9 | ## COT-14 | Drift is blocking | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-15 | recovered-plan | 6e8ea2d9 | ## COT-15 | Recorded drift evidence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-16 | recovered-plan | 6e8ea2d9 | ## COT-16 | Attribution is provider-derived | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| COT-17 | recovered-plan | 6e8ea2d9 | ## COT-17 | Mapping tables are generated, not authored | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ARC-4 | recovered-plan | 6e8ea2d9 | ## ARC-4 | Target layers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ARC-5 | recovered-plan | 6e8ea2d9 | ## ARC-5 | Thin adapters | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ARC-6 | recovered-plan | 6e8ea2d9 | ## ARC-6 | Internal calls do not self-call HTTP | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ARC-7 | recovered-plan | 6e8ea2d9 | ## ARC-7 | Domain services are not public entry points | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ARC-8 | recovered-plan | 6e8ea2d9 | ## ARC-8 | Shared contract, not duplicated frontends | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ARC-9 | recovered-plan | 6e8ea2d9 | ## ARC-9 | Enforced by audit | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUZ-1 | recovered-plan | 6e8ea2d9 | ## AUZ-1 | Actor resolution | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUZ-2 | recovered-plan | 6e8ea2d9 | ## AUZ-2 | Resource authorization | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUZ-3 | recovered-plan | 6e8ea2d9 | ## AUZ-3 | Broker role does not override provider restrictions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUZ-4 | recovered-plan | 6e8ea2d9 | ## AUZ-4 | Non-disclosure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUZ-5 | recovered-plan | 6e8ea2d9 | ## AUZ-5 | Listing entitlement | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUZ-6 | recovered-plan | 6e8ea2d9 | ## AUZ-6 | Three distinct outcomes | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| POL-2 | recovered-plan | 6e8ea2d9 | ## POL-2 | Policy order | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| POL-3 | recovered-plan | 6e8ea2d9 | ## POL-3 | Fair Housing state | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| POL-4 | recovered-plan | 6e8ea2d9 | ## POL-4 | Versioned policy | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| POL-5 | recovered-plan | 6e8ea2d9 | ## POL-5 | Compliance-sensitive surfaces | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| POL-6 | recovered-plan | 6e8ea2d9 | ## POL-6 | Evaluation receives context | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TRN-1 | recovered-plan | 6e8ea2d9 | ## TRN-1 | Success envelope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TRN-2 | recovered-plan | 6e8ea2d9 | ## TRN-2 | Empty envelope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TRN-3 | recovered-plan | 6e8ea2d9 | ## TRN-3 | Error envelope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TRN-4 | recovered-plan | 6e8ea2d9 | ## TRN-4 | Exceptions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TRN-5 | recovered-plan | 6e8ea2d9 | ## TRN-5 | Envelope metadata is not persisted state | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TRN-6 | recovered-plan | 6e8ea2d9 | ## TRN-6 | No arbitrary response shapes | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| VER-1 | recovered-plan | 6e8ea2d9 | ## VER-1 | Separate contract and build versions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| VER-2 | recovered-plan | 6e8ea2d9 | ## VER-2 | Compatibility failure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| VER-3 | recovered-plan | 6e8ea2d9 | ## VER-3 | Compatibility is determined by contract version only | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| VER-4 | recovered-plan | 6e8ea2d9 | ## VER-4 | Every response advertises versions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| VER-5 | recovered-plan | 6e8ea2d9 | ## VER-5 | Clients never silently parse unknown shapes | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| VER-6 | recovered-plan | 6e8ea2d9 | ## VER-6 | Generated client lifecycle | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ERR-2 | recovered-plan | 6e8ea2d9 | ## ERR-2 | One public error taxonomy | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ERR-3 | recovered-plan | 6e8ea2d9 | ## ERR-3 | Error catalog fields | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ERR-4 | recovered-plan | 6e8ea2d9 | ## ERR-4 | No arbitrary route strings | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ERR-5 | recovered-plan | 6e8ea2d9 | ## ERR-5 | Error lifecycle | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ERR-6 | recovered-plan | 6e8ea2d9 | ## ERR-6 | No hanging catches or warnings | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ERR-7 | recovered-plan | 6e8ea2d9 | ## ERR-7 | Provider failure is never a false empty | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUD-1 | recovered-plan | 6e8ea2d9 | ## AUD-1 | Baseline | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUD-2 | recovered-plan | 6e8ea2d9 | ## AUD-2 | Ratchet | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUD-3 | recovered-plan | 6e8ea2d9 | ## AUD-3 | What the audit checks | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUD-4 | recovered-plan | 6e8ea2d9 | ## AUD-4 | The audit states its limits | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUD-5 | recovered-plan | 6e8ea2d9 | ## AUD-5 | Audit failures block | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| HYG-2 | recovered-plan | 6e8ea2d9 | ## HYG-2 | What counts as bloat | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| HYG-3 | recovered-plan | 6e8ea2d9 | ## HYG-3 | Disposition states | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| HYG-4 | recovered-plan | 6e8ea2d9 | ## HYG-4 | Required inventories | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| HYG-5 | recovered-plan | 6e8ea2d9 | ## HYG-5 | Temporary code contract | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| HYG-6 | recovered-plan | 6e8ea2d9 | ## HYG-6 | Safe removal proof | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| HYG-7 | recovered-plan | 6e8ea2d9 | ## HYG-7 | Per-change hygiene questions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| HYG-8 | recovered-plan | 6e8ea2d9 | ## HYG-8 | Platform check target | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| HYG-9 | recovered-plan | 6e8ea2d9 | ## HYG-9 | One branch, one bounded capability | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-1 | recovered-plan | 6e8ea2d9 | ## SEA-1 | Separate products, shared meaning | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-2 | recovered-plan | 6e8ea2d9 | ## SEA-2 | Public search scope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-3 | recovered-plan | 6e8ea2d9 | ## SEA-3 | Honest internal-search scope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-4 | recovered-plan | 6e8ea2d9 | ## SEA-4 | One canonical pipeline | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-5 | recovered-plan | 6e8ea2d9 | ## SEA-5 | Unsupported criteria | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-6 | recovered-plan | 6e8ea2d9 | ## SEA-6 | Deterministic parity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-7 | recovered-plan | 6e8ea2d9 | ## SEA-7 | Matched-pair suppression order | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-8 | recovered-plan | 6e8ea2d9 | ## SEA-8 | Search states | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-9 | recovered-plan | 6e8ea2d9 | ## SEA-9 | Field contract | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEA-10 | recovered-plan | 6e8ea2d9 | ## SEA-10 | Acceptance criteria | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CRM-1 | recovered-plan | 6e8ea2d9 | ## CRM-1 | Target | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CRM-2 | recovered-plan | 6e8ea2d9 | ## CRM-2 | Inventory first | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CRM-3 | recovered-plan | 6e8ea2d9 | ## CRM-3 | Vertical-slice migration | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CRM-4 | recovered-plan | 6e8ea2d9 | ## CRM-4 | Retirement gate | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CRM-5 | recovered-plan | 6e8ea2d9 | ## CRM-5 | Client identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CRM-6 | recovered-plan | 6e8ea2d9 | ## CRM-6 | Durable history | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CRM-7 | recovered-plan | 6e8ea2d9 | ## CRM-7 | Listing creation and matched-pair display | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEL-1 | recovered-plan | 6e8ea2d9 | ## SEL-1 | Seller portal purpose | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEL-2 | recovered-plan | 6e8ea2d9 | ## SEL-2 | Truth levels | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEL-3 | recovered-plan | 6e8ea2d9 | ## SEL-3 | Live activity is separate from CMA | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEL-4 | recovered-plan | 6e8ea2d9 | ## SEL-4 | Live activity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| SEL-5 | recovered-plan | 6e8ea2d9 | ## SEL-5 | Seller sees only shared versions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-1 | recovered-plan | 6e8ea2d9 | ## CMA-1 | Automatic starting set | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-2 | recovered-plan | 6e8ea2d9 | ## CMA-2 | Evidence classification | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-3 | recovered-plan | 6e8ea2d9 | ## CMA-3 | Agent control | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-4 | recovered-plan | 6e8ea2d9 | ## CMA-4 | No central approval by default | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-5 | recovered-plan | 6e8ea2d9 | ## CMA-5 | Facts versus judgment | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-6 | recovered-plan | 6e8ea2d9 | ## CMA-6 | Versioning | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-7 | recovered-plan | 6e8ea2d9 | ## CMA-7 | Selection reasons | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-8 | recovered-plan | 6e8ea2d9 | ## CMA-8 | Subject record authority | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-9 | recovered-plan | 6e8ea2d9 | ## CMA-9 | Refresh and alert | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CMA-10 | recovered-plan | 6e8ea2d9 | ## CMA-10 | Re-verification before issuance | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-0 | recovered-plan | 6e8ea2d9 | ## BIZ-0 | Every obligation carries its authority | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-1 | recovered-plan | 6e8ea2d9 | ## BIZ-1 | Compensation timeline: three separate changes | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-2 | recovered-plan | 6e8ea2d9 | ## BIZ-2 | Written representation agreements and showing eligibility | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-3 | recovered-plan | 6e8ea2d9 | ## BIZ-3 | Who pays | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-4 | recovered-plan | 6e8ea2d9 | ## BIZ-4 | Compensation arrangement model | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-5 | recovered-plan | 6e8ea2d9 | ## BIZ-5 | Engagement types | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-6 | recovered-plan | 6e8ea2d9 | ## BIZ-6 | Commission is earned only at closing | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-7 | recovered-plan | 6e8ea2d9 | ## BIZ-7 | Required negotiability disclosure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-8 | recovered-plan | 6e8ea2d9 | ## BIZ-8 | Services may not be described as free | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-9 | recovered-plan | 6e8ea2d9 | ## BIZ-9 | Compensation must never appear in listing content | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-10 | recovered-plan | 6e8ea2d9 | ## BIZ-10 | Legacy compensation fields: live probe result | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-11 | recovered-plan | 6e8ea2d9 | ## BIZ-11 | Agency relationship and disclosure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-12 | recovered-plan | 6e8ea2d9 | ## BIZ-12 | Rentals | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BIZ-13 | recovered-plan | 6e8ea2d9 | ## BIZ-13 | Source register | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-1 | recovered-plan | 6e8ea2d9 | ## TXN-1 | Mallan does not draft or review contracts | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-2 | recovered-plan | 6e8ea2d9 | ## TXN-2 | Mallan does not hold escrow or any transaction funds | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-3 | recovered-plan | 6e8ea2d9 | ## TXN-3 | The deal sheet is the brokerage artifact | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-4 | recovered-plan | 6e8ea2d9 | ## TXN-4 | Transaction state is observed, not owned | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-5 | recovered-plan | 6e8ea2d9 | ## TXN-5 | Sale milestone sequence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-6 | recovered-plan | 6e8ea2d9 | ## TXN-6 | Acceptance is not binding | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-7 | recovered-plan | 6e8ea2d9 | ## TXN-7 | Board approval is the principal deal risk | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-8 | recovered-plan | 6e8ea2d9 | ## TXN-8 | Board package assistance has a boundary | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-9 | recovered-plan | 6e8ea2d9 | ## TXN-9 | Rental transactions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-10 | recovered-plan | 6e8ea2d9 | ## TXN-10 | FARE Act fee attribution | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-11 | recovered-plan | 6e8ea2d9 | ## TXN-11 | Prohibited surfaces | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| TXN-12 | recovered-plan | 6e8ea2d9 | ## TXN-12 | Referral to counsel is a first-class action | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ACT-1 | recovered-plan | 6e8ea2d9 | ## ACT-1 | Actor classes | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ACT-2 | recovered-plan | 6e8ea2d9 | ## ACT-2 | Client actors are scoped by role and resource | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ACT-3 | recovered-plan | 6e8ea2d9 | ## ACT-3 | Actor context is resolved once, by an adapter | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ACT-4 | recovered-plan | 6e8ea2d9 | ## ACT-4 | Mallan is a broker-operated brokerage today | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ACT-5 | recovered-plan | 6e8ea2d9 | ## ACT-5 | Capacity, not account type | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ACT-6 | recovered-plan | 6e8ea2d9 | ## ACT-6 | Supervision is configurable and off by default | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| ACT-7 | recovered-plan | 6e8ea2d9 | ## ACT-7 | Multi-agent readiness without multi-agent complexity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-1 | recovered-plan | 6e8ea2d9 | ## PER-1 | Person is the identity, role is separate | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-2 | recovered-plan | 6e8ea2d9 | ## PER-2 | Contact method is not identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-3 | recovered-plan | 6e8ea2d9 | ## PER-3 | Household and decision group | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-4 | recovered-plan | 6e8ea2d9 | ## PER-4 | Organization | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-5 | recovered-plan | 6e8ea2d9 | ## PER-5 | Lead is a role state, not a separate entity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-6 | recovered-plan | 6e8ea2d9 | ## PER-6 | Lead source and provenance | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-7 | recovered-plan | 6e8ea2d9 | ## PER-7 | Assignment | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-8 | recovered-plan | 6e8ea2d9 | ## PER-8 | Interaction timeline | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-9 | recovered-plan | 6e8ea2d9 | ## PER-9 | Knowledge types must not be conflated | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-10 | recovered-plan | 6e8ea2d9 | ## PER-10 | Commitment | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-11 | recovered-plan | 6e8ea2d9 | ## PER-11 | Consent is per person, per channel, per purpose | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PER-12 | recovered-plan | 6e8ea2d9 | ## PER-12 | Portal identity maps to person | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-1 | recovered-plan | 6e8ea2d9 | ## IAM-1 | Authentication is resolved by an adapter | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-2 | recovered-plan | 6e8ea2d9 | ## IAM-2 | Distinct principal classes | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-3 | recovered-plan | 6e8ea2d9 | ## IAM-3 | Session properties | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-4 | recovered-plan | 6e8ea2d9 | ## IAM-4 | Invitation-based portal onboarding | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-5 | recovered-plan | 6e8ea2d9 | ## IAM-5 | Elevated capability requires stronger assurance | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-6 | recovered-plan | 6e8ea2d9 | ## IAM-6 | Impersonation is explicit, bounded, and audited | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-7 | recovered-plan | 6e8ea2d9 | ## IAM-7 | Credential material is never in provider or client surfaces | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-8 | recovered-plan | 6e8ea2d9 | ## IAM-8 | Rate limiting and abuse controls | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-9 | recovered-plan | 6e8ea2d9 | ## IAM-9 | Write idempotency | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| IAM-10 | recovered-plan | 6e8ea2d9 | ## IAM-10 | Retention and deletion | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BRK-1 | recovered-plan | 6e8ea2d9 | ## BRK-1 | Producing broker first | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BRK-2 | recovered-plan | 6e8ea2d9 | ## BRK-2 | Roster and licensing | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BRK-3 | recovered-plan | 6e8ea2d9 | ## BRK-3 | Onboarding and offboarding | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BRK-4 | recovered-plan | 6e8ea2d9 | ## BRK-4 | Supervision when it becomes real | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BRK-5 | recovered-plan | 6e8ea2d9 | ## BRK-5 | Compliance exception register | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BRK-6 | recovered-plan | 6e8ea2d9 | ## BRK-6 | Financial visibility, not accounting | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| BRK-7 | recovered-plan | 6e8ea2d9 | ## BRK-7 | Business visibility | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| GATE-1 | recovered-plan | 6e8ea2d9 | ## GATE-1 | Completion is a machine-checkable claim | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| GATE-2 | recovered-plan | 6e8ea2d9 | ## GATE-2 | What the gate rejects | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| GATE-3 | recovered-plan | 6e8ea2d9 | ## GATE-3 | The exit code cannot be asserted | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| GATE-4 | recovered-plan | 6e8ea2d9 | ## GATE-4 | Dependency staleness invalidates evidence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| GATE-5 | recovered-plan | 6e8ea2d9 | ## GATE-5 | Negative findings are first-class | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| GATE-6 | recovered-plan | 6e8ea2d9 | ## GATE-6 | The gate states its own limits | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| GATE-7 | recovered-plan | 6e8ea2d9 | ## GATE-7 | Ratchet | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| GATE-8 | recovered-plan | 6e8ea2d9 | ## GATE-8 | One command | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MKT-1 | recovered-plan | 6e8ea2d9 | ## MKT-1 | Consent model | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MKT-2 | recovered-plan | 6e8ea2d9 | ## MKT-2 | Durable opt-out | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MKT-3 | recovered-plan | 6e8ea2d9 | ## MKT-3 | Contact provenance | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MKT-4 | recovered-plan | 6e8ea2d9 | ## MKT-4 | Production hold | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MKT-5 | recovered-plan | 6e8ea2d9 | ## MKT-5 | Sender separation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MKT-6 | recovered-plan | 6e8ea2d9 | ## MKT-6 | Recipient reconciliation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MKT-7 | recovered-plan | 6e8ea2d9 | ## MKT-7 | Content policy | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MKT-8 | recovered-plan | 6e8ea2d9 | ## MKT-8 | Existing suppression retained | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| INT-1 | recovered-plan | 6e8ea2d9 | ## INT-1 | Intelligence is a consumer, not the owner | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| INT-2 | recovered-plan | 6e8ea2d9 | ## INT-2 | Explainability | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| INT-3 | recovered-plan | 6e8ea2d9 | ## INT-3 | No invented facts | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| INT-4 | recovered-plan | 6e8ea2d9 | ## INT-4 | Replaceable providers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| INT-5 | recovered-plan | 6e8ea2d9 | ## INT-5 | Outcome loop | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| INT-6 | recovered-plan | 6e8ea2d9 | ## INT-6 | Cost and usefulness ledger | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-2 | recovered-plan | 6e8ea2d9 | ## OPS-2 | Evidence standard | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-3 | recovered-plan | 6e8ea2d9 | ## OPS-3 | Test layers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-4 | recovered-plan | 6e8ea2d9 | ## OPS-4 | Production proof | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-5 | recovered-plan | 6e8ea2d9 | ## OPS-5 | Rollback | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-6 | recovered-plan | 6e8ea2d9 | ## OPS-6 | No unrelated files | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-7 | recovered-plan | 6e8ea2d9 | ## OPS-7 | Maya approval | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-8 | recovered-plan | 6e8ea2d9 | ## OPS-8 | Health checks | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PH-1 | recovered-plan | 6e8ea2d9 | ## PH-1 | Canonical truth, inventory, and cleanup baseline | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PH-2 | recovered-plan | 6e8ea2d9 | ## PH-2 | Application foundation and identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PH-3 | recovered-plan | 6e8ea2d9 | ## PH-3 | Working public search | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PH-4 | recovered-plan | 6e8ea2d9 | ## PH-4 | Dynamic CRM, seller loop, and CMA | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PH-5 | recovered-plan | 6e8ea2d9 | ## PH-5 | Marketing readiness | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| PH-6 | recovered-plan | 6e8ea2d9 | ## PH-6 | Explainable intelligence and continuous cleanup | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ONE-AUTHORITATIVE-001 | PR#585-plan | f51848b0 | ## One authoritative product, architecture, compliance, delivery, error, and housekeeping plan | One authoritative product, architecture, compliance, delivery, error, and housekeeping plan | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-DOC-1-001 | PR#585-plan | f51848b0 | ## DOC-1 — Single source of platform truth | DOC-1 — Single source of platform truth | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-DOC-2-001 | PR#585-plan | f51848b0 | ## DOC-2 — Repository entry points | DOC-2 — Repository entry points | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-DOC-3-001 | PR#585-plan | f51848b0 | ## DOC-3 — Amend in place | DOC-3 — Amend in place | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-DOC-4-001 | PR#585-plan | f51848b0 | ## DOC-4 — Source-document consolidation | DOC-4 — Source-document consolidation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-DOC-5-001 | PR#585-plan | f51848b0 | ## DOC-5 — No silent document drift | DOC-5 — No silent document drift | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-BUS-1-001 | PR#585-plan | f51848b0 | ## BUS-1 — What Mallan is building | BUS-1 — What Mallan is building | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-BUS-2-001 | PR#585-plan | f51848b0 | ## BUS-2 — Current data boundary | BUS-2 — Current data boundary | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-BUS-3-001 | PR#585-plan | f51848b0 | ## BUS-3 — Static CRM is temporary | BUS-3 — Static CRM is temporary | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-BUS-4-001 | PR#585-plan | f51848b0 | ## BUS-4 — One system does not mean one generic screen | BUS-4 — One system does not mean one generic screen | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-BUS-5-001 | PR#585-plan | f51848b0 | ## BUS-5 — REBNY responsibility | BUS-5 — REBNY responsibility | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-1-001 | PR#585-plan | f51848b0 | ## COT-1 — Cotality responsibility | COT-1 — Cotality responsibility | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-BUS-6-001 | PR#585-plan | f51848b0 | ## BUS-6 — Mallan responsibility | BUS-6 — Mallan responsibility | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-2-001 | PR#585-plan | f51848b0 | ## COT-2 — Evidence precedence | COT-2 — Evidence precedence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-3-001 | PR#585-plan | f51848b0 | ## COT-3 — Live verification | COT-3 — Live verification | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-4-001 | PR#585-plan | f51848b0 | ## COT-4 — Field existence is not permission | COT-4 — Field existence is not permission | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ARC-1-001 | PR#585-plan | f51848b0 | ## ARC-1 — No client-side MLS calls | ARC-1 — No client-side MLS calls | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ARC-2-001 | PR#585-plan | f51848b0 | ## ARC-2 — One application-service door | ARC-2 — One application-service door | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ARC-3-001 | PR#585-plan | f51848b0 | ## ARC-3 — No silent failure | ARC-3 — No silent failure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-5-001 | PR#585-plan | f51848b0 | ## COT-5 — No provider guessing | COT-5 — No provider guessing | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-1-001 | PR#585-plan | f51848b0 | ## LST-1 — No duplicate public matched pair | LST-1 — No duplicate public matched pair | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-2-001 | PR#585-plan | f51848b0 | ## LST-2 — No local provider mutation | LST-2 — No local provider mutation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-3-001 | PR#585-plan | f51848b0 | ## LST-3 — No provider overwrite of Mallan workflow | LST-3 — No provider overwrite of Mallan workflow | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-POL-1-001 | PR#585-plan | f51848b0 | ## POL-1 — Compliance fails closed | POL-1 — Compliance fails closed | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ERR-1-001 | PR#585-plan | f51848b0 | ## ERR-1 — Empty is not an error | ERR-1 — Empty is not an error | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-HYG-1-001 | PR#585-plan | f51848b0 | ## HYG-1 — No deletion by grep alone | HYG-1 — No deletion by grep alone | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-OPS-1-001 | PR#585-plan | f51848b0 | ## OPS-1 — No unsupported completion claim | OPS-1 — No unsupported completion claim | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-BUS-7-001 | PR#585-plan | f51848b0 | ## BUS-7 — Repository boundary | BUS-7 — Repository boundary | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-4-001 | PR#585-plan | f51848b0 | ## LST-4 — Exact prefix definitions | LST-4 — Exact prefix definitions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-5-001 | PR#585-plan | f51848b0 | ## LST-5 — Separate dimensions | LST-5 — Separate dimensions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-6-001 | PR#585-plan | f51848b0 | ## LST-6 — Example | LST-6 — Example | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-7-001 | PR#585-plan | f51848b0 | ## LST-7 — Matched-pair behavior | LST-7 — Matched-pair behavior | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-8-001 | PR#585-plan | f51848b0 | ## LST-8 — No authority handover | LST-8 — No authority handover | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-9-001 | PR#585-plan | f51848b0 | ## LST-9 — Current implementation shortcut | LST-9 — Current implementation shortcut | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-10-001 | PR#585-plan | f51848b0 | ## LST-10 — Match confidence | LST-10 — Match confidence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-11-001 | PR#585-plan | f51848b0 | ## LST-11 — Ambiguity fails closed | LST-11 — Ambiguity fails closed | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-12-001 | PR#585-plan | f51848b0 | ## LST-12 — Provider-controlled facts | LST-12 — Provider-controlled facts | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-13-001 | PR#585-plan | f51848b0 | ## LST-13 — Mallan-controlled facts | LST-13 — Mallan-controlled facts | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-LST-14-001 | PR#585-plan | f51848b0 | ## LST-14 — Discrepancy handling | LST-14 — Discrepancy handling | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-6-001 | PR#585-plan | f51848b0 | ## COT-6 — Preserve both provider identifiers | COT-6 — Preserve both provider identifiers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-7-001 | PR#585-plan | f51848b0 | ## COT-7 — Media identity | COT-7 — Media identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-8-001 | PR#585-plan | f51848b0 | ## COT-8 — Photo-first and media integrity | COT-8 — Photo-first and media integrity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-9-001 | PR#585-plan | f51848b0 | ## COT-9 — Freshness | COT-9 — Freshness | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COT-10-001 | PR#585-plan | f51848b0 | ## COT-10 — Unknown provider values | COT-10 — Unknown provider values | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ARC-4-001 | PR#585-plan | f51848b0 | ## ARC-4 — Target layers | ARC-4 — Target layers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ARC-5-001 | PR#585-plan | f51848b0 | ## ARC-5 — Thin adapters | ARC-5 — Thin adapters | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ARC-6-001 | PR#585-plan | f51848b0 | ## ARC-6 — Internal calls do not self-call HTTP | ARC-6 — Internal calls do not self-call HTTP | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ARC-7-001 | PR#585-plan | f51848b0 | ## ARC-7 — Domain services are not public entry points | ARC-7 — Domain services are not public entry points | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ARC-8-001 | PR#585-plan | f51848b0 | ## ARC-8 — Shared contract, not duplicated frontends | ARC-8 — Shared contract, not duplicated frontends | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AUZ-1-001 | PR#585-plan | f51848b0 | ## AUZ-1 — Actor resolution | AUZ-1 — Actor resolution | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AUZ-2-001 | PR#585-plan | f51848b0 | ## AUZ-2 — Resource authorization | AUZ-2 — Resource authorization | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AUZ-3-001 | PR#585-plan | f51848b0 | ## AUZ-3 — Broker role does not override provider restrictions | AUZ-3 — Broker role does not override provider restrictions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AUZ-4-001 | PR#585-plan | f51848b0 | ## AUZ-4 — Non-disclosure | AUZ-4 — Non-disclosure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-POL-2-001 | PR#585-plan | f51848b0 | ## POL-2 — Policy order | POL-2 — Policy order | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-POL-3-001 | PR#585-plan | f51848b0 | ## POL-3 — Fair Housing state | POL-3 — Fair Housing state | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-POL-4-001 | PR#585-plan | f51848b0 | ## POL-4 — Versioned policy | POL-4 — Versioned policy | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-TRN-1-001 | PR#585-plan | f51848b0 | ## TRN-1 — Success envelope | TRN-1 — Success envelope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-TRN-2-001 | PR#585-plan | f51848b0 | ## TRN-2 — Empty envelope | TRN-2 — Empty envelope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-TRN-3-001 | PR#585-plan | f51848b0 | ## TRN-3 — Error envelope | TRN-3 — Error envelope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-TRN-4-001 | PR#585-plan | f51848b0 | ## TRN-4 — Exceptions | TRN-4 — Exceptions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-VER-1-001 | PR#585-plan | f51848b0 | ## VER-1 — Separate contract and build versions | VER-1 — Separate contract and build versions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-VER-2-001 | PR#585-plan | f51848b0 | ## VER-2 — Compatibility failure | VER-2 — Compatibility failure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ERR-2-001 | PR#585-plan | f51848b0 | ## ERR-2 — One public error taxonomy | ERR-2 — One public error taxonomy | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ERR-3-001 | PR#585-plan | f51848b0 | ## ERR-3 — Error catalog fields | ERR-3 — Error catalog fields | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ERR-4-001 | PR#585-plan | f51848b0 | ## ERR-4 — No arbitrary route strings | ERR-4 — No arbitrary route strings | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ERR-5-001 | PR#585-plan | f51848b0 | ## ERR-5 — Error lifecycle | ERR-5 — Error lifecycle | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-ERR-6-001 | PR#585-plan | f51848b0 | ## ERR-6 — No hanging catches or warnings | ERR-6 — No hanging catches or warnings | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-HYG-2-001 | PR#585-plan | f51848b0 | ## HYG-2 — What counts as bloat | HYG-2 — What counts as bloat | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-HYG-3-001 | PR#585-plan | f51848b0 | ## HYG-3 — Disposition states | HYG-3 — Disposition states | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-HYG-4-001 | PR#585-plan | f51848b0 | ## HYG-4 — Required inventories | HYG-4 — Required inventories | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-HYG-5-001 | PR#585-plan | f51848b0 | ## HYG-5 — Temporary code contract | HYG-5 — Temporary code contract | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-HYG-6-001 | PR#585-plan | f51848b0 | ## HYG-6 — Safe removal proof | HYG-6 — Safe removal proof | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-HYG-7-001 | PR#585-plan | f51848b0 | ## HYG-7 — Per-change hygiene questions | HYG-7 — Per-change hygiene questions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-HYG-8-001 | PR#585-plan | f51848b0 | ## HYG-8 — Platform check target | HYG-8 — Platform check target | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEA-1-001 | PR#585-plan | f51848b0 | ## SEA-1 — Separate products, shared meaning | SEA-1 — Separate products, shared meaning | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEA-2-001 | PR#585-plan | f51848b0 | ## SEA-2 — Public search scope | SEA-2 — Public search scope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEA-3-001 | PR#585-plan | f51848b0 | ## SEA-3 — Honest internal-search scope | SEA-3 — Honest internal-search scope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEA-4-001 | PR#585-plan | f51848b0 | ## SEA-4 — One canonical pipeline | SEA-4 — One canonical pipeline | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEA-5-001 | PR#585-plan | f51848b0 | ## SEA-5 — Unsupported criteria | SEA-5 — Unsupported criteria | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEA-6-001 | PR#585-plan | f51848b0 | ## SEA-6 — Deterministic parity | SEA-6 — Deterministic parity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEA-7-001 | PR#585-plan | f51848b0 | ## SEA-7 — Matched-pair suppression order | SEA-7 — Matched-pair suppression order | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEA-8-001 | PR#585-plan | f51848b0 | ## SEA-8 — Search states | SEA-8 — Search states | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEA-9-001 | PR#585-plan | f51848b0 | ## SEA-9 — Field contract | SEA-9 — Field contract | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CRM-1-001 | PR#585-plan | f51848b0 | ## CRM-1 — Target | CRM-1 — Target | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CRM-2-001 | PR#585-plan | f51848b0 | ## CRM-2 — Inventory first | CRM-2 — Inventory first | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CRM-3-001 | PR#585-plan | f51848b0 | ## CRM-3 — Vertical-slice migration | CRM-3 — Vertical-slice migration | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CRM-4-001 | PR#585-plan | f51848b0 | ## CRM-4 — Retirement gate | CRM-4 — Retirement gate | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CRM-5-001 | PR#585-plan | f51848b0 | ## CRM-5 — Client identity | CRM-5 — Client identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CRM-6-001 | PR#585-plan | f51848b0 | ## CRM-6 — Durable history | CRM-6 — Durable history | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEL-1-001 | PR#585-plan | f51848b0 | ## SEL-1 — Seller portal purpose | SEL-1 — Seller portal purpose | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEL-2-001 | PR#585-plan | f51848b0 | ## SEL-2 — Truth levels | SEL-2 — Truth levels | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEL-3-001 | PR#585-plan | f51848b0 | ## SEL-3 — Live activity is separate from CMA | SEL-3 — Live activity is separate from CMA | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-SEL-4-001 | PR#585-plan | f51848b0 | ## SEL-4 — Live activity | SEL-4 — Live activity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CMA-1-001 | PR#585-plan | f51848b0 | ## CMA-1 — Automatic starting set | CMA-1 — Automatic starting set | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CMA-2-001 | PR#585-plan | f51848b0 | ## CMA-2 — Evidence classification | CMA-2 — Evidence classification | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CMA-3-001 | PR#585-plan | f51848b0 | ## CMA-3 — Agent control | CMA-3 — Agent control | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CMA-4-001 | PR#585-plan | f51848b0 | ## CMA-4 — No central approval by default | CMA-4 — No central approval by default | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CMA-5-001 | PR#585-plan | f51848b0 | ## CMA-5 — Facts versus judgment | CMA-5 — Facts versus judgment | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-CMA-6-001 | PR#585-plan | f51848b0 | ## CMA-6 — Versioning | CMA-6 — Versioning | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-MKT-1-001 | PR#585-plan | f51848b0 | ## MKT-1 — Consent model | MKT-1 — Consent model | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-MKT-2-001 | PR#585-plan | f51848b0 | ## MKT-2 — Durable opt-out | MKT-2 — Durable opt-out | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-MKT-3-001 | PR#585-plan | f51848b0 | ## MKT-3 — Contact provenance | MKT-3 — Contact provenance | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-MKT-4-001 | PR#585-plan | f51848b0 | ## MKT-4 — Production hold | MKT-4 — Production hold | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-MKT-5-001 | PR#585-plan | f51848b0 | ## MKT-5 — Sender separation | MKT-5 — Sender separation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-MKT-6-001 | PR#585-plan | f51848b0 | ## MKT-6 — Recipient reconciliation | MKT-6 — Recipient reconciliation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-MKT-7-001 | PR#585-plan | f51848b0 | ## MKT-7 — Content policy | MKT-7 — Content policy | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-INT-1-001 | PR#585-plan | f51848b0 | ## INT-1 — Intelligence is a consumer, not the owner | INT-1 — Intelligence is a consumer, not the owner | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-INT-2-001 | PR#585-plan | f51848b0 | ## INT-2 — Explainability | INT-2 — Explainability | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-INT-3-001 | PR#585-plan | f51848b0 | ## INT-3 — No invented facts | INT-3 — No invented facts | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-INT-4-001 | PR#585-plan | f51848b0 | ## INT-4 — Replaceable providers | INT-4 — Replaceable providers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-INT-5-001 | PR#585-plan | f51848b0 | ## INT-5 — Outcome loop | INT-5 — Outcome loop | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-OPS-2-001 | PR#585-plan | f51848b0 | ## OPS-2 — Evidence standard | OPS-2 — Evidence standard | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-OPS-3-001 | PR#585-plan | f51848b0 | ## OPS-3 — Test layers | OPS-3 — Test layers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-OPS-4-001 | PR#585-plan | f51848b0 | ## OPS-4 — Production proof | OPS-4 — Production proof | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-OPS-5-001 | PR#585-plan | f51848b0 | ## OPS-5 — Rollback | OPS-5 — Rollback | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-OPS-6-001 | PR#585-plan | f51848b0 | ## OPS-6 — No unrelated files | OPS-6 — No unrelated files | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-OPS-7-001 | PR#585-plan | f51848b0 | ## OPS-7 — Maya approval | OPS-7 — Maya approval | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-PH-1-001 | PR#585-plan | f51848b0 | ## PH-1 — Canonical truth, inventory, and cleanup baseline | PH-1 — Canonical truth, inventory, and cleanup baseline | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-GOAL-001 | PR#585-plan | f51848b0 | ### Goal | Goal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-STEPS-001 | PR#585-plan | f51848b0 | ### Steps | Steps | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-EXIT-001 | PR#585-plan | f51848b0 | ### Exit | Exit | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-PH-2-001 | PR#585-plan | f51848b0 | ## PH-2 — Application foundation and identity | PH-2 — Application foundation and identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-GOAL-002 | PR#585-plan | f51848b0 | ### Goal | Goal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-STEPS-002 | PR#585-plan | f51848b0 | ### Steps | Steps | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-EXIT-002 | PR#585-plan | f51848b0 | ### Exit | Exit | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-PH-3-001 | PR#585-plan | f51848b0 | ## PH-3 — Working public search | PH-3 — Working public search | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-GOAL-003 | PR#585-plan | f51848b0 | ### Goal | Goal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-STEPS-003 | PR#585-plan | f51848b0 | ### Steps | Steps | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-EXIT-003 | PR#585-plan | f51848b0 | ### Exit | Exit | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-PH-4-001 | PR#585-plan | f51848b0 | ## PH-4 — Dynamic CRM, seller loop, and CMA | PH-4 — Dynamic CRM, seller loop, and CMA | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-GOAL-004 | PR#585-plan | f51848b0 | ### Goal | Goal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-STEPS-004 | PR#585-plan | f51848b0 | ### Steps | Steps | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-EXIT-004 | PR#585-plan | f51848b0 | ### Exit | Exit | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-PH-5-001 | PR#585-plan | f51848b0 | ## PH-5 — Marketing readiness | PH-5 — Marketing readiness | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-GOAL-005 | PR#585-plan | f51848b0 | ### Goal | Goal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-STEPS-005 | PR#585-plan | f51848b0 | ### Steps | Steps | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-EXIT-005 | PR#585-plan | f51848b0 | ### Exit | Exit | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-PH-6-001 | PR#585-plan | f51848b0 | ## PH-6 — Explainable intelligence and continuous cleanup | PH-6 — Explainable intelligence and continuous cleanup | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-GOAL-006 | PR#585-plan | f51848b0 | ### Goal | Goal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-STEPS-006 | PR#585-plan | f51848b0 | ### Steps | Steps | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-EXIT-006 | PR#585-plan | f51848b0 | ### Exit | Exit | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AI-START-001 | PR#585-AI-START-HERE.md | f51848b0 | # AI START HERE | AI START HERE | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AI-START-002 | PR#585-AI-START-HERE.md | f51848b0 | ## Governing rule | Governing rule | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AI-START-003 | PR#585-AI-START-HERE.md | f51848b0 | ## Listing identity | Listing identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AI-START-004 | PR#585-AI-START-HERE.md | f51848b0 | ## Scope and safety | Scope and safety | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AI-START-005 | PR#585-AI-START-HERE.md | f51848b0 | ## Immediate program state | Immediate program state | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-001 | PR#585-AGENTS.md | f51848b0 | # AGENTS.md — Cross-Agent Constitution | AGENTS.md — Cross-Agent Constitution | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-002 | PR#585-AGENTS.md | f51848b0 | ## 0. Mandatory reading order | 0. Mandatory reading order | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-003 | PR#585-AGENTS.md | f51848b0 | ### Tool entry paths | Tool entry paths | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-004 | PR#585-AGENTS.md | f51848b0 | ## 1. Listing identity invariants | 1. Listing identity invariants | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-005 | PR#585-AGENTS.md | f51848b0 | ## 2. Core invariants | 2. Core invariants | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-006 | PR#585-AGENTS.md | f51848b0 | ## 3. Non-negotiable holds | 3. Non-negotiable holds | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-007 | PR#585-AGENTS.md | f51848b0 | ## 4. Where truth lives | 4. Where truth lives | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-008 | PR#585-AGENTS.md | f51848b0 | ## 5. Evidence language | 5. Evidence language | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-009 | PR#585-AGENTS.md | f51848b0 | ## 6. Branch and diff discipline | 6. Branch and diff discipline | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-010 | PR#585-AGENTS.md | f51848b0 | ## 7. Implementation sequence | 7. Implementation sequence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-011 | PR#585-AGENTS.md | f51848b0 | ## 8. Handoff rule | 8. Handoff rule | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-012 | PR#585-AGENTS.md | f51848b0 | ## 9. Review policy | 9. Review policy | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-AGENTS-013 | PR#585-AGENTS.md | f51848b0 | ## 10. Current program direction | 10. Current program direction | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-001 | PR#585-README.md | f51848b0 | # Mallan Real Estate Inc. — NYC Brokerage Platform | Mallan Real Estate Inc. — NYC Brokerage Platform | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-002 | PR#585-README.md | f51848b0 | ## Start here | Start here | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-003 | PR#585-README.md | f51848b0 | ## Platform contract | Platform contract | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-004 | PR#585-README.md | f51848b0 | ### Listing identity | Listing identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-005 | PR#585-README.md | f51848b0 | ### CRM direction | CRM direction | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-006 | PR#585-README.md | f51848b0 | ### Non-negotiable rules | Non-negotiable rules | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-007 | PR#585-README.md | f51848b0 | ## Implementation sequence | Implementation sequence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-008 | PR#585-README.md | f51848b0 | ## Data, database, and infrastructure safety | Data, database, and infrastructure safety | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-009 | PR#585-README.md | f51848b0 | ## Compliance and licensed data | Compliance and licensed data | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-010 | PR#585-README.md | f51848b0 | ## Evidence and completion | Evidence and completion | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-README-011 | PR#585-README.md | f51848b0 | ## Repository hygiene | Repository hygiene | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P585-COPILOT-INSTRUCTIONS-001 | PR#585-.github/copilot-instructions.md | f51848b0 | # Copilot Instructions — mallan67/mallan-nyc | Copilot Instructions — mallan67/mallan-nyc | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-UNIFIED-PRODUCT-001 | PR#579-plan | 7c15b1d5 | ## Unified Product, Data, Technology, Compliance, and Implementation Master Plan | Unified Product, Data, Technology, Compliance, and Implementation Master Plan | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-2-1-001 | PR#579-plan | 7c15b1d5 | ## 2.1 Public growth experience | 2.1 Public growth experience | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-2-2-001 | PR#579-plan | 7c15b1d5 | ## 2.2 Agent operating system | 2.2 Agent operating system | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-2-3-001 | PR#579-plan | 7c15b1d5 | ## 2.3 Broker operating system | 2.3 Broker operating system | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-2-4-001 | PR#579-plan | 7c15b1d5 | ## 2.4 Client portals | 2.4 Client portals | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-2-5-001 | PR#579-plan | 7c15b1d5 | ## 2.5 Shared foundation, different interfaces | 2.5 Shared foundation, different interfaces | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-3-1-001 | PR#579-plan | 7c15b1d5 | ## 3.1 Technology supports human judgment | 3.1 Technology supports human judgment | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-3-2-001 | PR#579-plan | 7c15b1d5 | ## 3.2 One canonical owner per concept | 3.2 One canonical owner per concept | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-3-3-001 | PR#579-plan | 7c15b1d5 | ## 3.3 No silent failure | 3.3 No silent failure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-3-4-001 | PR#579-plan | 7c15b1d5 | ## 3.4 Build closed loops | 3.4 Build closed loops | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-3-5-001 | PR#579-plan | 7c15b1d5 | ## 3.5 Preserve evidence and history | 3.5 Preserve evidence and history | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-5-1-001 | PR#579-plan | 7c15b1d5 | ## 5.1 Authority model | 5.1 Authority model | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-5-2-001 | PR#579-plan | 7c15b1d5 | ## 5.2 Adapter boundary | 5.2 Adapter boundary | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-5-3-001 | PR#579-plan | 7c15b1d5 | ## 5.3 Recommended integration structure | 5.3 Recommended integration structure | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-5-4-001 | PR#579-plan | 7c15b1d5 | ## 5.4 Live metadata and contract cycle | 5.4 Live metadata and contract cycle | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-5-5-001 | PR#579-plan | 7c15b1d5 | ## 5.5 Change classification | 5.5 Change classification | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-ADDITIVE-001 | PR#579-plan | 7c15b1d5 | ### Additive | Additive | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-DEPRECATION-001 | PR#579-plan | 7c15b1d5 | ### Deprecation | Deprecation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-BREAKING-001 | PR#579-plan | 7c15b1d5 | ### Breaking | Breaking | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-BEHAVIORAL-001 | PR#579-plan | 7c15b1d5 | ### Behavioral | Behavioral | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-5-6-001 | PR#579-plan | 7c15b1d5 | ## 5.6 Canonical field registry | 5.6 Canonical field registry | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-5-7-001 | PR#579-plan | 7c15b1d5 | ## 5.7 Anti-corruption layer | 5.7 Anti-corruption layer | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-5-8-001 | PR#579-plan | 7c15b1d5 | ## 5.8 Unknown values | 5.8 Unknown values | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-5-9-001 | PR#579-plan | 7c15b1d5 | ## 5.9 Cotality change gate | 5.9 Cotality change gate | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-6-1-001 | PR#579-plan | 7c15b1d5 | ## 6.1 Versioned policy registry | 6.1 Versioned policy registry | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-6-2-001 | PR#579-plan | 7c15b1d5 | ## 6.2 Central policy decisions | 6.2 Central policy decisions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-6-3-001 | PR#579-plan | 7c15b1d5 | ## 6.3 Policy change process | 6.3 Policy change process | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-6-4-001 | PR#579-plan | 7c15b1d5 | ## 6.4 Effective-date behavior | 6.4 Effective-date behavior | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-6-5-001 | PR#579-plan | 7c15b1d5 | ## 6.5 Fail-closed boundaries | 6.5 Fail-closed boundaries | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-7-1-001 | PR#579-plan | 7c15b1d5 | ## 7.1 Person | 7.1 Person | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-7-2-001 | PR#579-plan | 7c15b1d5 | ## 7.2 Household or decision group | 7.2 Household or decision group | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-7-3-001 | PR#579-plan | 7c15b1d5 | ## 7.3 Organization | 7.3 Organization | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-7-4-001 | PR#579-plan | 7c15b1d5 | ## 7.4 Property graph | 7.4 Property graph | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-7-5-001 | PR#579-plan | 7c15b1d5 | ## 7.5 Client relationship | 7.5 Client relationship | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-7-6-001 | PR#579-plan | 7c15b1d5 | ## 7.6 Relationship knowledge types | 7.6 Relationship knowledge types | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-7-7-001 | PR#579-plan | 7c15b1d5 | ## 7.7 Commitments | 7.7 Commitments | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-8-1-001 | PR#579-plan | 7c15b1d5 | ## 8.1 Transactional event outbox | 8.1 Transactional event outbox | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-8-2-001 | PR#579-plan | 7c15b1d5 | ## 8.2 Runtime workflow engine | 8.2 Runtime workflow engine | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-8-3-001 | PR#579-plan | 7c15b1d5 | ## 8.3 Capability registry | 8.3 Capability registry | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-8-4-001 | PR#579-plan | 7c15b1d5 | ## 8.4 Human-service levels | 8.4 Human-service levels | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-LEVEL-1-001 | PR#579-plan | 7c15b1d5 | ### Level 1 — Safe automation | Level 1 — Safe automation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-LEVEL-2-001 | PR#579-plan | 7c15b1d5 | ### Level 2 — Prepare for human | Level 2 — Prepare for human | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-LEVEL-3-001 | PR#579-plan | 7c15b1d5 | ### Level 3 — Human approval required | Level 3 — Human approval required | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-LEVEL-4-001 | PR#579-plan | 7c15b1d5 | ### Level 4 — Human only | Level 4 — Human only | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-8-5-001 | PR#579-plan | 7c15b1d5 | ## 8.5 Artifact lifecycle | 8.5 Artifact lifecycle | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-8-6-001 | PR#579-plan | 7c15b1d5 | ## 8.6 Artifact evidence | 8.6 Artifact evidence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-8-7-001 | PR#579-plan | 7c15b1d5 | ## 8.7 Dependency and staleness | 8.7 Dependency and staleness | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-9-1-001 | PR#579-plan | 7c15b1d5 | ## 9.1 Shared search contract | 9.1 Shared search contract | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-9-2-001 | PR#579-plan | 7c15b1d5 | ## 9.2 Public search | 9.2 Public search | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-9-3-001 | PR#579-plan | 7c15b1d5 | ## 9.3 Agent search | 9.3 Agent search | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-9-4-001 | PR#579-plan | 7c15b1d5 | ## 9.4 Broker search | 9.4 Broker search | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-9-5-001 | PR#579-plan | 7c15b1d5 | ## 9.5 Portal search | 9.5 Portal search | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-9-6-001 | PR#579-plan | 7c15b1d5 | ## 9.6 Saved-search contract | 9.6 Saved-search contract | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-9-7-001 | PR#579-plan | 7c15b1d5 | ## 9.7 Execution rules | 9.7 Execution rules | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-10-1-001 | PR#579-plan | 7c15b1d5 | ## 10.1 Objective | 10.1 Objective | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-10-2-001 | PR#579-plan | 7c15b1d5 | ## 10.2 Buyer and renter journeys | 10.2 Buyer and renter journeys | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-10-3-001 | PR#579-plan | 7c15b1d5 | ## 10.3 Seller journey | 10.3 Seller journey | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-10-4-001 | PR#579-plan | 7c15b1d5 | ## 10.4 Landlord journey | 10.4 Landlord journey | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-10-5-001 | PR#579-plan | 7c15b1d5 | ## 10.5 Contextual calls to action | 10.5 Contextual calls to action | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-10-6-001 | PR#579-plan | 7c15b1d5 | ## 10.6 Progressive lead capture | 10.6 Progressive lead capture | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-11-1-001 | PR#579-plan | 7c15b1d5 | ## 11.1 Agent home | 11.1 Agent home | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-11-2-001 | PR#579-plan | 7c15b1d5 | ## 11.2 Client workspace | 11.2 Client workspace | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-11-3-001 | PR#579-plan | 7c15b1d5 | ## 11.3 Buyer tools | 11.3 Buyer tools | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-11-4-001 | PR#579-plan | 7c15b1d5 | ## 11.4 Seller tools | 11.4 Seller tools | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-11-5-001 | PR#579-plan | 7c15b1d5 | ## 11.5 Tenant tools | 11.5 Tenant tools | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-11-6-001 | PR#579-plan | 7c15b1d5 | ## 11.6 Landlord tools | 11.6 Landlord tools | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-11-7-001 | PR#579-plan | 7c15b1d5 | ## 11.7 Relationship brief | 11.7 Relationship brief | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-12-1-001 | PR#579-plan | 7c15b1d5 | ## 12.1 Signals | 12.1 Signals | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-12-2-001 | PR#579-plan | 7c15b1d5 | ## 12.2 Signal contract | 12.2 Signal contract | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-12-3-001 | PR#579-plan | 7c15b1d5 | ## 12.3 Explainable, not manipulative | 12.3 Explainable, not manipulative | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-12-4-001 | PR#579-plan | 7c15b1d5 | ## 12.4 Contradiction intelligence | 12.4 Contradiction intelligence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-13-1-001 | PR#579-plan | 7c15b1d5 | ## 13.1 Shared framework | 13.1 Shared framework | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-13-2-001 | PR#579-plan | 7c15b1d5 | ## 13.2 Buyer portal | 13.2 Buyer portal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-13-3-001 | PR#579-plan | 7c15b1d5 | ## 13.3 Tenant portal | 13.3 Tenant portal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-13-4-001 | PR#579-plan | 7c15b1d5 | ## 13.4 Seller portal | 13.4 Seller portal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-13-5-001 | PR#579-plan | 7c15b1d5 | ## 13.5 Landlord portal | 13.5 Landlord portal | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-1-001 | PR#579-plan | 7c15b1d5 | ## 14.1 Producing-broker mode | 14.1 Producing-broker mode | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-2-001 | PR#579-plan | 7c15b1d5 | ## 14.2 Agent management | 14.2 Agent management | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-3-001 | PR#579-plan | 7c15b1d5 | ## 14.3 Agent performance | 14.3 Agent performance | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-4-001 | PR#579-plan | 7c15b1d5 | ## 14.4 Lead and client governance | 14.4 Lead and client governance | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-5-001 | PR#579-plan | 7c15b1d5 | ## 14.5 Listing governance | 14.5 Listing governance | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-6-001 | PR#579-plan | 7c15b1d5 | ## 14.6 Compliance and law center | 14.6 Compliance and law center | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-7-001 | PR#579-plan | 7c15b1d5 | ## 14.7 Forms center | 14.7 Forms center | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-8-001 | PR#579-plan | 7c15b1d5 | ## 14.8 Commission and referral center | 14.8 Commission and referral center | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-9-001 | PR#579-plan | 7c15b1d5 | ## 14.9 Accounting and tax-support center | 14.9 Accounting and tax-support center | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-10-001 | PR#579-plan | 7c15b1d5 | ## 14.10 Technology center | 14.10 Technology center | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-14-11-001 | PR#579-plan | 7c15b1d5 | ## 14.11 Business command center | 14.11 Business command center | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-15-1-001 | PR#579-plan | 7c15b1d5 | ## 15.1 Media | 15.1 Media | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-15-2-001 | PR#579-plan | 7c15b1d5 | ## 15.2 Documents | 15.2 Documents | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-15-3-001 | PR#579-plan | 7c15b1d5 | ## 15.3 Transaction intelligence | 15.3 Transaction intelligence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-15-4-001 | PR#579-plan | 7c15b1d5 | ## 15.4 Decision support | 15.4 Decision support | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-15-5-001 | PR#579-plan | 7c15b1d5 | ## 15.5 Property passport | 15.5 Property passport | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-16-1-001 | PR#579-plan | 7c15b1d5 | ## 16.1 Canonical communication record | 16.1 Canonical communication record | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-16-2-001 | PR#579-plan | 7c15b1d5 | ## 16.2 Notification dispatcher | 16.2 Notification dispatcher | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-16-3-001 | PR#579-plan | 7c15b1d5 | ## 16.3 Unsubscribe | 16.3 Unsubscribe | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-16-4-001 | PR#579-plan | 7c15b1d5 | ## 16.4 Outlook | 16.4 Outlook | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-17-1-001 | PR#579-plan | 7c15b1d5 | ## 17.1 One supervisor and registered capabilities | 17.1 One supervisor and registered capabilities | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-17-2-001 | PR#579-plan | 7c15b1d5 | ## 17.2 Model abstraction | 17.2 Model abstraction | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-17-3-001 | PR#579-plan | 7c15b1d5 | ## 17.3 AI output contract | 17.3 AI output contract | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-17-4-001 | PR#579-plan | 7c15b1d5 | ## 17.4 Voice | 17.4 Voice | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-17-5-001 | PR#579-plan | 7c15b1d5 | ## 17.5 Multimodal property intelligence | 17.5 Multimodal property intelligence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-17-6-001 | PR#579-plan | 7c15b1d5 | ## 17.6 Future protocols and providers | 17.6 Future protocols and providers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-17-7-001 | PR#579-plan | 7c15b1d5 | ## 17.7 AI economics | 17.7 AI economics | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-MALLAN-MUST-001 | PR#579-plan | 7c15b1d5 | ## Mallan must own | Mallan must own | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-MALLAN-MAY-001 | PR#579-plan | 7c15b1d5 | ## Mallan may buy | Mallan may buy | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-21-1-001 | PR#579-plan | 7c15b1d5 | ## 21.1 Strangler migration | 21.1 Strangler migration | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-21-2-001 | PR#579-plan | 7c15b1d5 | ## 21.2 Feature flags | 21.2 Feature flags | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-21-3-001 | PR#579-plan | 7c15b1d5 | ## 21.3 Shadow mode | 21.3 Shadow mode | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-21-4-001 | PR#579-plan | 7c15b1d5 | ## 21.4 Compatibility windows | 21.4 Compatibility windows | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-0-001 | PR#579-plan | 7c15b1d5 | ## Program 0 — Adopt and reconcile the authority | Program 0 — Adopt and reconcile the authority | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-1-001 | PR#579-plan | 7c15b1d5 | ## Program 1 — Provider and policy adaptability | Program 1 — Provider and policy adaptability | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-2-001 | PR#579-plan | 7c15b1d5 | ## Program 2 — Canonical graph and identity | Program 2 — Canonical graph and identity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-3-001 | PR#579-plan | 7c15b1d5 | ## Program 3 — Canonical search runtime | Program 3 — Canonical search runtime | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-4-001 | PR#579-plan | 7c15b1d5 | ## Program 4 — Events, workflows, artifacts, and approvals | Program 4 — Events, workflows, artifacts, and approvals | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-5-001 | PR#579-plan | 7c15b1d5 | ## Program 5 — Public growth system | Program 5 — Public growth system | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-6-001 | PR#579-plan | 7c15b1d5 | ## Program 6 — Agent service system | Program 6 — Agent service system | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-7-001 | PR#579-plan | 7c15b1d5 | ## Program 7 — Client portals | Program 7 — Client portals | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-8-001 | PR#579-plan | 7c15b1d5 | ## Program 8 — Broker operating system | Program 8 — Broker operating system | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-9-001 | PR#579-plan | 7c15b1d5 | ## Program 9 — Transactions and after-close | Program 9 — Transactions and after-close | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-10-001 | PR#579-plan | 7c15b1d5 | ## Program 10 — Advanced intelligence | Program 10 — Advanced intelligence | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROGRAM-11-001 | PR#579-plan | 7c15b1d5 | ## Program 11 — Decommissioning and consolidation | Program 11 — Decommissioning and consolidation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROOF-1-001 | PR#579-plan | 7c15b1d5 | ## Proof 1 — Seller opportunity | Proof 1 — Seller opportunity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROOF-2-001 | PR#579-plan | 7c15b1d5 | ## Proof 2 — Buyer demand | Proof 2 — Buyer demand | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROOF-3-001 | PR#579-plan | 7c15b1d5 | ## Proof 3 — Listing launch | Proof 3 — Listing launch | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROOF-4-001 | PR#579-plan | 7c15b1d5 | ## Proof 4 — Transaction | Proof 4 — Transaction | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-PROOF-5-001 | PR#579-plan | 7c15b1d5 | ## Proof 5 — Property passport | Proof 5 — Property passport | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| C-1 | PR#579-plan | 7c15b1d5 | ## C-1 — `audit_events` is not the §8.1 transactional outbox | `audit_events` is not the §8.1 transactional outbox | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| C-2 | PR#579-plan | 7c15b1d5 | ## C-2 — Cotality consolidates on `lib/idx/`; no parallel integration tree | Cotality consolidates on `lib/idx/`; no parallel integration tree | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| C-3 | PR#579-plan | 7c15b1d5 | ## C-3 — Neon/R2 remediation is a hard dependency gate | Neon/R2 remediation is a hard dependency gate | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| C-4 | PR#579-plan | 7c15b1d5 | ## C-4 — Program 11: Decommissioning and consolidation | Program 11: Decommissioning and consolidation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| C-5 | PR#579-plan | 7c15b1d5 | ## C-5 — §24 acceptance criteria become machine-enforced | §24 acceptance criteria become machine-enforced | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| C-5.1 | PR#579-plan | 7c15b1d5 | ### C-5.1 Promotion thresholds | Promotion thresholds | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| C-5.2 | PR#579-plan | 7c15b1d5 | ### C-5.2 Program assessment is a separate vocabulary from capability maturity | Program assessment is a separate vocabulary from capability maturity | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| C-6 | PR#579-plan | 7c15b1d5 | ## C-6 — AI-altered media provenance moves early, on existing-obligation grounds only | AI-altered media provenance moves early, on existing-obligation grounds only | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| C-7 | PR#579-plan | 7c15b1d5 | ## C-7 — Measured baselines are dated evidence, not architecture facts | Measured baselines are dated evidence, not architecture facts | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P0 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P0 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P1 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P1 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P2 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P2 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P3 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P3 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P4 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P4 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P5 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P5 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P6 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P6 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P7 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P7 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P8 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P8 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P9 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P9 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P10 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P10 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P11 | PR#579-program-registry | 7c15b1d5 | config/capabilities.mjs | Program/phase registry entry: P11 | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-SEARCH-CANONICAL | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-SEARCH-CANONICAL | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-IDX-COTALITY-ADAPTER | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-IDX-COTALITY-ADAPTER | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-COMPLIANCE-GATES | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-COMPLIANCE-GATES | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-MEDIA-SYNC | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-MEDIA-SYNC | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-MEDIA-AI-PROVENANCE | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-MEDIA-AI-PROVENANCE | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| NYC-DCWP-AI-MEDIA-DISCLOSURE | PR#579-capability-obligation | 7c15b1d5 | config/capabilities.mjs | Obligation nested inside a capability (depth 2): NYC-DCWP-AI-MEDIA-DISCLOSURE | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-EVENT-OUTBOX | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-EVENT-OUTBOX | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-WORKFLOW-ENGINE | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-WORKFLOW-ENGINE | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-POLICY-REGISTRY | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-POLICY-REGISTRY | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-CANONICAL-PROPERTY | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-CANONICAL-PROPERTY | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-CANONICAL-PERSON | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-CANONICAL-PERSON | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| CAP-CLIENT-PORTALS | PR#579-capability-registry | 7c15b1d5 | config/capabilities.mjs | Capability registry entry: CAP-CLIENT-PORTALS | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-FILE-SCRIPTS-CAPABILITY-AUDIT-MJS | PR#579-machinery | 7c15b1d5 | scripts/capability-audit.mjs | Machine-governance / evidence artefact: scripts/capability-audit.mjs | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-FILE-PACKAGE-JSON | PR#579-machinery | 7c15b1d5 | package.json | Machine-governance / evidence artefact: package.json | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-FILE-MEMORY-EVIDENCE-STANDARD-2026-07-27-MD | PR#579-machinery | 7c15b1d5 | memory/EVIDENCE-STANDARD-2026-07-27.md | Machine-governance / evidence artefact: memory/EVIDENCE-STANDARD-2026-07-27.md | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-FILE-DOCS-ARCHITECTURE-MASTER-PLAN-GAP-ANALYSIS-2026-07-27-MD | PR#579-machinery | 7c15b1d5 | docs/architecture/MASTER-PLAN-GAP-ANALYSIS-2026-07-27.md | Machine-governance / evidence artefact: docs/architecture/MASTER-PLAN-GAP-ANALYSIS-2026-07-27.md | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-FILE-DOCS-EVIDENCE-CAPABILITY-EVIDENCE-2026-07-27-MD | PR#579-machinery | 7c15b1d5 | docs/evidence/capability-evidence-2026-07-27.md | Machine-governance / evidence artefact: docs/evidence/capability-evidence-2026-07-27.md | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| P579-FILE-DOCS-EVIDENCE-CAPABILITY-EVIDENCE-2026-07-27-E57-MD | PR#579-machinery | 7c15b1d5 | docs/evidence/capability-evidence-2026-07-27-e57.md | Machine-governance / evidence artefact: docs/evidence/capability-evidence-2026-07-27-e57.md | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-024 | safe-main | 04db1b99 | docs/PLATFORM-ISSUE-REGISTRY.md | Phase 1A froze Property ingestion for 4 cycles; rollback + main revert; corrected code unmerged | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| OPS-025 | safe-main | 04db1b99 | docs/PLATFORM-ISSUE-REGISTRY.md | mls_id IS NULL on 22,809/23,980 IDX listings (95.1%) — pre-existing, not in scope | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MAIN-SCHEDULES-001 | safe-main | 04db1b99 | vercel.json | Active cron schedules including one-cycle every 10 minutes | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MAIN-GOVERNANCE-001 | safe-main | 04db1b99 | AGENTS.md / CLAUDE.md | Cross-agent constitution and Claude-specific depth | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MAIN-GOVERNANCE-002 | safe-main | 04db1b99 | docs/PROJECT-HEALTH-DASHBOARD.md | Current operational status tier | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MAIN-GOVERNANCE-003 | safe-main | 04db1b99 | docs/PLATFORM-ISSUE-REGISTRY.md | Canonical issue evidence + evidence scoring | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MAIN-GOVERNANCE-004 | safe-main | 04db1b99 | docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md | File ownership and no-parallel-file rule | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MAIN-GOVERNANCE-005 | safe-main | 04db1b99 | docs/compliance/COMPLIANCE-CANONICAL-INDEX.md | 18 compliance areas with fail-closed pointers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| MAIN-GOVERNANCE-006 | safe-main | 04db1b99 | NEON.md | Database rules and canonical Neon project facts | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-PROVIDER-BOUNDARY | deep-audit | 2026-07-30 | system audit | Raw provider boundary absent: cursor/merge read raw rows before normalization | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-PORTAL-ACTOR-SUBJECT | deep-audit | 2026-07-30 | system audit | requirePortalRole permits agent/broker; routes reinterpret auth.userId as Lead.id | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-NEON-POOL | deep-audit | 2026-07-30 | system audit | Neon reachability/pool pressure: ~10s Prisma waits, pool limit 5, pooler unreachable | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-SEARCH-DUAL-RUNTIME | deep-audit | 2026-07-30 | system audit | /api/listings DB path and live Cotality fallback are not semantically equivalent | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-MEDIA-DUPLICATION | deep-audit | 2026-07-30 | system audit | Media duplicated across Listing.media, raw_data.Media, ListingMedia, R2, columns | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-PROJECTION-MIGRATION | deep-audit | 2026-07-30 | system audit | listing_search_projection dual-write best-effort; reader swap held (PR 5B) | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-PROPERTY-IDENTITY | deep-audit | 2026-07-30 | system audit | Canonical property identity is schema-only; no proven writers/readers | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-PERSON-ORG-IDENTITY | deep-audit | 2026-07-30 | system audit | No person/household/organization identity foundation | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-WORKFLOW-OUTBOX | deep-audit | 2026-07-30 | system audit | No domain-event/outbox/workflow separation; AuditEvent must not be repurposed | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-POLICY-VERSIONING | deep-audit | 2026-07-30 | system audit | No policy/provider-contract version provenance for decisions | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-IDX-GOD-MODULE | deep-audit | 2026-07-30 | system audit | lib/idx/sync.ts concentrates fetch, map, persist, media, cache, cursor concerns | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |
| AUDIT-GOVERNANCE-DRIFT | deep-audit | 2026-07-30 | system audit | Governance documents carry stale operational statements | TBD | unresolved | pending reconciliation | pending review | unassessed | unassessed | inventory_only |

## Excluded sections (12)

Headings carrying no requirement. Recorded, never silently omitted.

| heading | source | reason |
|---|---|---|
| One authoritative product, architecture, compliance, delivery, error, and housek | `recovered-plan` | `context_only` |
| 0.1 Requirement identifiers | `recovered-plan` | `context_only` |
| 0.2 Status legend | `recovered-plan` | `context_only` |
| 0.3 Section header convention | `recovered-plan` | `context_only` |
| 0.4 Blast radius | `recovered-plan` | `context_only` |
| A.1 — Requirements transferred, with evidence | `recovered-plan` | `context_only` |
| A.2 — Known-present but untransferred, with the specific gap | `recovered-plan` | `context_only` |
| A.3 — Consequence | `recovered-plan` | `context_only` |
| GATE-2026 | `recovered-plan` | `not_a_requirement_identifier — date in filename memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md (line 542)` |
| SL-0004 | `recovered-plan` | `not_a_requirement_identifier — Mallan listing/web record identifier, not a requirement (lines 664, 668)` |
| SPEC-2026 | `recovered-plan` | `not_a_requirement_identifier — date in filename SELLER-001-SPEC-2026-07-03.md (line 141)` |
| UCBA-2026 | `recovered-plan` | `not_a_requirement_identifier — date in filename data/UCBA-2026-Requirements.md (line 1937)` |
