/// <reference types="jest" />
/**
 * COTALITY API IS THE ONLY PROVIDER AUTHORITY. NO OTHER PROVIDER IS NAMED HERE.
 *
 * Mallan's listings reach REBNY RLS through a LEGACY UPSTREAM INTERMEDIARY — a
 * listing-input system that lives outside this repo. RLS distribution then
 * returns the listing to Mallan through Cotality as an `RLS*` row:
 *
 *     Mallan local row  →  legacy upstream intermediary  →  REBNY RLS
 *                       →  Cotality return-copy
 *
 * That round trip is real and it is why `excludeMallanRlsReturnCopies()` exists.
 * The ARCHITECTURE is documented. The intermediary's PRODUCT NAME is not, because
 * naming it makes it read as a system authority in an architecture that has
 * exactly one: the Cotality API.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES, AND WHY THE EARLIER VERSION WAS WRONG
 *
 * The predecessor of this file (deleted in the same commit; its name embedded
 * the forbidden token) enforced a WEAKER and partly OPPOSITE contract:
 *
 *   1. It scanned only `lib/` and `app/`, with comment lines stripped. It never
 *      looked at `compliance/`, `data/`, `docs/`, `memory/`, `scripts/`, the
 *      root markdown files, or the JSON data files. The true tree count at the
 *      time it passed was 128 occurrences across 44 files.
 *   2. It contained a describe block titled "external-workflow prose is
 *      deliberately retained" which ASSERTED the forbidden name was still
 *      present in two runtime modules. A test that requires a forbidden name is
 *      worse than a stray mention: it makes removal fail CI.
 *
 * A third guard, `cotality-reference-doc-guard`, independently required the name
 * in an architecture document. Two tests were holding the name in place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONTRACT
 *
 * Zero occurrences, any casing, in every git-TRACKED file. Tracked is the right
 * boundary: untracked build output and local scratch are not the repository, and
 * git history intentionally preserves the original wording — which is why
 * removing it from the working tree loses nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../..');

/** The forbidden token, assembled so this file does not itself contain it. */
const FORBIDDEN = ['real', 'plus'].join('');
const FORBIDDEN_RE = new RegExp(FORBIDDEN, 'i');

/**
 * Paths whose JOB is to carry instructions or history that reference the
 * forbidden name. Excluded by design, for the same reason the architecture
 * guardrail excludes `docs/audits/` and `memory/`.
 *
 * `docs/claude-instructions/` holds Maya's own authored directives. Those
 * instructions have to be able to say WHICH name to remove; rewriting them to
 * satisfy the rule they issue would corrupt the instruction record and is not
 * mine to do. The rule governs the ARCHITECTURE, not the brief that commissioned
 * the change.
 *
 * Deliberately narrow: one path prefix, not a pattern that could quietly grow to
 * cover source.
 */
const INSTRUCTION_PREFIXES = ['docs/claude-instructions/'];

/** Files that are not text we can meaningfully scan. */
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|svgz|pdf|zip|gz|woff2?|ttf|eot|mp4|mov|xlsx?|docx?)$/i;

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

function scan(): Array<{ file: string; line: number; text: string }> {
  const hits: Array<{ file: string; line: number; text: string }> = [];
  for (const rel of trackedFiles()) {
    if (BINARY_EXT.test(rel)) continue;
    // `git ls-files` emits forward slashes, but normalise defensively.
    const norm = rel.replace(/[\\]/g, '/');
    if (INSTRUCTION_PREFIXES.some((p) => norm.startsWith(p))) continue;
    const abs = join(REPO, rel);
    let body: string;
    try {
      // Skip anything implausibly large for source; nothing legitimate is.
      if (statSync(abs).size > 8 * 1024 * 1024) continue;
      body = readFileSync(abs, 'utf8');
    } catch {
      continue; // deleted-but-staged, symlink, permission — not our concern
    }
    if (!FORBIDDEN_RE.test(body)) continue;
    body.split('\n').forEach((text, i) => {
      if (FORBIDDEN_RE.test(text)) {
        hits.push({ file: rel, line: i + 1, text: text.trim().slice(0, 160) });
      }
    });
  }
  return hits;
}

describe('the scan is real before it is trusted', () => {
  const files = trackedFiles();

  it('enumerates the tracked tree', () => {
    // A `git ls-files` that returned nothing would make the census below pass
    // while checking nothing at all — exactly how the previous version stayed
    // green over 128 occurrences.
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain('package.json');
    expect(files).toContain('lib/listings/mallan-source-identity.ts');
  });

  it('the instruction exclusion is one narrow prefix', () => {
    // If this list ever grows to cover lib/, app/, compliance/ or data/, the
    // census stops meaning anything.
    expect(INSTRUCTION_PREFIXES).toEqual(['docs/claude-instructions/']);
  });

  it('would actually catch the token if it were present', () => {
    // Prove the matcher works, without writing the token into the repo.
    expect(FORBIDDEN_RE.test(`legacy ${FORBIDDEN} intermediary`)).toBe(true);
    expect(FORBIDDEN_RE.test(FORBIDDEN.toUpperCase())).toBe(true);
    expect(FORBIDDEN_RE.test('Cotality API')).toBe(false);
  });
});

describe('no tracked file names the legacy intermediary', () => {
  it('the current-tree count is zero', () => {
    const hits = scan();
    // Rendered as file:line — a failure should say exactly where, not just how many.
    expect(hits.map((h) => `${h.file}:${h.line}  ${h.text}`)).toEqual([]);
  });
});

describe('the architecture is still explained, just not by product name', () => {
  const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

  it.each([
    'lib/listings/mallan-source-identity.ts',
    'lib/listings/dedupe-crm-vs-idx.ts',
  ])('%s still explains why a return-copy exists', (file) => {
    // Removing the NAME must not remove the REASONING. This prose is why the
    // return-copy suppression exists at all; deleting it would leave real
    // executable logic with no stated cause, which is a worse kind of drift
    // than the name was.
    const src = read(file);
    expect(src).toMatch(/legacy upstream intermediary/i);
    expect(src).toMatch(/REBNY RLS/);
  });

  it('the Cotality reference doc describes the listing-entry path generically', () => {
    const doc = read('docs/architecture/COTALITY-COMPLETE-REFERENCE.md');
    expect(doc).toMatch(/Legacy upstream intermediary/i);
  });
});

describe('the replacement URL field is still honest', () => {
  const urls = readFileSync(resolve(REPO, 'lib/crm/listing-urls.ts'), 'utf8');

  it('no provider-named URL was reintroduced under a different name', () => {
    // The removed field was Mallan's own public URL wearing a foreign provider's
    // name. Renaming it to a Cotality URL would be the same defect in new
    // clothes — there is no verified Cotality URL behind that value.
    expect(urls).not.toMatch(/cotalityUrl/i);
    expect(urls).not.toMatch(/providerUrl/i);
  });

  it('and the live-only behaviour it carried survives', () => {
    expect(urls).toMatch(/const publicActiveUrl = isActive \? publicUrl : null;/);
  });
});
