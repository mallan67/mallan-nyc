#!/usr/bin/env python3
"""Reconciliation ledger VERIFIER — self-contained, normal-checkout safe.

Run:  npm run ledger:verify   (or: python scripts/reconciliation-ledger-verify.py)

Validates ONLY committed artefacts:
    docs/architecture/RECONCILIATION-LEDGER-BASELINE-605.json
    docs/architecture/RECONCILIATION-RESOLUTIONS.json
    docs/architecture/MALLAN-PLATFORM-RECONCILIATION-LEDGER.md
    docs/architecture/RECONCILIATION-LEDGER-VALIDATION.json
    docs/architecture/MALLAN-PLATFORM-PLAN.md   (generated blocks only)

It requires NO extra branches, NO historical objects and NO network. In
particular it does NOT need 6e8ea2d9, f51848b0 or 7c15b1d5. That is the whole
point of splitting it out of the regeneration path: verifying that the
committed reconciliation is internally consistent must not depend on commits a
clean or shallow checkout will not have.

    ledger:verify   normal-checkout validation of the committed reconciliation
    ledger:rebuild  MAINTAINER-ONLY regeneration from historical source refs

WHAT THIS PROVES: the committed artefacts agree with each other, the frozen
605-row baseline is intact by count and by digest, the ledger is structurally
clean, and the canonical plan's generated blocks match the ledger they claim to
be generated from.

WHAT IT DOES NOT PROVE: that any disposition is CORRECT. It checks internal
consistency and integrity, never judgement. Substance comes from the per-row
evidence and from review.

Exit codes: 0 = pass, 1 = one or more checks failed.
"""

import io
import json
import hashlib
import os
import pathlib
import re
import sys

WT = str(pathlib.Path(__file__).resolve().parent.parent)
ARCH = os.path.join(WT, "docs", "architecture")

BASELINE_COUNT = 605
BASELINE_SHA256 = "69cf9edf1b0dfcac1e7baebb0cb4d94cb32d4dfef4d25b4f0e2b933bac220092"

DISPOSITIONS = {"retained", "combined", "corrected", "historical_only",
                "deferred_with_gate", "rejected_with_reason", "unresolved"}

failures = []
checks = []


def check(name, ok, detail=""):
    checks.append((name, ok, detail))
    if not ok:
        failures.append("%s%s" % (name, (" — " + detail) if detail else ""))


def load(path):
    full = os.path.join(ARCH, path)
    if not os.path.exists(full):
        check("artefact present: " + path, False, "file is missing")
        return None
    check("artefact present: " + path, True)
    if path.endswith(".json"):
        return json.load(io.open(full, encoding="utf-8"))
    return io.open(full, encoding="utf-8").read()


baseline = load("RECONCILIATION-LEDGER-BASELINE-605.json")
resolutions = load("RECONCILIATION-RESOLUTIONS.json")
ledger_md = load("MALLAN-PLATFORM-RECONCILIATION-LEDGER.md")
validation = load("RECONCILIATION-LEDGER-VALIDATION.json")
plan_md = load("MALLAN-PLATFORM-PLAN.md")

if failures:
    print("ledger:verify — required artefacts are missing:")
    for f in failures:
        print("  FAIL  " + f)
    sys.exit(1)

# ── baseline integrity, pinned in code ────────────────────────────────────
ids = baseline["ids"]
digest = hashlib.sha256("\n".join(sorted(ids)).encode("utf-8")).hexdigest()
check("baseline count == %d" % BASELINE_COUNT,
      len(ids) == BASELINE_COUNT and baseline.get("_count") == BASELINE_COUNT,
      "ids=%d _count=%r" % (len(ids), baseline.get("_count")))
check("baseline ID digest matches pinned value", digest == BASELINE_SHA256,
      "actual %s" % digest)

