# agent_info Phase C — Stop Writing `agent_info` JSON (plan/spec)

> **For agentic workers:** This is the Phase C plan/spec ONLY. No implementation in this document. Phase C is a separate PR from Phase D. Phase D (DROP COLUMN + reclaim) is explicitly OUT of scope here.
>
> **Board:** GitHub issue #415 (Lane 1). **Predecessors:** Phase A (#412 columns, #413 producer dual-write), A6 backfill (#416), Phase B reader migration (#417, merged `fd0fdf15`, prod smoke PASS).

**Goal:** Stop all future writes/refills to the `listings.agent_info` JSON column while every producer continues writing the 8 typed agent columns. No reader behavior changes. The `agent_info` column stays in the DB and `resolveListingAgentInfo` keeps its JSON fallback (both removed only in Phase D).

**Why:** `agent_info` JSON is ~part of the legacy bloat blocking the Neon Free (<500 MB) target. Phase C stops growing/refreshing it so Phase D can drop it cleanly. After Phase C, every new/updated row carries attribution ONLY in the typed columns; existing rows keep their (now-frozen) JSON until Phase D.

---

## 0. Verified preconditions (re-confirmed 2026-06-21 against `main` @ fd0fdf15)

- **Every runtime producer already writes the 8 typed columns.** CREATE paths spread `...mapped`, and the trestle mapper returns the typed columns inside `mapped` (`...typedAgentCols`, `trestle-mapper.ts:1187`). UPDATE paths add `...typedAgentColumnsFromJson(...)` explicitly. **The 3 "typed-gap" paths flagged by the raw inventory (`sync.ts:1141`, `reset-sync:138`, `feed-reconcile:381`) are FALSE positives** — all three spread `...mapped`, which carries the typed columns. There are **no typed-column gaps to close first.**
- Readers are fully typed-first with JSON fallback (Phase B, merged + smoke-passed).
- The typed-derivation SOURCE at every producer is an **in-memory** `agentInfo` object (mapper output, or CRM form/exclusive-assignment object) — NOT the DB column. So dropping the DB write does **not** break typed derivation.

---

## 1. Writer / refill inventory (corrected, exhaustive)

Legend — **kind**: create / update / upsert / literal-helper / raw-SQL. **typed src**: where the typed columns are derived from.

### A. Runtime producers (serve production writes) — MUST stop writing `agent_info`, MUST keep typed

| # | Path | Site(s) | agent_info write | typed columns | typed src |
|---|---|---|---|---|---|
| A1 | `lib/idx/trestle-mapper.ts` | ~1182 (`agent_info: agentInfo`) + 1187 (`...typedAgentCols`) | returns it in `mapped` | returns them in `mapped` | internal `agentInfo` |
| A2 | `lib/idx/sync.ts` (syncListings) | create ~301 (`...mapped`+explicit) / update ~335 (`agent_info:` + `...typedAgentColumnsFromJson`) | YES (both) | YES | `mapped` / `mapped.agent_info` |
| A3 | `lib/idx/sync.ts` (syncAgentListings) | create ~1141 (`...mapped`+explicit) / update ~1169 (`agent_info:` +`...typed` 1171) | YES (both) | YES | `mapped` / `mapped.agent_info` |
| A4 | `app/api/idx/ensure-listing/route.ts` | create ~135 (`agent_info:`) + 138 (`...typed`) | YES | YES | in-memory `agentInfoJson` |
| A5 | `app/api/crm/listings/route.ts` | POST create ~428 (`agent_info:`) + 433-435 (`...typed`) | YES | YES | in-memory `exclusiveAssignment?.agent_info ?? persistence.agentInfo` |
| A6 | `app/api/crm/listings/[id]/route.ts` | PATCH ~414/418 (`update.agent_info = …`) + 425 (`...typed`) | YES | YES | in-memory `update.agent_info` |
| A7 | `app/api/crm/listings/reset-sync/route.ts` | create ~138 (`...mapped`+explicit) / update ~170 (`agent_info:` +`...typed` 172) | YES (both) | YES | `mapped` / `mapped.agent_info` |
| A8 | `app/api/cron/feed-reconcile/route.ts` | orphan create ~381 (`...mapped`+explicit) | YES | YES (via `...mapped`) | `mapped` |

