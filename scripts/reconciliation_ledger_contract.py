#!/usr/bin/env python3
"""Shared reconciliation contract — ONE definition of every generated structure.

Imported by BOTH:
    scripts/reconciliation-ledger.py         (ledger:rebuild, maintainer-only)
    scripts/reconciliation-ledger-verify.py  (ledger:verify, clean-checkout safe)

WHY THIS MODULE EXISTS
----------------------
Three review findings in a row shared one root shape: the verifier treated
REQUIRED generated state as OPTIONAL, and validated hand-picked fragments
instead of one complete deterministic contract. Deleting
`_identifier_retirement_map`, deleting `by_source`, or fabricating the
post-baseline additions summary all passed, because each check was guarded by
`if key in ...` / `if object:` and skipped itself when the thing it guarded
disappeared.

Patching those three lines would have left the class intact. Instead the
vocabularies, the required metadata keys, the validation schema, the
recomputation of every metric, and the exact rendering of both generated plan
blocks now live HERE, once. The generator renders from this module; the
verifier re-renders from this module and compares. Neither can drift from the
other, because there is no second definition to drift from.

CONSTRAINTS (deliberate)
------------------------
This module must NEVER: read the historical planning commits, touch the
network, require the archival tags, write repository files, or depend on
production data. It is pure functions over already-committed artefacts, so
`ledger:verify` stays runnable from a normal clean checkout.
`ledger:rebuild` may still require the protected archival tags — but only for
SOURCE EXTRACTION, never for anything defined here.
"""

import collections
import re

# ── controlled vocabularies ───────────────────────────────────────────────
DISPOSITIONS = {"retained", "combined", "corrected", "historical_only",
                "deferred_with_gate", "rejected_with_reason", "unresolved"}
MATURITIES = {"decided", "derived", "open", "unassessed"}
IMPLEMENTATION_STATUSES = {"not_started", "planned", "schema_only",
                           "partially_implemented", "implemented", "integrated",
                           "limited_release", "production_proven", "retiring",
                           "retired", "unassessed"}
VERIFICATION_STATUSES = {"inventory_only", "source_read", "code_verified",
                         "live_probe_verified"}

VOCABULARIES = {
    "disposition": DISPOSITIONS,
    "maturity": MATURITIES,
    "implementation_status": IMPLEMENTATION_STATUSES,
    "verification_status": VERIFICATION_STATUSES,
}

# Fields a resolution controls, and which the ledger table must echo exactly.
RESOLUTION_FIELDS = ("canonical_destination", "disposition", "reason_or_evidence",
                     "dependency", "maturity", "implementation_status",
                     "verification_status")

# ── frozen baseline pin ───────────────────────────────────────────────────
BASELINE_COUNT = 605
BASELINE_SHA256 = "69cf9edf1b0dfcac1e7baebb0cb4d94cb32d4dfef4d25b4f0e2b933bac220092"

# ── required metadata in RECONCILIATION-RESOLUTIONS.json ──────────────────
# REQUIRED means: must exist, must be the declared type, must not be null.
# Absence is a FAILURE, never a skipped check.
REQUIRED_METADATA = {
    "_identifier_retirement_map": dict,
    "_flagged_conflicts": list,
    "_deferred_capability_governance_workstream": dict,
}
# Genuinely optional / informational. Listed EXPLICITLY rather than inferred
# from absence, so "optional" is a decision on the record and not an accident.
OPTIONAL_METADATA = {
    "_README": list,
    "_batches_resolved": list,
    "_verification_baseline": str,
}
# Nested fields that must be present on each entry, and which must also appear
# in the ledger's rendered section.
RETIREMENT_ENTRY_FIELDS = ("old_identifier", "old_meaning", "new_canonical_identifier",
                           "new_meaning", "retirement_reason", "source_commit",
                           "replacement_destination")
CONFLICT_ENTRY_FIELDS = ("id", "current_code_behavior", "recovered_plan_behavior",
                         "affected_scope", "not_currently_proven",
                         "temporary_operational_rule", "decision_gate")

