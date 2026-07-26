# Phase 2A — acceptance matrix (LIVE TRACKER)

> Canonical tracker for the fixed acceptance-evidence contract in
> `docs/superpowers/specs/2026-07-26-neon-phase2a-media-reconciliation-design.md` §12.
> **No gate is PASS without: command/query · timestamp · exact SHA/deployment · artifact path ·
> actual result · expected result.** All gates start **PENDING** (not run). Do not fabricate rows.
>
> **Redaction (hard):** no secrets, bearer tokens, complete signed URLs, personal data, addresses,
> or unredacted listing/media identifiers. Keys hashed; URLs dropped or reduced to host-class.

| Gate | Description | Artifact | Status | Evidence pointer (command · ts · SHA · actual/expected) |
|---|---|---|---|---|
| COT-1 | Live `$metadata` field/type contract | `01-cotality-contract.json` | ⬜ PENDING | — |
| COT-2 | Live read-only Property→Media probes | `02-cotality-live-probes.jsonl` | ⬜ PENDING | — |
| COT-3 | Permission semantics (proof gate) | `03-permission-contract.md` | ⬜ PENDING | — |
| CODE-1 | Stable hash determinism | `05-replay-results.json` | ⬜ PENDING | — |
| CODE-2 | Reconciliation truth table | `06-test-results.txt` | ⬜ PENDING | — |
| CODE-3 | Pending verification lane | `06-test-results.txt` | ⬜ PENDING | — |
| DB-1 | Migration (new empty table only) | `07-migration-proof.md` | 🟨 BRANCH-PASS | ephemeral br-super-sunset-adrkwzj8 (from br-crimson-frog, now deleted) 2026-07-26: table/cols/FK/unique/pending-index + schema-diff (additions only) + counts-unchanged + unique/FK enforced + index-scan all PASS. **Apply-to-main NOT done (Maya-gated).** |
| REPLAY-1 | Deterministic replay (real shapes) | `04-replay-fixtures/` + `05-replay-results.json` | ⬜ PENDING | — |
| PROD-1 | Three natural cycles | `08-production-natural-cycles.jsonl` + `09-production-db-invariants.txt` | ⬜ PENDING | — (Maya-gated deploy) |
| PROD-2 | 24-hour normalized write trend | `09-production-db-invariants.txt` | ⬜ PENDING | — (Maya-gated deploy) |

**Final verdict:** ⬜ NOT YET ADJUDICATED → `10-final-verdict.md`
**Known residual work:** Phase 2B only (HELD).

## Gate ordering / dependencies
1. **COT-1 → COT-2 → COT-3** (live contract before behavior) — read-only GET probes; no code needed.
2. **CODE-1, CODE-2, CODE-3, REPLAY-1** (implementation + tests; replay uses redacted real shapes
   captured in COT-2).
3. **DB-1** (migration) — requires Maya authorization; applied to prod before schema-dependent code.
4. **PROD-1 → PROD-2** — requires Maya-authorized deploy; natural cycles only, `manual_triggers=0`.

## Status legend
⬜ PENDING (not run) · 🟨 IN PROGRESS · ✅ PASS · ❌ FAIL — a line moves to ✅/❌ only when the
Evidence pointer cell is fully populated (command/query · timestamp · exact SHA/deployment ·
artifact path · actual result · expected result).
