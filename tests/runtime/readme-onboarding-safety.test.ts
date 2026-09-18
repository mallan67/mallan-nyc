/// <reference types="jest" />
/**
 * DB SAFETY PACKET 1 — README onboarding must not tell a developer to write to an unproven database.
 *
 * THE DEFECT. "Development Setup → Local Development" read, in order:
 *
 *   3. cp .env.example .env.local   # Edit .env.local with your database credentials
 *   4. npx prisma migrate deploy
 *      npx prisma db seed
 *   5. npm run dev
 *
 * Nothing between step 3 and step 4 established WHICH database those credentials point at. In this
 * project that gap is not theoretical: `vercel env pull` defaults to the Development environment
 * and writes `.env.local`, and Development can still resolve to the production database. So the
 * documented first-day sequence could run a schema migration and then a seed — whose upserts
 * rewrite `password_hash` on the real broker and agent rows — against production, and the developer
 * following the README would have no way to know.
 *
 * WHAT THIS TEST PINS. Not prose quality. Two structural facts: that the destructive commands are
 * never presented before a database-authority step, and that the four safety facts the packet
 * requires are actually written down. A README is executable instruction here, so it gets a
 * regression test like any other executable thing.
 */
import fs from 'node:fs';
import path from 'node:path';

const README = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf-8');

/** The Development Setup section only — from its heading to the next level-2 heading. */
function developmentSetupSection(): string {
  const start = README.indexOf('## Development Setup');
  expect(start).toBeGreaterThan(-1);
  const rest = README.slice(start + 1);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('README onboarding — no write before the database target is proven', () => {
  const section = developmentSetupSection();

  it('never presents migrate or seed before a database-authority step', () => {
    // Document ORDER is the claim: a warning printed after the command a developer already ran is
    // not a guard, it is a postmortem.
    const firstDestructive = Math.min(
      ...[/prisma\s+migrate\s+deploy/, /prisma\s+db\s+seed/, /npm run db:seed/]
        .map((re) => section.search(re))
        .filter((i) => i > -1),
    );
    if (!Number.isFinite(firstDestructive)) return; // no destructive command documented at all

    const authorityAt = section.search(
      /approved non-production|database authority|which database|verify the target/i,
    );
    expect(authorityAt).toBeGreaterThan(-1);
    expect(authorityAt).toBeLessThan(firstDestructive);
  });

  it('states that `vercel env pull` defaults to Development and writes .env.local', () => {
    expect(section).toMatch(/vercel env pull/i);
    expect(section).toMatch(/defaults? to (the )?Development/i);
    expect(section).toMatch(/\.env\.local/);
  });

  it('states that Development must resolve to an approved non-production database first', () => {
    expect(section).toMatch(/approved non-production/i);
  });

  it('states that production credentials are never for ordinary local development', () => {
    expect(section).toMatch(/never|must not/i);
    expect(section).toMatch(/production credential|production database/i);
  });

  it('states that a missing approved non-production authority means STOP', () => {
    // The specific failure mode this sentence exists to prevent: an onboarding developer deciding
    // that "temporarily" pointing at production is a reasonable unblock.
    expect(section).toMatch(/\bSTOP\b/);
    expect(section).toMatch(/temporar/i);
  });

  it('does not introduce a competing authority document', () => {
    // The README reflects executable safety reality; it does not become a second rulebook. The
    // authority lives in lib/ops/db-target.ts and the guards that consume it.
    expect(section).not.toMatch(/DATABASE-AUTHORITY\.md|DB-AUTHORITY\.md|SAFETY-POLICY\.md/i);
  });
});
