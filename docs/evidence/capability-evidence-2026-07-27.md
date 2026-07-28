# Capability promotion evidence — 2026-07-27

**Purpose:** durable evidence record backing every `implemented` status in
`config/capabilities.mjs`. Referenced by `evidence.resultArtifact`.

**Target SHA:** `6d2518b829c45f018337120c41811e4bdf11f7fa`
**Branch:** `docs/unified-ai-master-plan-2026-07-27` (PR #579 head)
**Run date:** 2026-07-27
**Runner:** local, Node 20.x, Windows 11. `node_modules` junctioned from the primary
working tree so the code under test is the PR head exactly.
**Verified before running:** `git rev-parse HEAD` → `6d2518b829c45f018337120c41811e4bdf11f7fa`

Per master plan §26 C-5 and `memory/EVIDENCE-STANDARD-2026-07-27.md`, a status of
`implemented` or higher requires a real command, a real exit code, a named target commit,
and an explicit statement of what the run does **not** prove.

---

## E-1 — `lib/search` suite

```
$ npx jest --config lib/search/jest.config.js --ci

Test Suites: 23 passed, 23 total
Tests:       625 passed, 625 total
Snapshots:   0 total
Time:        11.723 s
Ran all test suites.
```

**EXIT CODE:** `0`

**PROVES:** the canonical search contract, visibility contract, listing-access decision,
criteria→Prisma translation, public DTO shaping (DB and Trestle paths), projection write
suppression, and natural-language parsing behave as their 625 assertions specify, at this commit.

**DOES NOT PROVE:** that search returns correct results against live Cotality; that production
pagination or totals are truthful under real load; that any deployed surface uses these modules;
or that the assertions themselves encode correct REBNY semantics.

Backs: `CAP-SEARCH-CANONICAL`.

---

## E-2 — `lib/idx` suite

```
$ npx jest --config lib/idx/jest.config.js --ci

Test Suites: 39 passed, 39 total
Tests:       784 passed, 784 total
Snapshots:   0 total
Time:        17.21 s
Ran all test suites.
```

**EXIT CODE:** `0`

**PROVES:** the Cotality/Trestle adapter — auth, fetch, field mapping, normalization, media sync
and its cursor telemetry, write suppression, DTO construction — behaves as its 784 assertions
specify, at this commit.

**DOES NOT PROVE:** that any field is live or populated on Cotality today; that the mapping matches
current Trestle `$metadata`; that a live fetch succeeds; or that production sync is healthy. Those
are Class-B claims requiring `trestle:probe` / `trestle:audit-server` per `CLAUDE.md` §J.4. **No
live Cotality call was made during this run.**

Backs: `CAP-IDX-COTALITY-ADAPTER`, `CAP-MEDIA-SYNC`.

---

## E-3 — `lib/compliance` suite

```
$ npx jest --config lib/compliance/jest.config.js --ci

Test Suites: 14 passed, 14 total
Tests:       381 passed, 381 total
Snapshots:   0 total
Time:        4.259 s
Ran all test suites.
```

**EXIT CODE:** `0`

**PROVES:** the compliance gate logic — IDX display gate, RLS eligibility and enforcement, status
normalization including terminal statuses, auction banner and DTO handling, agent-info mapping —
behaves as its 381 assertions specify, at this commit.

**DOES NOT PROVE:** that any disclosure actually *renders* on a production page. That is precisely
the failure the 2026-05-20 FARE Act finding recorded — source and unit-test evidence passed while
the production conditional did not render. Rendering claims require a live URL probe.

Backs: `CAP-COMPLIANCE-GATES`.

---

## E-4 — Media AI-provenance fields are absent (negative evidence)

```
$ ls lib/idx/ | grep -i "media\|watermark"
agent-card-media.ts
media-sync.ts
media-sync-member.ts
watermark.ts

$ grep -rilE "editType|edit_type|virtualStaging|virtual_staging|aiModified|ai_modified|disclosureRequired" lib/idx/ lib/media/
→ NONE FOUND
```

**EXIT CODE:** `0` (grep found no matches)

**PROVES:** at this commit, no module under `lib/idx/` or `lib/media/` declares an AI-modification
edit type, virtual-staging marker, provider/model attribution, or disclosure requirement — the
§17.5 provenance field list.

**DOES NOT PROVE:** that no equivalent exists under a different name elsewhere in the repo. The
search covered two directories and one pattern set.

**Consequence:** `CAP-MEDIA-PROVENANCE` was split. Media synchronization is `implemented` (E-2);
the AI-provenance envelope is `discovered`. A capability may not be promoted on half its scope.

Also note: `lib/idx/media-reconcile-guard.ts` and `lib/idx/media-set-hash.ts` do **not** exist at
this commit. They are unpushed on `fix/neon-write-amp-phase2a-media-reconcile-2026-07-26` and were
removed from the registry's declared paths rather than left as dangling references.

---

## Not run during this analysis

Stated explicitly so a reader does not infer broader coverage than was obtained:

- `npm run type-check`
- `npm run ucba:audit`, `rls:validate`, `idx:validate`, `compliance-check`
- `npm run test:rls` (noted in `CLAUDE.md` §J.6 as absent from PR CI)
- `npm run crm:test`
- `npm run ops:health`
- any live Cotality/Trestle call
- any production or preview URL probe
- any Neon/production database query

No capability in the registry claims `shadow_mode`, `limited_release`, `production`, or `degraded`.
Those statuses require evidence classes — shadow comparison, bounded audience, deployed SHA, live
probe, rollback proof — that this analysis did not produce.
