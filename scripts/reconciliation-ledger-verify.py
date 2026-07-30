#!/usr/bin/env python3
"""Reconciliation ledger VERIFIER — self-contained, normal-checkout safe.

Run:  npm run ledger:verify   (or: python scripts/reconciliation-ledger-verify.py)

Validates ONLY committed artefacts:
    docs/architecture/RECONCILIATION-LEDGER-BASELINE-605.json
    docs/architecture/RECONCILIATION-RESOLUTIONS.json
    docs/architecture/MALLAN-PLATFORM-RECONCILIATION-LEDGER.md
    docs/architecture/RECONCILIATION-LEDGER-VALIDATION.json
    docs/architecture/MALLAN-PLATFORM-PLAN.md   (generated blocks only)

It requires NO extra branches, NO historical objects and NO network — it does
NOT need 6e8ea2d9, f51848b0 or 7c15b1d5. Verifying that the committed
reconciliation is internally consistent must not depend on commits a clean or
shallow checkout will not have.

    ledger:verify   normal-checkout validation of the committed reconciliation
    ledger:rebuild  MAINTAINER-ONLY regeneration from historical source refs

FAIL-CLOSED BY CONSTRUCTION
---------------------------
Every REQUIRED structure is checked unconditionally. There is no
`if key in artefact: compare(...)` for required data anywhere in this file —
that pattern is what let three separate deletions pass verification. Absence of
required state is a FAILURE, not a skipped check. Structures that are genuinely
optional are named in the contract's OPTIONAL_METADATA, so "optional" is a
recorded decision rather than an inference from absence.

All vocabularies, schemas and rendering live in
`scripts/reconciliation_ledger_contract.py`, shared with the generator, so the
two cannot drift apart.

WHAT THIS PROVES: the committed artefacts agree with each other; the frozen
605-row baseline is intact by count AND digest; the ledger is structurally
clean; every recomputable validation metric matches the ledger; the required
metadata is present and rendered; and both generated plan blocks are
byte-equal (normalized) to what the contract renders from the ledger.

WHAT IT DOES NOT PROVE: that any disposition is CORRECT, nor that the four
SOURCE-DERIVED metrics are accurate — those are derived from the historical
planning commits, which a clean checkout does not have, so they are checked for
presence and type only. That limitation is stated, not hidden.

Exit codes: 0 = pass, 1 = one or more checks failed.
"""

import hashlib
import io
import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import reconciliation_ledger_contract as C  # noqa: E402

WT = str(pathlib.Path(__file__).resolve().parent.parent)
ARCH = os.path.join(WT, "docs", "architecture")

failures = []
checks = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok), detail))
    if not ok:
        failures.append(name)


def load(path):
    full = os.path.join(ARCH, path)
    if not os.path.exists(full):
        check("artefact present: " + path, False, "file is missing")
        return None
    check("artefact present: " + path, True)
    if path.endswith(".json"):
        try:
            return json.load(io.open(full, encoding="utf-8"))
        except Exception as err:                                  # noqa: BLE001
            check("artefact parses: " + path, False, str(err)[:120])
            return None
    return io.open(full, encoding="utf-8").read()


baseline = load("RECONCILIATION-LEDGER-BASELINE-605.json")
resolutions = load("RECONCILIATION-RESOLUTIONS.json")
ledger_md = load("MALLAN-PLATFORM-RECONCILIATION-LEDGER.md")
validation = load("RECONCILIATION-LEDGER-VALIDATION.json")
plan_md = load("MALLAN-PLATFORM-PLAN.md")

if failures:
    print("ledger:verify — required artefacts are missing or unreadable:")
    for f in failures:
        print("  FAIL  " + f)
    sys.exit(1)

# ── baseline integrity, pinned in code ────────────────────────────────────
ids = baseline.get("ids")
check("baseline `ids` is a list", isinstance(ids, list), type(ids).__name__)
if not isinstance(ids, list):
    print("ledger:verify — baseline is unusable"); sys.exit(1)
digest = hashlib.sha256("\n".join(sorted(ids)).encode("utf-8")).hexdigest()
check("baseline count == %d" % C.BASELINE_COUNT,
      len(ids) == C.BASELINE_COUNT and baseline.get("_count") == C.BASELINE_COUNT,
      "ids=%d _count=%r" % (len(ids), baseline.get("_count")))
