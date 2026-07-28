# E-5.7 — Capability validator confirmation run at the committed SHA

**Companion to** `docs/evidence/capability-evidence-2026-07-27.md` §E-5.

E-5.1 … E-5.6 were run against `40ae3917` **plus** the changes that became commit `5c0ccdb9`.
Those runs could not name their own commit — the commit did not exist until they were written into
it. This entry closes that circularity by re-running the validator against the **committed, clean
tree** at the SHA that contains E-5.

---

## Preconditions

**COMMAND RUN**

```
git status --porcelain
```

**RAW OUTPUT**

```
```

*(empty — working tree clean, no staged or unstaged modifications)*

**EXIT CODE:** `0`

**COMMAND RUN**

```
git rev-parse HEAD
```

**RAW OUTPUT**

```
5c0ccdb9ee8e64a3d7cefe382ca46c20e2b849d2
```

**EXIT CODE:** `0`

---

## Confirmation run

**TARGET SHA:** `5c0ccdb9ee8e64a3d7cefe382ca46c20e2b849d2`
**ENVIRONMENT:** local; Node 20.x; Windows 11; git bash; clean working tree.
**RUN DATE:** 2026-07-27

**COMMAND RUN**

```
npm run capability:audit
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

---

## WHAT THIS PROVES

The registry as **committed** at `5c0ccdb9` — not as staged, not as a working-tree draft — passes
every enforced rule with zero warnings, on a clean tree. The E-5.1 output is reproducible from the
committed state, so the E-5 record describes the artifact that actually landed.

It also confirms the `environment` field addition did not break any existing evidence record: all
five records (four `evidence`, one `negativeEvidence`) carry it, or the run would have failed with
`EVIDENCE_INCOMPLETE`.

Note the two distinct SHAs visible above and why both are correct:

- `baseline: 6d2518b8` — where the **application test suites** (E-1 … E-3) were run. Unchanged,
  because no `lib/` file changed since.
- `5c0ccdb9` — where **this validator run** happened.

Conflating them is exactly the error this artifact exists to prevent.

## WHAT THIS DOES NOT PROVE

- That any application test passes. The validator does not rerun tests; E-1 … E-3 are the evidence
  for those, captured at `6d2518b8`.
- That the four negative tests (E-5.2 … E-5.5) still behave correctly at this SHA. They were run
  against the immediately preceding tree state. `scripts/capability-audit.mjs` is byte-identical
  between that state and this commit, so the behavior carries; but this run exercised only the
  positive path.
- That any recorded evidence value is **truthful**. The validator enforces presence and
  well-formedness, never truthfulness. See E-5.5.
- That anything works in production, or that the registry is a complete platform inventory.
  Six areas remain unregistered by design.
