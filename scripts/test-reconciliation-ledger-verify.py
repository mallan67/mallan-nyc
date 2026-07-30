#!/usr/bin/env python3
"""Negative-test harness for `ledger:verify`.

Run:  npm run ledger:verify:test

Every case copies the whole repository's committed reconciliation artefacts into
a TEMPORARY tree, mutates one artefact there, and runs the REAL public command
(`python scripts/reconciliation-ledger-verify.py`) against that tree as a
subprocess. Nothing in the working checkout is ever mutated, and no case calls a
verifier helper directly — a test that re-invoked the same helper the same way
would prove only that the helper is self-consistent, not that the shipped
command rejects bad input.

Contract under test: every REQUIRED structure fails closed. The three findings
that produced this harness (deleted metadata, deleted validation metric,
fabricated additions summary) all passed verification because required state was
guarded by `if present:` and skipped itself when absent.

Exit codes: 0 = every case behaved as required, 1 = at least one case did not.
"""

import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parent.parent
ARCH_REL = os.path.join("docs", "architecture")
VERIFY_REL = os.path.join("scripts", "reconciliation-ledger-verify.py")

RESOLUTIONS = "RECONCILIATION-RESOLUTIONS.json"
VALIDATION = "RECONCILIATION-LEDGER-VALIDATION.json"
LEDGER = "MALLAN-PLATFORM-RECONCILIATION-LEDGER.md"
BASELINE = "RECONCILIATION-LEDGER-BASELINE-605.json"
PLAN = "MALLAN-PLATFORM-PLAN.md"

results = []


def _stage():
    """Copy the artefacts + scripts into a fresh temp tree."""
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="ledger-verify-test-"))
    (tmp / ARCH_REL).mkdir(parents=True)
    (tmp / "scripts").mkdir(parents=True)
    for name in (RESOLUTIONS, VALIDATION, LEDGER, BASELINE, PLAN):
        shutil.copy2(REPO / ARCH_REL / name, tmp / ARCH_REL / name)
    for name in ("reconciliation-ledger-verify.py", "reconciliation_ledger_contract.py"):
        shutil.copy2(REPO / "scripts" / name, tmp / "scripts" / name)
    return tmp


def _read(tmp, name):
    p = tmp / ARCH_REL / name
    return json.load(io.open(p, encoding="utf-8")) if name.endswith(".json") \
        else io.open(p, encoding="utf-8").read()


