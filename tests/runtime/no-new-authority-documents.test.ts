/// <reference types="jest" />
/**
 * A NEW INSTRUCTION DOCUMENT CANNOT APPEAR BY ACCIDENT, AND ONLY THE MASTER PLAN IS AUTHORITY.
 *
 * ── THE PROBLEM THIS EXISTS FOR ─────────────────────────────────────────────────────────────────
 *
 * Owner, 2026-09-10: *"make sure that all claude docs are updated, there are so many of them and
 * each agent creates a new one."*
 *
 * That is measurable, not a feeling. Of 226 tracked markdown files, 42 were created in two days —
 * 23 on 2026-09-09 and 19 on 2026-09-08 — during a single stretch of convergence work. Successive
 * sessions wrote NEW documents instead of updating existing ones, so the same subject ended up
 * described in several places with no way to tell which one was current. That is exactly how
 * `CLAUDE.md` and `AGENTS.md` came to instruct two different agents to undo an architecture the
 * repository had already corrected.
 *
 * `AGENTS.md` §3 has said "Do not create parallel governance documents" since 2026-07-01. Documents
 * kept appearing anyway. A rule that only a compliant reader obeys is not a control — so this file
 * is the control, and it is a test rather than another document. Adding a document to answer a
 * documentation-sprawl problem is the problem.
 *
 * ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. The set of ROOT-LEVEL instruction documents is a fixed, declared list. A new one fails this
 *      suite until a person adds it here on purpose — the same shape as the PAGES map in
 *      crm-one-application.test.ts, which works.
 *   2. Only the Master Plan may declare itself the product/system authority. Everything else is
 *      operating instructions or a record.
 *   3. No document may claim to OVERRIDE the Master Plan.
 *
 * ── WHAT IT IS HONESTLY WORTH ───────────────────────────────────────────────────────────────────
 *
 * Assertion 1 is mechanical and strong: a filename either is in the list or is not.
 *
 * Assertions 2 and 3 scan prose, which is weaker, and this suite is built by an author who has
 * watched five prose-scanning guards in this convergence fire on their own explanatory comments. So
 * they scan only each document's OPENING REGION — where a self-declaration of authority actually
 * lives — and they strip blockquoted history first, because a document that QUOTES a discarded
 * claim in order to correct it is doing the right thing. They will not catch a self-declaration
 * phrased in words nobody has used yet. They are a ratchet, not a proof.
 *
 * What this suite does NOT do: stop anyone adding a file under docs/. That is normal work — audits,
 * evidence and dated reports are supposed to accumulate. It guards the ROOT, where instruction
 * documents live, and it guards the claim of AUTHORITY anywhere.
 */