### B. Helper that emits `agent_info` (not a writer itself)

| # | Path | Note |
|---|---|---|
| B1 | `lib/listings/exclusive-agent-assignment.ts` | `buildExclusiveAgentAssignment()` returns `{ agent_info, ...8 typed columns }` (line ~183). Pure function; callers A5/A6 persist it. Phase C: callers stop persisting `agent_info`; the returned typed columns continue. Helper may keep returning `agent_info` (used in-memory) or drop it — see §3 design. |
| B2 | `lib/listings/agent-info-typed-columns.ts` | `typedAgentColumnsFromJson()` — pure JSON→typed map. **Unchanged.** Stays the single derivation seam. |

### C. Ops / import / repair scripts (not runtime; admin-gated)

| # | Path | agent_info write | typed | Phase C disposition |
|---|---|---|---|---|
| C1 | `scripts/import-closed-from-trestle.ts` | create ~330 (`agent_info:`) + 331 (`...typed`) | YES | UPDATE to typed-only (drop agent_info write) — still a live import tool |
| C2 | `scripts/ops/set-exclusive-listing-agent.mjs` | update ~103 + hard-coded typed 108-113 | YES | UPDATE to typed-only |
| C3 | `scripts/ops/repair-exclusive-agent-assignment.mjs` | update ~155 + hard-coded typed 159-164 | YES | UPDATE to typed-only |
| C4 | `scripts/backfill-crm-exclusive-cotality-identity.mjs` | update ~101 + hard-coded typed 91-97 | YES | RETIRE (one-time identity backfill, already run) — or typed-only if kept |
| C5 | `scripts/backfill-agent-info-typed-columns.ts` | raw SQL — typed only, agent_info untouched | n/a | **No change** (already typed-only; this is the A6 backfill) |

### D. Read-only / fixtures / generated (NOT writers — no Phase C change, allowlisted by the guard)

- READERS (typed-first + JSON fallback): `lib/listings/agent-info-resolver.ts`, `lib/idx/db-to-public-dto.ts`, `lib/compliance/dto.ts`, `lib/listings/assigned-agent.ts`, `lib/syndication/eligibility.ts`, `app/api/cron/data-retention/route.ts` (archiver capture — reads, writes to `listingsArchive` typed columns, NOT `listings.agent_info`), `app/api/listings/route.ts`, `app/api/listings/similar/route.ts`, `app/api/open-houses/route.ts`, `app/api/agents/[slug]/listings/route.ts`, `app/listing/[...slug]/page.tsx`, `public/crm/js/core/data-loader.js`.
- TEST FIXTURES: `tests/runtime/*.test.ts`, `lib/**/__tests__/*.test.ts` building `agent_info: {...}` inputs.
- GENERATED: `public/crm/index-built.html`.

---

## 2. Classification summary (per Maya's required buckets)

- **Must keep writing typed columns:** A1–A8 (all runtime producers), C1–C3 (kept ops tools), C5 (backfill).
- **Must stop writing `agent_info`:** A1–A8 (runtime), C1–C3 (ops tools), B1 caller-side persistence.
- **Legacy-only script to retire:** C4 (`backfill-crm-exclusive-cotality-identity.mjs` — one-time, already run).
- **Test fixture only (no change, allowlisted):** all `*.test.ts` agent_info fixtures.
- **Safe fallback read only (no change, allowlisted):** all of bucket D.

---

## 3. Design decision — HOW to stop writing `agent_info`

Because CREATE paths use `create: { ...mapped }` and the mapper returns `agent_info` **inside** `mapped`, simply deleting an explicit `agent_info:` line does NOT stop the write — `...mapped` still carries it. Two clean options:

### Option A — Mapper stops emitting `agent_info`; UPDATE paths read typed from `mapped`
- `mapTrestleToPrisma` removes `agent_info: agentInfo` from its returned object (keeps `...typedAgentCols`; still builds `agentInfo` internally to derive them).
- CREATE paths (`...mapped`) automatically stop writing `agent_info` and keep typed — **zero change**.
- UPDATE paths currently do `agent_info: mapped.agent_info` (remove) **and** `...typedAgentColumnsFromJson(mapped.agent_info)` (BREAKS — `mapped.agent_info` is gone). Must swap to a new `pickTypedAgentColumns(mapped)` helper that lifts the 8 typed keys already on `mapped`.
- CRM/ensure/ops (build agent_info from form): drop the `agent_info:` write; keep `...typedAgentColumnsFromJson(inMemoryObj)` (derives from an in-memory object, unaffected).
- **Pro:** centralized; CREATE sites need no edit. **Con:** changes the mapper's return contract (type + every consumer's expectations) and rewrites the UPDATE typed-derivation in sync/reset-sync.

