# PR Verification Checklist

**Status:** OPEN · REPORT-ONLY · No workflows changed. No production code touched. Not enforced yet — proposes rules + a mandatory CLAUDE.md dependency survey.
**Date:** 2026-05-18
**Author:** Claude Code under Maya direction.
**Scope:** Codify today's (2026-05-17) failure modes as procedural rules so future PRs don't repeat them. Sister doc: `docs/engineering/vercel-preview-proof-rules.md` (covers Vercel-preview-specific verification).

---

## TL;DR — the 6 rules in this doc

| # | Rule | Why |
|---|---|---|
| **R0 (mandatory)** | **No CLAUDE.md slim / restructure may land without a written dependency survey first.** | Today's audit found 44 files referencing CLAUDE.md across 5 dependency tiers; a silent rename of a section heading or removal of the "🔔 ACTIVE FOLLOW-UP" block would break a SessionStart hook + multiple agent prompts |
| **R5** | **Codex feedback resolution rule** — every Codex/CR comment must be greppable as resolved before merge | PR #152 shipped with 3 unresolved contradictions because I corrected the TL;DR + §I but missed §C, §E, and the footer |
| **R6** | **Audit-doc correction rule** — when a finding is contradicted by new evidence, the contradiction must be cleared in ALL surfaces of the doc (TL;DR + section + risk row + summary) in one PR | PR #152 only patched 3 of 5; PR #153 was needed to clean up |
| **R7** | **Docs-only PR proof rule** — every docs PR must include a `git diff --name-only` filter + a forbidden-path filter in the body | Provides one-glance proof that no source code crept in |
| **R9** | **Hard-hold confirmation block** — every PR body must include an explicit "what this PR does NOT touch" list for: IDX, projection, reconciliation, env vars, Neon, migrations, cron triggers, CRM, PR #148, PR 5B | Today's PRs respected this implicitly; today's rule makes it explicit |
| **R10** | **Required PR body proof matrix** — every PR body must include a structured table of validation gates passed | Replaces the ad-hoc "tested it" with a machine-readable expectation |

---

## R0 — Mandatory CLAUDE.md dependency survey before any slim

### Why

CLAUDE.md loads into every session start, subagent invocation, and hook fire. It is **the** project doctrine document. Today's audit found 44 files reference it across 5 dependency tiers (catalogued in §Appendix A). Removing a section, renaming a heading, or restructuring the block layout can silently break:

- A SessionStart hook that greps for a specific marker string
- An agent prompt that reads the file as policy input
- A script that regenerates content in the file
- A spec that cites a specific section by name as the authoritative source

### Mandatory pre-flight before any CLAUDE.md slim/restructure PR

1. **Run the dependency survey:**
   ```bash
   grep -rln 'CLAUDE\.md' \
     --exclude-dir=node_modules --exclude-dir=.next \
     --exclude-dir=.git --exclude-dir=test-results \
     --exclude-dir=archive 2>/dev/null
   ```
2. **Classify every match by tier:** HARD (parses content) / SECTION-NAME (cites by name) / SCRIPT (regenerates) / CITATION (legal/policy reference) / POINTER (just a link).
3. **For every HARD or SECTION-NAME match, propose the alternative landing place** before removing/renaming from CLAUDE.md.
4. **Surface the survey as Appendix A of the slim-PR body.**

### Enforcement options (NONE deployed in this PR — report-only)

| Option | What | Status |
|---|---|---|
| Pre-commit hook similar to `scripts/neon-precommit-guard.js` | Block commits that touch CLAUDE.md unless commit message contains `[claude-md-survey: OK]` | Not deployed; proposed |
| `guardrails.yml` workflow check | On any PR touching CLAUDE.md, require an Appendix A in the PR body | Not deployed; proposed |
| `repo-hygiene.mjs` extension | Add a dependency-drift detector that fails CI if a CLAUDE.md heading referenced in another file is missing | Not deployed; proposed |

**No enforcement is wired up in this PR.** R0 is a procedural rule. The 3 options above are tracked for a separate follow-up if Maya wants tooling.

---

## R5 — Codex feedback resolution rule

### What today proved

PR #152 corrected the TL;DR + §C.4 + §I of the Neon audit. Codex reviewed it and caught 3 contradictions still present in §C row A.6–A.8, §E closing paragraph, and the end-of-audit footer. PR #153 was a clean-up needed only because the original correction was incomplete.

### Rule

