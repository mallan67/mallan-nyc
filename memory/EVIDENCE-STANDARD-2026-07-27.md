# EVIDENCE STANDARD — All agent findings must be factual, tested, proven, result-based

**Date established:** 2026-07-27
**Authority:** Maya Allan (standing directive)
**Scope:** Every agent, subagent, skill, reviewer, and automated reporter operating on `mallan-nyc` — Claude, Codex, ChatGPT, CodeRabbit, cloud review agents, and any future agent.
**Status:** BINDING. Supersedes any agent's default reporting behavior.

---

## 0. Canonical relationship — read this first

**This file is NOT a parallel standard. It is the enforcement tier of one standard.**

`AI-START-HERE.md` §Evidence standard is the **canonical cross-agent statement**. It defines the
four requirements (factual · tested · proven · result-based), the "three out of four is a failure"
rule, the mandatory finding format, and `unverified-hypothesis` as a legal confidence value.

This file **extends** it — it does not restate, replace, fork, or supersede it. It adds only:

- the per-requirement failure table (§1);
- the banned reporting-pattern list (§3);
- the fail-closed wording for absent evidence (§4);
- application to master-plan progress reporting (§5);
- enforcement and withdrawal procedure (§6).

**On conflict, `AI-START-HERE.md` wins.** If the two ever diverge, that is a defect in this file;
fix this file, do not fork the standard. Per `AI-START-HERE.md` §"Do not create parallel truth,"
no third evidence-standard document may be created — extend one of these two.

Field-name note: `AI-START-HERE.md` is authoritative for the finding-format field names. Where §2
below labels a field differently, the `AI-START-HERE.md` name governs; §2's extra fields
(`CLASS`, `EVIDENCE TYPE`, `DATE + TARGET`, `CONFIDENCE`) are additive.

---

## 1. The rule

> **No finding, claim, status, score, or completion statement may be reported unless it is factual, tested, proven, and result-based.**

Four words, four separate requirements. All four must hold. Meeting three is a fail.

| Requirement | Means | Fails when |
|---|---|---|
| **Factual** | The statement describes something that is actually true of the live system or the actual code, right now. | Recalled from training data, inferred from a filename, assumed from a similar codebase, or extrapolated from another MLS/field/route. |
| **Tested** | A command, probe, or test was actually executed against the thing being claimed. | "Should pass", "presumably works", "the code looks correct", source-grep only for a behavior claim. |
| **Proven** | The raw output of that execution is captured and quoted — exit code, log line, HTTP response, row count, test summary. | Output was summarized from memory, paraphrased without the artifact, or the command was never run. |
| **Result-based** | The conclusion follows from the captured output, and the report states what the output does **not** prove. | Conclusion is broader than the evidence, green checks are cited as proof of an unrelated property. |

---

## 2. Mandatory finding format

Every finding an agent reports MUST carry these fields. A finding missing any field is **rejected, not triaged**.

```text
CLAIM:            one sentence, falsifiable
CLASS:            A | B | C | D | E   (see CLAUDE.md §J.1)
EVIDENCE TYPE:    test | live probe | runtime log | SQL result | source read
COMMAND RUN:      the exact command / query / URL, verbatim
RAW OUTPUT:       the actual captured output, quoted — not summarized
EXIT CODE:        0 / non-zero / N/A
DATE + TARGET:    when it ran, against which env / branch / deployment SHA
WHAT THIS PROVES: the narrow thing the output actually establishes
WHAT IT DOES NOT PROVE: the adjacent things a reader might wrongly infer
CONFIDENCE:       proven | unverified-hypothesis
```

`unverified-hypothesis` is a legal value. **Presenting a hypothesis as a finding is not.**

---

## 3. Banned reporting patterns

These are hard stops. An agent producing any of them has failed the task, regardless of whether the underlying guess was correct.

- Reporting a fix as "done" / "fixed" / "working" without a failing test that the fix flipped green, or a live probe capture.
- Citing green CI checks as proof of anything the checks do not actually assert (CLAUDE.md §J.8).
- Source-grep as sole evidence for a **rendering** or **behavior** claim. Grep proves an import exists; it does not prove a conditional renders. (2026-05-20 FARE Act disclosure incident.)
- Claiming a Cotality/Trestle field exists, is populated, moved, or changed without a live `$metadata` / `trestle:probe` / `trestle:audit-server` capture. Codex is **not** authority here (CLAUDE.md §J.3).
- Claiming production DB, Neon, Vercel, or env state without a read-only live query or runtime log.
- Asserting a REBNY / RLS / DOS / Fair Housing / FARE rule from memory. Cite the canonical file and line, or fail closed (CLAUDE.md §E).
- Unexplained numeric scores presented as truth (master plan §12.3).
- Reporting a percentage complete, a count, or a coverage figure that was estimated rather than counted by a command.
- Silently narrowing scope and reporting the narrowed scope as the whole.

---

## 4. Fail-closed on absent evidence

If an agent cannot obtain evidence — tool unavailable, credentials missing, environment unreachable, live probe blocked — the required output is:

> **NOT VERIFIED.** `<what was attempted>` failed with `<actual error>`. This finding is an unverified hypothesis and must not be acted on until `<specific proof>` is captured.

It is **never** acceptable to substitute a plausible answer for a missing measurement.

---

## 5. Applies to plan-progress reporting specifically

The Mallan Intelligence Master Plan (`docs/architecture/Mallan_Intelligence_Master_Plan.md`) defines the target system. Progress against it is a **finding** and is governed by this standard.

- "Program N is complete" requires the §24 acceptance checklist, item by item, each with captured evidence.
- "Capability X exists" requires the closed-loop test of master plan §2.5 — a route, a schema, or a model existing is **not** the capability.
- Maturity status (`discovered` … `production`) is assigned from evidence, not from intent or from how much code was written.

---

## 6. Enforcement

- A finding that violates this standard is **withdrawn and re-run with evidence**, not defended.
- If an agent's report is challenged, the response is to produce the raw capture — not to re-argue the reasoning.
- Agents that repeatedly report unproven findings are removed from the workflow.
- This standard is cited by ID in review comments: **EVIDENCE-STANDARD-2026-07-27**.

---

## 7. Relationship to existing rules

This standard does not replace, it hardens:

- **`AI-START-HERE.md` §Evidence standard — CANONICAL. This file is its enforcement tier (see §0).**
- `AGENTS.md` — cross-agent constitution.
- `CLAUDE.md` §F — proof-first rule on completion claims.
- `CLAUDE.md` §E — fail-closed on unclear compliance requirements.
- `CLAUDE.md` §J — Codex finding classification (A/B/C/D/E) and the ban on treating Codex as live field authority.
- `docs/engineering/pr-verification-checklist.md`
- `docs/engineering/vercel-preview-proof-rules.md`
- `docs/operations/proof-first-guardrails.md`
- Master plan §2.4 (no silent failure) and §2.5 (build closed loops).

Where this standard is stricter, this standard wins.
