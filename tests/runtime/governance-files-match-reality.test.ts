/// <reference types="jest" />
/**
 * THE INSTRUCTION FILES MUST AGREE WITH THE ROUTING CONTRACT, AND WITH EACH OTHER.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
 *
 * On 2026-09-10 the routing was corrected in `928f31c4`: `/crm` serves the brokerage CRM
 * (`dashboard.html`) and `/crm/search` serves the Backend Agent Search / Listings application
 * (`index-built.html`). But `CLAUDE.md` §A.0 and `AGENTS.md` §1 invariant 0 still said the opposite —
 * that `index-built.html` WAS the CRM, that `dashboard.html` was "the RETIRED duplicate", and that
 * `js/dashboard/**` "may only SHRINK ... and it is deleted".
 *
 * Those files are what an agent reads BEFORE it reads any code. Left uncorrected they would have sent
 * the next session straight back to repointing `/crm` at Backend Search. And because **Codex reads
 * `AGENTS.md` natively**, correcting only `CLAUDE.md` would have left a second agent still instructed
 * to undo the fix. Owner, 2026-09-10: *"I would make AGENTS.md just as important as CLAUDE.md in this
 * fix. Otherwise Claude gets corrected while Codex or another future agent is still instructed to do
 * the opposite."*
 *
 * ── WHAT THIS SUITE PROVES ────────────────────────────────────────────────────────────────────────
 *
 * Documentation normally drifts because nothing executes it. Here the governance files' architectural
 * claims are checked against `vercel.json` — the contract the browser actually obeys — so the prose
 * cannot silently diverge from the product again. Both files are held to the same standard, together.
 *
 * ── HOW IT AVOIDS THE TRAP IT IS GUARDING AGAINST ─────────────────────────────────────────────────
 *
 * The governance files deliberately QUOTE the old, wrong rule inside a "HISTORICAL CORRECTION" block,
 * because the owner asked that the history not be erased. A naive grep for the stale wording would
 * therefore fire on the very passage that documents the correction — the same mistake five earlier
 * guards in this convergence made by scanning prose instead of behaviour. So: negative assertions run
 * only over ACTIVE text with the historical blocks stripped, and the load-bearing assertions are
 * POSITIVE ones that quoted history cannot satisfy.
 */
export {};
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const GOVERNANCE = ['CLAUDE.md', 'AGENTS.md'] as const;

type Rewrite = { source: string; destination: string };
const rewrites = (JSON.parse(read('vercel.json')) as { rewrites: Rewrite[] }).rewrites;
const destinationFor = (source: string) => rewrites.find((r) => r.source === source)?.destination;

/**
 * Active directive text only. Everything from a "HISTORICAL CORRECTION" heading to the end of that
 * block records what the file USED to say; it is documentation of a correction, not an instruction.
 */