# ── RECONCILIATION-LEDGER-VALIDATION.json schema ──────────────────────────
# Taken from generator truth: exactly the keys `reconciliation-ledger.py`
# writes. `recomputable=False` marks the four metrics derived from the
# HISTORICAL PLANNING SOURCES, which a clean checkout cannot re-derive — those
# are checked for presence and type only, and that limitation is stated rather
# than silently skipped.
VALIDATION_SCHEMA = {
    "total_rows":                           (int,  True),
    "by_source":                            (dict, True),
    "by_family_top":                        (dict, True),
    "duplicate_ids":                        (list, True),
    "blank_requirement_text":               (list, True),
    "blank_source_sections":                (list, True),
    "malformed_rows":                       (list, True),
    "unrepresented_recovered_ids":          (list, False),
    "recovered_heading_ids":                (int,  False),
    "recovered_ids_referenced_anywhere":    (int,  False),
    "excluded_sections":                    (int,  False),
    "resolved_rows":                        (int,  True),
    "unresolved_rows":                      (int,  True),
    "baseline_605_present":                 (int,  True),
    "baseline_605_missing":                 (list, True),
    "baseline_605_regressed_to_unresolved": (list, True),
    "rows_added_after_baseline":            (list, True),
    "by_disposition":                       (dict, True),
    "by_implementation_status":             (dict, True),
    "by_verification_status":               (dict, True),
}
SOURCE_DERIVED_METRICS = {k for k, (_t, rec) in VALIDATION_SCHEMA.items() if not rec}


# ── helpers ───────────────────────────────────────────────────────────────
def normalize(value):
    """Collapse whitespace and unescape table pipes for text comparison."""
    return " ".join(str(value).replace("\\|", "|").split())


def parse_ledger_rows(ledger_md):
    """Parse the committed ledger table.

    Splits on UNESCAPED pipes only. A naive split("|") breaks any row whose
    text contains an escaped pipe — ACT-1 yielded 20 columns instead of 13 —
    and every field after `reason_or_evidence` was then read from the wrong
    cell, so checks silently compared garbage instead of validating.
    """
    rows = []
    for line in ledger_md.splitlines():
        if not line.startswith("| "):
            continue
        c = [x.strip() for x in re.split(r"(?<!\\)\|", line)]
        if len(c) < 13 or c[1] in ("requirement_id",) or c[1].startswith("---"):
            continue
        rows.append({
            "id": c[1], "source": c[2], "source_commit_or_pr": c[3],
            "source_section": c[4], "requirement": c[5],
            "canonical_destination": c[6], "disposition": c[7],
            "reason_or_evidence": c[8], "dependency": c[9], "maturity": c[10],
            "implementation_status": c[11], "verification_status": c[12],
        })
    return rows


def family_of(requirement_id):
    m = re.match(r"^([A-Za-z0-9]+)", requirement_id)
    return m.group(1) if m else requirement_id