export {};
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const tracked = (pattern: string) =>
  execFileSync('git', ['ls-files', '--', pattern], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * The rank-1 product/system authority is `MALLAN-PLATFORM-MASTER-PLAN.md` at repo ROOT on the
 * canonical governance lineage (PR #595 / agent/publish-mallan-platform-master-plan-2026-08-04).
 * It is deliberately NOT expected to exist on an implementation branch: requiring that would
 * duplicate the authority onto every branch, which is the failure this suite exists to prevent.
 *
 * The path below is the integration/reconciliation WORKING COPY that happens to live in this
 * checkout. It is evidence, never authority. It is named here only so the self-declaration scan can
 * exempt the one file whose body legitimately carries Master Plan wording.
 */
const MASTER_PLAN_FILENAME = 'MALLAN-PLATFORM-MASTER-PLAN.md';
const INTEGRATION_WORKING_COPY = 'docs/Master Bus Plan work in progress/MALLAN-PLATFORM-MASTER-PLAN.md';

/**
 * Every root-level markdown file, and what it is. Adding a file to the repository root without
 * adding it here fails this suite — which is the point: a person decides, in review, on purpose.
 */
const ROOT_DOCS: Record<string, 'agent-instructions' | 'domain-rules' | 'reference' | 'historical'> = {
  'CLAUDE.md': 'agent-instructions',
  'AGENTS.md': 'agent-instructions',
  'NEON.md': 'domain-rules',
  'README.md': 'reference',
  'MASTER-PROJECT-TREE-v3.3.md': 'reference',
  'MALLAN-NYC-CRM-PROJECT.md': 'reference',
  'LAUNCH-CHECKLIST.md': 'reference',
  'CRM-ENHANCEMENT-SPEC.md': 'historical',
  'BASELINE.md': 'historical',
};

/**
 * A document's opening region — where a claim of authority is actually made. Blockquoted lines are
 * dropped: a `>` block is how this repository records a superseded claim while correcting it, and
 * flagging that would punish exactly the behaviour we want.
 */
const opening = (md: string) =>
  md
    .split(/\r?\n/)
    .slice(0, 40)
    .filter((l) => !/^\s*>/.test(l))
    .join('\n');

describe('root-level instruction documents are a declared set', () => {
  it('every tracked root .md is declared here', () => {
    const undeclared = tracked('*.md').filter((f) => !f.includes('/') && !(f in ROOT_DOCS));
    expect({
      undeclared,
      why: 'A new document at the repository root must be declared in ROOT_DOCS in this file. If it duplicates something that already exists, update that instead — 42 of this repo\'s 226 markdown files were created in two days by successive sessions writing new documents rather than updating old ones.',
    }).toEqual({ undeclared: [], why: expect.any(String) });
  });

  it('every declared root doc still exists — the list cannot rot', () => {
    const declaredButMissing = Object.keys(ROOT_DOCS).filter((f) => !tracked(f).length);
    expect({ declaredButMissing }).toEqual({ declaredButMissing: [] });
  });

  it('exactly two documents carry agent instructions, and they are the two that must stay in step', () => {
    const instr = Object.entries(ROOT_DOCS).filter(([, r]) => r === 'agent-instructions').map(([f]) => f).sort();
    expect(instr).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });
});

describe('only the Master Plan is the product/system authority', () => {
  // The SUBJECT has to be a document. This matters, and the first draft of this suite got it wrong:
  // it flagged README.md line 17, "This repository is the single source of truth for the Mallan NYC
  // brokerage platform" — which is a true and useful statement meaning "the repo, not a copy on
  // someone's Desktop". Punishing that would have been the guard bullying a correct document into
  // changing to satisfy a careless regex. Narrowed so it fires only when a DOCUMENT declares itself
  // the authority, which is the actual failure mode.
  const CLAIMS_AUTHORITY = [
    /\b(this\s+(file|document|plan|charter|spec|specification|ledger|registry|handoff|checklist)|[A-Z][\w.-]*\.md)\s+(is|remains)\s+(the\s+)?(single\s+|only\s+)?(shared\s+)?source\s+of\s+truth/i,
    /^\s*\**\s*(single|the only)\s+(shared\s+)?source\s+of\s+truth\b/im,
    /\bcanonical\s+authority\b/i,
    /\bsupersedes\s+all\b/i,
  ];

  const OVERRIDES_ANYTHING = [
    /overrides?\s+(any|all|every)\s+(other\s+)?(repo\s+)?(document|file|instruction)/i,
    /this\s+file\s+wins\s+over\s+(the\s+)?master\s+plan/i,
  ];

  const candidates = [...Object.keys(ROOT_DOCS), ...tracked('memory/*.md'), ...tracked('docs/architecture/*.md')];

  it('no document except the Master Plan declares itself the source of truth', () => {
    const offenders = candidates
      .filter((f) => f !== INTEGRATION_WORKING_COPY)
      .map((f) => ({ f, hit: CLAIMS_AUTHORITY.find((re) => re.test(opening(read(f)))) }))
      .filter((x) => x.hit)
      .map((x) => `${x.f}  ~  ${String(x.hit)}`);
    expect({
      offenders,
      why: 'Authority order: the Master Plan is the ONLY product/system authority; AGENTS.md and CLAUDE.md are operating instructions; everything else is a record. A second document claiming to be the source of truth is how one agent ends up correcting an architecture while another is still told the opposite.',
    }).toEqual({ offenders: [], why: expect.any(String) });
  });

  it('no document claims to override the Master Plan or the repository at large', () => {
    const offenders = candidates
      .map((f) => ({ f, hit: OVERRIDES_ANYTHING.find((re) => re.test(opening(read(f)))) }))
      .filter((x) => x.hit)
      .map((x) => `${x.f}  ~  ${String(x.hit)}`);
    expect({ offenders }).toEqual({ offenders: [] });
  });

  it('both instruction files name the Master Plan and its lineage as rank 1', () => {
    // NOT a path-existence check. The canonical Master lives on the governance lineage; demanding a
    // local copy is how the duplicate-authority problem gets recreated by the guard meant to stop it.
    for (const f of ['CLAUDE.md', 'AGENTS.md']) {
      expect(read(f)).toContain(MASTER_PLAN_FILENAME);
      expect(read(f)).toMatch(/ONLY product\/system authority/i);
      const rank1 = read(f).split(/\r?\n/).find((l) => /ONLY product\/system authority/i.test(l)) || '';
      expect({ f, lineageOnRank1Row: /#595|agent\/publish-mallan-platform-master-plan/.test(rank1) })
        .toEqual({ f, lineageOnRank1Row: true });
    }
  });
});
