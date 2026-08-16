/// <reference types="jest" />
/**
 * LEGACY PROVIDER REFERENCE GUARD — permanent anti-regression scan.
 *
 * WHAT THIS PROTECTS
 * ------------------
 * A retired third-party listing-entry platform is NOT a component of the Mallan
 * production architecture. The current architecture has exactly two systems:
 *
 *   mallan.nyc        canonical Mallan brokerage operating system; creates and
 *                     manages canonical, EDITABLE local `SL-*` / `RL-*` records
 *   Cotality/Trestle  external INBOUND data/feed provider; READ-ONLY consumption
 *
 * mallan.nyc never writes back and is not an LMP. However a listing reaches
 * REBNY RLS is outside this system, has no bearing on Mallan behaviour, and is
 * deliberately not modelled anywhere in the tree — **neither by vendor name nor
 * by an anonymised stand-in.**
 *
 * TWO GUARDS, NOT ONE
 * -------------------
 * Removing the vendor NAME is not sufficient. The first cleanup pass replaced it
 * with a generic stand-in and preserved the same workflow — "data entry ... then
 * the agent submits to RLS via <stand-in>" — which left the retired mental model
 * intact in current architecture while passing a name-only scan. So this file
 * enforces BOTH:
 *
 *   1. the retired vendor name appears nowhere in the tracked tree, and
 *   2. no CURRENT architecture/compliance/runtime file models an outbound
 *      Mallan -> external listing-submission step at all.
 *
 * Dated audits and specs under the history paths are exempt from (2) only: they
 * may record what was believed at the time, but they must not become current
 * architecture.
 *
 * The retired provider's name previously appeared in ~150 places across runtime
 * code, a now-removed SECOND URL property on the CRM listing write contract,
 * machine-readable config, tests and documentation. It is now removed from the
 * tracked tree. This guard fails CI if ANY variant is reintroduced.
 *
 * The write contract is now exactly: listing_id, status, publicUrl,
 * featuredEligible, exclusiveEligible, eligibilityReason.
 *
 * NO HISTORY EXEMPTION. Git history preserves the original wording; the CURRENT
 * tracked tree must stay clean. Audit and spec documents keep their historical
 * CONCLUSIONS — only the vendor name is replaced with neutral terminology.
 *
 * SELF-DETECTION
 * --------------
 * The forbidden patterns are assembled from FRAGMENTS at runtime and the literal
 * never appears contiguously in this file, so the guard does not match itself and
 * needs no path exemption. Keep it that way when editing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

/** Fragments — never joined into a literal in source, only at runtime. */
const HEAD = 'Real';
const TAIL = 'Plus';

/**
 * Covers every variant the census found plus the ones it must never acquire:
 * compact, spaced, hyphenated, underscored, camelCase property, and any
 * host/domain form.
 */
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  {
    label: 'provider name (compact / spaced / hyphenated / underscored, any case)',
    re: new RegExp(HEAD + '[ _-]?' + TAIL, 'i'),
  },
  {
    label: 'retired API property (camelCase URL contract)',
    re: new RegExp(HEAD.toLowerCase() + TAIL + 'Url', 'i'),
  },
  {
    label: 'provider host / domain form',
    re: new RegExp(HEAD + '[ _-]?' + TAIL + '\\s*\\.\\s*[a-z]{2,}', 'i'),
  },
];

const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|html|htm|css|scss|csv|ya?ml|txt|sql|prisma|sh|env\.example)$/i;

function trackedTextFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => TEXT_EXT.test(f));
}

interface Hit {
  file: string;
  line: number;
  label: string;
  excerpt: string;
}