# ── parse the committed ledger table ──────────────────────────────────────
rows = []
for line in ledger_md.splitlines():
    if not line.startswith("| "):
        continue
    # Split on UNESCAPED pipes only. A naive split("|") breaks every row whose
    # text contains an escaped pipe: ACT-1 yielded 20 columns instead of 13 and
    # every field after `reason_or_evidence` was read from the wrong cell — so
    # the earlier disposition-only check was silently comparing garbage on those
    # rows rather than validating them.
    c = [x.strip() for x in re.split(r"(?<!\\)\|", line)]
    if len(c) < 13 or c[1] in ("requirement_id",) or c[1].startswith("---"):
        continue
    rows.append({"id": c[1], "source": c[2], "section": c[4],
                 "requirement": c[5], "canonical_destination": c[6],
                 "disposition": c[7], "reason_or_evidence": c[8],
                 "dependency": c[9], "maturity": c[10],
                 "implementation_status": c[11], "verification_status": c[12]})

by_id = {r["id"]: r for r in rows}
check("ledger rows parsed", len(rows) > 0, "parsed %d" % len(rows))

# ── row-level structural checks ───────────────────────────────────────────
dupes = sorted({r["id"] for r in rows if [x["id"] for x in rows].count(r["id"]) > 1})
check("duplicate IDs == 0", not dupes, ", ".join(dupes[:8]))
blank_req = [r["id"] for r in rows if not r["requirement"]]
check("blank requirements == 0", not blank_req, ", ".join(blank_req[:8]))
malformed = [r["id"] for r in rows if not r["id"] or not r["source"] or not r["disposition"]]
check("malformed rows == 0", not malformed, ", ".join(malformed[:8]))
# Every controlled vocabulary is validated HERE, because `ledger:rebuild` — which
# also validates them — is unavailable in a normal checkout. Checking only
# `disposition` let an invalid `implementation_status` such as `production_prove`
# pass in both artefacts simultaneously.
VOCAB = {
    "disposition": DISPOSITIONS,
    "maturity": {"decided", "derived", "open", "unassessed"},
    "implementation_status": {"not_started", "planned", "schema_only",
                              "partially_implemented", "implemented", "integrated",
                              "limited_release", "production_proven", "retiring",
                              "retired", "unassessed"},
    "verification_status": {"inventory_only", "source_read", "code_verified",
                            "live_probe_verified"},
}
for _f, _allowed in VOCAB.items():
    _bad = sorted({r[_f] for r in rows} - _allowed)
    check("all %s values use the declared vocabulary" % _f, not _bad, ", ".join(_bad[:8]))
unresolved = [r["id"] for r in rows if r["disposition"] == "unresolved"]
check("unresolved rows == 0", not unresolved, ", ".join(unresolved[:8]))

total = len(rows)
check("disposition totals sum to row count", True, "%d" % total)

# ── baseline rows still present and still resolved ────────────────────────
missing = [i for i in ids if i not in by_id]
regressed = [i for i in ids if i in by_id and by_id[i]["disposition"] == "unresolved"]
check("baseline present == %d" % BASELINE_COUNT, len(ids) - len(missing) == BASELINE_COUNT,
      "missing %d" % len(missing))
check("baseline missing == 0", not missing, ", ".join(missing[:8]))
check("baseline regressed == 0", not regressed, ", ".join(regressed[:8]))

# ── ledger agrees with the resolutions file ───────────────────────────────
res_ids = {k for k in resolutions if not k.startswith("_")}
res_only = sorted(res_ids - set(by_id))
check("every resolution names a ledger row", not res_only, ", ".join(res_only[:8]))
unres_rows = sorted(set(by_id) - res_ids)
check("every ledger row has a resolution", not unres_rows, ", ".join(unres_rows[:8]))
# Compare EVERY resolution field, not just `disposition`. Checking one field let
# a stale `reason_or_evidence`, destination, dependency, maturity or status
# survive an omitted rebuild while verification still reported "the artefacts
# agree" — which is the exact drift this verifier exists to catch.
RES_FIELDS = ("canonical_destination", "disposition", "reason_or_evidence",
              "dependency", "maturity", "implementation_status", "verification_status")


