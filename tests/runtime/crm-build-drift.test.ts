/// <reference types="jest" />
export {};
/**
 * BUILD DRIFT — `public/crm/index-built.html` must be exactly what `public/crm/build.js` produces from the
 * current sources, on EVERY platform.
 *
 * `index-built.html` is a GENERATED file (CLAUDE.md §A.2: never edit it by hand) assembled from
 * `public/crm/index.html`, the `public/crm/html/*.html` partials and `public/crm/js/**\/*.js`. It is also the file
 * the CRM actually SERVES. So a source change that is not followed by `npm run crm:build` ships nothing — the
 * corrected partial sits in the repo while the browser keeps loading the stale build. Equally, a hand-edit to the
 * built file survives until the next rebuild silently reverts it.
 *
 * Owner instruction 2026-09-09: *"Rebuild index-built.html only after the source changes are complete, then run
 * the build-drift check."*
 *
 * ── WHY THIS GUARD WAS NOT REAL (2026-09-10) ──────────────────────────────────────────────────────────────
 *
 * It passed on Windows and failed on Linux CI, and BOTH results were meaningless.
 *
 * `build.js` read each source with `fs.readFileSync(..., 'utf8')` and concatenated it verbatim, so the artifact
 * inherited whatever line endings the CHECKOUT happened to produce. On Windows (`core.autocrlf=true`) the sources
 * arrive CRLF and the artifact came out CRLF; on Linux they arrive LF and it came out LF. A 34,131-byte delta,
 * every byte of it a carriage return. So locally the guard compared CRLF to CRLF and passed while proving nothing
 * about content, and on CI it compared LF to a committed CRLF artifact and failed while proving nothing about
 * staleness. A guard that reports the platform it ran on is worse than no guard: it reads as coverage.
 *
 * Underneath that sat a second defect. `public/crm/js/init/init-disable-dead-controls.js` had been committed
 * containing 253 `\r\r\n` sequences — a double CRLF conversion baked into the blob. A LONE carriage return makes
 * git classify a file as BINARY, which is why both that source and the artifact showed `i/-text` in
 * `git ls-files --eol` and why `* text=auto` never normalized either of them.
 *
 * ── THE FIX THESE TESTS PIN ───────────────────────────────────────────────────────────────────────────────
 *
 *   1. `build.js` normalizes every source it reads to LF, so the artifact is a function of CONTENT alone.
 *   2. `.gitattributes` pins the artifact to `text eol=lf`, so a Windows checkout cannot convert it back and
 *      re-create the drift on the next clone.
 *   3. The corrupt source is normalized, removing the lone CRs at their origin.
 *
 * The byte-for-byte comparison stays exactly as strict as it was. What changes is that it now compares two
 * things that are supposed to be equal for a reason other than "both sides ran on the same operating system".
 *
 * The test runs the real builder and byte-compares, then RESTORES whatever was on disk, so it can never leave the
 * working tree different from how it found it (including when it fails).
 */
import { execFileSync } from 'child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const CRM = resolve(ROOT, 'public/crm');
const BUILT = resolve(CRM, 'index-built.html');
const BUILDER = resolve(CRM, 'build.js');

const countCR = (b: Buffer) => {
  let cr = 0;
  let lone = 0;
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x0d) {
      cr++;
      if (b[i + 1] !== 0x0a) lone++;
    }
  }
  return { cr, lone };
};

/** Run the real builder in-place, byte-capture the result, and put the working tree back. */
function buildInPlace(): Buffer {
  const onDisk = readFileSync(BUILT);
  try {
    execFileSync(process.execPath, [BUILDER], { cwd: ROOT, stdio: 'pipe' });
    return readFileSync(BUILT);
  } finally {
    // Always put back exactly what was there — a failing drift check must not "helpfully" commit the rebuild.
    writeFileSync(BUILT, onDisk);
  }
}

describe('the served CRM build matches its sources', () => {
  // The builder inlines ~60 files; give it room on a cold Windows filesystem.
  jest.setTimeout(300_000);

  it('running public/crm/build.js reproduces index-built.html byte for byte', () => {
    const onDisk = readFileSync(BUILT);
    const rebuilt = buildInPlace();

    if (!rebuilt.equals(onDisk)) {
      throw new Error(
        'index-built.html is STALE: a source file under public/crm/ changed without a rebuild.\n' +
        `  on disk: ${onDisk.length} bytes\n` +
        `  rebuilt: ${rebuilt.length} bytes\n` +
        'Run `npm run crm:build` and commit the regenerated file. Never hand-edit index-built.html.'
      );
    }
    expect(rebuilt.equals(onDisk)).toBe(true);
  });
});