def _write(tmp, name, data):
    p = tmp / ARCH_REL / name
    if name.endswith(".json"):
        io.open(p, "w", encoding="utf-8").write(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        io.open(p, "w", encoding="utf-8").write(data)


def run_case(label, mutate, expect_nonzero=True):
    tmp = _stage()
    try:
        if mutate is not None:
            mutate(tmp)
        r = subprocess.run([sys.executable, str(tmp / VERIFY_REL)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        ok = (r.returncode != 0) if expect_nonzero else (r.returncode == 0)
        results.append((label, r.returncode, ok))
        print("  %-4s %-52s exit=%s" % ("OK" if ok else "FAIL", label, r.returncode))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ── positive control ──────────────────────────────────────────────────────
run_case("POSITIVE: unmodified artefacts", None, expect_nonzero=False)

# ── required reconciliation metadata ──────────────────────────────────────
def _drop_meta(key):
    def f(tmp):
        d = _read(tmp, RESOLUTIONS); d.pop(key, None); _write(tmp, RESOLUTIONS, d)
    return f


run_case("missing _identifier_retirement_map", _drop_meta("_identifier_retirement_map"))
run_case("missing _flagged_conflicts", _drop_meta("_flagged_conflicts"))
run_case("missing deferred-workstream metadata",
         _drop_meta("_deferred_capability_governance_workstream"))


def _null_meta(tmp):
    d = _read(tmp, RESOLUTIONS); d["_flagged_conflicts"] = None; _write(tmp, RESOLUTIONS, d)


run_case("required metadata set to null", _null_meta)


def _drop_retirement_entry(tmp):
    d = _read(tmp, RESOLUTIONS)
    d["_identifier_retirement_map"]["entries"] = d["_identifier_retirement_map"]["entries"][1:]
    _write(tmp, RESOLUTIONS, d)


def _drop_conflict_entry(tmp):
    d = _read(tmp, RESOLUTIONS); d["_flagged_conflicts"] = d["_flagged_conflicts"][1:]
    _write(tmp, RESOLUTIONS, d)


def _add_unrendered_entry(tmp):
    d = _read(tmp, RESOLUTIONS)
    d["_identifier_retirement_map"]["entries"].append({
        "old_identifier": "GHOST-1", "old_meaning": "never rendered",
        "new_canonical_identifier": "GHOST-2", "new_meaning": "never rendered",
        "retirement_reason": "never rendered", "source_commit": "deadbeef",
        "replacement_destination": "nowhere"})
    _write(tmp, RESOLUTIONS, d)


def _undeclared_meta(tmp):
    d = _read(tmp, RESOLUTIONS); d["_totally_new_structure"] = {"x": 1}
    _write(tmp, RESOLUTIONS, d)


run_case("retirement entry removed", _drop_retirement_entry)
run_case("conflict entry removed", _drop_conflict_entry)
run_case("unrendered metadata entry added", _add_unrendered_entry)
run_case("undeclared metadata structure added", _undeclared_meta)

# ── validation artefact schema ────────────────────────────────────────────
def _drop_metric(key):
    def f(tmp):
        d = _read(tmp, VALIDATION); d.pop(key, None); _write(tmp, VALIDATION, d)
    return f


for _m in ("by_source", "by_family_top", "blank_source_sections",
           "rows_added_after_baseline", "by_disposition", "duplicate_ids",
           "recovered_heading_ids"):
    run_case("missing validation metric: %s" % _m, _drop_metric(_m))


def _wrong_type(tmp):
    d = _read(tmp, VALIDATION); d["by_source"] = "not-a-dict"; _write(tmp, VALIDATION, d)


def _fabricate_count(tmp):
    d = _read(tmp, VALIDATION)
    k = sorted(d["by_source"])[0]; d["by_source"][k] = 99999
    _write(tmp, VALIDATION, d)


def _category_shift(tmp):
    d = _read(tmp, VALIDATION)
    bd = d["by_disposition"]
    a, b = "combined", "retained"
    if a in bd and b in bd:
        bd[a] -= 1; bd[b] += 1
    _write(tmp, VALIDATION, d)


def _extra_metric(tmp):
    d = _read(tmp, VALIDATION); d["fabricated_metric"] = 1; _write(tmp, VALIDATION, d)


run_case("validation field wrong type", _wrong_type)
run_case("fabricated by_source count", _fabricate_count)
run_case("category shift preserving total", _category_shift)
run_case("unexpected generated field", _extra_metric)

# ── generated plan blocks ─────────────────────────────────────────────────
def _plan_sub(pattern, repl, count=1):
    def f(tmp):
        s = _read(tmp, PLAN)
        s2 = re.sub(pattern, repl, s, count=count)
        assert s2 != s, "test mutation did not apply: %s" % pattern
        _write(tmp, PLAN, s2)
    return f


run_case("wrong post-baseline count",
         _plan_sub(r"605 baseline plus \d+ later addition", "605 baseline plus 999 later addition"))
run_case("BOGUS-ADDITION injected",
         _plan_sub(r"`OPS-026`\) —", "`OPS-026`, `BOGUS-ADDITION`) —"))
run_case("missing actual addition",
         _plan_sub(r"`CONFLICT-POL-GATE34-PORTAL`, `OPS-026`\) —", "`OPS-026`) —"))
run_case("wrong deferred count",
         _plan_sub(r"\*\*\d+\*\* rows are deferred", "**1** rows are deferred"))
run_case("wrong DEFERRED-GATES count",
         _plan_sub(r"NOT decided \(\d+\):\*\*", "NOT decided (1):**"))


def _unknown_deferred(tmp):
    s = _read(tmp, PLAN)
    s2 = s.replace("`PER-4`.", "`PER-4`, `BOGUS-GATE-999`.", 1)
    assert s2 != s
    _write(tmp, PLAN, s2)


def _missing_deferred(tmp):
    s = _read(tmp, PLAN)
    s2 = s.replace("`BIZ-4`, ", "", 2)
    assert s2 != s
    _write(tmp, PLAN, s2)


run_case("unknown deferred ID added", _unknown_deferred)
run_case("actual deferred ID removed", _missing_deferred)

# ── existing protections must be preserved ────────────────────────────────
def _baseline_drop(tmp):
    d = _read(tmp, BASELINE); d["ids"] = d["ids"][:-1]; _write(tmp, BASELINE, d)


def _baseline_swap(tmp):
    d = _read(tmp, BASELINE); d["ids"][0] = "FAKE-999"; _write(tmp, BASELINE, d)


def _dup_row(tmp):
    s = _read(tmp, LEDGER)
    for line in s.splitlines():
        if line.startswith("| BIZ-0 |"):
            _write(tmp, LEDGER, s.replace(line, line + "\n" + line, 1)); return
    raise AssertionError("no BIZ-0 row found")


def _blank_requirement(tmp):
    d = _read(tmp, RESOLUTIONS); d["BIZ-0"]["reason_or_evidence"] = "changed but not rebuilt"
    _write(tmp, RESOLUTIONS, d)


def _bad_vocab(tmp):
    d = _read(tmp, RESOLUTIONS); d["BIZ-0"]["implementation_status"] = "production_prove"
    _write(tmp, RESOLUTIONS, d)


def _meta_content_drift(tmp):
    d = _read(tmp, RESOLUTIONS)
    d["_identifier_retirement_map"]["_rule"] = "fabricated rule text"
    _write(tmp, RESOLUTIONS, d)


run_case("baseline row removed", _baseline_drop)
run_case("baseline ID swapped", _baseline_swap)
run_case("duplicate requirement ID", _dup_row)
run_case("resolution field mismatch", _blank_requirement)
run_case("unknown controlled vocabulary", _bad_vocab)
run_case("metadata content mismatch", _meta_content_drift)


def _drop_rule(tmp):
    d = _read(tmp, RESOLUTIONS)
    d["_identifier_retirement_map"].pop("_rule", None)
    _write(tmp, RESOLUTIONS, d)


# An empty/absent `_rule` previously passed, because "" is a substring of every
# string, so the containment test could never fail on it.
run_case("retirement map _rule deleted", _drop_rule)

# ── report ────────────────────────────────────────────────────────────────
line = "-" * 74
print(line)
bad = [r for r in results if not r[2]]
print("ledger:verify:test — %d case(s), %d behaved as required, %d did not"
      % (len(results), len(results) - len(bad), len(bad)))
if bad:
    for label, code, _ in bad:
        print("  FAIL  %-52s exit=%s" % (label, code))
    print(line)
    sys.exit(1)
print("RESULT: PASS — the positive control passes and every negative case is rejected.")
print("All cases ran the real `ledger:verify` command against a temporary copy;")
print("the working checkout was never mutated.")
print(line)
sys.exit(0)
