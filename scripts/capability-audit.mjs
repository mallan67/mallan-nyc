#!/usr/bin/env node
/**
 * capability-audit — machine enforcement of the master plan's §24 acceptance
 * criteria and §8.3 maturity statuses.
 *
 * Authority : docs/architecture/MALLAN-PLATFORM-PLAN.md §16 (capability maturity),
 *             which incorporates correction C-5. Mallan_Intelligence_Master_Plan.md is
 *             NOT normative and is not present in this repository; per DOC-1 only the
 *             canonical plan establishes platform-wide contracts.
 * Registry  : config/capabilities.mjs  (data only — no side effects)
 * Run       : npm run capability:audit
 *
 * WHAT THIS VALIDATOR PROVES
 *   - every registry entry is structurally complete;
 *   - every promoted status points to a COMPLETE structured evidence record
 *     naming a real command, exit code, target commit, and proof boundary;
 *   - no capability claims a status it has not earned;
 *   - every declared path for a promoted capability actually exists;
 *   - programs use the program vocabulary and capabilities use the maturity
 *     vocabulary — the two can no longer be confused;
 *   - blocked capabilities reference a real ratified correction;
 *   - the registry states its own coverage honestly.
 *
 * WHAT THIS VALIDATOR DOES NOT PROVE
 *   - that any listed test actually passes. It does NOT rerun tests. It enforces
 *     that a promoted status POINTS TO a complete evidence record; it cannot
 *     confirm that record is truthful.
 *   - that any capability works in production;
 *   - that the registry is a complete inventory of the platform;
 *   - that any capability is production-ready. PRODUCTION MATURITY REQUIRES
 *     PRODUCTION EVIDENCE (OPS-4): a passing structural audit is not, and can
 *     never be, a substitute for an observed production probe.
 *
 * Report both halves when citing a green run. Green means "the registry is
 * internally honest and every promotion is backed by a complete evidence
 * record," not "the platform works."
 *
 * Exit codes: 0 = pass, 1 = one or more violations, 2 = validator error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

/** Corrections ratified in master plan §26. `blockedBy` must reference one. */
const RATIFIED_CORRECTIONS = new Set(['C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-7']);

/** Fields required on every capability, even if `unverified`. */
const REQUIRED_FIELDS = [
  'id',
  'name',
  'program',
  'planRef',
  'owner',
  'status',
  'canonicalFiles',
  'tests',
  'observability',
  'rollback',
];

/** Placeholder text that must never satisfy an evidence field. */
const PLACEHOLDERS = new Set([
  '',
  'unverified',
  'none',
  'n/a',
  'na',
  'tbd',
  'todo',
  'pending',
  'unknown',
  '-',
]);

function hasEvidence(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return !PLACEHOLDERS.has(String(value).trim().toLowerCase());
}

/** Path-ish entries get an existence check; command entries do not. */
function isPathLike(entry) {
  return !/^(npm|npx|yarn|pnpm|node)\s/.test(entry);
}

const violations = [];
const warnings = [];
const violation = (capId, rule, detail) => violations.push({ capId, rule, detail });
const warn = (capId, rule, detail) => warnings.push({ capId, rule, detail });

let registry;
try {
  // pathToFileURL is required: on Windows a bare absolute path (`C:\...`) is
  // rejected by the ESM loader as an unsupported `c:` protocol.
  registry = await import(pathToFileURL(join(REPO_ROOT, 'config', 'capabilities.mjs')).href);
} catch (err) {
  console.error('capability:audit — FAILED TO LOAD REGISTRY');
  console.error(`  config/capabilities.mjs could not be imported: ${err.message}`);
  process.exit(2);
}

const {
  STATUSES,
  PROGRAM_ASSESSMENTS,
  PROMOTION_PROOF,
  EVIDENCE_FIELDS,
  meta,
  programs,
  capabilities,
  coverage,
} = registry;

