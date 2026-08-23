# Proof-First Guardrails — mallan.nyc Operating Standard

> **Purpose:** Prevent false "fixed" claims. Every issue closed under this guardrail
> must be proven end-to-end with file/line evidence, command output, source/DB/API
> evidence, and (where applicable) user-visible verification.
>
> **Status:** ACTIVE · **Adopted:** 2026-05-08 · **Owner:** Maya Allan (broker)
>
> **Scope:** Every audit, every patch, every commit, every status update — public
> frontend, CRM frontend, API, sync, mappers, DTOs, portals, email, lifecycle,
> compliance, search, media, and any other production surface in this repository.
>
> **This document is operational guardrail, not code.** Reference it from PRs and
> session reports. Cite specific sections in commit messages when a fix is
> non-trivial.

---

## 1. The end-to-end proof rule

**No issue is "fixed" until it has been verified end-to-end across every layer it
crosses, with each layer's evidence captured in the closing report.**

The standard layer chain for a public-facing data issue:

```
source (Trestle / RESO / external feed)
  → sync (lib/idx/sync.ts and the 5 non-sync writers in H1 Tier-1)
    → DB (listings.* columns, listing_search_projection.*, audit_events, sync_errors)
      → API / DTO (app/api/listings/*, lib/idx/db-to-public-dto.ts, lib/idx/public-dto.ts)
        → frontend (app/components/*, app/listing/[...slug]/page.tsx, helpers in lib/media/)
          → browser / user-visible (placeholder vs. photo, field renders, link works)
            → tests / validators (jest, idx:validate, compliance-check, ucba:audit, ops:health)
```

A fix that lands one layer but breaks at another is **not fixed**. It is a partial
patch and must be reported as such until every layer is verified.

For non-data work (auth, portal, email, cron, schema, etc.), substitute the
appropriate layer chain. The principle is identical: no skipping layers.

---

## 2. Snippet checks are insufficient

**Reading 5 lines of source and concluding "looks correct" is not proof.** The
recent audit cycle surfaced several classes of failure that snippet review never
catches:

| Failure class | Example from this codebase |
|---|---|
| Code path not actually taken at runtime | `media-backfill` cron runs the eligibility query every 8 min but never updates listings whose Trestle source has zero photos — readers of the SQL alone might assume those rows get healed |
| Static check matches but runtime drift | Static guard regex `mailto:contact@mallan\.nyc[^"'\`]*subject=...Inquiry` failed to catch template-literal mailto bypasses on listing detail desktop sidebar |
| One file fixed, sibling file missed | Floor-plan classifier corrected in `lib/media/listing-media-resolver.ts` but `lib/media/media-sync-service.ts` continued to miss `floor_plan` underscore variant for several weeks |
| Snake-case vs camelCase vs SourceSystemKey vs ListingKey | `mls_id` persists as null because `CARD_SELECT_FIELDS` may not request `ListingKey` from Trestle, even though the mapper code "looks right" |

**Required:** every concluding statement must cite file:line evidence AND a runtime
or DB-side check that proves the code path actually fires the expected behavior.

---

## 3. Validators and tests are not the final word

**Static validators (compliance-check, idx:validate, ucba:audit, jest test suites)
are necessary but not sufficient.** A fix that passes every validator and still
shows broken behavior to users is still broken.

| Validator | What it covers | What it doesn't catch |
|---|---|---|
| `npm run type-check` | Type errors | Runtime data shape divergence (e.g. media JSON shape variance between sync paths) |
| `npm run lint` | Style, dead code | Behavior errors |
| `npm run compliance-check` | 93 rule grep checks | Rules not yet codified |
| `npm run idx:validate` | 1,276 IDX-Plus field checks | DB state ≠ Trestle state at runtime |
| `npm run ucba:audit` | 145 UCBA 2026 rules | Rule fires on a file that's no longer the canonical surface |
| `lib/search/__tests__/*.test.ts` | Static source patterns + small unit cases | Behavior under real DB or live Trestle |
| `tests/runtime/*.test.ts` | Mocked-prisma route handlers | Mock shape may not match live Prisma return shape |
| `npm run repo:hygiene` | Working-tree scope, PR 4 paths, telemetry | Whether the staged change actually fixes the user-visible issue |
| `node scripts/ci/guardrails.mjs` | Phase-3 parallel-safe checks | Specific to its named scope |

