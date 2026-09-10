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

  it('rank 2 is filled — the execution-state file exists at the path the instructions name', () => {
    // This is the assertion whose absence let a canonical artifact go missing in silence. The file
    // lived only on feature branches; every branch cut from `main` started without it, and the
    // SessionStart hook pointed each new session at something it could not open.
    const CES = 'docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md';
    expect(() => read(CES)).not.toThrow();
    const tracked = execFileSync('git', ['ls-files', '--', CES], { cwd: ROOT, encoding: 'utf8' }).trim();
    expect({ tracked }).toEqual({ tracked: CES });
  });

  it('the execution-state file declares itself STATUS ONLY and defers to the Master Plan', () => {
    // Rank 2 must not quietly become a second architecture authority — the exact failure this whole
    // authority order exists to prevent.
    const ces = read('docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md');
    expect(ces).toMatch(/STATUS ONLY/);
    expect(ces).toMatch(/MALLAN-PLATFORM-MASTER-PLAN\.md/);
    expect(ces.replace(/\s+/g, ' ')).toMatch(/does not define product\/business\/system architecture/i);
  });

  it('AGENTS.md no longer calls itself the single shared source of truth', () => {
    // It is what Codex reads. Left as "single source of truth" it outranks the Master Plan in the
    // one agent that never sees this conversation.
    expect(activeText(read('AGENTS.md'))).not.toMatch(/Single shared source of truth/i);
  });
});