function scan(files: string[]): { hits: Hit[]; bytes: number; scanned: number } {
  const hits: Hit[] = [];
  let bytes = 0;
  let scanned = 0;

  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let src: string;
    try {
      // Skip anything implausibly large or unreadable rather than silently
      // dropping it — a skipped file must not look like a clean file.
      if (statSync(abs).size > 32 * 1024 * 1024) continue;
      src = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    bytes += src.length;
    scanned += 1;

    // Cheap pre-filter: only split into lines when a file actually matches.
    if (!FORBIDDEN.some((f) => f.re.test(src))) continue;

    const lines = src.split(/\r?\n/);
    for (const [i, line] of lines.entries()) {
      for (const { label, re } of FORBIDDEN) {
        if (!re.test(line)) continue;
        hits.push({
          file: rel,
          line: i + 1,
          label,
          excerpt: line.trim().slice(0, 160),
        });
        break; // one hit per line is enough to fail and locate it
      }
    }
  }
  return { hits, bytes, scanned };
}

describe('legacy provider reference guard', () => {
  const files = trackedTextFiles();
  const { hits, bytes, scanned } = scan(files);

  // ── Scanner integrity ────────────────────────────────────────────────────
  // A broken scanner returns zero hits and would otherwise look like success.
  describe('the scan actually ran (a broken scanner must not false-green)', () => {
    it('enumerated a realistic number of tracked text files', () => {
      expect(files.length).toBeGreaterThan(1500);
    });

    it('actually READ a realistic number of those files', () => {
      expect(scanned).toBeGreaterThan(1500);
      // Nothing meaningful should have been skipped by the size/read guards.
      expect(files.length - scanned).toBeLessThan(25);
    });

    it('read a realistic volume of bytes', () => {
      expect(bytes).toBeGreaterThan(3_000_000);
    });

    it('covers each category this cleanup touched', () => {
      // Runtime, API route, test, machine-readable config, and current
      // architecture doc must all be inside the scan set.
      expect(files).toContain('lib/crm/listing-urls.ts');
      expect(files).toContain('app/api/crm/listings/route.ts');
      expect(files).toContain('compliance/rules/active.json');
      expect(files).toContain('public/crm/data/search-fields-schema.json');
      expect(files).toContain('docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md');
      expect(files).toContain('public/crm/SALE-FORM-REDESIGN.html');
      expect(files).toContain('public/crm/index-built.html');
    });

    it('includes history/audit paths — there is NO history exemption', () => {
      expect(files).toContain('memory/AUDITOR-LOG.md');
      expect(files.some((f) => f.startsWith('docs/audits/'))).toBe(true);
      expect(files.some((f) => f.startsWith('docs/superpowers/specs/'))).toBe(true);
    });

    it('the patterns detect a synthetic positive (proves they are not inert)', () => {
      const synthetic = [HEAD + TAIL, HEAD + ' ' + TAIL, HEAD + '-' + TAIL, HEAD + '_' + TAIL];
      for (const s of synthetic) {
        expect(FORBIDDEN.some((f) => f.re.test(s))).toBe(true);
      }
      expect(FORBIDDEN.some((f) => f.re.test(HEAD.toLowerCase() + TAIL + 'Url'))).toBe(true);
      // And do NOT fire on innocuous neighbours.
      for (const ok of ['RealEstate', 'PlusOne', 'realtor', 'surplus', 'Realty']) {
        expect(FORBIDDEN.some((f) => f.re.test(ok))).toBe(false);
      }
    });
  });

  // ── Guard 2: the WORKFLOW, not just the name ─────────────────────────────
  describe('current architecture models NO outbound listing-submission step', () => {
    /** Paths whose job is to record history — exempt from THIS guard only. */
    const HISTORY_PREFIXES = [
      'docs/audits/',
      'docs/superpowers/',
      'docs/archive/',
      'docs/operations/',
      'memory/',
      'ops/',
    ];
    /** A dated basename (YYYY-MM-DD) marks a point-in-time audit or spec. */
    const DATED = /\d{4}-\d{2}-\d{2}/;

    /** Built from fragments so the patterns never appear literally in this file. */
    const seq = (...parts: string[]) => new RegExp(parts.join('\\s+'), 'i');
    const WORKFLOW: Array<{ label: string; re: RegExp }> = [
      { label: 'outbound submission step', re: seq('RLS', 'submission', 'is', 'via') },
      { label: 'outbound submission step', re: seq('RLS', 'submission', 'via', 'an') },
      { label: 'anonymised vendor stand-in', re: seq('external', 'LMP') },
      { label: 'anonymised vendor stand-in', re: seq('external', 'listing', 'platform') },
      { label: 'agent-submits-elsewhere step', re: seq('enters', 'listing', 'in', 'the') },
      { label: 'outbound submission step', re: seq('Submitted', 'via', 'an', 'external') },
    ];

    const currentFiles = files.filter(
      (f) => !HISTORY_PREFIXES.some((p) => f.startsWith(p)) && !DATED.test(f),
    );

    it('still has current-architecture files to check', () => {
      expect(currentFiles.length).toBeGreaterThan(1000);
      expect(currentFiles).toContain('docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md');
      expect(currentFiles).toContain('compliance/FORMS-AND-RLS-SUBMISSION.md');
      expect(currentFiles).toContain('MASTER-PROJECT-TREE-v3.3.md');
    });

    it('exempts dated history files from this guard (but never from the name scan)', () => {
      expect(currentFiles.some((f) => f.startsWith('docs/superpowers/'))).toBe(false);
      expect(files.some((f) => f.startsWith('docs/superpowers/'))).toBe(true);
    });

    it('the workflow patterns detect synthetic positives (proves they are not inert)', () => {
      // Assembled at runtime — the offending phrases must never appear literally
      // in this file, or the guard would flag itself.
      const positives = [
        ['RLS', 'submission', 'is', 'via', 'an', 'LMP'].join(' '),
        ['RLS', 'submission', 'via', 'an', 'LMP'].join(' '),
        ['external', 'LMP'].join(' '),
        ['external', 'listing', 'platform'].join(' '),
        ['Agent', 'enters', 'listing', 'in', 'the', 'LMP'].join(' '),
        ['Submitted', 'via', 'an', 'external', 'LMP'].join(' '),
      ];
      for (const p of positives) {
        expect(WORKFLOW.some((w) => w.re.test(p))).toBe(true);
      }
      // And stay silent on legitimate current wording.
      const negatives = [
        'Save canonical Mallan listing',
        'Cotality observation -> source classification -> reconcile',
        'mallan.nyc does NOT submit listings to the RLS and is NOT an LMP',
        'inbound external RLS feed, read-only',
      ];
      for (const n of negatives) {
        const fires = WORKFLOW.some((w) => w.re.test(n))
          && !/\bnot\b|\bnever\b|\bNO\b|deliberately|stand-in|outside mallan\.nyc/i.test(n);
        expect(fires).toBe(false);
      }
    });

    it('no current file describes a Mallan -> external submission workflow', () => {
      const bad: string[] = [];
      for (const rel of currentFiles) {
        let src: string;
        try {
          src = readFileSync(path.join(ROOT, rel), 'utf8');
        } catch {
          continue;
        }
        if (!WORKFLOW.some((w) => w.re.test(src))) continue;
        for (const [i, line] of src.split(/\r?\n/).entries()) {
          for (const { label, re } of WORKFLOW) {
            if (!re.test(line)) continue;
            // A line that PROHIBITS the model is not the model.
            if (/\bnot\b|\bnever\b|\bNO\b|deliberately|stand-in|outside mallan\.nyc/i.test(line)) {
              continue;
            }
            bad.push(`  ${rel}:${i + 1} [${label}]\n      ${line.trim().slice(0, 150)}`);
            break;
          }
        }
      }
      expect(bad.length === 0 ? '' : `Retired workflow still modelled:\n${bad.join('\n')}\n`).toBe('');
    });
  });

  // ── Guard 1: the name ────────────────────────────────────────────────────
  it('NO tracked file contains any retired-provider variant', () => {
    const report = hits
      .map((h) => `  ${h.file}:${h.line} [${h.label}]\n      ${h.excerpt}`)
      .join('\n');
    expect(
      hits.length === 0
        ? ''
        : `Retired provider reference reintroduced in ${hits.length} place(s):\n${report}\n`,
    ).toBe('');
  });
});
