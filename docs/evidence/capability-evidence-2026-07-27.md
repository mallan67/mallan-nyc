# Capability promotion evidence — 2026-07-27

**Purpose:** durable evidence record backing every `implemented` status in
`config/capabilities.mjs`. Referenced by `evidence.resultArtifact`.

**Target SHA (E-1 … E-4):** `6d2518b829c45f018337120c41811e4bdf11f7fa`
**Target SHA (E-5):** `40ae3917bddbdd2d4b73ad9f446f96ad9257765e` **plus this commit's changes** —
see E-5 for the exact reproduction procedure.
**Branch:** `docs/unified-ai-master-plan-2026-07-27`
**Run date:** 2026-07-27
**Environment:** local; Node 20.x; Windows 11; git bash. `node_modules` junctioned from the
primary working tree so the code under test is the stated commit exactly.
**Verified before running E-1…E-4:** `git rev-parse HEAD` → `6d2518b829c45f018337120c41811e4bdf11f7fa`

Per master plan §26 C-5 and `memory/EVIDENCE-STANDARD-2026-07-27.md`, a status of
`implemented` or higher requires a real command, a real exit code, a named target commit,
the environment, and an explicit statement of what the run does **not** prove.

**Local evidence is sufficient for `implemented`** (ratified 2026-07-27) when it carries all of
those. Durable CI and live-runtime evidence are required only for `limited_release` and
`production`, enforced through `PROMOTION_PROOF`.

---

## Applicability of E-1 … E-3 to the current head

E-1, E-2, and E-3 were captured at **prior PR head `6d2518b8`**, not at the current head.

`git diff --name-only 6d2518b8 40ae3917` returns exactly:

```
config/capabilities.mjs
docs/architecture/MASTER-PLAN-GAP-ANALYSIS-2026-07-27.md
docs/architecture/Mallan_Intelligence_Master_Plan.md
docs/evidence/capability-evidence-2026-07-27.md
scripts/capability-audit.mjs
```

**EXIT CODE:** `0`

**No `lib/search`, `lib/idx`, or `lib/compliance` application or test file changed between those
commits** (`git diff --name-only 6d2518b8 40ae3917 | grep -E "^lib/|\.test\.|\.spec\."` → no
matches, exit `1`). The E-1 … E-3 results therefore remain valid for the code they tested, and the
registry records `targetSha: 6d2518b8` accordingly rather than claiming the current head.

---

## A note on `grep` exit codes in this document

`grep` exits **`0` when it finds a match** and **`1` when it finds none** (`2` on error). A
"no matches" result is therefore an exit code of **`1`**, not `0`.

Several searches in this document and in the gap analysis were originally invoked inside wrappers
— `|| echo "NONE FOUND"`, or `grep … | wc -l` — whose **pipeline** exit code is `0` regardless of
what `grep` returned. Recording that `0` as though it were the search's own exit code was an error;
it has been corrected throughout. Where a `0` is recorded for a no-match search, the wrapper that
produced it is now shown explicitly in the command.

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

## E-4 — Bounded search for AI-media provenance identifiers (negative evidence)

> **CORRECTED 2026-07-27.** This entry previously recorded **EXIT CODE `0`** for a `grep` that
> found nothing. That was wrong: a bare `grep` with no matches exits **`1`**. The original
> invocation was wrapped with `|| echo "NONE FOUND"`, whose pipeline returned `0`, and that `0`
> was mistakenly recorded as the search's own exit code. Both forms are now shown, each with the
> code it actually returned. The correction is preserved rather than silently overwritten.

```
$ ls lib/idx/ | grep -i "media\|watermark"
agent-card-media.ts
media-sync.ts
media-sync-member.ts
watermark.ts
```

**EXIT CODE:** `0` — this `grep` *did* match.

**A. The bare search — the command the registry records:**

```
$ grep -rilE "editType|edit_type|virtualStaging|virtual_staging|aiModified|ai_modified|disclosureRequired" lib/idx/ lib/media/
$ echo $?
1
```

**EXIT CODE: `1`** — no matches. No output was produced.

**B. The wrapper originally used, which masked the code:**

```
$ grep -rilE "editType|edit_type|virtualStaging|virtual_staging|aiModified|ai_modified|disclosureRequired" lib/idx/ lib/media/ 2>/dev/null || echo "NONE FOUND"
NONE FOUND
$ echo $?
0
```

**EXIT CODE: `0`** — but this is the exit code of `echo`, **not** of `grep`. The `|| echo` branch
executed precisely *because* `grep` had failed with `1`. Reading this `0` as the search result was
the original error.