When a finding/conclusion changes mid-doc, the change must be applied **in every place it appears** — TL;DR, body section, risk table, summary, footer, cross-references. Specifically:

1. **Grep the full doc for the old wording before opening the PR.**
2. **List every occurrence in the PR body and label it `corrected` / `withdrawn` / `preserved as investigative trail`.**
3. **For multi-doc corrections (when contradictions cross files), apply the survey to every doc — not just the primary target.**

### Concrete check

Before opening any audit-correction PR:

```bash
# Step 1 — Find every occurrence of OLD_PHRASE in the post-PR document.
#
# Use `git grep` against the working-tree / final document (NOT a diff).
# This is the authoritative check: it counts what's actually in the doc
# now and is not contaminated by diff context lines, file headers, or
# rename markers (which is why the earlier `git diff … | grep -c …`
# pattern was unreliable — it counted matches inside unchanged context
# lines and made the count look larger than the number of actually-
# removed occurrences).
git grep -n "OLD_PHRASE" -- "<doc-path>"

# Step 2 — For EVERY line returned by Step 1, the PR body must label
# that occurrence as one of:
#   • corrected             — the line is the new wording
#   • withdrawn             — the line is the old wording, explicitly
#                              marked as withdrawn / reclassified in
#                              place (e.g. a struck-through note or a
#                              "RECLASSIFIED" banner)
#   • preserved as          — the line is the old wording, preserved
#     investigative trail     verbatim as historical narrative (e.g.
#                              kept in a §Investigation Trail section)
#
# An UNLABELED remaining occurrence = unresolved contradiction.
# The PR is not ready to merge until every line returned by Step 1
# falls into one of the three labels above.

# Step 3 (optional, for proof of what was REMOVED from the doc) —
#
# Show only the removed-line instances of OLD_PHRASE from the diff.
# This restricts to the `^-` change lines and explicitly excludes
# `^---` file headers (which start with `---` and are not actual
# removals). Use this when the PR body needs to show "here are the
# lines we deleted that contained OLD_PHRASE."
git diff main..HEAD -- "<doc-path>" | grep '^-' | grep -v '^---' | grep -n "OLD_PHRASE"
```

**Why three steps:**

- Step 1 is the gate ("are there any unresolved occurrences in the doc as it stands?").
- Step 2 is the disposition rule ("each remaining occurrence has a known role").
- Step 3 is removal proof ("here is what we explicitly deleted") — useful in the PR body to show the diff intent, but not a replacement for Step 1's gate.

The earlier `git diff … | grep -c "OLD_PHRASE"` count is **withdrawn** because diff output includes context lines (unchanged lines surrounding a change), and a match inside a context line is NOT a removal — but the naïve count treats it as one.

---

## R6 — Audit-doc correction rule

### What today proved

The mobile-search-overflow audit's F1 hypothesis (anchor `display:inline`) was wrong about the mechanism. PR #151 first cut applied F1 alone and Playwright still measured 583 px. The actual fix (`grid-cols-1`) required a second commit.

When an audit doc's recommendation is proven wrong, the doc must:
1. Add a banner at the top pointing to the correction section.
2. Add a "POST-PR-#XXX ROOT CAUSE CORRECTION" section at the end.
3. Document the actual mechanism with DOM/log evidence.
4. Document the production proof (before/after numbers).
5. Preserve the original investigative trail verbatim — do NOT edit the original sections.
6. End with a "Lessons for future audits" subsection.

### Rule

Every audit doc whose conclusion is later contradicted must follow steps 1–6 above in a single PR. The corrected doc is shipped alongside or immediately after the production fix that proved the correction.

PR #152 implemented this pattern correctly for the mobile audit. PR #152 attempted it for the Neon launch audit but missed 3 surfaces; PR #153 cleaned up.

---

## R7 — Docs-only PR proof rule

### What

A "docs-only PR" claim must be machine-verified, not asserted. Every docs-only PR body must include:

```
## Validation

| Gate | Result |
|------|--------|
| `git diff --stat` | <N> files, +<X> / -<Y> (specify) |
| Forbidden-path filter (`app/`, `lib/`, `prisma/`, `public/crm/`, `scripts/`, `tests/`, `.github/`, `vercel.json`, `package.json`, `memory/SESSION-`, public-records provisioning) | **zero matches** ✓ / N matches ✗ |
| Markdownlint | <pass / skipped / not installed> |
```

The forbidden-path filter must run:

