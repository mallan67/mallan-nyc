/// <reference types="jest" />
/**
 * Governance self-consistency checker (the "checker in place").
 *
 * Catches the CLASS of error an external reviewer (Codex) flagged on #372: a
 * governance doc drifting from the plan's non-negotiable rules — e.g. the
 * correction Trace Record template listing grep as acceptable RED proof while
 * the plan mandates "never grep alone" (§F). Runs in the harness (test:runtime)
 * so such contradictions are caught automatically on every PR, not by chance.
 *
 * This is the enforcement of `docs/superpowers/plans/...settlement-gates...md`
 * PART G (anti-skip). Add an assertion here whenever a new governance invariant
 * must not silently drift.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PLAN = path.join(ROOT, 'docs/superpowers/plans/2026-06-07-settlement-gates-and-oversight-plan.md');
const TEMPLATE = path.join(ROOT, 'docs/audits/corrections/_TEMPLATE.md');
const LEDGER = path.join(ROOT, 'docs/audits/settlement-ledger-2026-06.md');
const IMPROVEMENT = path.join(ROOT, 'docs/audits/pr372-improvement-and-merge-gate-2026-06-07.md');

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('the gate-balance statement is documented (protect without freezing)', () => {
  it('the #372 improvement doc states the fail-closed-on-unclassified-risk balance', () => {
    expect(fs.existsSync(IMPROVEMENT)).toBe(true);
    const doc = read(IMPROVEMENT);
    expect(doc).toMatch(/fail closed on (unclassified )?risk, not to block normal work/i);
    expect(doc).toMatch(/docs-only/i);
    expect(doc).toMatch(/unknown[- ]domain/i);
  });
});

describe('governance trail is durable (committed, not just local)', () => {
  it('plan + correction template + settlement ledger exist on this ref', () => {
    expect(fs.existsSync(PLAN)).toBe(true);
    expect(fs.existsSync(TEMPLATE)).toBe(true);
    expect(fs.existsSync(LEDGER)).toBe(true);
  });
});

describe('correction template obeys the plan’s RED-proof rule (no grep-only)', () => {
  const tpl = read(TEMPLATE);
  it('explicitly forbids grep-only RED proof', () => {
    expect(tpl).toMatch(/never grep alone/i);
    expect(tpl.toLowerCase()).toMatch(/grep-only[^.]*\b(invalid|fail-closed)\b/);
  });
  it('does NOT re-introduce the permissive "failing test / grep / probe" phrasing (Codex #372)', () => {
    expect(tpl).not.toMatch(/failing test\s*\/\s*grep\s*\/\s*probe/i);
  });
});

describe('plan ↔ template cross-consistency (one cannot contradict the other)', () => {
  const plan = read(PLAN);
  const tpl = read(TEMPLATE);
  it('if the plan forbids grep-only proof, the template must too', () => {
    if (/never grep alone/i.test(plan)) {
      expect(tpl).toMatch(/never grep alone/i);
    }
  });
  it('neither plan nor template treats grep as a sufficient RED proof', () => {
    expect(plan).not.toMatch(/grep[^.\n]{0,40}\b(is )?(a )?(sufficient|acceptable|valid) (red )?proof/i);
    expect(tpl).not.toMatch(/grep[^.\n]{0,40}\b(is )?(a )?(sufficient|acceptable|valid) (red )?proof/i);
  });
});

describe('plan keeps its non-negotiables (drift guard)', () => {
  const plan = read(PLAN);
  it('§F: never grep alone', () => {
    expect(plan).toMatch(/never grep alone/i);
  });
  it('Sentinel-L is documented as RETIRED/REMOVED (PR #546) and excluded from every gate', () => {
    // Retirement statement (replaces the earlier "non-functional" wording):
    // retired/removed, not a gate, not reintroduced without a new approved design.
    expect(plan).toMatch(/sentinel-l was retired and removed by pr #546/i);
    expect(plan).toMatch(/must not be reintroduced without a new, separately approved design/i);
    // And it must not be re-described as a live/non-functional-but-present check.
    expect(plan).not.toMatch(/sentinel-l is non-functional/i);
  });
  it('per-change MACRO system-impact evaluation + "no work in the dark"', () => {
    expect(plan).toMatch(/system-impact verifier/i);
    expect(plan).toMatch(/no work in the dark/i);
  });
  it('every correction must ship a Correction Trace Record', () => {
    expect(plan).toMatch(/Correction Trace Record/i);
  });
  it('both MICRO and MACRO are pass-required gates before advancing', () => {
    expect(plan).toMatch(/\bMICRO\b/);
    expect(plan).toMatch(/\bMACRO\b/);
  });
});

describe('the micro/macro checkers exist (cannot be silently removed)', () => {
  it('gate-lib + micro-gate + macro-gate runners are present', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts/ci/gate-lib.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'scripts/ci/micro-gate.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'scripts/ci/macro-gate.js'))).toBe(true);
  });
  it('npm gate:micro + gate:macro entrypoints are wired', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    expect(pkg.scripts['gate:micro']).toBe('node scripts/ci/micro-gate.js');
    expect(pkg.scripts['gate:macro']).toBe('node scripts/ci/macro-gate.js');
  });
});