check("baseline ID digest matches the pinned value", digest == C.BASELINE_SHA256,
      "actual %s" % digest)

# ── ledger table ──────────────────────────────────────────────────────────
rows = C.parse_ledger_rows(ledger_md)
by_id = {r["id"]: r for r in rows}
check("ledger rows parsed", len(rows) > 0, "parsed %d" % len(rows))
computed = C.compute_validation(rows, ids)

check("duplicate IDs == 0", not computed["duplicate_ids"],
      ", ".join(computed["duplicate_ids"][:8]))
check("blank requirements == 0", not computed["blank_requirement_text"],
      ", ".join(computed["blank_requirement_text"][:8]))
check("malformed rows == 0", not computed["malformed_rows"],
      ", ".join(computed["malformed_rows"][:8]))
check("unresolved rows == 0", computed["unresolved_rows"] == 0,
      "%d" % computed["unresolved_rows"])

for field, allowed in C.VOCABULARIES.items():
    bad = sorted({r[field] for r in rows} - allowed)
    check("all %s values use the declared vocabulary" % field, not bad, ", ".join(bad[:8]))

check("baseline present == %d" % C.BASELINE_COUNT,
      computed["baseline_605_present"] == C.BASELINE_COUNT,
      "%d" % computed["baseline_605_present"])
check("baseline missing == 0", not computed["baseline_605_missing"],
      ", ".join(computed["baseline_605_missing"][:8]))
check("baseline regressed == 0", not computed["baseline_605_regressed_to_unresolved"],
      ", ".join(computed["baseline_605_regressed_to_unresolved"][:8]))

# ── resolutions <-> ledger, every controlled field ────────────────────────
res_ids = {k for k in resolutions if not str(k).startswith("_")}
check("every resolution names a ledger row", not sorted(res_ids - set(by_id)),
      ", ".join(sorted(res_ids - set(by_id))[:8]))
check("every ledger row has a resolution", not sorted(set(by_id) - res_ids),
      ", ".join(sorted(set(by_id) - res_ids)[:8]))
mismatched = []
for k in sorted(res_ids & set(by_id)):
    for f in C.RESOLUTION_FIELDS:
        if C.normalize(resolutions[k].get(f, "")) != C.normalize(by_id[k].get(f, "")):
            mismatched.append("%s.%s" % (k, f))
check("every resolution field agrees with the ledger", not mismatched,
      "%d mismatch(es): %s" % (len(mismatched), ", ".join(mismatched[:6])))

# ── REQUIRED metadata — presence, type, and rendering. Unconditional. ─────
norm_ledger = C.normalize(ledger_md)
for key, expected_type in C.REQUIRED_METADATA.items():
    present = key in resolutions and resolutions[key] is not None
    check("required metadata present: %s" % key, present,
          "missing or null — required structures may not be absent")
    if not present:
        continue
    check("required metadata type: %s is %s" % (key, expected_type.__name__),
          isinstance(resolutions[key], expected_type),
          "got %s" % type(resolutions[key]).__name__)

_ret = resolutions.get("_identifier_retirement_map")
if isinstance(_ret, dict):
    entries = _ret.get("entries")
    check("_identifier_retirement_map.entries is a non-empty list",
          isinstance(entries, list) and len(entries) > 0,
          "got %r" % type(entries).__name__)
    unrendered = []
    # `_rule` must be PRESENT and non-empty before the containment test. An
    # empty string is a substring of everything, so defaulting to "" would make
    # a deleted `_rule` pass — the same fail-open shape this rewrite removes.
    _rule = _ret.get("_rule")
    check("_identifier_retirement_map._rule is present and non-empty",
          isinstance(_rule, str) and _rule.strip() != "", "got %r" % (_rule,))
    if isinstance(_rule, str) and _rule.strip() and C.normalize(_rule) not in norm_ledger:
        unrendered.append("_rule")
    for e in (entries or []):
        for f in C.RETIREMENT_ENTRY_FIELDS:
            if f not in e:
                unrendered.append("%s.%s(absent)" % (e.get("old_identifier"), f))
            elif C.normalize(e[f]) not in norm_ledger:
                unrendered.append("%s.%s" % (e.get("old_identifier"), f))
    check("retirement map is fully rendered in the ledger", not unrendered,
          "%d not rendered: %s" % (len(unrendered), ", ".join(unrendered[:6])))
    rendered_old = set()
    for e in (entries or []):
        if e.get("old_identifier"):
            rendered_old.add(e["old_identifier"])
    check("retirement map has at least the BUS-5/6/7 reassignments",
          {"BUS-5", "BUS-6", "BUS-7"} <= rendered_old,
          "have %s" % sorted(rendered_old))