describe('the artifact is canonical LF, so the guard compares content and not platform', () => {
  jest.setTimeout(300_000);

  it('the committed artifact contains no carriage return at all', () => {
    const { cr, lone } = countCR(readFileSync(BUILT));
    expect({
      cr,
      lone,
      why: 'A CRLF artifact makes this guard pass on Windows and fail on Linux for reasons that have nothing to do with staleness. A LONE CR additionally makes git classify the file as binary, which is how `* text=auto` came to be silently skipped.',
    }).toEqual({ cr: 0, lone: 0, why: expect.any(String) });
  });

  it('git stores the artifact as LF and is told to keep it that way on checkout', () => {
    // `text eol=lf` must be explicit. Relying on `text=auto` is what failed: auto-detection saw a lone
    // CR, called the file binary, and skipped normalization entirely.
    const attrs = readFileSync(resolve(ROOT, '.gitattributes'), 'utf8');
    expect(attrs).toMatch(/public\/crm\/index-built\.html\s+text\s+eol=lf/);

    const eol = execFileSync('git', ['ls-files', '--eol', 'public/crm/index-built.html'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(eol).toMatch(/^i\/lf\s+w\/lf/);
  });

  it('no source under public/crm carries a lone carriage return', () => {
    // The origin of the corruption. A lone CR in any inlined source propagates into the artifact and
    // takes git's text detection down with it.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          if (entry === '.backups' || entry === 'node_modules') continue;
          walk(p);
          continue;
        }
        if (p === BUILT) continue;
        if (!/\.(js|html|css|json)$/i.test(entry)) continue;
        const { lone } = countCR(readFileSync(p));
        if (lone > 0) offenders.push(`${p.slice(ROOT.length + 1).replace(/\\/g, '/')} (${lone} lone CR)`);
      }
    };
    walk(CRM);
    expect({ offenders }).toEqual({ offenders: [] });
  });
});

describe('the build output is a function of content, not of how the repo was checked out', () => {
  jest.setTimeout(300_000);

  it('sources checked out CRLF produce byte-identical output to sources checked out LF', () => {
    // This is the Linux-vs-Windows proof, executed rather than asserted. Copy the whole CRM tree,
    // rewrite EVERY inlined source to CRLF (what a Windows checkout does), build there, and require
    // the same bytes as the in-place build.
    const lfBuild = buildInPlace();

    const tmp = mkdtempSync(join(tmpdir(), 'crm-eol-'));
    try {
      const sandbox = join(tmp, 'crm');
      cpSync(CRM, sandbox, { recursive: true });

      let converted = 0;
      const toCRLF = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const p = join(dir, entry);
          if (statSync(p).isDirectory()) { toCRLF(p); continue; }
          if (p === join(sandbox, 'index-built.html')) continue;
          if (!/\.(js|html|css)$/i.test(entry)) continue;
          const text = readFileSync(p, 'utf8');
          writeFileSync(p, text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n'), 'utf8');
          converted++;
        }
      };
      toCRLF(sandbox);
      expect(converted).toBeGreaterThan(50);

      execFileSync(process.execPath, [join(sandbox, 'build.js')], { stdio: 'pipe' });
      const crlfBuild = readFileSync(join(sandbox, 'index-built.html'));

      expect({
        equal: crlfBuild.equals(lfBuild),
        lfBytes: lfBuild.length,
        crlfSourceBytes: crlfBuild.length,
        why: 'A line-ending-only difference in the CHECKOUT must not change the artifact. Otherwise the drift guard reports the operating system it ran on.',
      }).toEqual({
        equal: true,
        lfBytes: lfBuild.length,
        crlfSourceBytes: lfBuild.length,
        why: expect.any(String),
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('the guard still catches a REAL content change — line endings are not a blanket excuse', () => {
    // Mutation: a content edit to the artifact must still be reported as drift. If normalizing line
    // endings had been done in the COMPARISON instead of in the BUILDER, this is what would have gone soft.
    const onDisk = readFileSync(BUILT);
    try {
      writeFileSync(BUILT, Buffer.concat([onDisk, Buffer.from('\n<!-- hand edit -->\n')]));
      const rebuilt = buildInPlace();
      expect(rebuilt.equals(readFileSync(BUILT))).toBe(false);
    } finally {
      writeFileSync(BUILT, onDisk);
    }
  });
});