for (const [name, val] of Object.entries({
  STATUSES,
  PROGRAM_ASSESSMENTS,
  PROMOTION_PROOF,
  EVIDENCE_FIELDS,
  programs,
  capabilities,
})) {
  if (!val) {
    console.error(`capability:audit — registry does not export \`${name}\`.`);
    process.exit(2);
  }
}
if (!Array.isArray(capabilities) || capabilities.length === 0) {
  console.error('capability:audit — registry exports no capabilities. Nothing to validate.');
  process.exit(2);
}

const statusSet = new Set(STATUSES);
const assessmentSet = new Set(PROGRAM_ASSESSMENTS);
const programIds = new Set(programs.map((p) => p.id));
const idx = (s) => STATUSES.indexOf(s);
const IMPLEMENTED = idx('implemented');

// ---------------------------------------------------------------------------
// Programs: must use the PROGRAM vocabulary, never capability maturity.
// ---------------------------------------------------------------------------
for (const p of programs) {
  const pid = p.id ?? '<missing id>';
  if ('status' in p) {
    violation(
      pid,
      'PROGRAM_USES_STATUS',
      'programs must use `assessment`, not `status`. Sharing the word invites treating ' +
        '`partial`/`shell` as capability maturity states, which they are not.',
    );
  }
  if (!assessmentSet.has(p.assessment)) {
    violation(
      pid,
      'ILLEGAL_ASSESSMENT',
      `assessment \`${p.assessment}\` is not one of: ${PROGRAM_ASSESSMENTS.join(', ')}`,
    );
  }
  if (!hasEvidence(p.evidence)) {
    warn(pid, 'PROGRAM_NO_EVIDENCE', 'program assessment cites no evidence');
  }
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------
// Section numbers actually present in the canonical plan, parsed from its
// headings. Used to reject a `planRef` pointing at a section that does not exist.
const PLAN_SECTIONS = new Set();
try {
  const planTxt = readFileSync(join(REPO_ROOT, 'docs/architecture/MALLAN-PLATFORM-PLAN.md'), 'utf8');
  // Top-level sections from `## N.` headings, subsections from `### N.M`.
  for (const m of planTxt.matchAll(/^##\s+(\d+)\./gm)) PLAN_SECTIONS.add(m[1]);
  for (const m of planTxt.matchAll(/^#{3,4}\s+(\d+(?:\.\d+)+)/gm)) PLAN_SECTIONS.add(m[1]);
} catch (err) {
  // A missing or unreadable canonical plan must be FATAL, not a silent skip.
  // Leaving PLAN_SECTIONS empty made the `size > 0` guard disable every
  // reference check, so deleting the sole normative plan made all planRef
  // values look valid — the loudest possible failure reported as success.
  console.error('capability:audit — CANNOT READ THE CANONICAL PLAN');
  console.error(`  docs/architecture/MALLAN-PLATFORM-PLAN.md: ${err.message}`);
  console.error('  planRef validation depends on it, so this is a validator error (exit 2),');
  console.error('  not a pass. Restore the plan and re-run.');
  process.exit(2);
}
if (PLAN_SECTIONS.size === 0) {
  console.error('capability:audit — the canonical plan parsed to ZERO sections.');
  console.error('  Either its heading format changed or the file is empty; planRef');
  console.error('  validation would silently pass everything. Refusing to continue.');
  process.exit(2);
}

const seenIds = new Set();

for (const cap of capabilities) {
  const id = cap.id ?? '<missing id>';

  // Presence alone is not enough: `id: ''`, `name: ''`, `planRef: ''` all passed,
  // and a blank planRef additionally bypassed every reference check below.
  //
  // But EMPTY is not the same as `'unverified'`. The registry documents
  // `'unverified'` as a legal, honest value — "a field left unverified is
  // honest; a field asserted without evidence is a process failure" — so
  // rejecting it wholesale would punish exactly the honesty the registry asks
  // for. Empty/whitespace values and empty arrays are rejected everywhere;
  // `'unverified'` is additionally rejected only on IDENTITY fields, which
  // nothing can be honest about not knowing.
  const IDENTITY_FIELDS = new Set(['id', 'name', 'program', 'planRef', 'status']);
  for (const field of REQUIRED_FIELDS) {
    if (!(field in cap)) {
      violation(id, 'REQUIRED_FIELD_MISSING', `field \`${field}\` is absent`);
      continue;
    }
    const v = cap[field];
    // An empty ARRAY is honest on an unpromoted capability: a `discovered`
    // entry legitimately has no canonicalFiles and no tests yet. PROMOTION_PROOF
    // already requires those to be non-empty before promotion, so flagging them
    // here would punish accurate reporting of work not started.
    // Only `canonicalFiles` and `tests` are legitimately empty lists (a
    // `discovered` capability has no files and no tests yet, and PROMOTION_PROOF
    // already requires them before promotion). Exempting arrays GENERALLY was
    // too broad: `owner: []` passed, and so would an array in any other scalar
    // slot. Every other required field is a scalar and an array there is a
    // type error, not an honest empty.
    const LIST_FIELDS = new Set(['canonicalFiles', 'tests']);
    // Type first, then emptiness. Special-casing arrays still let `owner: {}`,
    // `owner: 0` and `owner: false` through, because the check asked "is this an
    // array in a scalar slot?" instead of "is this the declared shape?".
    if (LIST_FIELDS.has(field)) {
      if (!Array.isArray(v)) {
        violation(
          id,
          'REQUIRED_FIELD_WRONG_TYPE',
          `field \`${field}\` must be an array; got ${JSON.stringify(v)}.`,
        );
        continue;
      }
    } else if (typeof v !== 'string') {
      violation(
        id,
        'REQUIRED_FIELD_WRONG_TYPE',
        `field \`${field}\` must be a string; got ${JSON.stringify(v)} ` +
          `(${Array.isArray(v) ? 'array' : typeof v}). A non-scalar in a scalar slot ` +
          'passes emptiness checks while carrying no usable value.',
      );
      continue;
    }
    const empty = v === null || v === undefined
      || (typeof v === 'string' && v.trim() === '');
    if (empty) {
      violation(
        id,
        'REQUIRED_FIELD_BLANK',
        `field \`${field}\` is present but empty or of the wrong shape ` +
          `(${JSON.stringify(v)}). An empty value silently disables the checks that depend ` +
          'on it; an array in a scalar slot is a type error, not an honest empty.',
      );
    } else if (IDENTITY_FIELDS.has(field) && !hasEvidence(v)) {
      violation(
        id,
        'REQUIRED_FIELD_PLACEHOLDER',
        `identity field \`${field}\` is a placeholder (${JSON.stringify(v)}). ` +
          '`unverified` is legal for evidence-bearing fields, but not for identity: ' +
          'a capability cannot honestly not know its own id, name, program, planRef or status.',
      );
    }
  }

  if (seenIds.has(cap.id)) {
    violation(id, 'DUPLICATE_ID', `capability id \`${cap.id}\` appears more than once`);
  }
  seenIds.add(cap.id);

  // Capabilities must use the maturity vocabulary, never a program assessment.
  if (!statusSet.has(cap.status)) {
    const hint = assessmentSet.has(cap.status)
      ? ` \`${cap.status}\` is a PROGRAM assessment, not a capability maturity status.`
      : '';
    violation(
      id,
      'ILLEGAL_STATUS',
      `status \`${cap.status}\` is not one of §8.3: ${STATUSES.join(', ')}.${hint}`,
    );
  }

  if (cap.program && !programIds.has(cap.program)) {
    violation(id, 'UNKNOWN_PROGRAM', `program \`${cap.program}\` is not declared in programs[]`);
  }

  // `planRef` must point at a section that EXISTS in the canonical plan.
  // Checking only that it is populated let every entry keep the retired master
  // plan's numbering: the search capability pointed at §9.1/§9.7 while the
  // canonical plan puts search in §6, §9 is property identity, and §9.7 does
  // not exist at all — so a maintainer following the reference landed on an
  // unrelated or nonexistent requirement while the audit passed.
  if (hasEvidence(cap.planRef)) {
    // Only the ACTIVE reference is validated. Anything inside a trailing
    // `[...]` note is retained provenance — e.g. "[retargeted 2026-07-30; was
    // §5.2, §5.3, §26 C-2 of the retired master plan]" — and deliberately
    // records section numbers that no longer exist. Validating those would
    // force us to delete the audit trail to satisfy the check.
    const activeRef = String(cap.planRef).split('[')[0];
    // A planRef with no `§N` token at all previously bypassed the whole check,
    // because the loop below only validates matches and there were none. A typo
    // that drops the marker must not silently disable canonical-reference
    // validation.
    if (!/§\d/.test(activeRef)) {
      violation(
        id,
        'PLANREF_NO_SECTION',
        `\`planRef\` (${JSON.stringify(activeRef.trim())}) contains no §N reference. ` +
          'It must cite at least one canonical plan section, or the reference check ' +
          'silently passes on prose.',
      );
    }
    for (const ref of activeRef.matchAll(/§(\d+(?:\.\d+)*)/g)) {
      const full = ref[1];
      // Validate the WHOLE reference, not just its leading number. Checking only
      // the top level let `§6.999` pass because `6` exists — a stale or invented
      // subsection link stayed machine-approved in the sole normative plan.
      if (!PLAN_SECTIONS.has(full)) {
        const top = full.split('.')[0];
        const hint = PLAN_SECTIONS.has(top)
          ? ` §${top} exists but §${full} does not.`
          : ` §${top} is not a section of the plan.`;
        violation(
          id,
          'PLANREF_UNRESOLVED',
          `\`planRef\` cites §${full}, which is not a heading in ` +
            `docs/architecture/MALLAN-PLATFORM-PLAN.md.${hint} Retarget it.`,
        );
      }
    }
  }

  const promoted = statusSet.has(cap.status) && idx(cap.status) >= IMPLEMENTED;

  // ---- RETIREMENT ALSO REQUIRES PROOF -------------------------------------
  // `PROMOTION_PROOF` stops at `degraded`, so `deprecated` and `retired` had NO
  // evidence requirement at all while their index still made them count as
  // promoted. A capability could therefore be moved straight to `retired` — a
  // claim that decommissioning COMPLETED — and pass with `exitCode: undefined`.
  // Retirement is a stronger claim than implementation, not a weaker one: per
  // the canonical plan §17 it needs reader/writer inventory, parity proof,
  // retention review, rollback and approval. Enforced here rather than in the
  // registry so the registry's data stays owned by its authors.
  const RETIREMENT_STATES = new Set(['retiring', 'retired', 'deprecated']);
  if (RETIREMENT_STATES.has(cap.status)) {
    // Presence of SOME evidence is not enough. A capability's implementation
    // unit-test record says a thing WORKS; it says nothing about whether it was
    // safely removed. Retirement therefore needs its own record, so an
    // implementation test can never be reused as decommissioning proof.
    if (!hasEvidence(cap.retirementEvidence)) {
      violation(
        id,
        'RETIREMENT_WITHOUT_EVIDENCE',
        `status \`${cap.status}\` asserts decommissioning has happened, but there is no ` +
          '`retirementEvidence` record. An implementation `evidence` record does NOT qualify: ' +
          'it shows the capability worked, not that it was safely removed. §17 requires ' +
          'reader/writer inventory, parity proof, retention review, rollback and approval. ' +
          'Supply retirementEvidence or lower the status.',
      );
    }
    // Completeness, failed-command, artifact, fragment and SHA checks for
    // retirementEvidence are applied by the shared evidence loop below.
    if (!hasEvidence(cap.rollback)) {
      violation(
        id,
        'RETIREMENT_WITHOUT_ROLLBACK',
        `status \`${cap.status}\` requires a stated \`rollback\`; removing a path without a way ` +
          'back is the failure HYG-6 exists to prevent.',
      );
    }
  }

  // ---- THE CORE RULE: promotion requires proof (C-5) ----------------------
  const required = PROMOTION_PROOF[cap.status];
  if (required) {
    for (const field of required) {
      if (!hasEvidence(cap[field])) {
        violation(
          id,
          'UNEARNED_STATUS',
          `status \`${cap.status}\` requires \`${field}\`, but it is ` +
            `\`${JSON.stringify(cap[field] ?? null)}\`. Supply the evidence or lower the status. ` +
            `Status is assigned from evidence, not intent.`,
        );
      }
    }
  }

  // ---- evidence records must be COMPLETE, not merely present -------------
  // `retirementEvidence` gets the SAME substantive validation as promotion
  // evidence. Checking only that its fields are populated let a retirement
  // record cite `command: 'false'`, `exitCode: 1`, a nonexistent artifact
  // fragment and an unresolvable SHA and still PASS — a failed or fictional
  // decommissioning proof authorizing a `retired` status.
  for (const key of ['evidence', 'negativeEvidence', 'retirementEvidence']) {
    const ev = cap[key];
    if (!ev) continue;
    if (typeof ev !== 'object' || Array.isArray(ev)) {
      violation(id, 'EVIDENCE_NOT_STRUCTURED', `\`${key}\` must be a structured record, not a string`);
      continue;
    }
    for (const f of EVIDENCE_FIELDS) {
      const v = ev[f];
      const ok = f === 'exitCode' ? Number.isInteger(v) : hasEvidence(v);
      if (!ok) {
        violation(
          id,
          'EVIDENCE_INCOMPLETE',
          `\`${key}.${f}\` is missing or a placeholder (got ${JSON.stringify(v ?? null)}). ` +
            `A promoted status must name a real command, exit code, target commit, and proof boundary.`,
        );
      }
    }
    // A promoted status may not cite a FAILED command as its evidence.
    // Previously `exitCode` only had to be an integer, so `exitCode: 1` — a
    // command that failed — still produced RESULT: PASS. "We do not rerun
    // tests" explains why this validator cannot confirm a recorded SUCCESS; it
    // does not justify accepting a recorded FAILURE as proof a status was
    // earned. `negativeEvidence` is exempt: a negative finding legitimately
    // records a non-zero exit (GATE-5 — a bare grep that matches nothing exits
    // 1), and `expectedNonZeroExit: true` lets a deliberate failure case be
    // declared rather than smuggled in.
    // Applies to `evidence` AND `retirementEvidence`; only `negativeEvidence`
    // is exempt, because a negative finding legitimately exits non-zero.
    // `negativeEvidence` is no longer blanket-exempt. A negative finding does
    // legitimately exit non-zero (a bare grep with no match exits 1), but
    // exempting EVERY non-zero code let a broken probe — e.g. command-not-found
    // exit 127 — substantiate an absence claim. It must declare the exact code
    // it expects, exactly like promotion evidence.
    // A declared expectation is checked against the ACTUAL code no matter what
    // that code is. Checking only non-zero actuals meant flipping the bounded
    // search from 1 to 0 passed — but exit 0 means the search FOUND a match,
    // which directly contradicts the absence claim it substantiates.
    if (Number.isInteger(ev.expectedExitCode) && Number.isInteger(ev.exitCode)
        && ev.expectedExitCode !== ev.exitCode) {
      violation(
        id,
        'EVIDENCE_UNEXPECTED_EXIT',
        `\`${key}.expectedExitCode\` is ${ev.expectedExitCode} but \`exitCode\` is ` +
          `${ev.exitCode}. The command did not behave as declared, so this is an ` +
          'unexplained result, not a verified one. For a negative finding, exit 0 means ' +
          'the search MATCHED and the absence claim is contradicted.',
      );
    }
    if (Number.isInteger(ev.exitCode) && ev.exitCode !== 0) {
      // A bare boolean escape hatch is not enough: `expectedNonZeroExit: true`
      // let ANY non-zero code through, so `exitCode: 127` (command not found)
      // or an unrelated test failure could still justify a promotion. A
      // deliberate failure case must therefore DECLARE the exact code it
      // expects and say why, and the declared code must match what was
      // recorded.
      if (!Number.isInteger(ev.expectedExitCode)) {
        violation(
          id,
          'EVIDENCE_COMMAND_FAILED',
          `\`${key}.exitCode\` is ${ev.exitCode}, so the recorded acceptance command FAILED. ` +
            'A promoted status may not be justified by a failed command. Either record a ' +
            'successful run, or declare the intended failure with an integer ' +
            '`expectedExitCode` plus an `expectedOutcomeReason`.',
        );
      } else if (!hasEvidence(ev.expectedOutcomeReason)) {
        violation(
          id,
          'EVIDENCE_NO_EXPECTED_OUTCOME',
          `\`${key}\` declares \`expectedExitCode: ${ev.expectedExitCode}\` but gives no ` +
            '`expectedOutcomeReason`. State why a non-zero exit is the correct outcome, or ' +
            'the declaration is indistinguishable from suppressing a real failure.',
        );
      }
    }
    if (hasEvidence(ev.resultArtifact)) {
      const raw = String(ev.resultArtifact);
      const artifactPath = raw.split('#')[0];
      const fragment = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1).trim() : '';
      if (isPathLike(artifactPath) && !existsSync(join(REPO_ROOT, artifactPath))) {
        violation(
          id,
          'EVIDENCE_ARTIFACT_MISSING',
          `\`${key}.resultArtifact\` -> \`${artifactPath}\` does not exist`,
        );
      } else if (isPathLike(artifactPath) && fragment) {
        // A fragment must actually resolve. Previously the fragment was split
        // off and discarded, so `README.md#missing-evidence` passed on the
        // strength of README.md existing while the referenced evidence section
        // did not exist at all. Match the fragment against the file's headings,
        // GitHub-style anchor slugs, and explicit anchor ids.
        let body = '';
        try {
          body = readFileSync(join(REPO_ROOT, artifactPath), 'utf8');
        } catch {
          body = '';
        }
        const slugs = new Set();
        for (const line of body.split('\n')) {
          const h = /^#{1,6}\s+(.*?)\s*$/.exec(line);
          if (!h) continue;
          const text = h[1].replace(/`/g, '').trim();
          slugs.add(text);
          // GitHub's anchor algorithm: lowercase, drop characters that are not
          // word/space/hyphen, then convert EACH remaining space to a hyphen —
          // runs are NOT collapsed. `## E-1 — \`lib/search\` suite` therefore
          // becomes `e-1--libsearch-suite` (the double hyphen comes from the
          // two spaces left behind by the removed em dash). Collapsing runs
          // here produced a false EVIDENCE_FRAGMENT_UNRESOLVED against
          // genuinely valid anchors.
          const gh = text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s/g, '-');
          slugs.add(gh);
          // Also accept the run-collapsed form, so a hand-written anchor that
          // omits the doubled hyphen is not rejected on a technicality.
          slugs.add(gh.replace(/-{2,}/g, '-'));
        }
        for (const m of body.matchAll(/(?:id|name)=["']([^"']+)["']/g)) slugs.add(m[1]);
        const wanted = fragment.toLowerCase();
        const hit = [...slugs].some((s) => s === fragment || String(s).toLowerCase() === wanted);
        if (!hit) {
          violation(
            id,
            'EVIDENCE_FRAGMENT_UNRESOLVED',
            `\`${key}.resultArtifact\` -> \`${artifactPath}#${fragment}\`: the file exists but the ` +
              `fragment \`#${fragment}\` matches no heading or anchor in it. A promoted status may ` +
              `not point at an evidence section that does not exist.`,
          );
        }
      }
    }
    if (hasEvidence(ev.targetSha) && !/^[0-9a-f]{7,40}$/i.test(String(ev.targetSha))) {
      violation(id, 'EVIDENCE_BAD_SHA', `\`${key}.targetSha\` is not a commit sha: ${ev.targetSha}`);
    } else if (hasEvidence(ev.targetSha)) {
      // Shape alone proves nothing: a well-formed hex string that no commit
      // matches is an unanchored claim. Resolve it. This is a WARNING, not a
      // violation, because resolvability depends on what the checkout fetched —
      // a shallow or single-branch CI clone can legitimately lack a commit that
      // exists upstream. A warning surfaces the unanchored evidence without
      // failing a build for an environment difference.
      let resolved = false;
      try {
        const out = spawnSync('git', ['cat-file', '-t', String(ev.targetSha)], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        });
        resolved = out.status === 0 && String(out.stdout).trim() === 'commit';
      } catch {
        resolved = false;
      }
      if (!resolved) {
        warn(
          id,
          'EVIDENCE_SHA_UNRESOLVED',
          `\`${key}.targetSha\` \`${ev.targetSha}\` does not resolve to a commit in this ` +
            'checkout. Either the evidence is unanchored, or this clone does not have that ' +
            'branch fetched. Verify before citing this record as proof.',
        );
      }
    }
  }

  if (cap.blockedBy && !RATIFIED_CORRECTIONS.has(cap.blockedBy)) {
    violation(id, 'UNKNOWN_BLOCKER', `blockedBy \`${cap.blockedBy}\` is not a ratified §26 correction`);
  }
  if (cap.blockedBy && promoted) {
    violation(id, 'BLOCKED_BUT_PROMOTED', `capability is blocked by ${cap.blockedBy} yet claims \`${cap.status}\``);
  }

  // Owner is required beyond `implemented` (§24).
  if (statusSet.has(cap.status) && idx(cap.status) > IMPLEMENTED && cap.owner === 'unassigned') {
    violation(id, 'NO_OWNER', `status \`${cap.status}\` requires a named owner (§24)`);
  }

  // ---- declared paths: VIOLATION when promoted, warning otherwise --------
  for (const [listName, list] of [
    ['canonicalFiles', cap.canonicalFiles ?? []],
    ['tests', cap.tests ?? []],
  ]) {
    for (const entry of list) {
      if (!isPathLike(entry)) continue;
      if (existsSync(join(REPO_ROOT, entry))) continue;
      const detail = `declared ${listName} path \`${entry}\` does not exist at this commit`;
      if (promoted) {
        violation(
          id,
          'PROMOTED_PATH_MISSING',
          `${detail}. A promoted capability may not reference paths that are not here. ` +
            `Remove the path or lower the status.`,
        );
      } else {
        warn(id, 'PATH_NOT_FOUND', detail);
      }
    }
  }

  // ---- policy watch honesty ----------------------------------------------
  for (const w of cap.policyWatch ?? []) {
    if (w.review_status === 'monitoring' && w.effective_date !== null) {
      violation(
        id,
        'MONITORING_WITH_DATE',
        `policy watch \`${w.id}\` is \`monitoring\` but declares an effective_date. ` +
          `A monitored item has no effective date until an official source is captured.`,
      );
    }
    if (w.review_status !== 'monitoring' && w.enforcement_mode === 'none') {
      warn(id, 'ENFORCEMENT_MISMATCH', `policy watch \`${w.id}\` is promoted but enforces nothing`);
    }
  }
}

// ---------------------------------------------------------------------------
// Registry-level honesty
// ---------------------------------------------------------------------------
if (!coverage || coverage.capabilitiesTotalEstimated === undefined) {
  violation('<registry>', 'NO_COVERAGE_STATEMENT', 'registry must state its own coverage (C-5)');
}
if (coverage && coverage.capabilitiesRegistered !== capabilities.length) {
  violation(
    '<registry>',
    'COVERAGE_COUNT_MISMATCH',
    `coverage.capabilitiesRegistered=${coverage.capabilitiesRegistered} but capabilities.length=${capabilities.length}`,
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const line = '─'.repeat(74);
console.log(line);
console.log('capability:audit — master plan §24 / §8.3 / §26 C-5');
console.log(line);
console.log(`registry     : config/capabilities.mjs (v${meta?.version ?? '?'})`);
console.log(`baseline     : ${meta?.baselineCommit ?? '?'}`);
console.log(`               ${meta?.baselineBranch ?? '?'}`);
console.log(`programs     : ${programs.length}`);
console.log(`capabilities : ${capabilities.length}`);
console.log(
  `coverage     : ${coverage?.capabilitiesRegistered ?? '?'} registered of ` +
    `${coverage?.capabilitiesTotalEstimated ?? '?'} total`,
);
console.log('');

const byStatus = {};
for (const c of capabilities) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
console.log('capability maturity (§8.3):');
for (const s of STATUSES) if (byStatus[s]) console.log(`  ${s.padEnd(17)} ${byStatus[s]}`);

const byAssess = {};
for (const p of programs) byAssess[p.assessment] = (byAssess[p.assessment] ?? 0) + 1;
console.log('');
console.log('program assessment (separate vocabulary):');
for (const a of PROGRAM_ASSESSMENTS) if (byAssess[a]) console.log(`  ${a.padEnd(17)} ${byAssess[a]}`);

const promotedCaps = capabilities.filter((c) => statusSet.has(c.status) && idx(c.status) >= IMPLEMENTED);
console.log('');
console.log(`promoted capabilities (>= implemented): ${promotedCaps.length}`);
for (const c of promotedCaps) {
  console.log(
    `  ${c.id.padEnd(28)} ${c.status.padEnd(13)} exit=${c.evidence?.exitCode} @ ${String(
      c.evidence?.targetSha,
    ).slice(0, 8)}`,
  );
}
console.log('');

if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}) — not blocking:`);
  for (const w of warnings) console.log(`  [${w.capId}] ${w.rule}: ${w.detail}`);
  console.log('');
}

if (violations.length) {
  console.log(`VIOLATIONS (${violations.length}) — blocking:`);
  for (const v of violations) console.log(`  [${v.capId}] ${v.rule}\n      ${v.detail}`);
  console.log('');
  console.log(line);
  console.log(`RESULT: FAIL — ${violations.length} violation(s)`);
  console.log(line);
  process.exit(1);
}

console.log(line);
console.log('RESULT: PASS');
console.log('');
console.log('PROVES        : registry is structurally complete; every promoted status points to a');
console.log('                complete evidence record with a real command, exit code, target commit,');
console.log('                and proof boundary; every promoted path exists; program and capability');
console.log('                vocabularies are not confused.');
console.log('DOES NOT PROVE: that any test actually passes — this validator does NOT rerun tests, it');
console.log('                only enforces that the evidence record is complete. Nor that anything');
console.log('                works in production, nor that the registry is a complete inventory.');
console.log('                Production maturity requires PRODUCTION evidence (OPS-4); a green');
console.log('                structural audit is never a substitute for a production probe.');
console.log(`                ${coverage?.knownUnregisteredAreas?.length ?? 0} known area(s) remain unregistered.`);
console.log(line);
process.exit(0);