_conf = resolutions.get("_flagged_conflicts")
if isinstance(_conf, list):
    check("_flagged_conflicts is non-empty", len(_conf) > 0)
    cmiss = []
    for c1 in _conf:
        for f in C.CONFLICT_ENTRY_FIELDS:
            if f not in c1:
                cmiss.append("%s.%s(absent)" % (c1.get("id"), f))
            elif C.normalize(c1[f]) not in norm_ledger:
                cmiss.append("%s.%s" % (c1.get("id"), f))
    check("flagged conflicts are fully rendered in the ledger", not cmiss,
          "%d not rendered: %s" % (len(cmiss), ", ".join(cmiss[:6])))

# Unknown metadata keys must be declared, so a new structure cannot appear
# unnoticed and unvalidated.
declared = set(C.REQUIRED_METADATA) | set(C.OPTIONAL_METADATA)
undeclared = sorted(k for k in resolutions if str(k).startswith("_") and k not in declared)
check("no undeclared metadata structures", not undeclared, ", ".join(undeclared))

# ── validation artefact: exact schema + full recomputation ────────────────
missing_keys = sorted(k for k in C.VALIDATION_SCHEMA if k not in validation)
extra_keys = sorted(k for k in validation if k not in C.VALIDATION_SCHEMA)
check("validation artefact has every required key", not missing_keys,
      "missing: " + ", ".join(missing_keys))
check("validation artefact has no undeclared keys", not extra_keys,
      "unexpected: " + ", ".join(extra_keys))

bad_types = []
for k, (typ, _rec) in C.VALIDATION_SCHEMA.items():
    if k in validation and not isinstance(validation[k], typ):
        bad_types.append("%s expected %s got %s" % (k, typ.__name__, type(validation[k]).__name__))
check("validation artefact field types are correct", not bad_types, "; ".join(bad_types[:4]))

diffs = []
for k, expected in computed.items():
    if k not in validation:
        continue  # already reported as a missing required key above
    got = validation[k]
    if isinstance(expected, list):
        same = sorted(got) == sorted(expected)
    else:
        same = got == expected
    if not same:
        diffs.append("%s: committed=%r recomputed=%r" % (k, got, expected))
check("every recomputable validation metric matches the ledger", not diffs,
      "%d differ: %s" % (len(diffs), " | ".join(diffs[:3])))

# ── generated plan blocks: exact re-render comparison ─────────────────────
for name, expected_block in (("LEDGER-TOTALS", C.render_totals_block(rows, ids)),
                             ("DEFERRED-GATES", C.render_deferred_block(rows))):
    got_block = C.extract_block(plan_md, name)
    check("plan contains GENERATED:%s" % name, got_block is not None)
    if got_block is None:
        continue
    check("GENERATED:%s matches the contract rendering exactly" % name,
          C.normalize(got_block) == C.normalize(expected_block),
          "committed and re-rendered text differ")

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
print("PROVES        : committed artefacts agree with each other; the frozen 605-row")
print("                baseline is intact by count AND digest; the ledger is structurally")
print("                clean; every recomputable validation metric matches the ledger;")
print("                required metadata is present and fully rendered; and both")
print("                generated plan blocks are identical to the contract's rendering.")
print("DOES NOT PROVE: that any disposition is CORRECT. Nor that these %d source-derived"
      % len(C.SOURCE_DERIVED_METRICS))
print("                metrics are accurate — %s —"
      % ", ".join(sorted(C.SOURCE_DERIVED_METRICS)))
print("                they derive from the historical planning commits, which a clean")
print("                checkout does not have, so only presence and type are checked.")
print("                Re-deriving them is `ledger:rebuild`, which is maintainer-only.")
print(line)
sys.exit(0)
