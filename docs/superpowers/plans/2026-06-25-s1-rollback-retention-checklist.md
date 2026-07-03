# S1 rollback-branch retention checklist + calendar gate

> **Tracking doc. No reclaim, no branch deletion, no VACUUM/pg_repack, no downgrade, no S2 — all
> remain gated.** Created 2026-06-25 · #415. Governs the confidence window before S1 reclaim.

## State (accepted)
S1 compliance strip succeeded logically: `listings.compliance` ~202 MB → **541 kB** (110,062 rows `{}`, 7 authored preserved). Autovacuum/analyze already ran; dead space is reusable. **Billed/physical size will NOT drop** until the rollback branches are deleted + the PITR window elapses. **NO-GO on reclaim today.**

## 1. Rollback branches — KEEP BOTH (do not delete)
| Branch | id | Endpoint | Parent / LSN | Captures |
|---|---|---|---|---|
| `pre-s1-compliance-terminal-strip-2026-06-24` | `br-mute-flower-adurq0o7` | `ep-icy-art-adsosxti` | `br-crimson-frog-adr7g9gt` @ `4/403D0CF0` | full **pre-S1** (terminal+live intact) |
| `pre-s1-compliance-live-strip-2026-06-25` | `br-holy-forest-adxoogq9` | `ep-purple-glitter-adg1wlsd` | `br-crimson-frog-adr7g9gt` @ `4/4C563DD0` | **post-Phase-1** (terminal stripped, live intact) |
Both in canonical `hidden-mountain-87248164` (org-wild-king). Neither may be deleted without explicit Maya approval (and only after §4 passes).

## 2. Confidence window
- **S1 completed:** 2026-06-25 (~01:06 UTC, Phase-2).
- **7-day clean window:** **2026-06-25 → 2026-07-02**.
- **Window-end checkpoint:** **2026-07-02** (re-run §4). Calendar gate set (Google Calendar, America/New_York).

## 3. Monitor during the window (read-only; spot-check ~daily or on any deploy/incident)
All checks are read-only / live probes — no writes.
- [ ] **Listing detail render** — sample live detail pages render remarks (from `features`/`raw_data`). (live URL probe)
- [ ] **`/api/listings`** — 200, no `compliance` key leak (only `_compliance`/`_displayCompliance`).
- [ ] **CRM loader/auth** — unchanged (no compliance-driven breakage; authed check is Maya's).
- [ ] **Syndication / display gate** — `idx:validate` + `rls:validate` clean; approval keys still 0; gating via typed columns.
- [ ] **Sync does NOT rehydrate compliance** — rows created after deploy still `{}`; `new_rows_with_trestle_copy = 0`.
- [ ] **No new compliance JSON growth** — `compliance` column logical size stays ~KB (not creeping back toward MB).
- Tools (read-only, host-guarded): `scripts/__s1-phase2-prestrip-proof-2026-06-25.mjs` (durability + authored), `scripts/__s1-reclaim-assessment-2026-06-25.mjs` (sizes/dead tuples), live WebFetch probes of `/api/listings` + a few detail pages.

## 4. Window-end re-run (on/after 2026-07-02) — REQUIRED before asking to delete branches
- [ ] Re-run the smoke: `/api/listings` 200 + no leak; ≥3 live detail pages render remarks.
- [ ] Re-run size/durability measurement (`__s1-reclaim-assessment` + `__s1-phase2-prestrip-proof`): confirm compliance still ~KB, no rehydration, dead tuples reasonable, authored 7 preserved.
- [ ] Confirm no compliance-related runtime errors/incidents during the window.
- [ ] Summarize results on #415.

## 5. Branch-deletion gate (DO NOT RUN — explicit approval required)
Only after §4 is clean + Maya's explicit approval. Commands (for reference, NOT to run now):
```
# delete the finer-grained Phase-2 branch first (optional staging), then the pre-S1 branch
neonctl branches delete br-holy-forest-adxoogq9 --org-id org-wild-king-99967357 --project-id hidden-mountain-87248164
neonctl branches delete br-mute-flower-adurq0o7 --org-id org-wild-king-99967357 --project-id hidden-mountain-87248164
```
Deleting them **unpins** the pre-strip pages (prerequisite for billed reclaim). Trade-off: removes the fast rollback (PITR-to-timestamp still exists within window; data also re-derivable from `raw_data`).

## 6. Post-deletion: PITR elapse + re-measure (gated)
- After branch deletion, the pre-strip page versions on `main` age out over the **Launch 7-day PITR window** (~delete-date + 7 days).
- Then re-measure Neon billed/synthetic size (`neonctl branches list` logical_size + `pg_database_size`) → expect a drop toward live size (≈ −200 MB).

## 7. Reclaim decision (gated)
- If, after §6, billed size has dropped to the live-data level → **no pg_repack needed** (done).
- If the physical TOAST file remains bloated AND billing reflects it → consider **online `pg_repack`** (verify Neon extension availability first). **NEVER `VACUUM FULL`.**
- Re-assess Free-tier go/no-go only on the **measured** post-reclaim bytes.

## Calendar gate
- **2026-07-02 — S1 window-end checkpoint** (Google Calendar event, America/New_York): re-run §4 smoke+size, then decide whether to request branch deletion.

## Hard limits
No branch deletion yet · no reclaim · no VACUUM/pg_repack · no downgrade · no S2/raw_data until Maya decides observe-S1-first vs continue-probes. This doc tracks; it authorizes nothing.
