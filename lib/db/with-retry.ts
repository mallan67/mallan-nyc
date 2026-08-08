import { Prisma } from '@prisma/client';

/**
 * Retry a DB operation on TRANSIENT Neon cold-start errors.
 *
 * The production compute is 0.25 CU fixed and auto-suspends after ~5 min idle; the
 * the db-keepalive cron did not prevent that, and was REMOVED in the approved 2026-07
 * compute reduction (PR #481) so Neon can autosuspend — so a request landing on a cold DB gets
 * `P1001 Can't reach database server` before compute wakes. Verified live: `/api/contact`
 * lead submissions and several crons fail this way (Vercel runtime errors, 2026-06/07).
 * The FIRST attempt wakes the compute, so a short retry succeeds. This wraps only the calls
 * where a cold-start miss loses real data (lead capture, form saves) — NOT a blanket wrapper,
 * so a genuine outage still surfaces quickly.
 *
 * Retries only the transient connection codes; anything else (unique-constraint, validation)
 * throws immediately.
 */
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 1500;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const transient =
        (typeof code === 'string' && TRANSIENT_CODES.has(code)) ||
        e instanceof Prisma.PrismaClientInitializationError;
      if (!transient || attempt === retries) throw e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}
