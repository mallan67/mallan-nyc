# Settlement Ledger — 2026-06

The single source of truth for "is it settled." One row per CONFIRMED defect. Governed by the
gate system in `docs/superpowers/plans/2026-06-07-settlement-gates-and-oversight-plan.md`.

**A row is `SETTLED` only when:** fix merged · harness green (B0) · compliance chain green (B1) ·
live proof attached (B2, §F) · all required MICRO agents PASS (C1) · MACRO system-impact verifier
PASS with blast-radius record (C2/B4) · **its Correction Trace Record is complete and green** · no
other ledger row regressed. **"System settled" ≡ all rows SETTLED.**

**Status vocabulary (exactly one per row):** `PLANNED` · `IN-PR` · `SETTLED` · `HELD` · `BLOCKED`.
(`REFUTED` = investigated and found NOT a defect.) Nothing is SETTLED without a complete, green
Trace Record — except the three pre-2026-06-07 items below, which shipped BEFORE the Trace Record
system existed and are annotated as such (verified by merge + harness, not by a Trace Record).

Sources: `repo-wide-audit-verification-2026-06-07.md`, `system-root-cause-registry`,
`phase1-unverified-traces-2026-06-07.md`. Sentinel-L is **excluded** from all gates.

## Done (shipped + verified — pre-Trace-Record system)
| ID | Defect | Phase | Status |
|---|---|---|---|
| B0 | Green regression baseline + un-blind compliance-check | 0 / 0.4 | **SETTLED** (#370, main 8bcac552; verified by merge + harness — pre-Trace-Record system, no record authored) |
| SF4 | `refused` neon-prune now surfaced in ops:health | 0.5 | **SETTLED** (#371; pre-Trace-Record system) |
| CI2 | rotate-db-keys + neon-branch-prune route + prune CLI guarded (fail-closed) + ops-health surfaces `refused` | 0.5 | **SETTLED** (#371 → main 7e2910a8; harness green 2041/2041, Codex P2 fixed+replied; pre-Trace-Record system) |
| — | Portal workspace isolation "hole" | 1 | **REFUTED** (complementary layers — not a defect) |

## Governance enforcement follow-ups
| ID | Item | Sev | Phase | Status |
|---|---|---|---|---|
| **G1** | Wire `gate:micro` + `gate:macro` + the harness as **REQUIRED CI checks** (branch protection) so the gates are **merge-blocking**, not just runnable. **Highest-leverage governance follow-up. Until G1 lands, no correction PR is fully protected (discipline-enforced only).** | P1 (gov) | 7 | **HELD** (.github/workflows — required next) |
| G2-hard | Full structured Trace-Record parsing (beyond the current basic heuristic) — RED-proof + regression-guard completeness enforced on every completed record; **auto-verify a claimed test-exemption reason is actually recorded in the Trace Record**. | P2 (gov) | later | **PLANNED** |
| G3 | **Remove or narrow the gate-tooling bootstrap exemption** (`isGateTooling`) after #372 lands, so future changes to `scripts/ci/gate-*.js` themselves require test updates (the exemption only existed so #372 could introduce the gates). | P2 (gov) | after #372 | **PLANNED** |

## Open rows (by domain) — gate column = which gates must go green to settle
| ID | Defect | Sev | Compliance | Phase | Gates | Status |
|---|---|---|---|---|---|---|
| **CC1** | Coming Soon badge not set on detail DB path | P0 | UCBA §16(C) | 6 | B0+B1+**B2 live**+tristle | PLANNED |
| **CC2** | FARE block dies if `listingType` mis-derived | P0 | NYC LL 119 | 6 | B0+B1+**B2 live rental**+tristle | PLANNED |
| CC3 | Third-party `publicRemarks` unscanned at render | P1 | Fair Housing | 6 | B0+B1+tristle | PLANNED |
| CC4 | Footer settings wholesale-replace blanks attribution | P1 | NY DOS §175.25 | 6 | B0+B1+tristle | PLANNED |
| CC5 | DOM raw, not UCBA-computed (latent — unrendered) | P2 | UCBA §11 | 6 | B0+B1 | PLANNED (latent) |
| CC6 | REBNY access-audit write swallowed | P1 | 12-mo retention | 2 | B0+silent-failure-hunter | PLANNED |
| CC7 | `/api/favorites/sync` lead POST → 404 | P1 | lead-routing/TCPA | 2 | B0+B1+security+flow-verifier | PLANNED |
| M1 | Held refactor: 3+ media writers; projection unread; 5 JSON cols undropped | P1 | — | 5 | B0+type-design+B4 | HELD |
| M2 | Incremental-only sync, no reconcile (starvation/stale/incomplete) | P1 | IDX display freshness | 3 | B0+B1+B4 | PLANNED |
| M3 | `mapping.ts` classifies Trestle FloorPlan as Photo (live path) | P1 | media display | 4 | B0+B2 live+tristle | PLANNED |
| M4 | ~8,568 displayable listings with no active `listing_media` | P1 | display completeness | 8 | B0+B2 (dry-run→execute) | HELD |
| **RC2** | idx-sync per-record UPDATE stomps `listings.media` with `[]` when Media not expanded (continuous self-overwrite) | P1 | media display (REBNY) | 3 | B0+B2 behavioral+gate:micro/macro+tristle | **SETTLED** (#375 → main `1047b562`; `mediaUpdatePatch` omits media on the not-fetched UPDATE so existing `listings.media` is preserved; batch loops unchanged from `main`; the deleted-at-source batch-clear add-on was **reverted** — it needs `@odata.nextLink` pagination = RC1; Codex 3-pass → clean "Swish"; tristle final PASS; gate:micro/macro PASS; harness green; Trace Record `docs/audits/corrections/RC2-idx-sync-media-stomp.md`) — media program correction #1, relates to **M2** |
| **RC1** | Cursor + `@odata.nextLink` pagination; owns deleted-at-source media clearing + boundary-key partial-write fix (deferred from RC2) | P1 | media display freshness | 3 | B0+B1+B2 behavioral+tristle | PLANNED (next in media program — **awaiting Maya GO**) |
| SF1 | Sync/media crons log `status=ok` while broken | P1 | — | 2 | B0+silent-failure-hunter | PLANNED |
| SF2 | `/api/analytics/event` missing → analytics dropped | P2 | — | 2 | B0+flow-verifier | PLANNED |
| SF3 | DB-outage → silent Trestle fallback | P2 | — | 2 | B0+silent-failure-hunter | PLANNED |
| S1 | Dedup-after-pagination → cross-page dup cards | P1 | attribution (dup) | 4 | B0+search-auditor+flow | PLANNED |
| S2 | `total`/`hasMore` from undeduped count | P2 | — | 4 | B0+search-auditor | PLANNED |
| S3 | DB search path drops `propertyType`+`bounds` (map no-op) | P1 | — | 4 | B0+flow-verifier | PLANNED |
| AS1 | `auth/login` no rate-limit/lockout | P1 | data security | 3 | B0+security (blocker) | PLANNED |
| AS2 | Ethics gate not per-request (scoped enforcement decided) | P1 | RLS eligibility | 3 | B0+B1+security | PLANNED |
| AS3 | `next@16.2.4` auth-bypass + SSRF | P1 | security | 7 | npm audit+security+full B0 | HELD (deps) |
| AS4 | vercel.json↔proxy.ts divergent Permissions-Policy | P1 | security headers | 6/7 | security header probe | HELD (.github/deploy) |
| CI1 | CI `db push --accept-data-loss`; validator:migration unwired; release-truth non-blocking | P1 | migration discipline | 7 | CI run exercises migrations | HELD (.github) |
| CI3 | db-keepalive ineffective; orphaned media-backfill route; no VACUUM | P2 | — | 4/9 | B0 | PLANNED |
| FE1 | Nested `<main>`×50 + redundant role | P1 a11y | accessibility | 5 | B0+frontend-auditor | PLANNED |
| FE2 | Contact form lacks `required`/`aria-required` | P2 | accessibility | 5 | B0+frontend-auditor | PLANNED |
| FE3 | `picsum`/`unsplash` in prod image allowlist | P2 | brand/advertising | 5 | B0+build | HELD (build/CSP) |

## Domain U — CRM/Portal (Phase 1 traces, now CONFIRMED)
| ID | Defect | Sev | Compliance | Phase | Gates | Status |
|---|---|---|---|---|---|---|
| **U4** | Cross-agent offer-transmit: any agent transmits another's offer + writes UCBA audit under own id | **P1 urgent** | UCBA Art. II / SHIELD | 3 | B0+security(blocker)+**auth test**+tristle | **SETTLED** (#373 → main e02060a3; ownership guard, security-agent PASS, Codex #373 resolved, gate:micro/macro PASS, Trace Record complete) |
| **U1** | Portal offers write `ClientListingAction`, never create `Offer` → bypass UCBA transmission | P0 | UCBA Art. II | 6 | B0+B1+tristle+B4 | PLANNED |
| **U7** | Commission "Submit Request" silent-fail (success-on-error toast, no write) | P1 | financial oversight | 6 | B0+flow-verifier+silent-failure-hunter | PLANNED |
| **U8** | Payout approve/reject `payout_status` vs `status` mismatch → pipeline unreachable | P1 | financial oversight | 6 | B0+flow-verifier | PLANNED |
| **U10** | Outlook imports land `consent_captured_at=null`, no consent flag | P1 (verify) | TCPA/CAN-SPAM | 2 | B0+B1+**§D read first**+tristle | PLANNED |
| U3 | Impersonation: no per-write `impersonated_by_broker_id`; TTL mismatch + silent rotation | P1 | NY DOS supervision/audit | 3 | B0+security+schema(HELD) | PLANNED |
| U2 | 20 portal mutation routes unthrottled (limiter bypasses auth) | P1 | abuse/security | 3 | B0+security | PLANNED |
| U5 | Notifications PATCH single-id cross-recipient write | P3 | segregation | 3 | B0+auth test | PLANNED |
| U6 | Outlook sequential import + no 429 backoff + unthrottled scan | P2 | reliability | 3 | B0+security | PLANNED |
| U9 | rental `applications_count: 0 // TODO` fake metric | P2 | — | 4/6 | B0+flow-verifier | PLANNED |

## Unverified-but-deferred (need a live read-only probe Maya runs — NOT yet ledger-actionable)
- True Cotality inventory count vs DB (run `scripts/trestle-listing-count.ts`).
- Cursor-freeze age / terminal-status-still-displayable >24h / gate drift / orphans (integrity SQL packs).
- Live Class-B Trestle probe: does status/price change bump `ModificationTimestamp`?
These gate Phase 3's sync rebuild design; they are **read-only** and require Maya to run (DB/Trestle env).

## Macro note
Per "no work in the dark," several rows are **coupled** — a fix to one must re-verify the others:
U7+U8 (same Deal field decision) · U1+U7/U8 (Offer/commission data models) · M1+M2+M3+M4 (media) ·
S1+S2+S3 (search) · CC1+CC2 (listing detail render). The MACRO system-impact verifier must treat
each coupled set as one blast-radius.
