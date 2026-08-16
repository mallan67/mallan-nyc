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
 * mallan.nyc never writes back. Any RLS submission happens through a legacy
 * external listing-entry workflow OUTSIDE this system, which is deliberately not
 * represented as a component anywhere in the tree.
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

  // ── The actual guard ─────────────────────────────────────────────────────
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
