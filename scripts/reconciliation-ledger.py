#!/usr/bin/env python3
"""Reconciliation ledger generator — the tool that makes the canonical plan's
"generated, not asserted" claim true (§0.5).

Run:  npm run ledger:build      (or: python scripts/reconciliation-ledger.py)

Rebuilds, from the two unmerged planning lines plus safe `main`:
    docs/architecture/MALLAN-PLATFORM-RECONCILIATION-LEDGER.md
    docs/architecture/RECONCILIATION-LEDGER-VALIDATION.json
and rewrites the two delimited blocks in
    docs/architecture/MALLAN-PLATFORM-PLAN.md
        <!-- GENERATED:LEDGER-TOTALS -->
        <!-- GENERATED:DEFERRED-GATES -->

ASSERTS, exiting non-zero, on:
  - a resolution naming a requirement id absent from the inventory;
  - any of the 605 frozen baseline rows missing or regressed to unresolved;
  - a recovered-plan H2 heading that is neither a ledger row nor an explicit
    exclusion — this is exactly how POL-1.1..POL-1.5 were silently dropped once;
  - a referenced XXX-#### token with no heading and no recorded explanation;
  - either GENERATED block missing from the canonical plan.

Reads PR #585 and PR #579 blobs with `git show`, so those heads must be
fetched. Read-only with respect to git; writes only the files listed above.

WHAT IT DOES NOT DO: it does not verify that any disposition is *correct*. It
enforces structure, completeness and baseline integrity. Substance comes from
the per-row evidence and from review (cf. GATE-6).
"""

import io, re, subprocess, collections, json, os, pathlib, hashlib

# Derived from this file's location so the generator is not bound to one
# machine's checkout path.
WT = str(pathlib.Path(__file__).resolve().parent.parent)

