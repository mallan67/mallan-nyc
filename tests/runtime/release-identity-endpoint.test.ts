/// <reference types="jest" />
/**
 * GET /api/release-identity — the token-free, deployment-bound production
 * identity endpoint the release-truth workflow polls. Proves: it returns the
 * Vercel system values, is uncached (no-store), and FAILS CLOSED (503) on any
 * missing or malformed value.
 */
import { GET } from '@/app/api/release-identity/route';

const SHA = 'b7386c289ca98fff27a0ca0af90d8724544b0026'; // 40-hex
const DPL = 'dpl_Gc7dVSp9TkQa7b83Zmw7io1mENyU';

const ENV_KEYS = ['VERCEL_GIT_COMMIT_SHA', 'VERCEL_DEPLOYMENT_ID', 'VERCEL_TARGET_ENV'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setEnv(sha?: string, dpl?: string, target?: string) {
  if (sha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = sha;
  if (dpl === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
  else process.env.VERCEL_DEPLOYMENT_ID = dpl;
  if (target === undefined) delete process.env.VERCEL_TARGET_ENV;
  else process.env.VERCEL_TARGET_ENV = target;
}

describe('GET /api/release-identity', () => {
  it('valid production env => 200 with commitSha/deploymentId/targetEnv and no-store', async () => {
    setEnv(SHA, DPL, 'production');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ commitSha: SHA, deploymentId: DPL, targetEnv: 'production' });
    expect(res.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(res.headers.get('X-Robots-Tag')).toMatch(/noindex/);
  });

  it('valid PREVIEW env => 200 (endpoint allows preview; the verifier enforces production)', async () => {
    setEnv(SHA, DPL, 'preview');
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).targetEnv).toBe('preview');
  });

  it('missing deploymentId => 503 fail-closed', async () => {
    setEnv(SHA, undefined, 'production');
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/unavailable|malformed/i);
    expect(res.headers.get('Cache-Control')).toBe('no-store, max-age=0');
  });

  it('missing commitSha => 503 fail-closed', async () => {
    setEnv(undefined, DPL, 'production');
    expect((await GET()).status).toBe(503);
  });

  it('malformed commitSha (not 40-hex) => 503', async () => {
    setEnv('deadbeef', DPL, 'production');
    expect((await GET()).status).toBe(503);
  });

  it('malformed deploymentId (not dpl_…) => 503', async () => {
    setEnv(SHA, '12345', 'production');
    expect((await GET()).status).toBe(503);
  });

  it('unknown targetEnv => 503', async () => {
    setEnv(SHA, DPL, 'staging');
    expect((await GET()).status).toBe(503);
  });
});