**Required:** when validators pass but the user reports the behavior is still
broken, treat the user report as the source of truth and re-investigate. Do NOT
respond with "all gates green" without a corroborating user-visible proof.

The Media Display P0 fix (commit `62ed80bf`) is an example: 459 unit tests + 160
runtime tests passed, but ~5,193 DB rows still rendered floorplan-as-hero on
cards because the staged fix sat uncommitted for hours. Tests passed; users still
saw the bug. Proof requires deployment + visual verification.

---

## 4. Verify the actual runtime path, not the assumed one

Every audit / patch must verify:

1. **File paths actually exist at the cited locations** — paths can drift after
   refactors; cite paths from `git ls-files`, not from memory.
2. **Imports and call sites match** — a helper exists ≠ a helper is used. Use
   `grep -nE "<symbol>"` or `Grep` tool to find every call site. Confirm the
   relevant call site is the one the runtime actually hits.
3. **Runtime branches are exercised** — a defensive `if (foo) { ... }` branch
   may never fire if `foo` is always falsy in production. Confirm with DB
   query or log inspection that the branch matters.
4. **Payload shapes match across boundaries** — Trestle returns `MediaCategory` /
   `MediaURL`; sync writes `mediaType` / `url`; some DB rows still hold the
   raw shape. Every mapper/filter must defensively handle BOTH shapes or
   document that the population is normalized.
5. **Same identifier across layers** — `listing_id` (RLS-prefixed string) vs
   `mls_id` (Trestle ListingKey numeric string) vs `id` (DB BigInt PK) vs
   `ResourceRecordKey` vs `ResourceRecordID` vs `ListingKey` vs `SourceSystemKey`
   vs `OriginatingSystemKey` — these are seven different identifiers. A fix
   that passes the wrong one to a Trestle query gets 0 results and looks
   correct on the wire.

---

## 5. Findings classification — every conclusion picks one

When closing an audit or filing a finding, every conclusion **must** be
classified into one of these five buckets. No "unknown" conclusions slip through
without an explicit declaration.

| Class | Definition | Example |
|---|---|---|
| **Root cause** | The originating defect that, if fixed, eliminates the problem entirely | "Trestle source genuinely has 0 photos for these 478 listings" |
| **Secondary cause** | A real bug that compounds the symptom but isn't the originating defect | "`mls_id` persists as null because `CARD_SELECT_FIELDS` doesn't request `ListingKey`" — fixing this doesn't fill the missing photos but causes downstream cron inefficiency |
| **Cosmetic mitigation** | A render-side or display-side patch that hides the symptom without fixing the source | "Filter zero-photo listings out of FeaturedListings before display" — the listing still has no photos, but the homepage stops showing placeholders |
| **Test/validator gap** | A check that should have caught this but didn't, requiring its own remediation | "Static guard regex `mailto:contact@mallan\.nyc[^"'\`]*subject=...Inquiry` doesn't match template literals with backticks; tightened guard needed" |
| **Unknown** | Insufficient evidence to classify; explicitly states what additional evidence is required | "DB shows 484 empty-media listings; live Trestle Property `PhotosCount` not yet checked for the full population — sample of 6 confirms source-empty for 4, but extrapolating without bulk verification is unsupported" |

**Required:** every audit's executive verdict must declare the classification for
every finding. "Mixed causes" is acceptable IF every contributing cause is itself
classified.

---

## 6. Patch plan template — required for every non-trivial fix

Every patch larger than a one-line typo must have a written plan with all eight
sections. Smaller patches (typo fix, doc edit) may compress sections 4-7 to one
line.

```
## Patch plan: <issue title>

### 1. Root cause evidence
[file:line citations + command output + DB/API/source evidence proving WHY this is the cause, not "looks like"]

### 2. Exact files
[bullet list of every file the patch touches, with line ranges]

### 3. Exact behavior change
[before → after for each modified function / route / component, in plain prose]

### 4. Tests
[every new test + every modified test + which suite + how to run]

### 5. Manual smoke test
[step-by-step steps a human runs in browser/curl/CLI to verify the fix at the user-visible layer]

### 6. Rollback plan
[exact `git revert` target, any required follow-up cleanup, any data state to monitor for 24-72h]

### 7. Compliance / hard-limit verification
[explicit confirmation that the patch does NOT touch: PR 4 paths, schema, telemetry, CRM redesign, secrets/PII logs, public media URL rewrite policy, external-inventory hold]

### 8. Validation gate results
[output of: type-check, lint, compliance-check, idx:validate, crm:check-build, lib/search jest, runtime jest, guardrails, repo:hygiene]
```

