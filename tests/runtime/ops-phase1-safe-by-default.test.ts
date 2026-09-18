/// <reference types="jest" />
/**
 * DB SAFETY PACKET 1 — `npm run ops:phase1` must not be destructive by default.
 *
 * THE DEFECT. `package.json` defined:
 *
 *   ops:phase1  =>  node … scripts/phase1-run.js --execute
 *
 * so the SHORTEST, most guessable, most tab-completable form of the command ran the destructive
 * path. `scripts/phase1-run.js` itself is careful — its own default is `--verify-only` and its
 * usage block says "the --execute flag is required to make any changes" — but the npm script
 * supplied that flag on the operator's behalf, defeating the script's own safety default. The
 * dangerous mode was reached by typing less, not more.
 *
 * WHAT `--execute` DOES: an UPDATE across `listings`, then `VACUUM (FULL, ANALYZE)` on listings,
 * leads and social_proof_cache. VACUUM FULL takes an ACCESS EXCLUSIVE lock and rewrites the table;
 * the script's own output warns that "Public listings pages + CRM will return errors during
 * listings VACUUM (~30-60s)". That is a deliberate, announced outage — never something an
 * unqualified command should start.
 *
 * WHY THE BEHAVIOURAL HALF EXISTS. A source-string assertion alone would pass if someone renamed
 * the flag, reordered the dispatch, or added a second path into `execute()`. So the runner is
 * actually SPAWNED with the flags `package.json` really carries — extracted from the manifest, not
 * retyped here — and its output inspected for the mutation markers.
 *
 * HOW THIS STAYS AWAY FROM EVERY REAL DATABASE. Three independent measures:
 *   1. the spawn omits the `--env-file-if-exists` flags the npm script uses, so no `.env.local`
 *      or `.env` is ever loaded;
 *   2. `DATABASE_URL` / `DATABASE_URL_UNPOOLED` are overridden to 127.0.0.1 port 1, which refuses
 *      instantly and cannot leave the machine; and
 *   3. `--execute` is never passed by any test in this file — not even to prove the harness works.
 * The runner's banners print BEFORE it opens a connection, which is what makes the mode
 * observable without a database.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const RUNNER = path.join(REPO, 'scripts', 'phase1-run.js');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/** A connection that is refused instantly and never leaves the machine. */
const UNREACHABLE = 'postgresql://nobody:nobody@127.0.0.1:1/definitely_not_a_database';

/**
 * The flags `package.json` really passes to the runner — read from the manifest rather than
 * retyped, so this cannot keep asserting about a command line that no longer exists.
 */
function runnerFlagsFor(scriptName: string): string[] {
  const cmd = pkg.scripts[scriptName];
  if (!cmd) throw new Error(`package.json has no script "${scriptName}"`);
  const marker = 'scripts/phase1-run.js';
  const at = cmd.indexOf(marker);
  if (at === -1) throw new Error(`"${scriptName}" no longer invokes ${marker}: ${cmd}`);
  return cmd
    .slice(at + marker.length)
    .split(/\s+/)
    .filter(Boolean);
}

function runRunner(flags: string[]) {
  const r = spawnSync(process.execPath, [RUNNER, ...flags], {
    cwd: REPO,
    encoding: 'utf-8',
    timeout: 60_000,
    env: {
      ...process.env,
      DATABASE_URL: UNREACHABLE,
      DATABASE_URL_UNPOOLED: UNREACHABLE,
    },
  });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

/** Markers that appear ONLY once the runner has entered its mutation path. */
const MUTATION_MARKERS = [/VACUUM/i, /Step 1:/i, /Step 2:/i, /━━━ BEFORE ━━━/];

describe('ops:phase1 — the unqualified command is not destructive', () => {
  it('the default script does NOT hardwire --execute', () => {
    expect(runnerFlagsFor('ops:phase1')).not.toContain('--execute');
  });

  it('the default script selects a non-mutating mode explicitly', () => {
    // Explicit, not merely "absent". Relying on the runner's internal default would make this
    // command's safety depend on a line nobody reading package.json can see.
    const flags = runnerFlagsFor('ops:phase1');
    expect(flags.some((f) => f === '--dry-run' || f === '--verify-only')).toBe(true);
  });

  it('an explicitly NAMED destructive command still exists', () => {
    // Safe-by-default must not mean "impossible". The destructive path stays available — it just
    // has to be asked for by name.
    const destructive = Object.entries(pkg.scripts).filter(
      ([, cmd]) => cmd.includes('scripts/phase1-run.js') && cmd.includes('--execute'),
    );
    expect(destructive.length).toBeGreaterThan(0);
    for (const [name] of destructive) {
      expect(name).toMatch(/execute/i);
    }
  });

  it('ops:phase1:verify is NOT weakened', () => {
    expect(runnerFlagsFor('ops:phase1:verify')).toContain('--verify-only');
  });

  it('BEHAVIOURAL — the default flags never reach the mutation path', () => {
    const out = runRunner(runnerFlagsFor('ops:phase1'));
    for (const marker of MUTATION_MARKERS) {
      expect(out).not.toMatch(marker);
    }
  });

  it('BEHAVIOURAL — the default flags do produce the non-mutating banner', () => {
    // The other half of the claim. Without this, a runner that crashed instantly would "pass" the
    // no-mutation assertion while proving nothing at all.
    const out = runRunner(runnerFlagsFor('ops:phase1'));
    expect(out).toMatch(/DRY RUN|CURRENT STATE/i);
  });

  it('BEHAVIOURAL CONTROL — the harness can actually tell the modes apart', () => {
    // Proves the two assertions above are discriminating rather than vacuous: two different
    // non-destructive modes produce visibly different output through this same harness.
    // `--execute` is deliberately NOT exercised anywhere in this file.
    const dry = runRunner(['--dry-run']);
    const verifyOnly = runRunner(['--verify-only']);
    expect(dry).toMatch(/DRY RUN/i);
    expect(verifyOnly).not.toMatch(/DRY RUN/i);
  });

  it('the runner reaches execute() from the --execute branch alone', () => {
    // Static backstop for the behavioural tests: if a second call site into execute() ever
    // appeared, "the default flags print no mutation markers" could become true while the
    // mutation still happened by another route.
    const src = fs.readFileSync(RUNNER, 'utf-8');
    const callSites = src.split('\n').filter((l) => /(?<!async function )\bexecute\(\)/.test(l));
    expect(callSites).toHaveLength(1);
    expect(callSites[0]).toMatch(/await execute\(\)/);
  });
});
