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
| **RC1** | Cotality Media `@odata.nextLink` pagination + keyset cursor (`last_listing_key`) — fixes the boundary-cluster cursor deadlock (incident 2026-05-21 §4 RC1); safe deleted-at-source tombstone only after complete pagination | P1 | media display freshness | 3 | B0+B1+B2 behavioral+gate:micro/macro+tristle+security+rebny-search+Codex | **SETTLED** (#377 → main `07ec45b1`; approved additive nullable `MediaSyncState.last_listing_key` migration `20260608120000` applied to prod by Maya pre-merge; `paginateMedia` follows nextLink, complete-only `tombstoneVanished:true`, `pickKeysetWatermark` halts past failures, keyset `(pct gt ts) OR (pct eq ts AND ListingKey gt key)`; Codex P2 ListingId-missing-halt fixed; Claude Code Review SUCCESS + Codex CLEAN + tristle/security/rebny-search PASS; **runtime-verified** post-deploy: ops:health MEDIA SYNC `status=ok checked=380 updated=380 failed=0`, no `last_listing_key` error, no longer `pre_migration`) — media program correction #2, relates to **M2** |
| **RC3** | R2 retry purgatory — non-permanent failures (429/5xx/403/network/upload/head/token) retried forever; 40 poison rows ≈160 failed attempts/24h wasting Phase-3 mirror budget | P1 | media display freshness (non-destructive) | 3 | B0+B2 behavioral+gate:micro/macro+tristle+Codex | **SETTLED** (#379 → main `0fe39174`, merged 2026-06-10; `R2_RETRY_EXHAUSTED_THRESHOLD=8` + pure `buildR2BacklogWhere` parks retry-exhausted rows out of the Phase-3 backlog SELECT while `status='active'` is preserved so the proxy keeps serving `media_url_original` — photos never disappear; tombstone classification UNCHANGED (404/410@3 only); incident §7 PR-E blanket-tombstone rejected as unsafe; Codex CLEAN + claude-review SUCCESS + tristle PASS + gate:micro/macro PASS; harness green incl. test:runtime 2099/2099; **runtime-verified** post-deploy: prod deployment READY + SQL split `r2_retry_eligible=44 · r2_retry_parked=40 · r2_cached_active=81,751` — 40 exhausted rows parked-but-displayable, 44 actionable, R2 broadly healthy; **caveat:** `scripts/ops-health.js` still counts parked rows as retry backlog — actionable-vs-parked split deferred (Trace Record §10); Featured 4-vs-6 is NOT an RC3 failure — newest-sort/media-coverage starvation while RC1 catch-up drains, Featured config = separate operator decision; Trace Record `docs/audits/corrections/RC3-r2-retry-purgatory.md`) — media program correction #3, relates to **M2** |
| **RC5** | Ghost-listing cursor freeze — a Trestle Property with no local `listings` row threw P2025 at batch position #1 → `ok:false` → keyset watermark frozen FOREVER (production: pinned 48h at `2026-05-14T20:37:58Z` by 3 ghosts; 90 vs 13,220 rows/day; 11,822-listing backlog starved; ~150 new photoless listings/day). NEW ghost variant of incident §4 RC1's deadlock CLASS (correction-RC5 ≠ incident-RC5) | **P0** | media display freshness | 3 | B0+B2 behavioral+gate:micro/macro+tristle+Codex+7-point runtime proof | **SETTLED** (#382 → main `34566a60`, merged 2026-06-11; local-existence probe inside try BEFORE fetchMedia → ghost = RESOLVED skip (ok:true, like compliance-blocked), zero writes for ghosts, probe-failure falls to catch → fail-closed halt; `ghost_listings_skipped`+`ghost_listing_ids[≤20]` result counters; tombstone/watermark/RC3-parking byte-identical; RED 3→GREEN 5/5, lib/idx 298/298, test:runtime 2099/2099; tristle PASS no corrections; Codex ghost-reimport gap VERIFIED → **HARD checklist item on Phase-1 Correction 6** (orphan-create must arrange media; cannot SETTLE without it); **runtime-verified, Maya's 7-point bar (Trace Record §10)**: cursor 05-14 frozen → `2026-05-15T15:34:21.837Z` sustained ok/failed=0 · +235 `listing_media` rows in 5h vs ~90/day frozen · ghost fate `[]` not imported (feed-reconcile $expand bug = Correction 6) · Codex stranding `[]` · crm: baseline unchanged 10 active/1 listing · zero R2 deletes/backfill; **honest notes:** first proof-script run errored `l.standard_status` (column is `listings.status`) — typo corrected, section re-run; ghost ids NOT in runtime logs (route returns JSON, never logs) — observability follow-up queued into Correction 5; **SCOPE: P0 cursor-unfreeze patch ONLY — media program remains OPEN**; EMPTY drain ETA ~2.5-3 days; Trace Record `docs/audits/corrections/RC5-ghost-listing-cursor-freeze.md`) — media program correction #4, relates to **M2**; mandatory media-PR preamble (incident §0.5) installed by this correction |
| **C6** | feed-reconcile detects + imports eligible Cotality/Trestle **Pending/AUC orphans** (P1C6) via deterministic **chunked catch-up** (P1C6b) — closes the orphan-detection gap (incremental sync sees CHANGES, not ABSENCES; the 3 RC5 media-sync ghosts were `Pending`, invisible to the Active-only diff). Feed source = Cotality/Trestle IDX Plus at `api.cotality.com`; "RLS" = REBNY listing-key **prefix** only, not a data source | P1 | media display completeness (REBNY) | 3 | B0+B2 runtime+gate:micro/macro+tristle+security+rebny-search | **SETTLED** (P1C6 #394 → main `27bee282`; P1C6b chunked catch-up #395 → main `9e50d9ad`; evidence record #401 → main `2c2f5c4a`; Trace Record `docs/audits/corrections/P1C6-feed-reconcile-eligible-orphans.md` §10 night-1 + §11 consolidated; **runtime-verified across 3 nightly runs** (cron 03:30 UTC = 11:30 PM America/New_York the prior evening), read-only via host-guarded `scripts/__c6-night1-verify.mjs`: **3/3 named orphan-ghosts landed with media matching the 2026-06-12 probe** — RLS20014678 (m0, clean no-media) · RLS20018843 (m11) · RLS20030621 (m18), all Pending, all now local; **7/7 hard gates clean** nights 2-3 — `gated_skipped`=0, stranding=0, **no cleanup/backfill/R2-delete** in any run window; backlog drained 1,361→1,052→751→449; ghost-Active withdraw direction 94→0 (route-scoped `RLS%`, SL-0004 + non-RLS exclusives correctly excluded); in-PR gates: tristle PASS (all six, archive-writer trace), security PASS, rebny-search PASS (O2 plain code-point sort), gate:micro/macro PASS; **MONITOR ITEMS carried forward — NOT settlement blockers:** Q7 residual `RLS_ghost_Active=2` (`RLS20072123`, `RLS20063884` — §8 over-withdrawal candidate for a future correction) · `ALL-gated-with-media` drift 637→649 (post-C6 gated-media compliance design) · **route host-validation hardening (Codex #402):** the **verifier IS** host-guarded to `api.cotality.com`, but the **production route `app/api/cron/feed-reconcile/route.ts` is NOT** — it only defaults via `TRESTLE_API_URL || "https://api.cotality.com/trestle"` with no hostname validation; feed-reconcile should reject a non-`api.cotality.com` `TRESTLE_API_URL` before fetch (carried-forward hardening, no code change here); **Maya approval recorded 2026-06-15** (this PR/thread) for **formal bookkeeping closure ONLY**; **THIS LEDGER ROW UNLOCKS NO EXECUTION** — P2-MONEY Step 4 / data-cleanup require SEPARATE explicit Maya approval; no cleanup, Neon downgrade, storage reduction, targeted re-sync, R2 cleanup, or DB migration is performed or authorized by this settlement) — media program correction #5, relates to **M2** |
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