The plan must be reviewable BEFORE the patch is staged, not after. A staged
patch without a plan must be reverted or held until a plan is written.

---

## 7. The "fixed" word is forbidden without proof

The following words/phrases are **forbidden** in commit messages, status reports,
and audit reports unless backed by every required piece of evidence:

- "Fixed"
- "Resolved"
- "Closed"
- "Done"
- "Working as expected"
- "Looks good"
- "Should be fine"
- "Cleared"

**To use any of these words, the report must include:**

1. **File / line evidence** — the exact code change, with paths and line ranges
2. **Command output** — the validation command results that prove the change is
   in place (`git log`, `git show`, `npm run type-check`, etc.)
3. **API / DB / source evidence** — for data-affecting fixes: a DB query result,
   API response, or source-feed query showing the change took effect
4. **User-visible verification** — for UI-affecting fixes: a screenshot reference,
   a browser DevTools network capture, or a written description of what the
   user now sees vs. before. Acceptable surrogates when a live human cannot
   browse: production HTTP curl + grep for the expected/forbidden string

**Acceptable hedge phrases when full proof is not yet collected:**

- "Code change landed; full smoke not yet run"
- "Static gates green; runtime verification pending"
- "Source verified; production deploy verification pending"
- "Verified in DB; not yet verified at frontend layer"

The hedge IS the audit trail. Use it instead of overclaiming.

---

## 8. Media / photo work — required proof matrix

Media defects are a recurring class with multiple possible failure modes. Every
media-related claim must be proven across this matrix:

| Layer | Required proof | Example evidence |
|---|---|---|
| **Trestle source** | Live Trestle Property `PhotosCount` field for the listing | `{"PhotosCount": 17}` from `Property?$filter=ListingId eq '...'` |
| **Trestle Media resource** | Direct Media query using ALL plausible keys (RRK / RRID / RRKN) | All three queries return identical record counts; no key-mapping ambiguity |
| **Sync key mapping** | `lib/idx/sync.ts` line that constructs the Media filter; `mls_id` column populated as expected | `mls_id` matches `ListingKey`, or fallback to `ListingId`-based RRID filter is exercised |
| **DB media JSON** | `listings.media` array length and category breakdown | `SELECT jsonb_array_length(media), jsonb_path_query_array(media, '$[*].mediaType') FROM listings WHERE listing_id = '...'` |
| **API DTO** | Public listing API response for the listing | `curl /api/listings/<id>` showing `media[]` and `photosCount` |
| **Frontend helper** | `getValidPhotoMedia` / `getHeroPhoto` / `countPhotoMedia` outputs for the same media JSON | Unit test or runtime-mock test asserts the helper returns the expected shape |
| **Frontend component** | Card render uses the helper output, not raw media | Static guard test asserting `app/components/SearchListingCard.tsx` and `FeaturedListings.tsx` import from `@/lib/media/listing-card-media` |
| **Browser image request** | The image URL the browser actually requests resolves to a real image | DevTools Network panel: HTTP 200, Content-Type: image/jpeg; OR `curl -I` against the proxy URL |
| **Production deploy status** | The relevant commit is on `origin/main` AND deployed to Vercel production | `git log origin/main`, Vercel deployment dashboard / log timestamp |

**Special rule for media — the safety classifier:**

> If `Trestle PhotosCount > 0` BUT `DB media count == 0`, this is a SYNC BUG
> and must be classified as such, not as "source missing."

This rule is the inverse-test that prevents misclassifying genuine sync failures as
"Trestle has nothing." The proof matrix's Trestle source row + DB row together
satisfy the rule.

**Special rule for media — staged vs deployed:**

> A media fix in a staged commit that has not been pushed to `origin/main` is NOT
> a fix. The user still sees the bug. Until the commit is on `origin/main` AND
> Vercel has built + deployed it, the report must say "staged, not yet deployed."

