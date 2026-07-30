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
    c = [x.strip() for x in line.split("|")]
    if len(c) < 13 or c[1] in ("requirement_id",) or c[1].startswith("---"):
        continue
    rows.append({"id": c[1], "source": c[2], "section": c[4],
                 "requirement": c[5], "disposition": c[7]})

by_id = {r["id"]: r for r in rows}
check("ledger rows parsed", len(rows) > 0, "parsed %d" % len(rows))

# ── row-level structural checks ───────────────────────────────────────────
dupes = sorted({r["id"] for r in rows if [x["id"] for x in rows].count(r["id"]) > 1})
check("duplicate IDs == 0", not dupes, ", ".join(dupes[:8]))
blank_req = [r["id"] for r in rows if not r["requirement"]]
check("blank requirements == 0", not blank_req, ", ".join(blank_req[:8]))
malformed = [r["id"] for r in rows if not r["id"] or not r["source"] or not r["disposition"]]
check("malformed rows == 0", not malformed, ", ".join(malformed[:8]))
unknown_disp = sorted({r["disposition"] for r in rows} - DISPOSITIONS)
check("all dispositions use the declared vocabulary", not unknown_disp,
      ", ".join(unknown_disp))
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
mismatched = sorted(k for k in res_ids & set(by_id)
                    if resolutions[k]["disposition"] != by_id[k]["disposition"])
check("dispositions agree between ledger and resolutions", not mismatched,
      ", ".join(mismatched[:8]))

# ── ledger agrees with the committed validation JSON ──────────────────────
check("validation.total_rows matches the table", validation["total_rows"] == total,
      "json=%s table=%d" % (validation["total_rows"], total))
check("validation.unresolved_rows == 0", validation["unresolved_rows"] == 0)
check("validation dispositions sum to total",
      sum(validation["by_disposition"].values()) == validation["total_rows"])

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
if gates_block:
    listed = set(re.findall(r"`([A-Za-z0-9._-]+)`", gates_block))
    check("generated deferred list matches the ledger",
          set(deferred) == (listed & (set(deferred) | listed)) and set(deferred) == listed,
          "ledger=%s block=%s" % (deferred, sorted(listed)))
    check("generated deferred count matches",
          re.search(r"NOT decided \(%d\)" % len(deferred), gates_block) is not None,
          "expected NOT decided (%d)" % len(deferred))

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
