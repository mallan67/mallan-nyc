# Correction Trace Record — `<ID>` `<short title>`

> One record per correction. **Committed in the same PR as the fix** so the full trail lives in
> git and can be replayed from scratch. This is the mandatory G2 evidence artifact: a correction
> with no complete, green Trace Record is **not done**. Every section must be filled; empty/▢ =
> incomplete = fail-closed.

## 0. Header
- **ID / Ledger row:** `<U4 / CC1 / …>` (links to `settlement-ledger-2026-06.md`)
- **Severity / Compliance tie:** `<P? / UCBA §… / FARE / NY DOS / TCPA / —>`
- **Owning phase:** `<n>`  · **Maya GO:** `<quote of the explicit GO + date>`
- **Status:** PLANNED → IN-PR → VERIFYING → SETTLED  (start: PLANNED)

## 1. Defect — the BEFORE proof (what is wrong, proven)
- Description: …
- Evidence (file:line + the observed failure): …
- **RED proof (§F — NEVER grep alone):** a **failing automated test** that demonstrates the
  defect *before* the fix (preferred), OR — only for behavior that genuinely cannot be
  unit-tested — a **live probe** (preview-URL capture / runtime log). A static grep or
  source-read may be attached as *supporting context*, but is **never sufficient** as the RED
  proof of a behavior or compliance defect (a grep proves code shape, not behavior). A Trace
  Record whose RED proof is grep-only is **invalid / fail-closed**. (Path to captured output.)

## 2. Pre-registered blast radius (declared BEFORE coding — the "no dark work" contract)
- **Files/modules it WILL touch** (direct): …
- **Transitive reach / downstream consumers** (the §J.5 trace): …
- **Compliance surfaces touched:** …
- **Coupled ledger rows** (must be re-checked, not regressed): …
- **MUST NOT touch:** schema/migration? env? CI? other routes? (list the fences)

## 3. Compliance pre-read (§D — if any §D surface)
- Canonical file(s) read: `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` → `<area file>`
- Key rule that governs the fix: …
- Fail-closed note (§E): what we do if the rule is unclear → STOP & report (no guessing).

## 4. Fix approach
- Design / chosen option (and the decision, if a decision-gate): …

## 5. Step log — the traceable sequence (append-only; each step = action + command/file + artifact + result)
| # | Step | Command / file | Artifact / evidence | Result |
|---|------|----------------|---------------------|--------|
| 1 | Write failing test (RED) | `<test file>` | `<captured RED output>` | RED ✓ |
| 2 | Implement fix | `<file:line>` | diff | — |
| 3 | New test → GREEN | `<jest cmd>` | output | GREEN ✓ |
| 4 | Full harness vs baseline | the B0 chain | counts | green / 1-known-exception |
| 5 | Compliance chain (B1) | ucba/rls/idx/compliance-check | counts | 0 regressions |
| 6 | Live proof (B2, if render/behavior) | preview URL / runtime log | capture path | rendered ✓ |
| 7 | Actual-diff vs pre-registered radius (§5/G5) | `git diff --name-only` | list | matches §2 (note any exception) |
| 8 | MICRO agents (C1) | `<agents>` | verdict paths | PASS |
| 9 | MACRO system-impact verifier (C2/B4) | blast-radius + cross-ledger | record path | PASS, no other row regressed |
| 10 | Commit / PR / checks / merge | SHA, PR# | CI links | merged |

## 6. Gate results (the receipts)
| Gate | Required | Result | Artifact |
|---|---|---|---|
| B0 type-check / lint / test:runtime / crm / scanner / ucba / compliance-check / rls / idx / display / build | green vs baseline (1 known idx exception) | … | … |
| B1 compliance chain | 0 regressions | … | … |
| B2 live proof (§F) | if render/behavior | … | … |
| C1 micro agents | each required PASS | … | … |
| C2 macro verifier | PASS + blast-radius record | … | … |

## 7. Sign-offs
- Micro: `<agent> → PASS (link)` …
- Macro (system-impact verifier): PASS — blast radius matched, cross-ledger clean (link)
- **tristle-rebny-compliance** (if §D): PASS (link)
- **security-agent** (if auth/routes/headers): PASS (link)
- **Maya:** GO to start (date) · merge approval (date)

## 8. Trace-back / reproduce-from-scratch
Exact commands + commit SHAs to re-derive the RED→GREEN and re-run every gate independently:
```
git checkout <base SHA>      # defect present
<run the failing test>       # observe RED
git checkout <fix SHA>       # fix applied
<run the test + full harness># observe GREEN + baseline match
```

## 9. Permanent regression guard
- Test(s) added that lock this (so it cannot silently return): `<paths>`
- Ledger row → **SETTLED** only after §6 all green + §7 all signed.