Both commands were re-run to confirm the codes above; `1` and `0` respectively.

**Note:** `lib/media/` exists, so exit `1` here means "searched successfully, found nothing" — not
exit `2`, which would indicate a missing path or a read error.

> **SCOPE CORRECTION, 2026-07-28.** The previous `PROVES` statement claimed this search
> established the absence of **provider/model attribution** and of "the §17.5 provenance field
> list." **Neither was searched.** The pattern set contains seven identifiers and none of them
> covers provider/model attribution, original or derived asset links, approval, publication
> history, or withdrawal status. The conclusion was broader than the command — exactly what the
> evidence standard forbids — and is withdrawn. The claim below is narrowed to what was actually
> executed. No new search was run; the wording was corrected instead of the scope expanded.

**PROVES:** At commit `6d2518b8`, no files under `lib/idx/` or `lib/media/` contained the searched
identifiers `editType`, `edit_type`, `virtualStaging`, `virtual_staging`, `aiModified`,
`ai_modified`, or `disclosureRequired`.

**DOES NOT PROVE:** This does not establish the absence of provider/model attribution, original or
derived asset links, approval, publication history, withdrawal status, differently named
equivalents, or implementations elsewhere in the repository.

**Consequence:** `CAP-MEDIA-PROVENANCE` was split. Media synchronization is `implemented` (E-2);
the AI-provenance envelope is recorded as `discovered` — a status that asserts **no positive
implementation evidence is registered**, which is what this bounded search supports. It is not a
claim that the capability is absent from the repository. A capability may not be promoted on half
its stated scope, and equally may not be declared absent on a search narrower than that scope.

Also note: `lib/idx/media-reconcile-guard.ts` and `lib/idx/media-set-hash.ts` do **not** exist at
this commit. They are unpushed on `fix/neon-write-amp-phase2a-media-reconcile-2026-07-26` and were
removed from the registry's declared paths rather than left as dangling references.

---

## E-5 — Capability validator: positive and negative tests

**TARGET SHA:** `40ae3917bddbdd2d4b73ad9f446f96ad9257765e` **plus the changes committed alongside
this artifact** (the `environment` evidence field, the E-4 exit-code correction, and this entry).
The runs below could not name their own commit — the commit does not exist until they are recorded
in it. **Reproduce by checking out the commit that contains this file and re-running each command;
the outputs must match verbatim.** A confirmation run at the resulting SHA is recorded in §E-5.7.

**ENVIRONMENT:** local; Node 20.x; Windows 11; git bash.
**RUN DATE:** 2026-07-27.
**Registry backup taken before mutation:** `cp config/capabilities.mjs /tmp/cap-e5.bak`

A validator that has only ever been observed passing proves nothing about its enforcement. Each
negative test below induces exactly one fault and confirms the specific blocking violation.

---

### E-5.1 — Clean pass (positive control)

**COMMAND RUN**

```
node scripts/capability-audit.mjs
```

**RAW OUTPUT**

```
──────────────────────────────────────────────────────────────────────────
capability:audit — master plan §24 / §8.3 / §26 C-5
──────────────────────────────────────────────────────────────────────────
registry     : config/capabilities.mjs (v2)
baseline     : 6d2518b829c45f018337120c41811e4bdf11f7fa
               docs/unified-ai-master-plan-2026-07-27
programs     : 12
capabilities : 11
coverage     : 11 registered of unknown total

capability maturity (§8.3):
  discovered        5
  designed          1
  contracted        1
  implemented       4

program assessment (separate vocabulary):
  not_started       1
  discovered        2
  designed          1
  partial           6
  shell             1
  implemented       1

promoted capabilities (>= implemented): 4
  CAP-SEARCH-CANONICAL         implemented   exit=0 @ 6d2518b8
  CAP-IDX-COTALITY-ADAPTER     implemented   exit=0 @ 6d2518b8
  CAP-COMPLIANCE-GATES         implemented   exit=0 @ 6d2518b8
  CAP-MEDIA-SYNC               implemented   exit=0 @ 6d2518b8

──────────────────────────────────────────────────────────────────────────
RESULT: PASS

PROVES        : registry is structurally complete; every promoted status points to a
                complete evidence record with a real command, exit code, target commit,
                and proof boundary; every promoted path exists; program and capability
                vocabularies are not confused.
DOES NOT PROVE: that any test actually passes — this validator does NOT rerun tests, it
                only enforces that the evidence record is complete. Nor that anything
                works in production, nor that the registry is a complete inventory.
                6 known area(s) remain unregistered.
──────────────────────────────────────────────────────────────────────────
```