### Option B — Producers omit `agent_info` at the write site; mapper unchanged  ✅ RECOMMENDED
- Mapper unchanged (still returns `agent_info` in `mapped` — used only in-memory now).
- CREATE `{ ...mapped, … }` → destructure it out: `const { agent_info: _omitAgentInfoJson, ...mappedNoAgentInfo } = mapped;` then `create: { ...mappedNoAgentInfo, … }` and delete the explicit `agent_info:` line.
- UPDATE → delete the `agent_info: mapped.agent_info` line; **keep** `...typedAgentColumnsFromJson(mapped.agent_info)` (mapped.agent_info still exists in memory). No new helper.
- CRM/ensure/ops → delete the `agent_info:` write line; keep the existing `...typedAgentColumnsFromJson(inMemoryObj)`.
- **Pro:** smallest blast radius; mapper + UPDATE typed-derivation untouched; the in-memory `agentInfo` stays available for derivation everywhere; the guard test (§4) enforces completeness so a missed CREATE site fails CI. **Con:** each CREATE site needs the one-line destructure (≈5 sites).

**Recommendation: Option B.** It keeps the derivation source intact at every site, doesn't churn the mapper contract, and the guard test makes "did we miss a site?" a hard CI failure rather than a silent leak. (Option A is viable if we later prefer a single chokepoint — but its UPDATE rewrite is more error-prone now.)

### Implementation rule (invariants enforced in the PR)
1. All producers continue writing the 8 typed columns (unchanged derivation).
2. No producer writes/refills `agent_info` (CREATE destructure-omit; UPDATE/CRM/ops line-delete).
3. No reader behavior changes. `resolveListingAgentInfo` keeps JSON fallback.
4. `agent_info` column remains in the DB (no schema change, no DROP).
5. No Phase D. No Neon downgrade.

---

## 4. Guard tests (added in the Phase C PR)

1. **Producer typed-write tests (per path):** assert each producer's write payload includes all 8 typed columns. Extend the existing `agent-info-mapper-dualwrite` + sync/reset-sync tests; add ensure-listing + feed-reconcile coverage where missing.
2. **Producer "no agent_info write" tests:** assert each producer's Prisma write payload does NOT set `agent_info` (e.g. mock `prisma.listing.create/update/upsert` and assert `data.agent_info === undefined`). One per A2–A8 (A1 mapper: assert `mapTrestleToPrisma(raw).agent_info === undefined` only under Option A; under Option B the mapper still returns it, so this assertion lives at the WRITE sites, not the mapper).
3. **Reader regression:** re-run the Phase B reader suite (`agent-info-phase-b-readers`, `agent-info-phase-b-secondary-readers`, `agent-info-resolver`) to prove typed-first + JSON-fallback still work unchanged.
4. **Static producer guard (grep/AST):** a jest test that reads the runtime producer files (A2–A8 + C1–C3) and asserts **no `agent_info:` Prisma-write key** and **no `.agent_info =` assignment** remains, with an explicit ALLOWLIST for: the resolver/typed-columns seam, `dto.ts` (read + strip), all `*.test.ts` fixtures, and bucket-D readers. New `agent_info:` writes in producer paths fail CI. (Static structural assertion — acceptable per CLAUDE.md §F for "is X present/absent in source" claims.)

---

## 5. Required proof before Phase C merge