def compute_validation(rows, baseline_ids):
    """Recompute every RECOMPUTABLE validation metric from committed data.

    Returns only the recomputable subset; source-derived metrics are excluded
    by construction so a caller cannot accidentally treat them as verified.
    """
    by_id = {r["id"]: r for r in rows}
    ids = [r["id"] for r in rows]
    counts = collections.Counter(ids)
    dupes = sorted({i for i in ids if counts[i] > 1})
    by_family = collections.Counter(family_of(i) for i in ids)
    missing = [i for i in baseline_ids if i not in by_id]
    regressed = [i for i in baseline_ids
                 if i in by_id and by_id[i]["disposition"] == "unresolved"]
    unresolved = [r["id"] for r in rows if r["disposition"] == "unresolved"]
    return {
        "total_rows": len(rows),
        "by_source": dict(sorted(collections.Counter(r["source"] for r in rows).items())),
        "by_family_top": dict(sorted(by_family.items(), key=lambda kv: -kv[1])[:40]),
        "duplicate_ids": dupes,
        "blank_requirement_text": [r["id"] for r in rows if not r["requirement"].strip()],
        "blank_source_sections": [r["id"] for r in rows if not r["source_section"].strip()],
        "malformed_rows": [r["id"] for r in rows
                           if any(not str(r[k]).strip() for k in r)],
        "resolved_rows": len(rows) - len(unresolved),
        "unresolved_rows": len(unresolved),
        "baseline_605_present": len(baseline_ids) - len(missing),
        "baseline_605_missing": missing,
        "baseline_605_regressed_to_unresolved": regressed,
        "rows_added_after_baseline": sorted(set(by_id) - set(baseline_ids)),
        "by_disposition": dict(sorted(
            collections.Counter(r["disposition"] for r in rows).items(),
            key=lambda kv: -kv[1])),
        "by_implementation_status": dict(sorted(
            collections.Counter(r["implementation_status"] for r in rows).items(),
            key=lambda kv: -kv[1])),
        "by_verification_status": dict(sorted(
            collections.Counter(r["verification_status"] for r in rows).items(),
            key=lambda kv: -kv[1])),
    }


def deferred_ids(rows):
    return sorted(r["id"] for r in rows if r["disposition"] == "deferred_with_gate")


# ── deterministic rendering of the two generated plan blocks ──────────────
# The generator writes these; the verifier re-renders and compares the exact
# normalized text. Previously the verifier asserted a handful of independently
# chosen regexes, so a fabricated additions summary passed as long as one
# unrelated phrase survived.
NL = chr(10)


def render_totals_block(rows, baseline_ids):
    v = compute_validation(rows, baseline_ids)
    added = v["rows_added_after_baseline"]
    dfr = deferred_ids(rows)
    plural = "s" if len(added) != 1 else ""
    lines = [
        "<!-- GENERATED:LEDGER-TOTALS — do not hand-edit; rewritten by the ledger generator -->",
        "**Ledger totals (generated):** {} rows — {} baseline plus {} later addition{}".format(
            v["total_rows"], len(baseline_ids), len(added), plural),
        "({}) —".format(", ".join("`{}`".format(i) for i in added)),
        "{} with a reasoned disposition, **{} unresolved**. Baseline integrity:".format(
            v["resolved_rows"], v["unresolved_rows"]),
        "{} present / {} missing / {} regressed.".format(
            v["baseline_605_present"], len(v["baseline_605_missing"]),
            len(v["baseline_605_regressed_to_unresolved"])),
        "",
        "> **A `deferred_with_gate` row is accounted for in the ledger. It is *not* a",
        "> settled product or policy decision.** **{}** rows are deferred:".format(len(dfr)),
        "> {}.".format(", ".join("`{}`".format(i) for i in dfr)),
        "> This plan records what is decided, what is deferred, and what is contested,",
        "> and never presents the second or third as the first.",
        "<!-- /GENERATED:LEDGER-TOTALS -->",
    ]
    return NL.join(lines)


def render_deferred_block(rows):
    dfr = deferred_ids(rows)
    lines = [
        "<!-- GENERATED:DEFERRED-GATES — do not hand-edit; rewritten by the ledger generator -->",
        "**Deferred and unresolved — accounted for in the ledger, NOT decided ({}):**".format(len(dfr)),
        "{}.".format(", ".join("`{}`".format(i) for i in dfr)),
        "<!-- /GENERATED:DEFERRED-GATES -->",
    ]
    return NL.join(lines)


BLOCK_PATTERNS = {
    "LEDGER-TOTALS": re.compile(
        r"<!-- GENERATED:LEDGER-TOTALS.*?<!-- /GENERATED:LEDGER-TOTALS -->", re.S),
    "DEFERRED-GATES": re.compile(
        r"<!-- GENERATED:DEFERRED-GATES.*?<!-- /GENERATED:DEFERRED-GATES -->", re.S),
}


def extract_block(plan_md, name):
    m = BLOCK_PATTERNS[name].search(plan_md)
    return m.group(0) if m else None
