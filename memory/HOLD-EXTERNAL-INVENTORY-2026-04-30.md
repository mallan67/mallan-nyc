# HOLD — External Inventory + Sponsor Database Implementation

> **Status:** HOLD · **Created:** 2026-04-30 · **Updated:** 2026-04-30 (sponsor spec added) · **Survives until:** Media PR 3 observation closeout passes cleanly AND user explicitly approves both builds.
>
> **This file is the active hold-record for TWO parked specs. Do NOT delete or archive until release conditions are met for both.**

## Specs under hold

| Spec | Path | Lines | Status |
|---|---|---|---|
| External inventory (FSBO + non-RLS broker exclusives) | `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md` | 701 | DRAFT, parked |
| Sponsor database (sponsor LLCs + management cos + selling brokerages + sponsor units) | `docs/superpowers/specs/2026-04-30-sponsor-database-design.md` | 1003 | DRAFT, parked. **§14b commission addendum is open-question pending NAR-post-settlement clarification from user.** |
| Commission confirmation (cross-cutting, future) | not yet drafted | — | Identified as a future generalization in sponsor spec §14b. Needs user input on post-NAR data shape before drafting. |

## Open architectural question — post-NAR commission tracking

Per user correction 2026-04-30: the Sitzer/Burnett v. NAR settlement (Aug 2024) materially changed how commission/compensation is tracked. MLS feeds (including REBNY RLS) no longer carry buyer-broker compensation. Buyer-representation agreements are now mandatory before touring. Compensation per transaction can come from multiple sources (seller concession + listing-side co-broke if any + buyer payment under rep agreement + closing-cost credits, etc.).

**The "we have to call each agent for every listing" workflow the user described is therefore not a quirk of non-RLS data — it's the post-NAR baseline for ALL listings, including RLS REBNY-member ones.** The data model captured in the sponsor spec §4.7 (commission_confirmed_at, commission_basis, commission_value) was sketched in pre-NAR framing and needs revisiting before any implementation.

**Next questions to resolve with the user before drafting the commission spec:**
1. What does "confirming commission" mean operationally at mallan post-NAR — is it tracking (a) what the listing-side brokerage pays a buyer's agent if anything, (b) what the buyer has agreed to pay mallan under their rep agreement, (c) both, separately, or (d) something different?
2. Per transaction, how many compensation sources does mallan typically reconcile? (Seller concession + listing co-broke + buyer-rep payment + closing credits.)
3. Where is buyer-broker compensation displayed in mallan.nyc today (CRM result cards, portal, send emails)?
4. Does mallan track compensation per-listing OR per-transaction?
5. Are listing-side co-broke offerings still common in mallan's NYC market, or have most listings shifted to "no buyer-side compensation, buyer pays their own agent per rep agreement"?

## Active hold

User instruction (verbatim, 2026-04-30):

> Hold implementation.
> I will review: `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md`
> Do not invoke writing-plans.
> Do not commit.
> Do not start implementation.
> Do not start PR 4.
> Keep Media PR 3 observation gate active.

## Hard limits while held

- ❌ Do NOT invoke `superpowers:writing-plans` for the external-inventory spec.
- ❌ Do NOT begin any implementation of the external-inventory feature (no schema, no migrations, no API routes, no UI, no tests, no CI rules).
- ❌ Do NOT commit anything during the Media PR 3 observation window.
- ❌ Do NOT start master plan PR 4 (`refactor/04-media-batch-rewrite`).
- ❌ Do NOT begin Phase 2 (bulk import) or Phase 3 (scraper) work — those are gated behind their own approvals per the spec.
- ✅ Read-only checks of any kind are fine.
- ✅ The spec itself (`docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md`) may be edited by the user or by Claude under user direction, but the resulting changes stay in the working tree (no commit during observation).

## Two release conditions (BOTH required to lift this hold)

1. **Media PR 3 observation closeout passes cleanly.**
   - Window ends `2026-05-02T06:00:42-04:00`.
   - Closeout checklist lives at the bottom of `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`.
   - Closeout report must show: time-gate satisfied, REBNY §2.05 = 0, R2 health green, media dry-run failed = 0, projection parity clean, public `/api/listings` recovered, no public media URLs rewritten.
2. **User explicitly approves the external-inventory build.**
   - Approval is a separate decision from the spec review. The user may approve the spec but defer the build.
   - Spec approval alone is NOT sufficient to lift this hold.

## What unblocks when this hold lifts

- `superpowers:writing-plans` invocation against the design spec.
- Implementation plan created and reviewed by user.
- Phase 1 implementation PR opened.
- Manual migration applied to Neon prod per `NEON.md` discipline before code merge.

## Spec reference

- **Path:** `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md`
- **Length:** 701 lines · 17 sections
- **Self-review:** complete (§14 of the spec answers 7 compliance questions)
- **Phased rollout:**
  - Phase 1 (post-PR-4): manual Add Off-Market CRM flow + per-client invite + portal display + disclaimer + PII reveal flow + public-route firewall
  - Phase 2 (post-Phase-1, separate spec): CSV bulk import + URL-assisted manual entry
  - Phase 3 (post-Phase-2 + legal review, separate spec): StreetEasy FSBO scraper

## What's parked (carryover from session close 2026-04-30)

Working tree at hold time — these stay parked, not committed:

```
 M .idx-validate/history.json                              (auto-regenerated; carryover)
 M CLAUDE.md                                                (memory rule + IDX-Plus follow-up updates)
 M memory/REFACTOR-2026-04-25.md                            (sub-incident note)
 M public/crm/data/validator-results.json                   (auto-regenerated; carryover)
?? artifacts/reso-snapshots/                                (read-only diagnostic JSONs)
?? memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md             (THIS FILE)
?? memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md               (today's incident capture)
?? docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md (spec parked here)
```

When both release conditions are met and the user authorizes a deliberate check-in, a single `chore(memory): capture 2026-04-30 IDX Plus display-gate incident + recovery + external-inventory spec` commit can land all of these except `artifacts/reso-snapshots/` (those stay local diagnostic artifacts).

## Active gate (independent of this hold)

| Gate | Status | Ends |
|---|---|---|
| Media PR 3 observation window | ⏳ active | `2026-05-02T06:00:42-04:00` |
| §2.05 violations = 0 at closeout | ⏳ pending verification | post-closeout |
| External-inventory build approval | ⏳ awaiting user decision | independent of observation gate |

## Resume instructions for the next session

1. Read this file end-to-end. Confirm both release conditions are still pending or now met.
2. If Media PR 3 closeout has not run yet (now is before `2026-05-02T06:00:42-04:00`):
   - Do read-only checks only.
   - Do not lift this hold.
3. If Media PR 3 closeout window has passed:
   - Run the closeout checklist at the bottom of `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`.
   - Report results.
   - Wait for user to (a) confirm observation closeout was clean, AND (b) explicitly authorize the external-inventory build.
   - Only then invoke `superpowers:writing-plans` against `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md`.
4. When this hold is lifted:
   - Replace this file's body with a dated archival note pointing to the implementation PR.
   - Mirror the archival update to Desktop per the CLAUDE.md memory-mirror rule.

## Cross-references

- `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md` — the spec under hold
- `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` — closeout checklist + IDX Plus incident capture
- `memory/REFACTOR-2026-04-25.md` — master plan; PR 4 status table
- `CLAUDE.md` — memory mirror rule + active follow-up block
- `NEON.md` — schema migration discipline (applies when Phase 1 implementation begins)