**EXIT CODE:** `0`

**WHAT THIS PROVES:** the registry as committed passes every enforced rule, with zero warnings.
**WHAT THIS DOES NOT PROVE:** that the validator would *reject* anything — that is E-5.2 … E-5.5.

---

### E-5.2 — Program carrying `status` instead of `assessment`

**COMMAND RUN**

```
sed -i "s/{ id: 'P0', name: 'Adopt and reconcile the authority', assessment:/{ id: 'P0', name: 'Adopt and reconcile the authority', status:/" config/capabilities.mjs
node scripts/capability-audit.mjs
```

**RAW OUTPUT** (violations section)

```
VIOLATIONS (2) — blocking:
  [P0] PROGRAM_USES_STATUS
      programs must use `assessment`, not `status`. Sharing the word invites treating `partial`/`shell` as capability maturity states, which they are not.
  [P0] ILLEGAL_ASSESSMENT
      assessment `undefined` is not one of: not_started, discovered, designed, partial, shell, implemented, complete

──────────────────────────────────────────────────────────────────────────
RESULT: FAIL — 2 violation(s)
──────────────────────────────────────────────────────────────────────────
```

**EXIT CODE:** `1`
**RESTORED:** `cp /tmp/cap-e5.bak config/capabilities.mjs`

**WHAT THIS PROVES:** C-5.2 vocabulary separation is enforced — a program may not carry `status`.
**WHAT THIS DOES NOT PROVE:** that every possible vocabulary confusion is caught; one fault was tested.

---

### E-5.3 — Capability claiming `production` without proof

**COMMAND RUN**

```
perl -0pi -e "s/(id: 'CAP-SEARCH-CANONICAL',.*?)status: 'implemented'/\1status: 'production'/s" config/capabilities.mjs
node scripts/capability-audit.mjs
```

**RAW OUTPUT** (violations section)

```
VIOLATIONS (9) — blocking:
  [CAP-SEARCH-CANONICAL] UNEARNED_STATUS
      status `production` requires `shadowComparison`, but it is `null`. Supply the evidence or lower the status. Status is assigned from evidence, not intent.
  [CAP-SEARCH-CANONICAL] UNEARNED_STATUS
      status `production` requires `observability`, but it is `"unverified"`. Supply the evidence or lower the status. Status is assigned from evidence, not intent.
  [CAP-SEARCH-CANONICAL] UNEARNED_STATUS
      status `production` requires `audience`, but it is `null`. Supply the evidence or lower the status. Status is assigned from evidence, not intent.
  [CAP-SEARCH-CANONICAL] UNEARNED_STATUS
      status `production` requires `rollback`, but it is `"unverified"`. Supply the evidence or lower the status. Status is assigned from evidence, not intent.
  [CAP-SEARCH-CANONICAL] UNEARNED_STATUS
      status `production` requires `monitoredResults`, but it is `null`. Supply the evidence or lower the status. Status is assigned from evidence, not intent.
  [CAP-SEARCH-CANONICAL] UNEARNED_STATUS
      status `production` requires `deployedSha`, but it is `null`. Supply the evidence or lower the status. Status is assigned from evidence, not intent.
  [CAP-SEARCH-CANONICAL] UNEARNED_STATUS
      status `production` requires `productionProbe`, but it is `null`. Supply the evidence or lower the status. Status is assigned from evidence, not intent.
  [CAP-SEARCH-CANONICAL] UNEARNED_STATUS
      status `production` requires `rollbackProof`, but it is `null`. Supply the evidence or lower the status. Status is assigned from evidence, not intent.
  [CAP-SEARCH-CANONICAL] NO_OWNER
      status `production` requires a named owner (§24)
```

**EXIT CODE:** `1`
**RESTORED:** `cp /tmp/cap-e5.bak config/capabilities.mjs`

**WHAT THIS PROVES:** the C-5.1 promotion ladder is enforced field by field. The strongest
capability in the registry — the one with a genuine 625-test pass — still cannot reach `production`
on that evidence alone. It is short by eight distinct proofs plus an owner.
**WHAT THIS DOES NOT PROVE:** that `shadow_mode` and `limited_release` gates behave correctly;
only the `production` row was exercised.

---

### E-5.4 — Promoted capability declaring a path that does not exist

**COMMAND RUN**

```
perl -0pi -e "s|(id: 'CAP-MEDIA-SYNC',.*?canonicalFiles: \[)|\1'lib/idx/media-set-hash.ts', |s" config/capabilities.mjs
node scripts/capability-audit.mjs
```