def _norm(v):
    # The markdown table escapes pipes and flattens newlines; normalise both
    # sides so formatting alone never reports a false mismatch.
    return " ".join(str(v).replace("\\|", "|").split())


mismatched = []
for k in sorted(res_ids & set(by_id)):
    for f in RES_FIELDS:
        if _norm(resolutions[k].get(f, "")) != _norm(by_id[k].get(f, "")):
            mismatched.append("%s.%s" % (k, f))
check("every resolution field agrees with the ledger", not mismatched,
      "%d mismatch(es): %s" % (len(mismatched), ", ".join(mismatched[:6])))

# ── generated METADATA must agree with its rendered ledger sections ───────
# `_identifier_retirement_map` and `_flagged_conflicts` are excluded from the
# row comparison by the `_`-prefix filter, so they could be edited without a
# rebuild while the ledger kept the old rendered text. Compare them explicitly:
# retired-identifier and open-conflict evidence must not drift silently.
_ret = resolutions.get("_identifier_retirement_map")
if _ret:
    _missing_bits = []
    if _norm(_ret.get("_rule", "")) not in _norm(ledger_md):
        _missing_bits.append("_rule text")
    for _e in _ret.get("entries", []):
        for _f2 in ("old_identifier", "new_canonical_identifier", "old_meaning",
                    "new_meaning", "retirement_reason", "replacement_destination"):
            if _norm(_e.get(_f2, "")) not in _norm(ledger_md):
                _missing_bits.append("%s.%s" % (_e.get("old_identifier"), _f2))
    check("identifier retirement map matches the rendered ledger", not _missing_bits,
          "%d not rendered: %s" % (len(_missing_bits), ", ".join(_missing_bits[:6])))

_conf = resolutions.get("_flagged_conflicts")
if _conf:
    _cmiss = []
    for _c1 in _conf:
        for _f3 in ("id", "current_code_behavior", "recovered_plan_behavior",
                    "affected_scope", "temporary_operational_rule", "decision_gate"):
            if _norm(_c1.get(_f3, "")) not in _norm(ledger_md):
                _cmiss.append("%s.%s" % (_c1.get("id"), _f3))
    check("flagged conflicts match the rendered ledger", not _cmiss,
          "%d not rendered: %s" % (len(_cmiss), ", ".join(_cmiss[:6])))

# ── ledger agrees with the committed validation JSON ──────────────────────
# Recompute EVERY metric the committed validation artefact reports, rather than
# only its totals. Checking the sum alone let a row be moved between categories,
# `by_source` be fabricated, and a blank source section be invented, all while
# the sum stayed correct and verification passed.
import collections as _c
check("validation.total_rows matches the table", validation["total_rows"] == total,
      "json=%s table=%d" % (validation["total_rows"], total))
check("validation.unresolved_rows == 0", validation["unresolved_rows"] == 0)
for _key, _actual in (
        ("by_disposition", dict(_c.Counter(r["disposition"] for r in rows))),
        ("by_source", dict(_c.Counter(r["source"] for r in rows))),
        ("by_implementation_status", dict(_c.Counter(r["implementation_status"] for r in rows))),
        ("by_verification_status", dict(_c.Counter(r["verification_status"] for r in rows)))):
    if _key not in validation:
        continue
    check("validation.%s matches the ledger" % _key,
          {k: v for k, v in validation[_key].items()} == _actual,
          "json=%s recomputed=%s" % (validation[_key], _actual))
for _key, _actual in (("duplicate_ids", dupes), ("malformed_rows", malformed),
                      ("blank_requirement_text", blank_req)):
    if _key in validation:
        check("validation.%s matches the ledger" % _key,
              sorted(validation[_key]) == sorted(_actual),
              "json=%s recomputed=%s" % (validation[_key], _actual))