def git(*a):
    r = subprocess.run(["git"] + list(a), cwd=WT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        # Never convert a failed lookup into empty input. Doing so produced an
        # empty inventory that failed 200 lines later at an unrelated assertion,
        # with no hint that the real cause was a missing object.
        raise SystemExit(
            "reconciliation-ledger: `git %s` failed (exit %d).\n  %s"
            % (" ".join(a), r.returncode, (r.stderr or "").strip()[:300]))
    return r.stdout


# ── PREFLIGHT: the inventory sources must actually be present ──────────────
# This generator reconstructs the ledger from three commits that are NOT
# ancestors of this branch: the recovered planning line, the PR #585 head and
# the PR #579 head. A single-branch or shallow clone of this head will not have
# them, and `git show` requires its <object> to exist. Check up front and say
# exactly how to fix it, rather than failing obscurely much later.
SOURCE_OBJECTS = {
    "6e8ea2d9": "recovered planning line (design/frontend-backend-integration-clean-2026-07-28)",
    "f51848b0": "PR #585 head, preserved at backup/pr585-f51848b0-before-reconciliation",
    "7c15b1d5": "PR #579 head (docs/unified-ai-master-plan-2026-07-27)",
}
_missing = []
for _obj, _what in SOURCE_OBJECTS.items():
    _r = subprocess.run(["git", "cat-file", "-e", _obj + "^{commit}"], cwd=WT,
                        capture_output=True, text=True)
    if _r.returncode != 0:
        _missing.append((_obj, _what))
if _missing:
    raise SystemExit(
        "reconciliation-ledger: required source commits are not in this checkout.\n\n"
        + "".join("  MISSING %s  — %s\n" % (o, w) for o, w in _missing)
        + "\nNone of these is an ancestor of the current head, so a single-branch or\n"
          "shallow clone will not contain them. Fetch them and re-run:\n\n"
          "    git fetch origin "
          "'refs/heads/*:refs/remotes/origin/*' --no-tags\n"
          "    git fetch origin backup/pr585-f51848b0-before-reconciliation\n"
          "    npm run ledger:build\n\n"
          "The ledger and its validation JSON are committed, so a clean checkout can\n"
          "READ them without this command. `ledger:build` is the REGENERATION and\n"
          "integrity path, and it requires the inventory sources by construction.\n")

ROWS = []          # each: dict with the 12 fields
EXCLUDED = []      # (id_or_heading, source, reason)

SKEL = dict(disposition="unresolved", reason_or_evidence="pending reconciliation",
            dependency="pending review", maturity="unassessed",
            implementation_status="unassessed", verification_status="inventory_only")

def add(rid, source, commit, section, requirement, dest="TBD"):
    ROWS.append({"requirement_id": rid, "source": source, "source_commit_or_pr": commit,
                 "source_section": section, "requirement": requirement,
                 "canonical_destination": dest, **SKEL})

def slug(text, maxw=2):
    w = re.findall(r"[A-Za-z0-9]+", text.upper())
    w = [x for x in w if x not in ("THE","AND","A","AN","OF","FOR","TO","IN","ON")]
    return "-".join(w[:maxw]) or "SECTION"

# ── 1. RECOVERED PLAN (6e8ea2d9) — preserve identifiers exactly ──────────
rec = git("show", "6e8ea2d9:docs/architecture/MALLAN-PLATFORM-PLAN.md").splitlines()
rec_ids = set()
cur_h2 = ""
for i, line in enumerate(rec):
    # Accept sub-numbered H2 identifiers too. POL-1.1..POL-1.5 are `##` headings,
    # not `###`, so they are SEPARATE sections rather than part of POL-1's body —
    # unlike BIZ-1.1 / BIZ-2.1 / BIZ-4.1, which are `###` and fold into their
    # parent. An earlier revision of this regex required `XXX-N` followed by a
    # dash, so `POL-1.1` matched neither this branch nor the exclusion branch
    # below (it starts with `POL-1`) and all five dropped out of the ledger
    # silently. They carry the gate-by-gate null semantics and the 7,594-row
    # incident record, so that omission was the most consequential one possible.
    m = re.match(r"^##\s+([A-Z]{2,5})-(\d+(?:\.\d+)*)\s*[—–-]\s*(.+?)\s*$", line)
    if m:
        rid = f"{m.group(1)}-{m.group(2)}"
        rec_ids.add(rid)
        add(rid, "recovered-plan", "6e8ea2d9", f"## {rid}", m.group(3).strip())
        continue
    m2 = re.match(r"^##\s+(?!\s)(.+?)\s*$", line)
    if m2 and not re.match(r"^[A-Z]{2,5}-\d+", m2.group(1)):
        EXCLUDED.append((m2.group(1).strip()[:80], "recovered-plan", "context_only"))

# Every token in the recovered plan shaped like a requirement identifier.
# NOT all of them are requirement identifiers: filenames carrying a four-digit
# year and one listing record id share the XXX-#### shape. Each such token is
# recorded below with the line that proves what it actually is, so the
# 247-referenced vs 243-heading delta is explained rather than silent.
all_referenced = set(re.findall(r"\b[A-Z]{2,5}-\d+\b", "\n".join(rec)))

NOT_REQUIREMENT_IDS = {
    "GATE-2026": "date in filename memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md (line 542)",
    "SPEC-2026": "date in filename SELLER-001-SPEC-2026-07-03.md (line 141)",
    "UCBA-2026": "date in filename data/UCBA-2026-Requirements.md (line 1937)",
    "SL-0004":   "Mallan listing/web record identifier, not a requirement (lines 664, 668)",
}
for tok in sorted(all_referenced - rec_ids):
    why = NOT_REQUIREMENT_IDS.get(tok)
    # Fail loudly rather than quietly dropping an identifier that has no heading.
    assert why, f"UNEXPLAINED referenced identifier with no heading: {tok}"
    EXCLUDED.append((tok, "recovered-plan", f"not_a_requirement_identifier — {why}"))

# ── 2. PR #585 plan — deterministic P585-<SECTION>-<SEQ> ────────────────
p585 = git("show", "f51848b0:docs/architecture/MALLAN-PLATFORM-PLAN.md").splitlines()
seq = collections.Counter()
for line in p585:
    m = re.match(r"^(#{2,4})\s+(.+?)\s*$", line)
    if not m: continue
    title = m.group(2).strip()
    if re.match(r"^(table of contents|contents|index|appendix)$", title, re.I):
        EXCLUDED.append((title[:80], "PR#585-plan", "navigation_only")); continue
    s = slug(title); seq[s] += 1
    add(f"P585-{s}-{seq[s]:03d}", "PR#585-plan", "f51848b0", f"{m.group(1)} {title}", title)

# PR #585 governance files
for f in ["AI-START-HERE.md", "AGENTS.md", "README.md", ".github/copilot-instructions.md"]:
    txt = git("show", f"f51848b0:{f}")
    if not txt.strip():
        EXCLUDED.append((f, "PR#585-governance", "duplicate_heading")); continue
    s2 = collections.Counter()
    for line in txt.splitlines():
        m = re.match(r"^(#{1,4})\s+(.+?)\s*$", line)
        if not m: continue
        t = m.group(2).strip(); k = slug(f.replace(".md","").replace(".github/",""))
        s2[k] += 1
        add(f"P585-{k}-{s2[k]:03d}", f"PR#585-{f}", "f51848b0", f"{m.group(1)} {t}", t)

# ── 3. PR #579 — master plan, C-#, capabilities, evidence, script ───────
p579 = git("show", "7c15b1d5:docs/architecture/Mallan_Intelligence_Master_Plan.md").splitlines()
seq3 = collections.Counter()
for line in p579:
    m = re.match(r"^(#{2,4})\s+(.+?)\s*$", line)
    if not m: continue
    title = m.group(2).strip()
    if re.match(r"^(table of contents|contents|index)$", title, re.I):
        EXCLUDED.append((title[:80], "PR#579-plan", "navigation_only")); continue
    cm = re.match(r"^(C-\d+(?:\.\d+)*)\b\s*[—–:-]?\s*(.*)$", title)
    if cm:
        add(cm.group(1), "PR#579-plan", "7c15b1d5", f"{m.group(1)} {title}",
            (cm.group(2) or title).strip())
        continue
    s = slug(title); seq3[s] += 1
    add(f"P579-{s}-{seq3[s]:03d}", "PR#579-plan", "7c15b1d5", f"{m.group(1)} {title}", title)

# config/capabilities.mjs holds THREE distinct kinds of identifier, not one.
# A flat `id:` regex conflates them and reports "24 capabilities", which is wrong:
#   export const programs    -> 12 program/phase entries (P0..P11)
#   export const capabilities -> 11 capability entries (CAP-*)
#   plus 1 obligation id nested INSIDE CAP-MEDIA-AI-PROVENANCE, not a capability.
# Track the enclosing export block and the brace depth so each lands in its own source.
cap_lines = git("show", "7c15b1d5:config/capabilities.mjs").splitlines()
block, depth = None, 0
cap_counts = collections.Counter()
for line in cap_lines:
    em = re.match(r"^export const (\w+)\s*=", line)
    if em:
        block = em.group(1); depth = 0
    if block in ("programs", "capabilities"):
        im = re.search(r"\bid:\s*['\"]([^'\"]+)['\"]", line)
        if im:
            cid = im.group(1)
            # depth counted BEFORE this line's braces: 1 == a top-level array entry
            if block == "programs":
                src, desc = "PR#579-program-registry", f"Program/phase registry entry: {cid}"
            elif depth <= 1:
                src, desc = "PR#579-capability-registry", f"Capability registry entry: {cid}"
            else:
                src, desc = ("PR#579-capability-obligation",
                             f"Obligation nested inside a capability (depth {depth}): {cid}")
            cap_counts[src] += 1
            add(cid, src, "7c15b1d5", "config/capabilities.mjs", desc)
        depth += line.count("{") - line.count("}")
        if re.match(r"^\]", line): block = None

for f in ["scripts/capability-audit.mjs", "package.json",
          "memory/EVIDENCE-STANDARD-2026-07-27.md",
          "docs/architecture/MASTER-PLAN-GAP-ANALYSIS-2026-07-27.md",
          "docs/evidence/capability-evidence-2026-07-27.md",
          "docs/evidence/capability-evidence-2026-07-27-e57.md"]:
    # Full-path slug: two evidence files share their first four words
    # (docs/evidence/capability-evidence-2026-07-27{,-e57}.md), so a truncated
    # slug collides. Keep every word so each artefact keeps its own ID.
    add(f"P579-FILE-{slug(f.replace('/',' ').replace('.',' '), 99)}", "PR#579-machinery", "7c15b1d5", f,
        f"Machine-governance / evidence artefact: {f}")

# ── 4. Safe main operational truth ─────────────────────────────────────
add("OPS-024", "safe-main", "04db1b99", "docs/PLATFORM-ISSUE-REGISTRY.md",
    "Phase 1A froze Property ingestion for 4 cycles; rollback + main revert; corrected code unmerged")
add("OPS-025", "safe-main", "04db1b99", "docs/PLATFORM-ISSUE-REGISTRY.md",
    "mls_id IS NULL on 22,809/23,980 IDX listings (95.1%) — pre-existing, not in scope")
add("OPS-026", "stage-G-finding", "04db1b99", "app/api/listings/route.ts",
    "Public listing pagination occurs before final display and matched-pair filtering")
add("CONFLICT-POL-GATE34-PORTAL", "stage-G-finding", "04db1b99",
    "lib/compliance/gates.ts + lib/compliance/dto.ts",
    "Portal gate 3/4 null semantics: current code denies on null, recovered plan says displayable")
add("CONFLICT-CAPABILITY-VOCABULARY", "stage-L-review", "3be70fa4",
    "config/capabilities.mjs STATUSES vs canonical plan §16",
    "Capability maturity vocabulary differs between the enforced registry and the canonical plan")
for gid, sec, req in [
    ("MAIN-SCHEDULES-001", "vercel.json", "Active cron schedules including one-cycle every 10 minutes"),
    ("MAIN-GOVERNANCE-001", "AGENTS.md / CLAUDE.md", "Cross-agent constitution and Claude-specific depth"),
    ("MAIN-GOVERNANCE-002", "docs/PROJECT-HEALTH-DASHBOARD.md", "Current operational status tier"),
    ("MAIN-GOVERNANCE-003", "docs/PLATFORM-ISSUE-REGISTRY.md", "Canonical issue evidence + evidence scoring"),
    ("MAIN-GOVERNANCE-004", "docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md", "File ownership and no-parallel-file rule"),
    ("MAIN-GOVERNANCE-005", "docs/compliance/COMPLIANCE-CANONICAL-INDEX.md", "18 compliance areas with fail-closed pointers"),
    ("MAIN-GOVERNANCE-006", "NEON.md", "Database rules and canonical Neon project facts"),
]:
    add(gid, "safe-main", "04db1b99", sec, req)

# ── 5. Twelve deep-system findings ─────────────────────────────────────
for aid, req in [
    ("AUDIT-PROVIDER-BOUNDARY", "Raw provider boundary absent: cursor/merge read raw rows before normalization"),
    ("AUDIT-PORTAL-ACTOR-SUBJECT", "requirePortalRole permits agent/broker; routes reinterpret auth.userId as Lead.id"),
    ("AUDIT-NEON-POOL", "Neon reachability/pool pressure: ~10s Prisma waits, pool limit 5, pooler unreachable"),
    ("AUDIT-SEARCH-DUAL-RUNTIME", "/api/listings DB path and live Cotality fallback are not semantically equivalent"),
    ("AUDIT-MEDIA-DUPLICATION", "Media duplicated across Listing.media, raw_data.Media, ListingMedia, R2, columns"),
    ("AUDIT-PROJECTION-MIGRATION", "listing_search_projection dual-write best-effort; reader swap held (PR 5B)"),
    ("AUDIT-PROPERTY-IDENTITY", "Canonical property identity is schema-only; no proven writers/readers"),
    ("AUDIT-PERSON-ORG-IDENTITY", "No person/household/organization identity foundation"),
    ("AUDIT-WORKFLOW-OUTBOX", "No domain-event/outbox/workflow separation; AuditEvent must not be repurposed"),
    ("AUDIT-POLICY-VERSIONING", "No policy/provider-contract version provenance for decisions"),
    ("AUDIT-IDX-GOD-MODULE", "lib/idx/sync.ts concentrates fetch, map, persist, media, cache, cursor concerns"),
    ("AUDIT-GOVERNANCE-DRIFT", "Governance documents carry stale operational statements"),
]:
    add(aid, "deep-audit", "2026-07-30", "system audit", req)

# ── STRUCTURAL COMPLETENESS OF THE RECOVERED PLAN ──────────────────────
# Every `##` heading in the recovered plan must be accounted for as either a
# ledger row or an explicit exclusion. Counting only the IDs the regex happened
# to produce is self-consistent and proves nothing: it is exactly how POL-1.1
# through POL-1.5 went missing while every other check reported clean.
_rec_h2 = [re.match(r"^##\s+(.+?)\s*$", l).group(1).strip()
           for l in rec if re.match(r"^##\s+\S", l)]
_row_sections = {r["source_section"] for r in ROWS if r["source"] == "recovered-plan"}
_excluded_txt = {h for h, s, _ in EXCLUDED if s == "recovered-plan"}
unaccounted_headings = []
for h in _rec_h2:
    m = re.match(r"^([A-Z]{2,5}-\d+(?:\.\d+)*)\b", h)
    if m and f"## {m.group(1)}" in _row_sections:
        continue
    if h[:80] in _excluded_txt:
        continue
    unaccounted_headings.append(h)
assert not unaccounted_headings, (
    f"{len(unaccounted_headings)} recovered-plan H2 headings are neither a ledger "
    f"row nor an explicit exclusion: {unaccounted_headings[:10]}")

# ── APPLY RESOLUTIONS ──────────────────────────────────────────────────
# A requirement absent from the resolutions file stays `unresolved`. Silence is
# never read as a decision.
RES_FIELDS = ("canonical_destination", "disposition", "reason_or_evidence",
              "dependency", "maturity", "implementation_status", "verification_status")
RES_PATH = os.path.join(WT, "docs", "architecture", "RECONCILIATION-RESOLUTIONS.json")
resolutions = json.load(io.open(RES_PATH, encoding="utf-8")) if os.path.exists(RES_PATH) else {}
by_id = {r["requirement_id"]: r for r in ROWS}
# A resolution naming an ID that is not in the inventory means the ledger and the
# resolutions have drifted apart. Fail rather than silently ignore it.
unknown_res = sorted(k for k in resolutions if not k.startswith("_") and k not in by_id)
assert not unknown_res, f"resolutions reference unknown requirement IDs: {unknown_res}"
for rid, res in resolutions.items():
    if rid.startswith("_"):
        continue
    missing = [f for f in RES_FIELDS if f not in res]
    assert not missing, f"resolution {rid} is missing required fields: {missing}"
    by_id[rid].update({f: res[f] for f in RES_FIELDS})

# The frozen 605-row baseline must survive intact. Asserting it here makes
# "nothing was rewritten" provable rather than asserted: every baseline ID must
# still exist AND still be resolved. Rows added afterwards (OPS-026) are counted
# separately as additions on top of the baseline.
_bl_path = os.path.join(WT, "docs", "architecture", "RECONCILIATION-LEDGER-BASELINE-605.json")
baseline_ids, baseline_missing, baseline_unresolved, added_ids = [], [], [], []
# The baseline file cannot be its own authority. If an ID were deleted from it,
# deriving the expected set FROM it would report "no missing baseline row" and
# silently reclassify the omitted ID as a later addition — the run would exit 0
# and rewrite the plan as 604 baseline + 4 additions, defeating the guard
# entirely. Pin the count and a digest of the ID set in CODE, so tampering with
# the file is what fails.
BASELINE_COUNT = 605
BASELINE_SHA256 = "69cf9edf1b0dfcac1e7baebb0cb4d94cb32d4dfef4d25b4f0e2b933bac220092"
if not os.path.exists(_bl_path):
    raise SystemExit(
        "reconciliation-ledger: RECONCILIATION-LEDGER-BASELINE-605.json is missing.\n"
        "  It is the regression guard; generating without it would produce an\n"
        "  unguarded ledger. Restore it from git.")
if True:
    _bl = json.load(io.open(_bl_path, encoding="utf-8"))
    baseline_ids = _bl["ids"]
    _declared = _bl.get("_count")
    _digest = hashlib.sha256("\n".join(sorted(baseline_ids)).encode("utf-8")).hexdigest()
    if len(baseline_ids) != BASELINE_COUNT or _declared != BASELINE_COUNT:
        raise SystemExit(
            "reconciliation-ledger: the frozen baseline has been altered.\n"
            "  expected %d ids and _count %d; file has %d ids and _count %r.\n"
            "  The 605-row baseline is immutable — restore it from git rather than\n"
            "  editing it." % (BASELINE_COUNT, BASELINE_COUNT, len(baseline_ids), _declared))
    if _digest != BASELINE_SHA256:
        raise SystemExit(
            "reconciliation-ledger: the frozen baseline ID SET has changed.\n"
            "  expected sha256 %s\n  actual   sha256 %s\n"
            "  The count matches but the membership does not, so an id was swapped.\n"
            "  Restore the baseline from git." % (BASELINE_SHA256, _digest))
    _by = {r["requirement_id"]: r for r in ROWS}
    baseline_missing = [i for i in baseline_ids if i not in _by]
    baseline_unresolved = [i for i in baseline_ids
                           if i in _by and _by[i]["disposition"] == "unresolved"]
    added_ids = sorted(set(_by) - set(baseline_ids))
    assert not baseline_missing, f"baseline rows disappeared from the ledger: {baseline_missing[:10]}"
    assert not baseline_unresolved, f"baseline rows regressed to unresolved: {baseline_unresolved[:10]}"

resolved_ids = [k for k in resolutions if not k.startswith("_")]
still_unresolved = [r["requirement_id"] for r in ROWS if r["disposition"] == "unresolved"]
assert len(resolved_ids) + len(still_unresolved) == len(ROWS), "resolved/unresolved counts do not partition the ledger"
by_disposition = collections.Counter(r["disposition"] for r in ROWS)
by_impl = collections.Counter(r["implementation_status"] for r in ROWS)
by_verif = collections.Counter(r["verification_status"] for r in ROWS)

# ── VALIDATION ─────────────────────────────────────────────────────────
ids = [r["requirement_id"] for r in ROWS]
dupes = [k for k, v in collections.Counter(ids).items() if v > 1]
blank_req = [r["requirement_id"] for r in ROWS if not r["requirement"].strip()]
blank_sec = [r["requirement_id"] for r in ROWS if not r["source_section"].strip()]
malformed = [r["requirement_id"] for r in ROWS if any(not str(r[k]).strip() for k in r)]
unrep = sorted(rec_ids - set(ids))

# Structural errors must BLOCK, not merely be reported. Previously duplicates,
# blank requirements and malformed rows were written into the validation JSON
# and the Markdown table with a "required 0 / actual N" line, while the run
# still exited 0 — a structural check whose stated requirement was violated and
# whose only consequence was a number in a table. Duplicating a resolved ID even
# satisfied the resolved/unresolved partition assertion, so nothing caught it.
_structural = []
if dupes:
    _structural.append("duplicate requirement IDs: %s" % ", ".join(dupes[:10]))
if blank_req:
    _structural.append("blank requirement text: %s" % ", ".join(blank_req[:10]))
if blank_sec:
    _structural.append("blank source sections: %s" % ", ".join(blank_sec[:10]))
if malformed:
    _structural.append("malformed rows: %s" % ", ".join(malformed[:10]))
if unrep:
    _structural.append("unrepresented recovered identifiers: %s" % ", ".join(unrep[:10]))
if _structural:
    _nl = chr(10)
    raise SystemExit(
        "reconciliation-ledger: STRUCTURAL VIOLATIONS — refusing to write artefacts." + _nl
        + "".join("  - " + v + _nl for v in _structural)
        + _nl
        + "These are the checks the ledger reports as 'required 0'. Emitting them" + _nl
        + "into the table while exiting 0 would let a source change silently break" + _nl
        + "the inventory. Fix the source or the resolutions and re-run." + _nl)

by_source = collections.Counter(r["source"] for r in ROWS)
by_family = collections.Counter(re.match(r"^([A-Za-z0-9]+)", r["requirement_id"]).group(1) for r in ROWS)

report = {
    "total_rows": len(ROWS),
    "by_source": dict(sorted(by_source.items())),
    "by_family_top": dict(sorted(by_family.items(), key=lambda kv: -kv[1])[:40]),
    "duplicate_ids": dupes,
    "blank_requirement_text": blank_req,
    "blank_source_sections": blank_sec,
    "malformed_rows": malformed,
    "unrepresented_recovered_ids": unrep,
    "recovered_heading_ids": len(rec_ids),
    "recovered_ids_referenced_anywhere": len(all_referenced),
    "excluded_sections": len(EXCLUDED),
    "resolved_rows": len(resolved_ids),
    "unresolved_rows": len(still_unresolved),
    "baseline_605_present": len(baseline_ids) - len(baseline_missing),
    "baseline_605_missing": baseline_missing,
    "baseline_605_regressed_to_unresolved": baseline_unresolved,
    "rows_added_after_baseline": added_ids,
    "by_disposition": dict(sorted(by_disposition.items(), key=lambda kv: -kv[1])),
    "by_implementation_status": dict(sorted(by_impl.items(), key=lambda kv: -kv[1])),
    "by_verification_status": dict(sorted(by_verif.items(), key=lambda kv: -kv[1])),
}
io.open(os.path.join(WT, "docs", "architecture",
                     "RECONCILIATION-LEDGER-VALIDATION.json"),
        "w", encoding="utf-8").write(json.dumps(report, indent=2))

# ── STAMP THE GENERATED TOTALS INTO THE CANONICAL PLAN ─────────────────
# §0.5 says counts are generated, not asserted. An earlier revision hand-wrote
# them into the plan header and they went stale within one commit — the exact
# failure §0.5 exists to prevent. Rewriting the delimited block from the ledger
# makes the claim true rather than aspirational.
_plan = os.path.join(WT, "docs", "architecture", "MALLAN-PLATFORM-PLAN.md")
if os.path.exists(_plan):
    _deferred = sorted(r["requirement_id"] for r in ROWS
                       if r["disposition"] == "deferred_with_gate")
    _added = sorted(added_ids)
    _plural = "s" if len(_added) != 1 else ""
    _lines = [
        "<!-- GENERATED:LEDGER-TOTALS — do not hand-edit; rewritten by the ledger generator -->",
        "**Ledger totals (generated):** {} rows — {} baseline plus {} later addition{}".format(
            len(ROWS), len(baseline_ids), len(_added), _plural),
        "({}) —".format(", ".join("`{}`".format(i) for i in _added)),
        "{} with a reasoned disposition, **{} unresolved**. Baseline integrity:".format(
            len(resolved_ids), len(still_unresolved)),
        "{} present / {} missing / {} regressed.".format(
            len(baseline_ids) - len(baseline_missing), len(baseline_missing),
            len(baseline_unresolved)),
        "",
        "> **A `deferred_with_gate` row is accounted for in the ledger. It is *not* a",
        "> settled product or policy decision.** **{}** rows are deferred:".format(len(_deferred)),
        "> {}.".format(", ".join("`{}`".format(i) for i in _deferred)),
        "> This plan records what is decided, what is deferred, and what is contested,",
        "> and never presents the second or third as the first.",
        "<!-- /GENERATED:LEDGER-TOTALS -->",
    ]
    _block = "\n".join(_lines)
    _txt = io.open(_plan, encoding="utf-8").read()
    _pat = re.compile(r"<!-- GENERATED:LEDGER-TOTALS.*?<!-- /GENERATED:LEDGER-TOTALS -->", re.S)
    assert _pat.search(_txt), "canonical plan is missing the GENERATED:LEDGER-TOTALS block"
    _new = _pat.sub(lambda _m: _block, _txt)
    # The provenance footer repeats the same numbers; keep it in step so the
    # document cannot disagree with itself.
    _new = re.sub(r"\(\d+ rows, \d+ resolved,\s*\n\d+ unresolved\)",
                  "({} rows, {} resolved,\n{} unresolved)".format(
                      len(ROWS), len(resolved_ids), len(still_unresolved)),
                  _new)
    # §18 repeats the deferred set; generate it too. It drifted once already.
    _dg = [
        "<!-- GENERATED:DEFERRED-GATES — do not hand-edit; rewritten by the ledger generator -->",
        "**Deferred and unresolved — accounted for in the ledger, NOT decided ({}):**".format(len(_deferred)),
        "{}.".format(", ".join("`{}`".format(i) for i in _deferred)),
        "<!-- /GENERATED:DEFERRED-GATES -->",
    ]
    _dgpat = re.compile(r"<!-- GENERATED:DEFERRED-GATES.*?<!-- /GENERATED:DEFERRED-GATES -->", re.S)
    assert _dgpat.search(_new), "canonical plan is missing the GENERATED:DEFERRED-GATES block"
    _dgtext = chr(10).join(_dg)
    _new = _dgpat.sub(lambda _m: _dgtext, _new)
    if _new != _txt:
        io.open(_plan, "w", encoding="utf-8").write(_new)

# ── EMIT THE LEDGER ────────────────────────────────────────────────────
out = []
out.append("# Mallan platform — reconciliation ledger\n")
out.append(f"> **Complete inventory: {len(ROWS)} rows. Resolved so far: {len(resolved_ids)}. "
           f"Still unresolved: {len(still_unresolved)}.**\n>\n"
           "> A row is `unresolved` until it appears in `RECONCILIATION-RESOLUTIONS.json`.\n"
           "> **Silence is never read as a decision** — an unresolved row means no\n"
           "> reconciliation judgement has been made about it, not that it was accepted.\n"
           "> A superficially complete ledger with invented dispositions would look like\n"
           "> accounting while hiding exactly that.\n>\n"
           "> Rows marked `code_verified` had their claim about the current codebase checked\n"
           "> by reading the cited `file:line` at commit `04db1b99` (safe `main`), read-only.\n"
           "> Rows marked `source_read` are policy statements with nothing in code to verify.\n")
out.append(f"\n**Total inventoried requirements: {len(ROWS)}**\n")

out.append("\n## Resolution progress\n\n| disposition | rows |\n|---|---:|")
for k, v in sorted(by_disposition.items(), key=lambda kv: (-kv[1], kv[0])):
    out.append(f"| `{k}` | {v} |")
out.append("\n| implementation status | rows |\n|---|---:|")
for k, v in sorted(by_impl.items(), key=lambda kv: (-kv[1], kv[0])):
    out.append(f"| `{k}` | {v} |")
out.append("\n| verification status | rows |\n|---|---:|")
for k, v in sorted(by_verif.items(), key=lambda kv: (-kv[1], kv[0])):
    out.append(f"| `{k}` | {v} |")
out.append("\n## Totals by source\n\n| source | rows |\n|---|---:|")
for k, v in sorted(by_source.items()):
    out.append(f"| `{k}` | {v} |")
out.append(f"| **TOTAL** | **{len(ROWS)}** |")

out.append("\n## Totals by requirement family\n\n| family | rows |\n|---|---:|")
for k, v in sorted(by_family.items(), key=lambda kv: (-kv[1], kv[0])):
    out.append(f"| `{k}` | {v} |")

out.append("\n## Structural validation\n\n| check | required | actual |\n|---|---|---:|")
out.append(f"| duplicate requirement IDs | 0 | {len(dupes)} |")
out.append(f"| malformed rows | 0 | {len(malformed)} |")
out.append(f"| blank requirement text | 0 | {len(blank_req)} |")
out.append(f"| blank source sections | 0 | {len(blank_sec)} |")
out.append(f"| unrepresented recovered identifiers | 0 | {len(unrep)} |")
if dupes: out.append(f"\nDuplicate IDs: {', '.join(dupes)}")
if unrep: out.append(f"\nUnrepresented recovered IDs: {', '.join(unrep)}")

out.append("\n## Field vocabulary\n")
out.append("`disposition`: `retained` · `combined` · `corrected` · `historical_only` · "
           "`deferred_with_gate` · `rejected_with_reason` · `unresolved`\n")
out.append("`implementation_status`: `not_started` · `planned` · `schema_only` · "
           "`partially_implemented` · `implemented` · `integrated` · `limited_release` · "
           "`production_proven` · `retiring` · `retired`\n")

out.append("\n## Ledger\n")
out.append("| requirement_id | source | source_commit_or_pr | source_section | requirement | "
           "canonical_destination | disposition | reason_or_evidence | dependency | maturity | "
           "implementation_status | verification_status |")
out.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
def esc(x): return str(x).replace("|", "\\|").replace("\n", " ")
for r in ROWS:
    out.append("| " + " | ".join(esc(r[k]) for k in
        ["requirement_id","source","source_commit_or_pr","source_section","requirement",
         "canonical_destination","disposition","reason_or_evidence","dependency","maturity",
         "implementation_status","verification_status"]) + " |")

_ret = resolutions.get("_identifier_retirement_map")
if _ret:
    out.append("\n## Identifier retirement map\n")
    out.append(f"> {_ret['_rule']}\n")
    out.append(f"\n{_ret['_cause']}\n")
    out.append("\n| old id | old meaning | new canonical id | new meaning | reason | source commit | destination |")
    out.append("|---|---|---|---|---|---|---|")
    for e in _ret["entries"]:
        out.append("| `{old_identifier}` | {old_meaning} | `{new_canonical_identifier}` | {new_meaning} | "
                   "{retirement_reason} | `{source_commit}` | {replacement_destination} |".format(**e))

_conflicts = resolutions.get("_flagged_conflicts", [])
if _conflicts:
    out.append(f"\n## Flagged conflicts — OPEN, requiring Maya's decision ({len(_conflicts)})\n")
    out.append("> These are conflicts this reconciliation **deliberately did not resolve**.\n"
               "> REB-3 and CLAUDE.md §E require stopping and reporting when a compliance\n"
               "> requirement is unclear or conflicting, rather than silently picking one reading.\n")
    for c in _conflicts:
        out.append(f"\n### {c['id']}\n")
        out.append(f"**Ledger disposition:** `{c['ledger_disposition']}` — {c['ledger_vs_policy']}  ")
        out.append(f"\n**Status:** {c['status']}  \n**Raised by:** {c['raised_by']}\n")
        out.append("\n| aspect | statement |\n|---|---|")
        for k, lab in [("current_code_behavior", "current code behavior"),
                       ("recovered_plan_behavior", "recovered-plan behavior"),
                       ("affected_scope", "affected scope"),
                       ("not_currently_proven", "not currently proven"),
                       ("temporary_operational_rule", "temporary operational rule"),
                       ("decision_gate", "decision gate")]:
            out.append(f"| **{lab}** | {str(c[k]).replace('|', chr(92)+'|')} |")
        out.append("\n**Supporting facts verified (read-only, at `04db1b99`):**\n")
        for f in c["supporting_facts_verified_read_only_at_04db1b99"]:
            out.append(f"- {f}")
        out.append(f"\n**Obligation on the canonical plan.** {c['canonical_plan_obligation']}\n")
        out.append("\n**Actions deliberately not taken:**\n")
        for f in c["actions_deliberately_not_taken"]:
            out.append(f"- {f}")

out.append(f"\n## Excluded sections ({len(EXCLUDED)})\n")
out.append("Headings carrying no requirement. Recorded, never silently omitted.\n")
out.append("| heading | source | reason |\n|---|---|---|")
for h, s, why in EXCLUDED:
    out.append(f"| {esc(h)} | `{s}` | `{why}` |")

io.open(os.path.join(WT, "docs", "architecture", "MALLAN-PLATFORM-RECONCILIATION-LEDGER.md"),
        "w", encoding="utf-8").write("\n".join(out) + "\n")
print(json.dumps(report, indent=2)[:1800])