function activeText(md: string): string {
  return md
    .split(/\n/)
    .reduce<{ out: string[]; skipping: boolean }>(
      (acc, line) => {
        if (/HISTORICAL CORRECTION/i.test(line)) return { out: acc.out, skipping: true };
        // A historical block ends at the next top-level heading or numbered hard rule.
        if (acc.skipping && /^(#{1,3}\s|\d+\.\s\*\*)/.test(line)) acc.skipping = false;
        if (!acc.skipping) acc.out.push(line);
        return acc;
      },
      { out: [], skipping: false }
    )
    .out.join('\n');
}

describe('both instruction files carry the same architecture — neither agent is told the opposite', () => {
  for (const file of GOVERNANCE) {
    const md = read(file);

    it(`${file}: names the brokerage CRM and its canonical entry`, () => {
      expect(md).toMatch(/public\/crm\/dashboard\.html/);
      expect(md).toMatch(/js\/dashboard\/\*\*/);
      expect(activeText(md)).toMatch(/`?\/crm`?[^\n]{0,120}(compat|dashboard)/i);
    });

    it(`${file}: names the Backend Agent Search / Listings application and its entry`, () => {
      expect(md).toMatch(/index-built\.html/);
      expect(md).toMatch(/\/crm\/search/);
      expect(md).toMatch(/Backend Agent Search/i);
    });

    it(`${file}: keeps Consumer Search separate, with its own routes`, () => {
      expect(md).toMatch(/app\/search\/page\.tsx/);
      for (const route of ['/search', '/buy', '/rent']) {
        expect(md).toContain(route);
      }
    });

    it(`${file}: states the dependency direction — CRM launches Search, never the reverse`, () => {
      // Collapse whitespace first. Where a sentence happens to hard-wrap in markdown is not a fact
      // about governance, and asserting on it is the same prose-scanning brittleness this file exists
      // to avoid — a rule stated across two lines is still the rule.
      const active = activeText(md).replace(/\s+/g, ' ');
      expect(active).toMatch(/CRM\s*(->|→)\s*Backend Search/i);
      expect(active).toMatch(/MUST NOT require.{0,40}(dashboard\.html|CRM router)/i);
    });

    it(`${file}: no ACTIVE directive still claims index-built.html is the CRM`, () => {
      // Positive-and-negative in one: the stale claim must be absent from directive text, while the
      // historical record of it is allowed to remain.
      const active = activeText(md);
      const offenders = [
        /The CRM is `?public\/crm\/index\.html/i,
        /index-built\.html`?,? (is|as) the CRM/i,
        /ONE CRM\s*[—-]\s*`?public\/crm\/index\.html/i,
      ]
        .filter((re) => re.test(active))
        .map(String);
      expect({ offenders, file }).toEqual({ offenders: [], file });
    });

    it(`${file}: no ACTIVE directive still calls the CRM retired or says it may only shrink`, () => {
      const active = activeText(md);
      const offenders = [
        /dashboard\.html[^\n]{0,80}RETIRED/i,
        /RETIRED duplicate/i,
        /may only SHRINK/i,
        /add every CRM feature/i,
      ]
        .filter((re) => re.test(active))
        .map(String);
      expect({ offenders, file }).toEqual({ offenders: [], file });
    });

    it(`${file}: records the misclassification instead of quietly erasing it`, () => {
      // The owner asked that the history be kept. A future reader must be able to see that the old
      // rule existed and why it was wrong — otherwise the same conclusion gets re-derived.
      expect(md).toMatch(/HISTORICAL CORRECTION/i);
      expect(md).toMatch(/misclassification|disproven|now-disproven/i);
    });
  }
});

describe('the instruction files agree with the routing contract they describe', () => {
  it('the CRM entry the governance files name is the destination vercel.json actually serves', () => {
    // This is the assertion that stops the prose drifting from the product again: the claim is
    // checked against the file the browser obeys, not against another document.
    expect(destinationFor('/crm')).toBe('/crm/dashboard.html');
    for (const file of GOVERNANCE) {
      expect(read(file)).toMatch(/public\/crm\/dashboard\.html/);
    }
  });

  it('the professional Search entry the governance files name is what vercel.json serves', () => {
    expect(destinationFor('/crm/search')).toBe('/crm/index-built.html');
    for (const file of GOVERNANCE) {
      expect(read(file)).toMatch(/\/crm\/search/);
    }
  });

  it('the public consumer routes are claimed by no rewrite, exactly as the governance files say', () => {
    for (const route of ['/search', '/buy', '/rent']) {
      expect(destinationFor(route)).toBeUndefined();
    }
  });

  it('the two applications never resolve to each other', () => {
    expect(destinationFor('/crm')).not.toBe(destinationFor('/crm/search'));
  });
});

describe('the authority order is stated, and these files place themselves below the Master Plan', () => {
  for (const file of GOVERNANCE) {
    const md = read(file);

    it(`${file}: names the Master Plan as the product/system authority`, () => {
      expect(md).toMatch(/MALLAN-PLATFORM-MASTER-PLAN\.md/);
      expect(md).toMatch(/ONLY product\/system authority/i);
    });

    it(`${file}: names the execution-state tracker in second place, BY ITS REAL PATH`, () => {
      // The path matters. On 2026-09-10 both files named the file without its directory and asserted
      // it "does not exist ... Maya's document to create". It did exist, at docs/operations/, since
      // 2026-08 — it had simply never reached `main`, so branches cut from `main` never had it. A
      // bare filename is what let that go unnoticed: nothing could be checked against the filesystem.
      expect(md).toMatch(/docs\/operations\/MALLAN-CONTINUOUS-EXECUTION-STATE\.md/);
      expect(md).not.toMatch(/execution-state[^\n]{0,80}does not exist/i);
    });

    it(`${file}: declares itself operating instructions, not a competing authority`, () => {
      expect(md).toMatch(/NOT\*{0,2}\s*a\s*(competing\s*)?(product|product or system)/i);
      expect(md).toMatch(/Master Plan wins/i);
    });
  }

  it('both canonical files are named by LINEAGE, and neither is required to exist here', () => {
    // THE CORRECTION THIS ENCODES (2026-09-10). An earlier version of this suite asserted that the
    // execution state must EXIST and be TRACKED in this checkout, and no-new-authority-documents
    // asserted the same for the Master Plan. Both were wrong in the same way: they forced a copy of
    // the authority onto every implementation branch, which manufactures the second competing
    // authority the whole order exists to prevent.
    //
    // Owner, 2026-09-10: "we should not create two rank-2 truths that will diverge", and "A test
    // must not create the very duplicate-authority problem it is supposed to prevent."
    //
    // So: assert the POINTER and the LINEAGE. Existence is a fact about the governance branch.
    for (const file of GOVERNANCE) {
      const md = read(file);
      expect(md).toMatch(/MALLAN-PLATFORM-MASTER-PLAN\.md/);
      expect(md).toMatch(/docs\/operations\/MALLAN-CONTINUOUS-EXECUTION-STATE\.md/);
      // The lineage must be named ON THE RANK-1 ROW, not merely somewhere in the file. A first
      // draft matched anywhere and a mutation that stripped the lineage from the row still passed,
      // because an unrelated mention of #595 elsewhere satisfied it.
      const rank1 = md.split(/\r?\n/).find((l) => /ONLY product\/system authority/i.test(l)) || '';
      expect({ rank1Names: /#595|agent\/publish-mallan-platform-master-plan/.test(rank1), rank1 })
        .toEqual({ rank1Names: true, rank1: expect.any(String) });
    }
  });

  it('the canonical execution state is NOT duplicated onto this implementation branch', () => {
    // THE INVARIANT, stated positively rather than merely permitted:
    //   the canonical execution state lives on the governance lineage (PR #595);
    //   implementation branches POINT to it;
    //   a local mirror is not required, and must not be created.
    //
    // This assertion exists because I created exactly that mirror on 2026-09-10 - recovering the
    // file onto this branch after wrongly reporting it did not exist anywhere. Owner: "we should not
    // create two rank-2 truths that will diverge." A guard that merely tolerates a local copy would
    // let the next session recreate it in good faith, as I did.
    const CES = 'docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md';
    const localCopy = execFileSync('git', ['ls-files', '--', CES], { cwd: ROOT, encoding: 'utf8' }).trim();
    expect({
      localCopy,
      why: 'The canonical execution state belongs to PR #595 / agent/publish-mallan-platform-master-plan-2026-08-04. CLAUDE.md and AGENTS.md point at it there. A tracked copy on an implementation branch is a second rank-2 truth that will drift.',
    }).toEqual({ localCopy: '', why: expect.any(String) });
  });

  it('no local copy of either canonical file is presented as authority', () => {
    // A local copy may legitimately exist as evidence - the integration/reconciliation working copy
    // does. What it may never do is read as rank 1 or rank 2 without saying otherwise.
    // KNOWN OPEN ITEM, deliberately not asserted yet:
    // `docs/Master Bus Plan work in progress/MALLAN-PLATFORM-MASTER-PLAN.md` is the 6,388-line
    // integration working copy and is currently UNLABELLED. It carries Master Plan authority wording
    // in its body. The owner has reserved its disposition -- archive with a not-authority banner, or
    // delete once proven to hold zero unique requirements -- until the reconciled requirements are
    // confirmed landed on the governance lineage. Adding it to this list before that decision would
    // either force an unauthorized edit to the owner's uncommitted file or leave a red test standing.
    // It is tracked instead in the execution state's open-governance list.
    const LOCAL_COPIES = [
      'docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md',
    ];
    for (const rel of LOCAL_COPIES) {
      const present = execFileSync('git', ['ls-files', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
      if (!present) continue; // absent from this checkout - correct, nothing to check
      const head = read(rel).split(/\r?\n/).slice(0, 40).join('\n');
      expect({
        rel,
        labelled: /NOT AUTHORITY|NON-AUTHORITATIVE|working copy|LOCAL MIRROR|reconciliation evidence/i.test(head),
        why: 'A copy of a canonical file living on an implementation branch must announce in its opening lines that it is not the canonical one, or it becomes a second truth by default.',
      }).toEqual({ rel, labelled: true, why: expect.any(String) });
    }
  });

  it('AGENTS.md no longer calls itself the single shared source of truth', () => {
    // It is what Codex reads. Left as "single source of truth" it outranks the Master Plan in the
    // one agent that never sees this conversation.
    expect(activeText(read('AGENTS.md'))).not.toMatch(/Single shared source of truth/i);
  });
});

describe('no document sends a reader to the integration working copy as authority', () => {
  // ── WHY THIS IS A CLASSIFICATION, NOT A PATTERN ────────────────────────────────────────────────
  //
  // The first design for this guard allowed the old path "within 120 characters of a negation".
  // The owner rejected it, correctly: "That is too easy to fool accidentally. We just learned this
  // exact lesson when an unrelated #595 elsewhere made an earlier guard pass."
  //
  // That had just happened - a lineage assertion matched `#595` anywhere in the file, so stripping
  // the lineage from the rank-1 row still passed. Proximity is not classification. So every file
  // below is named, and its obligations follow from the class it is in.
  //
  // ── HOW 25 FILES CAME TO POINT AT THE WRONG MASTER ─────────────────────────────────────────────
  //
  // I wrote them. On 2026-09-10, while correcting a documentation sprawl, I propagated
  // `docs/Master Bus Plan work in progress/MALLAN-PLATFORM-MASTER-PLAN.md` as rank 1 into 25 tracked
  // files. It is the integration/reconciliation WORKING COPY. The canonical Master is
  // `MALLAN-PLATFORM-MASTER-PLAN.md` at repo root on PR #595. Owner: "even though AGENTS.md and
  // CLAUDE.md are fixed, 25 other tracked documents can still direct a future agent to the wrong
  // Master."
  const INTEGRATION_PATH = 'docs/Master Bus Plan work in progress/MALLAN-PLATFORM-MASTER-PLAN.md';
  const ROOT_MASTER = 'MALLAN-PLATFORM-MASTER-PLAN.md';
  const LINEAGE = /#595|agent\/publish-mallan-platform-master-plan/;

  /** Current direction. A reader acts on these today. */
  const ACTIVE_CURRENT_POINTER_FILES = [
    'MALLAN-NYC-CRM-PROJECT.md',
    'MASTER-PROJECT-TREE-v3.3.md',
    'CRM-ENHANCEMENT-SPEC.md',
    'README.md',
    'docs/operations/handoff-neon-gate6-2026-07-01.md',
    'NEON.md',
    'compliance/README.md',
    'compliance/AUTH-AND-API-SECURITY.md',
    'docs/compliance/COMPLIANCE-CANONICAL-INDEX.md',
    'docs/PLATFORM-ISSUE-REGISTRY.md',
  ];

  /** Dated records. Their bodies may keep old facts; their BANNERS may not misdirect. */
  const HISTORICAL_FILES = [
    'docs/architecture/SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md',
    'docs/audits/crm-agent-search-architecture-audit-2026-05-21.md',
    'docs/audits/search-backend-1-field-attribution-analysis-2026-07-09.md',
    'docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md',
    'docs/superpowers/specs/2026-05-04-crm-search-agent-workflow-rebuild.md',
    'memory/FOLLOWUP-2026-05-01.md',
    'memory/HANDOFF.md',
    'memory/NEXT-SESSION-2026-04-28.md',
    'memory/REFACTOR-2026-04-25.md',
  ];

  /** Frozen inputs to the Master integration rounds. */
  const INTEGRATION_ARTIFACTS = [
    'docs/Master Bus Plan work in progress/_BASE-595-MALLAN-PLATFORM-MASTER-PLAN.md',
    'docs/Master Bus Plan work in progress/_BASE-ROUND2-MALLAN-PLATFORM-MASTER-PLAN.md',
    'docs/Master Bus Plan work in progress/_BASE-ROUND3-MALLAN-PLATFORM-MASTER-PLAN.md',
    'docs/Master Bus Plan work in progress/_CONTRADICTIONS-18.md',
    'docs/Master Bus Plan work in progress/FINAL-INTEGRATION-REVIEW.md',
    'docs/Master Bus Plan work in progress/GOVERNANCE-CORRECTIONS.md',
  ];

  /** The ONLY files allowed to name the integration path - they name it to REJECT it. */
  const EXPLICIT_NON_AUTHORITY_REFERENCES = [
    'AGENTS.md',
    'CLAUDE.md',
    'tests/runtime/governance-files-match-reality.test.ts',
    'tests/runtime/no-new-authority-documents.test.ts',
  ];

  const HISTORICAL_MARK =
    /HISTORICAL|SUPERSEDED|NOT AUTHORITY|NOT CURRENT AUTHORITY|historical evidence|working copy|not a (product|system|product or system) authority/i;
  // Markdown emphasis is stripped before matching. memory/REFACTOR-2026-04-25.md declares itself
  // non-authority as "It is **not** a product or system authority" - correctly - and a literal
  // match failed on the asterisks. Normalising emphasis recognises the declaration that is
  // actually there; it does not loosen what counts as one.
  const opening = (md: string) =>
    md.split(/\r?\n/).slice(0, 45).join('\n').replace(/[*_]/g, '');

  it('the complete census: exactly four tracked files may name the integration path', () => {
    // The strongest assertion here. Any NEW stale reader anywhere in the repository fails this,
    // whether or not anyone thought to add it to a list.
    const hits = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean)
      .filter((f) => f !== INTEGRATION_PATH)
      .filter((f) => /\.(md|ts|tsx|js|mjs|cjs|json|yml|yaml|html)$/.test(f))
      .filter((f) => {
        try { return read(f).includes(INTEGRATION_PATH); } catch { return false; }
      })
      .sort();
    expect({
      hits,
      why: 'Only files that name the integration working copy in order to REJECT it as authority may mention it. Anything else is a reader that will send the next agent to the wrong Master.',
    }).toEqual({ hits: [...EXPLICIT_NON_AUTHORITY_REFERENCES].sort(), why: expect.any(String) });
  });

  for (const f of ACTIVE_CURRENT_POINTER_FILES) {
    it(`ACTIVE: ${f} points at the canonical root Master`, () => {
      const md = read(f);
      expect({ f, namesIntegrationPath: md.includes(INTEGRATION_PATH) }).toEqual({ f, namesIntegrationPath: false });
      expect(md).toContain(ROOT_MASTER);
      expect({ f, namesLineage: LINEAGE.test(md) }).toEqual({ f, namesLineage: true });
    });
  }

  for (const f of HISTORICAL_FILES) {
    it(`HISTORICAL: ${f} is marked historical and points forward correctly`, () => {
      const md = read(f);
      expect({ f, namesIntegrationPath: md.includes(INTEGRATION_PATH) }).toEqual({ f, namesIntegrationPath: false });
      expect({ f, markedHistorical: HISTORICAL_MARK.test(opening(md)) }).toEqual({ f, markedHistorical: true });
      expect(md).toContain(ROOT_MASTER);
      expect({ f, namesLineage: LINEAGE.test(md) }).toEqual({ f, namesLineage: true });
    });
  }

  for (const f of INTEGRATION_ARTIFACTS) {
    it(`INTEGRATION ARTIFACT: ${f} declares itself non-authority and points at the root Master`, () => {
      const md = read(f);
      expect({ f, namesIntegrationPath: md.includes(INTEGRATION_PATH) }).toEqual({ f, namesIntegrationPath: false });
      expect({ f, markedHistorical: HISTORICAL_MARK.test(opening(md)) }).toEqual({ f, markedHistorical: true });
      expect(opening(md)).toContain(ROOT_MASTER);
      expect({ f, namesLineage: LINEAGE.test(opening(md)) }).toEqual({ f, namesLineage: true });
    });
  }
});
