/// <reference types="jest" />
/**
 * Phase 0.5 — scripts/neon-prune-branches.ts --execute production-target guard.
 *
 * Proves the manual CLI fails closed: a real delete (--execute) is refused
 * BEFORE pruneBranches is ever called with execute:true unless NEON_PROJECT_ID
 * is the canonical production project. Dry-run is read-only and allowed to
 * proceed (with a non-canonical warning).
 *
 * pruneBranches is mocked so no Neon API call is made by these tests.
 */
const pruneBranchesMock = jest.fn();
jest.mock('@/lib/neon/branches', () => ({
  __esModule: true,
  pruneBranches: pruneBranchesMock,
}));

import { runPruneCli } from '@/scripts/neon-prune-branches';

const EMPTY_RESULT = {
  examined: 0,
  primary_count: 0,
  protected_count: 0,
  too_recent_count: 0,
  pruned: [] as { id: string; name: string; updated_at: string }[],
  errors: [] as { id: string; name: string; message: string }[],
};

const CANONICAL = 'hidden-mountain-87248164';
const STALE = 'morning-bread-68708332';

beforeEach(() => {
  jest.clearAllMocks();
  pruneBranchesMock.mockResolvedValue(EMPTY_RESULT);
});

describe('neon-prune-branches CLI — --execute fail-closed guard', () => {
  it('req 1: --execute with stale morning-bread → refuses (exit 2), pruneBranches NOT called', async () => {
    const code = await runPruneCli(['--execute'], { NEON_API_KEY: 'k', NEON_PROJECT_ID: STALE });
    expect(code).toBe(2);
    expect(pruneBranchesMock).not.toHaveBeenCalled();
  });

  it('req 2a: --execute with MISSING project → refuses (exit 2), pruneBranches NOT called', async () => {
    const code = await runPruneCli(['--execute'], { NEON_API_KEY: 'k' });
    expect(code).toBe(2);
    expect(pruneBranchesMock).not.toHaveBeenCalled();
  });

  it('req 2b: --execute with UNKNOWN project → refuses (exit 2), pruneBranches NOT called', async () => {
    const code = await runPruneCli(['--execute'], { NEON_API_KEY: 'k', NEON_PROJECT_ID: 'some-unknown-9999' });
    expect(code).toBe(2);
    expect(pruneBranchesMock).not.toHaveBeenCalled();
  });

  it('req 3: refusal happens BEFORE any execute:true mutation (no pruneBranches call at all)', async () => {
    await runPruneCli(['--execute'], { NEON_API_KEY: 'k', NEON_PROJECT_ID: STALE });
    await runPruneCli(['--execute'], { NEON_API_KEY: 'k', NEON_PROJECT_ID: 'nope' });
    // Across both refusals, pruneBranches was never invoked — so execute:true
    // never reached the Neon delete path.
    expect(pruneBranchesMock).not.toHaveBeenCalled();
    expect(
      pruneBranchesMock.mock.calls.some((c) => (c[0] as { execute?: boolean })?.execute === true),
    ).toBe(false);
  });

  it('req 4a: canonical project + --execute → passes guard, pruneBranches called with execute:true', async () => {
    const code = await runPruneCli(['--execute'], { NEON_API_KEY: 'k', NEON_PROJECT_ID: CANONICAL });
    expect(code).toBe(0);
    expect(pruneBranchesMock).toHaveBeenCalledTimes(1);
    expect(pruneBranchesMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: CANONICAL, execute: true }),
    );
  });

  it('req 4b: canonical project + dry-run → pruneBranches called with execute:false', async () => {
    const code = await runPruneCli([], { NEON_API_KEY: 'k', NEON_PROJECT_ID: CANONICAL });
    expect(code).toBe(0);
    expect(pruneBranchesMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: CANONICAL, execute: false }),
    );
  });

  it('dry-run with non-canonical project is allowed (read-only) → execute:false, exit 0', async () => {
    const code = await runPruneCli([], { NEON_API_KEY: 'k', NEON_PROJECT_ID: STALE });
    expect(code).toBe(0);
    expect(pruneBranchesMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: STALE, execute: false }),
    );
  });

  it('invalid --hours → exit 2 before any prune (input validation preserved)', async () => {
    const code = await runPruneCli(['--execute', '--hours=24h'], { NEON_API_KEY: 'k', NEON_PROJECT_ID: CANONICAL });
    expect(code).toBe(2);
    expect(pruneBranchesMock).not.toHaveBeenCalled();
  });
});
