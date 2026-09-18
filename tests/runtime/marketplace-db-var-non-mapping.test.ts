/// <reference types="jest" />
/**
 * DB SAFETY PACKET 1 — Marketplace `database_*` variables are never mapped onto the bare Prisma ones.
 *
 * WHAT IS BEING PROTECTED. Prisma reads the BARE names `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
 * from the schema's datasource. The Vercel-Neon Marketplace integration separately publishes
 * `database_DATABASE_URL`, `database_DATABASE_URL_UNPOOLED` and friends, and those prefixed values
 * point at PRODUCTION. Copying one family onto the other — a one-line "fallback" that looks like a
 * convenience — would hand every Preview deployment the live production database.
 *
 * WHY IT NEEDS A TEST RATHER THAN A COMMENT. lib/prisma.ts already explains the rule in prose:
 * "We do NOT map the Vercel-Neon integration's prefixed vars onto the bare names: a global fallback
 * like that would silently hand every Preview route the production database." Nothing enforced it.
 * Preview is currently fail-CLOSED because the bare variables are absent there, and the tempting
 * fix for that symptom is precisely the mapping this test forbids. The rule is load-bearing exactly
 * when someone is frustrated enough to "just add a fallback".
 *
 * WHOLE-TREE, NOT A FILE LIST. The static half walks every production source file rather than
 * checking a handful of known env-loading modules. A guard that inspects three files proves nothing
 * about the fourth, and a mapping added anywhere would be just as effective as one added in
 * lib/prisma.ts.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = process.cwd();

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.vercel', '.turbo',
]);
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Every production source file in the repository. Tests and type declarations excluded. */
function walkSources(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkSources(full, acc);
    } else if (SOURCE_EXT.has(path.extname(entry.name))) {
      if (/\.(test|spec)\.[tj]sx?$/.test(entry.name)) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Does this line READ a Marketplace-prefixed connection variable?
 *
 * Naming the variable in a comment is not reading it — lib/prisma.ts and lib/ops/db-target.ts both
 * name it precisely to document that it must never be mapped, and a check that flagged those would
 * punish the documentation while catching nothing.
 */
function readsPrefixedVar(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  if (!/\bdatabase_DATABASE_URL\w*/.test(line)) return false;
  return /process\.env/.test(line) || /\benv\s*[.[]/.test(line);
}

describe('Marketplace database_* variables are never mapped to bare Prisma variables', () => {
  const sources = walkSources(REPO);

  it('finds a non-trivial number of source files to check', () => {
    // Guards the guard: if the walk silently returned [], every assertion below would pass while
    // checking nothing at all.
    expect(sources.length).toBeGreaterThan(200);
  });

  it('no production source assigns the bare Prisma connection variables', () => {
    // `process.env.DATABASE_URL = …` in any form. If nothing ever writes them, nothing can map
    // the prefixed family onto them.
    const assign =
      /process\.env\.(DATABASE_URL|DATABASE_URL_UNPOOLED)\s*(=[^=]|\|\|=|\?\?=)|process\.env\[\s*["'`](DATABASE_URL|DATABASE_URL_UNPOOLED)["'`]\s*\]\s*(=[^=]|\|\|=|\?\?=)/;
    const offenders = sources.filter((f) => assign.test(fs.readFileSync(f, 'utf-8')));
    expect(offenders.map((f) => path.relative(REPO, f))).toEqual([]);
  });

  it('the read-detector actually fires (positive + negative control)', () => {
    // Without this, "no file reads the prefixed family" could pass because the detector never
    // matches anything — the failure mode this repository calls a vacuous validator. Two files
    // legitimately NAME the variable in comments explaining why it must not be mapped
    // (lib/prisma.ts and lib/ops/db-target.ts), so the detector has to tell naming from reading.
    expect(readsPrefixedVar('const u = process.env.database_DATABASE_URL;')).toBe(true);
    expect(readsPrefixedVar('  const u = process.env["database_DATABASE_URL_UNPOOLED"];')).toBe(true);
    expect(readsPrefixedVar('const { database_DATABASE_URL } = process.env;')).toBe(true);

    expect(readsPrefixedVar('// we do NOT map database_DATABASE_URL onto the bare name')).toBe(false);
    expect(readsPrefixedVar(' * The integration publishes `database_DATABASE_URL` and friends.')).toBe(false);
    expect(readsPrefixedVar('const u = process.env.DATABASE_URL;')).toBe(false);
  });

  it('no production source READS a database_-prefixed connection variable', () => {
    // Reading one is the first half of mapping it. There is no legitimate reason for application
    // code to consult the Marketplace family: the bare names are the contract with Prisma.
    // Mentioning the name in a comment is fine, and is how the rule is documented at the two
    // places that matter.
    const offenders: string[] = [];
    for (const f of sources) {
      const hits = fs
        .readFileSync(f, 'utf-8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => readsPrefixedVar(line));
      for (const { i } of hits) offenders.push(`${path.relative(REPO, f)}:${i + 1}`);
    }
    expect(offenders).toEqual([]);
  });

  it('BEHAVIOURAL — a Preview-shaped env with ONLY Marketplace values leaves the bare names unset', () => {
    // The exact Preview shape: the Marketplace family present and pointing at production, the bare
    // names absent. Loading the application's Prisma module must not change that.
    const probe = path.join(os.tmpdir(), `mallan-nonmapping-probe-${process.pid}.mjs`);
    const prismaModule = path.join(REPO, 'lib', 'prisma.ts').replace(/\\/g, '/');
    fs.writeFileSync(
      probe,
      [
        'let loaded = false, threw = null;',
        'try {',
        `  await import(${JSON.stringify('file:///' + prismaModule)});`,
        '  loaded = true;',
        '} catch (e) { threw = String(e && e.message ? e.message : e); }',
        'console.log("PROBE:" + JSON.stringify({',
        '  loaded, threw,',
        '  bare: process.env.DATABASE_URL ?? null,',
        '  bareUnpooled: process.env.DATABASE_URL_UNPOOLED ?? null,',
        '  prefixed: process.env.database_DATABASE_URL ? "present" : "absent",',
        '}));',
      ].join('\n'),
      'utf-8',
    );

    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DATABASE_URL_UNPOOLED;
    env.database_DATABASE_URL =
      'postgresql://prod:prod@ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech/neondb';
    env.database_DATABASE_URL_UNPOOLED =
      'postgresql://prod:prod@ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech/neondb';

    try {
      const r = spawnSync('npx', ['tsx', probe], {
        // A directory with no .env.local, so the module's dotenv override cannot supply the bare
        // names from a developer's local file and mask the result.
        cwd: os.tmpdir(),
        encoding: 'utf-8',
        timeout: 120_000,
        shell: true,
        env,
      });
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      const line = out.split('\n').find((l) => l.includes('PROBE:'));
      expect(line).toBeDefined();
      const result = JSON.parse(line!.slice(line!.indexOf('PROBE:') + 'PROBE:'.length));

      // The probe must have actually exercised the module — otherwise this proves nothing.
      expect(result.prefixed).toBe('present');
      expect(result.loaded || result.threw).toBeTruthy();

      // The claim.
      expect(result.bare).toBeNull();
      expect(result.bareUnpooled).toBeNull();
    } finally {
      fs.rmSync(probe, { force: true });
    }
  });

  it('the generated Prisma client still binds the BARE name, so the non-mapping matters', () => {
    // If Prisma stopped reading `DATABASE_URL` from the environment, this whole invariant would be
    // about a variable nobody uses. The generated client records the binding it was built with.
    const generated = path.join(REPO, 'node_modules', '.prisma', 'client', 'index.js');
    if (!fs.existsSync(generated)) {
      throw new Error('generated Prisma client missing — run `npx prisma generate` before this suite');
    }
    const src = fs.readFileSync(generated, 'utf-8');
    expect(src).toMatch(/"fromEnvVar"\s*:\s*"DATABASE_URL"/);
  });
});
