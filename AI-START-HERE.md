# AI START HERE

**You are working on `mallan67/mallan-nyc` — a live REBNY IDX Plus brokerage
platform. Real listings, real compliance exposure, real production traffic.**

This file has **one purpose: routing**. It states no architecture of its own.

---

## Read in this order

1. **`docs/architecture/MALLAN-PLATFORM-PLAN.md`** — the single normative
   platform plan. Architecture, business rules, cross-system contracts and
   implementation sequence live **only** here (`DOC-1`).
2. **`AGENTS.md`** — the cross-agent constitution: invariants, holds, evidence
   language, review policy.
3. **`CLAUDE.md`** — Claude-specific depth (Claude only).
4. **`docs/PROJECT-HEALTH-DASHBOARD.md`** — live operational status.
5. **`docs/PLATFORM-ISSUE-REGISTRY.md`** — tracked issues and incidents.

Retired identifiers, open conflicts and deferred items are **normative in the
canonical plan** — §0.8, §1.2 and §18. The per-requirement reconciliation
evidence behind them is **historical, non-normative and not in this
repository**; it is preserved at the archival tag
**`archive/platform-plan-reconciliation-corpus-53688877`**
and carries known unvalidated defects. **The plan governs.**

---

## Four rules that will stop you breaking production

1. **Fail closed.** If a REBNY / RLS / IDX / FARE / Fair-Housing requirement is
   unclear, conflicting, or missing from the canonical source — **stop and
   report.** Do not guess from memory. Do not extrapolate from one field's
   handling to another's. *(`REB-3`; CLAUDE.md §E.)*

2. **Proof-first.** A source read never proves a rendering or behavior claim. A
   search that finds nothing proves **"not found in the searched paths"**, never
   **"does not exist"**. *(`OPS-4`, `GATE-2`, `GATE-5`, `HYG-1`.)*

3. **`implemented` ≠ `merged` ≠ `deployed` ≠ `production_proven`.** Four
   different claims. Do not promote one into another. *(§0.6 of the plan.)*

4. **Never remove a fallback.** `Listing.media`, `raw_data.Media`,
   `ListingMedia`, and the live provider fallbacks are all load-bearing during
   an in-flight migration. Absence of a discovered caller is not proof anything
   is safe to remove. *(`HYG-1`, `HYG-6`.)*

---

## Requires explicit Maya approval before you start

Schema migrations · environment variables · Neon settings · cron configuration ·
`public/crm/**` · agents · skills · `.github/workflows/**` · manual cron
triggers · reconciliation runs · admin merge bypass · force-push to `main` ·
PR 5B reader swap · external inventory · syndication exports · R2 operations.

---

## Open and unresolved — do not "fix" these

- **`OPS-024`** — the 2026-07-29 ingestion freeze. Recovered. Read it before
  touching the provider boundary.
- **`OPS-025`** — `mls_id` null on 95.1% of IDX listings. Pre-existing.
- **`OPS-026`** — public listing pagination runs before display and matched-pair
  filtering. Confirmed, **not fixed**, no correction authorized here.
- **`CONFLICT-POL-GATE34-PORTAL`** — portal gate 3/4 null semantics. The plan and
  the code disagree. **Preserve current deployed behavior; make no code change**
  until authoritative compliance verification plus Maya approval.
- **`CONFLICT-CAPABILITY-VOCABULARY`** — capability maturity vocabulary. The
  archived prototype registry and canonical plan §16 use different status lists.
  `deferred_with_gate`, **open**, decision owner **Maya**. **Neither list is
  adopted**; no capability registry, validator or `capability:audit` command
  exists in this repository. It must be settled **before** any machine
  enforcement returns.

---

## Scope

**`mallan67/mallan-nyc` only. Mallan Integrated is out of scope** — do not
inspect it, reference it as work product, or touch it (`BUS-6`).