- `npm run type-check` → 0
- Producer typed-write + "no agent_info write" tests (new) → green
- `agent-info-mapper-dualwrite`, sync/reset-sync producer tests → green
- CRM create/update tests (`crm-publication-featured-exclusive`, CRM PATCH/POST suites) → green
- IDX sync/mapper tests → green
- Phase B reader suites → green (regression)
- `npm run compliance-check` → 0 BLOCKER+STRICT
- `npm run ucba:audit` → 0 REGRESSIONS
- `npm run rls:validate` → all sections PASS
- `npm run idx:validate` → only the known pre-existing media-backfill critical (`Critical issues unchanged (1)`)
- **Grep proof:** no `agent_info` writer/refill remains in producer paths; no `schema.prisma`/`prisma/migrations`/DROP/ALTER; no Phase D work; no Neon downgrade.
- **Post-merge prod smoke:** same 7 surfaces as Phase B (attribution still renders from typed columns; new/edited listings carry typed columns and an UNCHANGED frozen `agent_info`).

---

## 6. Files to change / out of scope / risks / rollback

### Files to change (Phase C PR)
- `lib/idx/sync.ts` (A2, A3 — omit agent_info at create+update)
- `app/api/idx/ensure-listing/route.ts` (A4)
- `app/api/crm/listings/route.ts` (A5)
- `app/api/crm/listings/[id]/route.ts` (A6)
- `app/api/crm/listings/reset-sync/route.ts` (A7)
- `app/api/cron/feed-reconcile/route.ts` (A8)
- `lib/listings/exclusive-agent-assignment.ts` (B1 — optional: drop `agent_info` from the returned object once callers no longer persist it)
- `scripts/import-closed-from-trestle.ts` (C1), `scripts/ops/set-exclusive-listing-agent.mjs` (C2), `scripts/ops/repair-exclusive-agent-assignment.mjs` (C3) — typed-only
- `scripts/backfill-crm-exclusive-cotality-identity.mjs` (C4 — retire / mark legacy)
- (Option A only) `lib/idx/trestle-mapper.ts` — NOT changed under recommended Option B
- New tests under `tests/runtime/` + the static producer guard

### Explicitly OUT of scope
- `lib/idx/trestle-mapper.ts` content (under Option B) beyond what's needed.
- `resolveListingAgentInfo` JSON fallback (stays until Phase D).
- Any DROP COLUMN / schema migration / `prisma/migrations` (Phase D).
- Neon tier / downgrade.
- The archiver (`data-retention`) — it reads, and writes `listingsArchive` typed columns, not `listings.agent_info`.
- The third-party detail-page attribution display question (separate compliance issue — see §7).
- Any unrelated CRM feature work.

### Risks + mitigations
- **R1 — a CREATE site missed → agent_info keeps growing silently.** Mitigation: the §4.4 static producer guard fails CI on any residual `agent_info:` producer write.
- **R2 — typed derivation accidentally broken when removing the agent_info line (esp. UPDATE branches that derive from `mapped.agent_info`).** Mitigation: Option B keeps `mapped.agent_info` in memory; §4.1 typed-write tests assert all 8 columns still written.
- **R3 — a row updated post-Phase-C ends up with a STALE agent_info JSON (frozen at last pre-C value) while typed columns move on.** This is expected and safe: readers are typed-first; JSON is fallback only. No reader prefers stale JSON over a present typed column. Documented; resolved permanently at Phase D.
- **R4 — an exclusive listing whose attribution is edited in CRM after Phase C: typed columns update, agent_info frozen.** Same as R3 — typed-first readers show the new value. Safe.
- **R5 — ops script still writing agent_info if not updated.** Mitigation: C1–C3 included in the guard's producer set.

### Rollback plan
- Phase C is pure application code (no schema/data change), so rollback = **revert the Phase C PR**. On revert, producers resume dual-writing `agent_info` + typed columns; readers (already typed-first) are unaffected; no data migration needed.
- Rows written during the Phase-C window have a frozen/sparse `agent_info` but correct typed columns; after revert they resume getting JSON on next write. No corruption, no backfill required to roll back.
- Because the column was never dropped and the JSON fallback never removed, there is **no irreversible step** in Phase C. (Irreversibility begins only at Phase D.)

---

## 7. Separate compliance item (NOT part of Phase C)

Third-party IDX **detail pages** render a generic "Listings provided by REBNY RLS" attribution and do not display the specific listing office (e.g. "Listing courtesy of Compass"); only `/api/listings` exposes the office value. This is pre-existing (unchanged by Phase A/B/C) but may implicate REBNY / NY DOS §175.25 advertising-attribution requirements. **Tracked as a separate compliance issue — do not fold into Phase C.**