for _key, _actual in (("resolved_rows", total - len(unresolved)),
                      ("baseline_605_present", len(ids) - len(missing))):
    if _key in validation:
        check("validation.%s matches the ledger" % _key, validation[_key] == _actual,
              "json=%s recomputed=%s" % (validation[_key], _actual))

# ── the plan's generated blocks match the ledger ──────────────────────────
def block(name):
    m = re.search(r"<!-- GENERATED:%s.*?<!-- /GENERATED:%s -->" % (name, name),
                  plan_md, re.S)
    return m.group(0) if m else None


totals_block = block("LEDGER-TOTALS")
gates_block = block("DEFERRED-GATES")
check("plan contains GENERATED:LEDGER-TOTALS", totals_block is not None)
check("plan contains GENERATED:DEFERRED-GATES", gates_block is not None)

if totals_block:
    check("generated totals cite the committed row count",
          re.search(r"\b%d rows\b" % total, totals_block) is not None,
          "expected '%d rows'" % total)
    check("generated totals cite 0 unresolved",
          "**0 unresolved**" in totals_block)
    check("generated totals cite baseline %d present / 0 / 0" % BASELINE_COUNT,
          re.search(r"%d present / 0 missing / 0 regressed" % BASELINE_COUNT,
                    totals_block) is not None)

deferred = sorted(r["id"] for r in rows if r["disposition"] == "deferred_with_gate")

# BOTH generated blocks carry the deferred set, so BOTH are validated. Checking
# only DEFERRED-GATES let the LEDGER-TOTALS header drift back out of step with
# §18 and the ledger — the same stale-summary defect, one block over.
for _name, _blk in (("LEDGER-TOTALS", totals_block), ("DEFERRED-GATES", gates_block)):
    if not _blk:
        continue
    # Scope extraction to the DEFERRED sentence. The LEDGER-TOTALS block also
    # names the post-baseline additions in backticks, and those are not deferred
    # rows — pulling every backticked token from the whole block reported OPS-026
    # as a spurious extra.
    _stop = chr(10) + r">\s*This plan|" + chr(10) + "<!--"
    _m = re.search(r"rows are deferred:(.*?)(?:" + _stop + ")", _blk, re.S)
    _scope = _m.group(1) if _m else _blk
    # Compare the COMPLETE extracted set. Filtering through `if i in by_id`
    # discarded exactly the unknown extras the equality check exists to reject,
    # so the plan could advertise a nonexistent deferred gate and still pass.
    listed = set(re.findall(r"`([A-Za-z0-9._-]+)`", _scope))
    check("%s deferred list matches the ledger" % _name, listed == set(deferred),
          "missing=%s extra=%s" % (sorted(set(deferred) - listed), sorted(listed - set(deferred))))
    check("%s deferred count matches" % _name,
          re.search(r"\*\*%d\*\* rows are deferred|NOT decided \(%d\)"
                    % (len(deferred), len(deferred)), _blk) is not None,
          "expected %d" % len(deferred))

# ── report ────────────────────────────────────────────────────────────────
line = "-" * 74
print(line)
print("ledger:verify — self-contained validation of the committed reconciliation")
print(line)
for name, ok, detail in checks:
    print("  %-4s %s%s" % ("OK" if ok else "FAIL", name,
                           ("  [%s]" % detail) if (detail and not ok) else ""))
print(line)
if failures:
    print("RESULT: FAIL — %d check(s) failed" % len(failures))
    print(line)
    sys.exit(1)
print("RESULT: PASS")
print("")
print("PROVES        : the committed artefacts agree with each other; the frozen 605-row")
print("                baseline is intact by count AND digest; the ledger is structurally")
print("                clean; and the plan's generated blocks match the ledger.")
print("DOES NOT PROVE: that any disposition is CORRECT. This checks internal consistency")
print("                and integrity, never judgement. Substance comes from the per-row")
print("                evidence and from review.")
print("                It also does not re-derive the ledger from its sources — that is")
print("                `ledger:rebuild`, which is maintainer-only.")
print(line)
sys.exit(0)