```bash
git diff --name-only main..HEAD | grep -E '^(app/|lib/|prisma/|public/crm/|scripts/|tests/|\.github/|vercel\.json|package\.json|memory/SESSION-|docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING)' || echo "(no forbidden paths touched ✓)"
```

Output is the proof.

### Rule

Every docs-only PR body MUST contain this validation block. A docs-only claim without the proof is not a docs-only PR.

---

## R9 — Hard-hold confirmation block

### What

Every PR body MUST include an explicit "what this PR does NOT touch" list. Today's PRs informally followed this pattern; today's rule makes it formal.

### Template

```
## What this PR does NOT change

- ❌ No source code in <not-the-fix surface> touched
- ❌ No env vars (Vercel or GitHub Actions)
- ❌ No `NEON_PROJECT_ID` change on any surface
- ❌ No Neon branches deleted, no Neon integration changes
- ❌ No migrations / reconciliation / cron triggers
- ❌ No PR #148 / PR 5B / CRM work
- ❌ No `memory/SESSION-*` archival docs touched
- ❌ No `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md`
- ❌ No <PR-specific hard hold>
```

### Rule

The list above is the floor. Add PR-specific items as needed. Removing a line means it WAS touched and the PR should explain why.

---

## R10 — Required PR body proof matrix

### What

Every PR body MUST include a structured proof matrix showing which validation gates were run and their outcomes. Replaces "tested it locally" with machine-readable expectations.

### Template

```
## Validation

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | <0 errors / N errors> |
| `npx eslint <changed-files>` | <clean / N issues> |
| `npx jest <relevant-test-files>` | <N of M PASS> |
| `npm run compliance-check` | <93 PASS / 0 fail> |
| `npm run ucba:audit` | <46 PASS / 0 regressions> (if rules touched) |
| `npm run rls:validate` | <pass / N issues> (if RLS surface touched) |
| `npm run idx:validate` | <1278 pass / 0 critical> (if IDX surface touched) |
| `npm run ops:health` | <HEALTHY / WARNING / CRITICAL> (if DB-affecting) |
| Playwright e2e | <N of M PASS> (if UI surface touched) |
| Forbidden-path filter | <zero / N matches> |
```

Rows that don't apply may be omitted (e.g. no Playwright row for a backend-only PR) — but the validation block itself is mandatory.

---

## Appendix A — CLAUDE.md dependency survey (2026-05-18)

Survey command:
```bash
grep -rln 'CLAUDE\.md' --exclude-dir=node_modules --exclude-dir=.next \
  --exclude-dir=.git --exclude-dir=test-results --exclude-dir=archive 2>/dev/null
```

**Total: 44 files reference CLAUDE.md.**

### Tier 1 — HARD (parses CLAUDE.md content) — **MUST survey before removing**

| File | Dependency | Breakage if removed |
|------|------------|---------------------|
| `.claude/hooks/follow-up-reminder.js` | Reads `CLAUDE.md` from disk on SessionStart, greps for the literal string "🔔 ACTIVE FOLLOW-UP" + extracts a review-date pattern | Hook fires silently with no warning to operator if block is renamed/moved |
| `scripts/regenerate-claude-counts.js` | Computes canonical surface-area counts (cron jobs, API routes, components, Prisma models) and prints them with the explicit purpose "Use these to update CLAUDE.md." | A future CI gate could fail if CLAUDE.md is out of sync; renaming the count table breaks the regen target |

### Tier 2 — SECTION-NAME (cites a CLAUDE.md section by name) — **MUST plan alternative landing before removing**

| File | Cited section |
|------|---------------|
| `docs/architecture/PUBLIC-RECORDS-DB-CHARTER.md:305` | "tracked project compliance docs (`CLAUDE.md` and the `compliance/` directory…)" |
| `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md:684` | "CLAUDE.md — Memory File Policy and follow-up block reference this spec" |
| `docs/superpowers/specs/2026-04-30-sponsor-database-design.md:1040` | Same — "Memory File Policy and active follow-up block" |
| `docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md:35` | "CLAUDE.md for project doctrine and active follow-up" |
| `memory/AUDIT-2026-05-12.md:27` | Quotes a specific CLAUDE.md follow-up expectation |
| `memory/NEXT-SESSION-2026-04-28.md:176` | "CLAUDE.md — project instructions; check the Active Follow-up block" |
| `NEON.md:96` | "The discipline (from CLAUDE.md + this file §5)" |
| `.claude/skills/rebny-compliance/SKILL.md:33` | "Active gates / parked work: See `CLAUDE.md` top block" |