---

## 9. Cross-references to existing project guardrails

This document layers on top of the existing project rules. Every audit must
ALSO honor:

- **`CLAUDE.md`** — project instructions (authoritative)
- **`NEON.md`** — Neon / Prisma / DB / migration discipline
- **`docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md`** — canonical files by domain; no parallel-name files
- **`memory/REFACTOR-2026-04-25.md`** — master plan PR sequence; PR 4 status
- **`memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`** — hold record + release conditions
- **`memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`** — incident closeout checklist
- **`scripts/ci/repo-hygiene.mjs`** — 8 enforcement rules + ALLOW_* bypasses
- **`compliance/rules/ucba-audit-checklist.json`** — 145 UCBA 2026 rules
- `.claude/skills/rebny-compliance/SKILL.md` — REBNY compliance source-of-truth

When this document conflicts with one of the above, the more conservative rule
wins. When in doubt, ask before acting.

---

## 10. Standing rules already adopted

These were adopted earlier in the audit cycle and remain in force:

1. **Every commit reports `=== STAGED FILES ===`** before commit, listing the
   exact `git diff --cached --name-only` output. Files outside the declared
   scope are unstaged before commit.
2. **`repo:hygiene` runs before every commit.** No commit if hygiene fails. The
   `ALLOW_PR4_TOUCH=1` and other bypasses are used only when the user has
   explicitly authorized the specific surface in scope.
3. **Per-cycle close-out gate.** PR 4 readiness requires (a) §2.05 = 0,
   (b) projection parity = 0, (c) repo hygiene PASS, (d) explicit
   external-inventory release, (e) substantive closeout cleanliness with no
   open compliance findings.
4. **No commit unless all 8 standard validation gates pass:** type-check,
   lint, compliance-check, idx:validate, crm:check-build, lib/search jest,
   runtime jest, guardrails. Plus repo:hygiene before commit.
5. **No diagnostic script left behind.** Read-only audits create scripts in
   `scripts/diagnostic/`, run them, and delete them in the same session unless
   the user explicitly authorizes retention.
6. **Auto mode does not authorize destructive actions.** Continuous execution
   applies to low-risk read-only or staged-and-reviewable work. Anything that
   modifies shared/production state, deletes data, or releases a documented
   hold requires verbatim user authorization.

---

## 11. Enforcement

This document is enforced by:

- Code review of every PR description (must reference §6 patch plan template
  for non-trivial work, or a one-liner explanation for trivial work)
- Audit reports (must classify every finding per §5; must use hedge phrases
  per §7 when full proof is not yet collected)
- Commit messages (must NOT use the §7 forbidden words without §7 evidence)
- Session reports (must end with the §1 layer chain status, not just "all
  green")

This document is **not enforced** by automated CI today; the absence of an
automated enforcement is itself a known gap. Manual review is the current
mechanism.

---

## 12. Revision history

| Date | Change | Reason |
|---|---|---|
| 2026-05-08 | Initial adoption | Recurring "fixed but not deployed" / "validators green but user sees broken" pattern across the audit cycle. Specifically: 5,193 listings rendered floorplan-as-hero on cards while Media Display P0 sat staged-but-uncommitted; the H1 Tier-1 dual-write fix landed but the secondary `mls_id`-null bug was not caught at the time; §2.05 violations were declared "cleared" before strict gate validation. The pattern shows a need for explicit, written guardrails. |

---

## 13. Quick-reference checklist (use this at the end of every audit / patch)

```
[ ] All 7 layers in §1's chain explicitly cited with evidence
[ ] No snippet-only conclusions (§2)
[ ] No validator-only conclusions when a user-visible behavior is at stake (§3)
[ ] All identifiers cross-checked across layers (§4)
[ ] Every finding classified per §5
[ ] Patch plan complete per §6 (for non-trivial patches)
[ ] No "fixed/resolved/closed/done/cleared" without §7 evidence
[ ] Media work proven across §8 matrix (when applicable)
[ ] Cross-reference rules honored (§9)
[ ] Standing rules honored (§10)
[ ] Final status uses hedge phrasing if any layer not yet verified
```

If every box is checkable, the report is publishable. If any box is unchecked,
state it explicitly.
