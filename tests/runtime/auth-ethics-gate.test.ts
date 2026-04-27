/// <reference types="jest" />
/**
 * Auth ethics-gate runtime test (UCBA Art. III §6, workstream C4).
 *
 * Verifies the gate's two failure modes return the correct error type so
 * route handlers can convert it to a 403 with structured payload:
 *
 *   - NULL ethics_training_expires_at → reason="missing"
 *   - past expiry                     → reason="expired"
 *   - future expiry                   → no throw (happy path)
 *
 * Without this test, the gate could silently degrade (e.g., NULL
 * accidentally treated as "valid forever") and lock-out detection would
 * fail without anyone noticing until an active agent's training lapsed.
 */

import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

import { assertAgentEthicsTrainingValid, EthicsTrainingExpiredError } from '@/lib/auth/session';

describe('UCBA C4 — assertAgentEthicsTrainingValid', () => {
  async function getThrownError(fn: () => Promise<unknown>): Promise<unknown> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    throw new Error('expected the function to throw');
  }

  it('throws EthicsTrainingExpiredError(reason=missing) when expires_at is NULL', async () => {
    (prismaMock as { agent: { findUnique: jest.Mock } }).agent.findUnique = jest.fn(async () => ({
      ethics_training_completed_at: null,
      ethics_training_expires_at: null,
    }));

    const e = (await getThrownError(() => assertAgentEthicsTrainingValid(1n))) as EthicsTrainingExpiredError;
    expect(e).toBeInstanceOf(EthicsTrainingExpiredError);
    expect(e.code).toBe('ETHICS_TRAINING_EXPIRED');
    expect(e.reason).toBe('missing');
    expect(e.retrainingUrl).toMatch(/^https?:\/\//);
  });

  it('throws EthicsTrainingExpiredError(reason=expired) when expires_at is in the past', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    (prismaMock as { agent: { findUnique: jest.Mock } }).agent.findUnique = jest.fn(async () => ({
      ethics_training_completed_at: new Date('2024-01-01'),
      ethics_training_expires_at: yesterday,
    }));

    const e = (await getThrownError(() => assertAgentEthicsTrainingValid(1n))) as EthicsTrainingExpiredError;
    expect(e).toBeInstanceOf(EthicsTrainingExpiredError);
    expect(e.reason).toBe('expired');
    expect(e.expiredAt).toEqual(yesterday);
  });

  it('does NOT throw when expires_at is in the future (happy path)', async () => {
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    (prismaMock as { agent: { findUnique: jest.Mock } }).agent.findUnique = jest.fn(async () => ({
      ethics_training_completed_at: new Date(),
      ethics_training_expires_at: nextYear,
    }));

    await expect(assertAgentEthicsTrainingValid(1n)).resolves.toBeUndefined();
  });

  it('does NOT throw when the agent does not exist (caller handles FK violation)', async () => {
    (prismaMock as { agent: { findUnique: jest.Mock } }).agent.findUnique = jest.fn(async () => null);
    await expect(assertAgentEthicsTrainingValid(99999n)).resolves.toBeUndefined();
  });
});