### Tier 3 — SCRIPT (regenerates / audits content) — **MUST keep target shape**

| File | Behavior |
|------|----------|
| `scripts/regenerate-claude-counts.js` | Prints surface-area counts; documentation header says CI can run + fail if CLAUDE.md is out of sync |
| `scripts/audit-form-trestle-coverage.ts` | References "CLAUDE.md" as authoritative source for the REBNY 40-key list |
| `scripts/audit-server-trestle-coverage.ts` | References CLAUDE.md "Trestle Media API rules" + "Fields That DO NOT EXIST" section as authoritative |

### Tier 4 — CITATION (legal/policy reference, embedded in code comments)

| File | Citation |
|------|----------|
| `lib/idx/trestle-mapper.ts` | Cites CLAUDE.md for Trestle field rules |
| `lib/idx/mapping.ts` | Same |
| `lib/idx/db-to-public-dto.ts` | Same |
| `lib/compliance/rebny-ucba-rules.ts` | Same |
| `lib/search/crm-idx-mapper.ts` | Cites CLAUDE.md for compliance constraints |
| `lib/search/__tests__/crm-idx-filter.test.ts` | Same |
| `prisma/schema.prisma` | Cites CLAUDE.md commercial property classification |
| `public/crm/index-built.html` | Built artifact — contains compliance citations |
| `public/crm/js/search/search-engine.js` | Same |

### Tier 5 — POINTER (just a "see CLAUDE.md" link)

| Files (sampled) |
|-----------------|
| `.claude/agents/security-agent.md` ("Cross-reference with CLAUDE.md") |
| `docs/operations/proof-first-guardrails.md` |
| `MALLAN-NYC-CRM-PROJECT.md` |
| `MASTER-PROJECT-TREE-v3.3.md` |
| `CRM-ENHANCEMENT-SPEC.md` |
| `SALE-FORM-MASTER-REFERENCE.md` |
| `memory/REFACTOR-2026-04-25.md` |
| `memory/AUDITOR-LOG.md` |
| `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` |
| `compliance/VALIDATOR-FRAMEWORK.md` |
| `docs/superpowers/specs/2026-05-04-crm-search-agent-workflow-rebuild.md` |
| `scripts/fix-stale-form-bindings.ts` |

### Survey verdict

- **Tier 1 (HARD) is the smallest tier — 2 files — but failure is silent.** The SessionStart hook would stop firing reminders without throwing. Any CLAUDE.md slim PR MUST verify those 2 files still resolve.
- **Tier 2 (SECTION-NAME) — 8 files** name specific CLAUDE.md sections. A slim that renames "🔔 ACTIVE FOLLOW-UP" or "Memory File Policy" breaks every linker.
- **Tier 3 (SCRIPT) — 3 files** assume specific content shape in CLAUDE.md. The `regenerate-claude-counts.js` script in particular is a future CI gate candidate.
- **Tiers 4 + 5 are low risk** — comments + pointers. They survive renames as long as CLAUDE.md still exists.

### Recommended slim approach (NOT EXECUTED in this PR)

If a CLAUDE.md slim is approved later:
1. Keep `🔔 ACTIVE FOLLOW-UP` block heading literal (Tier 1.A dependency).
2. Keep `Memory File Policy` section heading literal (Tier 2 dependency × 3).
3. Keep `Trestle Media API rules` section heading literal (Tier 3 dependency × 2 + Tier 4 dependency × many).
4. Move historical content (closed-incident detail, past PR lists) to `memory/CLAUDE-MD-HISTORICAL-2026-05-17.md` and add a pointer.
5. Run the survey command AFTER the slim. The hit-count must be ≥ today's 44; no dependency disappears silently.

---

## Cross-references

- `docs/engineering/vercel-preview-proof-rules.md` — Vercel-preview-specific proof rules (items 1, 2, 3, 4, 8 of Maya's original spec list)
- `NEON.md` — DB rules; `[neon-preflight: OK]` token-in-commit-message is the existing precedent for procedural enforcement
- `scripts/neon-precommit-guard.js` — Hook precedent for "block commit unless ack token present"
- `.claude/hooks/follow-up-reminder.js` — Hook precedent that reads CLAUDE.md directly

---

**End of report. No workflows changed. No production code touched. Rules are procedural until enforcement tooling is approved separately.**
