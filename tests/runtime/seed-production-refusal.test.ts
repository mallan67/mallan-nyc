/// <reference types="jest" />
/**
 * DB SAFETY PACKET 1 — the seed must refuse a Production target before it writes anything.
 *
 * THE DEFECT. `prisma/seed.ts` upserts four agent rows, and the UPDATE branch of each upsert
 * rewrites `password_hash`:
 *
 *   prisma.agent.upsert({ where: { email: "maya@mallan.nyc" }, update: { …, password_hash: … } })
 *
 * `upsert` is not "create if missing" — when the row exists, it UPDATES. Run against production,
 * this silently replaces the real principal broker's credential (and Leda's, Julia's, Claudia's)
 * with whatever `SEED_BROKER_PASSWORD` happens to hold in the operator's `.env.local`. The seed had
 * no target check of any kind, and README told developers to run it as an ordinary onboarding step
 * — while `vercel env pull` defaults to Development, which can still resolve to production.
 *
 * WHAT IS PROVEN HERE. The policy is a pure decision over a reconciliation result, so every branch
 * — including the ALLOW branch — is testable without a database, without an environment, and
 * without inventing an approved non-production target that does not exist. The env-reading adapter
 * is then tested separately, and the seed itself is spawned to prove the refusal happens BEFORE it
 * writes or even announces that it started.
 *
 * NO REAL DATABASE IS CONTACTED. The behavioural spawn uses 127.0.0.1 port 1, which refuses
 * instantly and cannot leave the machine. A canonical PRODUCTION connection string is never given
 * to a spawned process anywhere in this file — the production case is proven against the pure
 * policy function, which is precisely where it can be proven without risk.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  decideSeedTarget,
  assertSeedTargetAllowed,
  SEED_REQUIRED_AUTHORITY,
} from '@/lib/ops/seed-target-guard';
import { reconcileDbTargets, type DbTargetReconciliation } from '@/lib/ops/db-target';

const CANON =
  'postgresql://u:p@ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const CANON_POOLED =
  'postgresql://u:p@ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech/neondb';
const STALE = 'postgresql://u:p@ep-royal-dawn-ad6eh8t2.us-east-1.aws.neon.tech/neondb';
const ARBITRARY = 'postgresql://u:p@db.example.com:5432/app';
const UNREACHABLE = 'postgresql://nobody:nobody@127.0.0.1:1/definitely_not_a_database';

describe('decideSeedTarget — the pure policy, every branch reachable', () => {
  it('requires a POSITIVELY approved non-production authority', () => {
    expect(SEED_REQUIRED_AUTHORITY).toBe('approved-nonproduction');
  });

  it('REFUSES the canonical production database, naming the credential hazard', () => {
    const v = decideSeedTarget(reconcileDbTargets({ DATABASE_URL: CANON }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/production/i);
    expect(v.reason).toMatch(/password|credential/i);
  });

  it('REFUSES the canonical production database reached through the pooler', () => {
    expect(decideSeedTarget(reconcileDbTargets({ DATABASE_URL: CANON_POOLED })).allowed).toBe(false);
  });

  it('REFUSES the stale morning-bread database', () => {
    const v = decideSeedTarget(reconcileDbTargets({ DATABASE_URL: STALE }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/stale|royal-dawn|do-not-serve/i);
  });

  it('REFUSES an unrecognised target — "not production" is not evidence of safety', () => {
    const v = decideSeedTarget(reconcileDbTargets({ DATABASE_URL: ARBITRARY }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/unknown|unrecognis|not.*recognis/i);
  });

  it('REFUSES when no target is configured at all', () => {
    const v = decideSeedTarget(reconcileDbTargets({}));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/undetermin|no .*DATABASE_URL/i);
  });

  it('REFUSES a mixed pair even when one half would be acceptable', () => {
    const v = decideSeedTarget(reconcileDbTargets({ DATABASE_URL: CANON, DATABASE_URL_UNPOOLED: ARBITRARY }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/disagree|mixed/i);
  });

  it('ALLOWS a consistent approved non-production authority — the branch is reachable', () => {
    // Proves the guard is a policy and not simply "always throw". No approved target is invented
    // in the registry to get here; the reconciliation result is constructed directly, which is the
    // whole reason the policy takes a result rather than reading the environment itself.
    const approved: DbTargetReconciliation = {
      verdict: 'consistent',
      authority: 'approved-nonproduction',
      identity: 'ep-some-future-verified-dev-endpoint',
      reason: 'hand-built fixture',
      targets: [],
    };
    const v = decideSeedTarget(approved);
    expect(v.allowed).toBe(true);
  });

  it('is pure — a typed verdict and reason, never an HTTP status or an exit code', () => {
    const v = decideSeedTarget(reconcileDbTargets({ DATABASE_URL: CANON }));
    expect(typeof v.reason).toBe('string');
    expect(v).not.toHaveProperty('status');
    expect(v).not.toHaveProperty('exitCode');
  });

  it('never echoes the connection URL or its credentials', () => {
    for (const url of [CANON, STALE, ARBITRARY]) {
      const v = decideSeedTarget(reconcileDbTargets({ DATABASE_URL: url }));
      expect(v.reason).not.toContain('u:p');
      expect(v.reason).not.toContain(url);
    }
  });

  it('with the registry empty today, NOTHING real is allowed', () => {
    // The honest present-tense consequence: no verified Mallan non-production Neon authority is
    // declared yet, so the seed currently refuses everywhere. That is the intended reading of
    // "missing approved non-production authority means STOP" — not a reason to relax the rule.
    for (const url of [CANON, CANON_POOLED, STALE, ARBITRARY, UNREACHABLE]) {
      expect(decideSeedTarget(reconcileDbTargets({ DATABASE_URL: url })).allowed).toBe(false);
    }
  });
});

describe('assertSeedTargetAllowed — the throwing adapter', () => {
  it('throws on a production target', () => {
    expect(() => assertSeedTargetAllowed({ DATABASE_URL: CANON })).toThrow(/production/i);
  });
  it('throws when nothing is configured', () => {
    expect(() => assertSeedTargetAllowed({})).toThrow();
  });
  it('the thrown message carries the policy reason, not a bare code', () => {
    let msg = '';
    try {
      assertSeedTargetAllowed({ DATABASE_URL: CANON });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/refus/i);
    expect(msg).not.toContain('u:p');
  });
});

describe('prisma/seed.ts — the refusal precedes every write', () => {
  const SEED = path.join(process.cwd(), 'prisma', 'seed.ts');

  it('calls the guard before the first prisma call in the file', () => {
    // Static ordering backstop. The behavioural test below proves the runtime ordering; this one
    // fails loudly if someone later moves a write above the guard.
    const src = fs.readFileSync(SEED, 'utf-8');
    const guardAt = src.indexOf('assertSeedTargetAllowed(');
    const firstWriteAt = src.search(/prisma\.\w+\.(upsert|create|update|delete|createMany)/);
    expect(guardAt).toBeGreaterThan(-1);
    expect(firstWriteAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(firstWriteAt);
  });

  it('BEHAVIOURAL — refuses an unrecognised target and never announces seeding', () => {
    // "Seeding database..." is the seed's first console output, printed before any write. If the
    // refusal is genuinely first, that line can never appear.
    const r = spawnSync('npx', ['tsx', SEED], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 120_000,
      shell: true,
      env: {
        ...process.env,
        DATABASE_URL: UNREACHABLE,
        DATABASE_URL_UNPOOLED: UNREACHABLE,
        SEED_BROKER_PASSWORD: 'not-used-because-the-guard-fires-first',
        SEED_AGENT_PASSWORD: 'not-used-because-the-guard-fires-first',
      },
    });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    expect(out).toMatch(/refus/i);
    expect(out).not.toMatch(/Seeding database/i);
    expect(r.status).not.toBe(0);
  });
});