**RAW OUTPUT** (violations section)

```
VIOLATIONS (1) — blocking:
  [CAP-MEDIA-SYNC] PROMOTED_PATH_MISSING
      declared canonicalFiles path `lib/idx/media-set-hash.ts` does not exist at this commit. A promoted capability may not reference paths that are not here. Remove the path or lower the status.

──────────────────────────────────────────────────────────────────────────
RESULT: FAIL — 1 violation(s)
──────────────────────────────────────────────────────────────────────────
```

**EXIT CODE:** `1`
**RESTORED:** `cp /tmp/cap-e5.bak config/capabilities.mjs`

**WHAT THIS PROVES:** a dangling path is a blocking violation for a promoted capability, not a
warning. This is the exact fault that existed in the v1 registry, where two files unpushed on
`fix/neon-write-amp-phase2a-media-reconcile-2026-07-26` were declared and only warned about.
**WHAT THIS DOES NOT PROVE:** that the same fault blocks on a non-promoted capability — by design
it does not; there it is a warning.

---

### E-5.5 — Evidence record with a placeholder `exitCode`

**COMMAND RUN**

```
perl -0pi -e "s|(id: 'CAP-COMPLIANCE-GATES',.*?)exitCode: 0,|\1exitCode: 'unverified',|s" config/capabilities.mjs
node scripts/capability-audit.mjs
```

**RAW OUTPUT** (violations section)

```
VIOLATIONS (1) — blocking:
  [CAP-COMPLIANCE-GATES] EVIDENCE_INCOMPLETE
      `evidence.exitCode` is missing or a placeholder (got "unverified"). A promoted status must name a real command, exit code, target commit, and proof boundary.

──────────────────────────────────────────────────────────────────────────
RESULT: FAIL — 1 violation(s)
──────────────────────────────────────────────────────────────────────────
```

**EXIT CODE:** `1`
**RESTORED:** `cp /tmp/cap-e5.bak config/capabilities.mjs`

**WHAT THIS PROVES:** placeholder text cannot satisfy an evidence field, and `exitCode`
specifically must be an integer.
**WHAT THIS DOES NOT PROVE:** that a *plausible but false* evidence record would be caught. It
would not be. The validator cannot verify that a recorded exit code is truthful — only that one is
present and well-formed. That is what the durable artifact and human review are for.

---

### E-5.6 — Registry restored byte-identically after mutation

**COMMAND RUN**

```
cmp config/capabilities.mjs /tmp/cap-e5.bak
echo $?
```

**RAW OUTPUT**

```
0
```

**EXIT CODE:** `0` — `cmp` produced no output, meaning the files are byte-identical.

**WHAT THIS PROVES:** none of the four induced faults leaked into the committed registry. The
file that passes E-5.1 is the file that was mutated and restored.
**WHAT THIS DOES NOT PROVE:** that `scripts/capability-audit.mjs` was unmodified during the run —
it was not touched, but that was not independently checked by `cmp`. `git status` at commit time
shows the tracked change set.

---

### E-5.7 — Confirmation run at the committed SHA

Recorded in a follow-up commit once the SHA containing E-5 exists, closing the circularity noted
at the top of E-5.

**COMMAND RUN**

```
git rev-parse HEAD
npm run capability:audit
echo $?
```

**RAW OUTPUT / EXIT CODE:** see `docs/evidence/capability-evidence-2026-07-27-e57.md`.

---

## Summary of validator enforcement evidence

| Test | Induced fault | Violation | Exit |
|---|---|---|---|
| E-5.1 | none (positive control) | — | `0` |
| E-5.2 | program carries `status` | `PROGRAM_USES_STATUS`, `ILLEGAL_ASSESSMENT` | `1` |
| E-5.3 | unearned `production` | `UNEARNED_STATUS` ×8, `NO_OWNER` | `1` |
| E-5.4 | promoted path missing | `PROMOTED_PATH_MISSING` | `1` |
| E-5.5 | placeholder `exitCode` | `EVIDENCE_INCOMPLETE` | `1` |
| E-5.6 | restoration check | — | `0` (byte-identical) |

**WHAT E-5 PROVES AS A WHOLE:** the validator both passes a correct registry and blocks four
distinct classes of dishonest entry, with the specific rule named in each case.

**WHAT E-5 DOES NOT PROVE:** that the validator catches every possible dishonest entry; that any
application test passes (it does not rerun them); that any recorded evidence value is truthful; or
that the registry is a complete inventory of the platform.

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
