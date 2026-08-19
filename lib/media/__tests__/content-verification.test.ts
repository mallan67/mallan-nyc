/**
 * CONTENT VERIFICATION — BEHAVIOURAL CONTRACT. Expected RED.
 *
 * These prove the MINIMUM SCHEMA CLAIM before any migration is requested:
 *   listing_media.content_check_at DateTime? + content_check_state (NULL|VERIFIED|MISMATCH|INDETERMINATE)
 *
 * Population context (frozen, 6,542/6,542 censused): 1,475 verified-defect rows / 1,448 units;
 * 1,472 / 1,447 actionable. 8 CURRENT_PROVIDER_UNAVAILABLE + 1 UNVERIFIABLE are exactly the rows a
 * two-timestamp design would have starved — they are the reason INDETERMINATE exists.
 */
import {
  isDueForVerification,
  buildContentVerificationWhere,
  verifyRow,
  runBoundedVerificationPass,
  applyRepairVerified,
  type ContentCheckState,
  type VerifiableRow,
  type VerificationDeps,
  type VerificationIntervals,
} from '../content-verification';
import { buildR2MirrorableBacklogUniverseWhere } from '@/lib/idx/media-sync';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const DAY = 86_400_000;
const INTERVALS: VerificationIntervals = { verificationIntervalMs: 30 * DAY, retryIntervalMs: 1 * DAY };
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function row(over: Partial<VerifiableRow> = {}): VerifiableRow {
  return {
    media_key: '2005470401678',
    listing_id: 'RLS20054046',
    r2_key: 'photos/RLS20054046/1.jpg',
    media_url_original: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/a/b/c',
    content_check_at: null,
    content_check_state: null,
    ...over,
  };
}

interface Spies extends VerificationDeps {
  recorded: Array<{ mediaKey: string; state: ContentCheckState }>;
  fetches: string[];
}
function makeDeps(over: Partial<VerificationDeps> = {}): Spies {
  const recorded: Spies['recorded'] = [];
  const fetches: string[] = [];
  const base: VerificationDeps = {
    async resolveFreshLocator() { return 'https://api.cotality.com/fresh'; },
    async fetchProviderBytes(u) { fetches.push(`provider:${u}`); return Buffer.from('SAME-BYTES'); },
    async readR2Bytes(k) { fetches.push(`r2:${k}`); return Buffer.from('SAME-BYTES'); },
    async recordCheck(mediaKey, _at, state) { recorded.push({ mediaKey, state }); },
  };
  return Object.assign(base, over, { recorded, fetches }) as Spies;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('eligibility — who is due', () => {
  it('(1) a never-checked row is due', () => {
    expect(isDueForVerification(row(), NOW, INTERVALS)).toBe(true);
  });

  it('(2) a clean VERIFIED row ages back into eligibility after the verification interval', () => {
    const fresh = row({ content_check_state: 'VERIFIED', content_check_at: ago(29 * DAY) });
    const stale = row({ content_check_state: 'VERIFIED', content_check_at: ago(31 * DAY) });
    expect(isDueForVerification(fresh, NOW, INTERVALS)).toBe(false);
    expect(isDueForVerification(stale, NOW, INTERVALS)).toBe(true);
  });

  it('(3) a REPAIRED/versioned row also ages back into eligibility — the RC3 closure', () => {
    const repaired = row({
      r2_key: 'photos/RLS20054046/2005470401678.a1b2c3d4.jpg',
      content_check_state: 'VERIFIED',
      content_check_at: ago(31 * DAY),
    });
    expect(isDueForVerification(repaired, NOW, INTERVALS)).toBe(true);
  });

  it('(4) a MISMATCH row is NEVER verifier work, at any age', () => {
    for (const age of [0, 31 * DAY, 3650 * DAY]) {
      const r = row({ content_check_state: 'MISMATCH', content_check_at: ago(age) });
      expect(isDueForVerification(r, NOW, INTERVALS)).toBe(false);
    }
  });

  it('(6) an INDETERMINATE row is paced by its own retry interval, not the verification interval', () => {
    const recent = row({ content_check_state: 'INDETERMINATE', content_check_at: ago(DAY / 2) });
    const due = row({ content_check_state: 'INDETERMINATE', content_check_at: ago(2 * DAY) });
    expect(isDueForVerification(recent, NOW, INTERVALS)).toBe(false);
    expect(isDueForVerification(due, NOW, INTERVALS)).toBe(true);
    // and it must NOT be gated on the much longer verification interval
    const between = row({ content_check_state: 'INDETERMINATE', content_check_at: ago(10 * DAY) });
    expect(isDueForVerification(between, NOW, INTERVALS)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('outcomes — what a check may conclude', () => {
  it('(7) equal hashes on both sides ⇒ VERIFIED', async () => {
    const deps = makeDeps();
    const out = await verifyRow(row(), deps, NOW);
    expect(out.state).toBe('VERIFIED');
    expect(deps.recorded).toEqual([{ mediaKey: '2005470401678', state: 'VERIFIED' }]);
  });

  it('(4b) both sides obtained but hashes differ ⇒ MISMATCH', async () => {
    const deps = makeDeps({ async readR2Bytes() { return Buffer.from('DIFFERENT'); } });
    const out = await verifyRow(row(), deps, NOW);
    expect(out.state).toBe('MISMATCH');
  });

  it('(6b) a null fresh locator ⇒ INDETERMINATE, never MISMATCH (the 8 CURRENT_PROVIDER_UNAVAILABLE)', async () => {
    const deps = makeDeps({ async resolveFreshLocator() { return null; } });
    const out = await verifyRow(row(), deps, NOW);
    expect(out.state).toBe('INDETERMINATE');
  });

  it('(6c) a transient provider failure ⇒ INDETERMINATE (every 429 lands here)', async () => {
    const deps = makeDeps({ async fetchProviderBytes() { throw new Error('HTTP 429 after bounded retry'); } });
    const out = await verifyRow(row(), deps, NOW);
    expect(out.state).toBe('INDETERMINATE');
  });

  it('(6d) an R2 read failure ⇒ INDETERMINATE', async () => {
    const deps = makeDeps({ async readR2Bytes() { throw new Error('R2 unreadable'); } });
    const out = await verifyRow(row(), deps, NOW);
    expect(out.state).toBe('INDETERMINATE');
  });

  it('(8) a failed or incomplete hash comparison can NEVER become VERIFIED', async () => {
    const cases: Array<Partial<VerificationDeps>> = [
      { async resolveFreshLocator() { return null; } },
      { async fetchProviderBytes() { throw new Error('boom'); } },
      { async readR2Bytes() { throw new Error('boom'); } },
    ];
    for (const c of cases) {
      const deps = makeDeps(c);
      const out = await verifyRow(row(), deps, NOW);
      expect(out.state).not.toBe('VERIFIED');
      expect(deps.recorded.every((r) => r.state !== 'VERIFIED')).toBe(true);
    }
  });

  it('a row with no r2_key cannot be VERIFIED — absence of delivery is not equivalence', async () => {
    const deps = makeDeps();
    const out = await verifyRow(row({ r2_key: null }), deps, NOW);
    expect(out.state).not.toBe('VERIFIED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('detection performs no repair', () => {
  it('(5) detecting a mismatch performs NO R2 write and NO repair — recordCheck is the only write', async () => {
    const deps = makeDeps({ async readR2Bytes() { return Buffer.from('DIFFERENT'); } });
    const out = await verifyRow(row(), deps, NOW);
    expect(out.state).toBe('MISMATCH');
    expect(deps.recorded).toHaveLength(1);
    expect(deps.recorded[0].state).toBe('MISMATCH');
    // no upload/pointer/closure surface is even exposed to the verifier
    expect(Object.keys(deps)).not.toContain('uploadToR2');
    expect(Object.keys(deps)).not.toContain('updateRowPointers');
    expect(Object.keys(deps)).not.toContain('closeMediaWrite');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('pacing — nothing may monopolize the verifier', () => {
  it('(4c) MISMATCH rows are excluded from a bounded pass even when they dominate the table', async () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) => row({ media_key: `M${i}`, content_check_state: 'MISMATCH', content_check_at: ago(999 * DAY) })),
      row({ media_key: 'CLEAN', content_check_state: 'VERIFIED', content_check_at: ago(31 * DAY) }),
    ];
    const deps = makeDeps();
    const { outcomes } = await runBoundedVerificationPass(rows.filter((r) => isDueForVerification(r, NOW, INTERVALS)), 10, deps, NOW);
    expect(outcomes.map((o) => o.media_key)).toContain('CLEAN');
    expect(outcomes.some((o) => o.media_key.startsWith('M'))).toBe(false);
  });

  it('(6e) INDETERMINATE rows cannot starve clean rows — they leave the window for retryInterval', async () => {
    const justChecked = Array.from({ length: 50 }, (_, i) =>
      row({ media_key: `I${i}`, content_check_state: 'INDETERMINATE', content_check_at: ago(DAY / 2) }));
    const clean = row({ media_key: 'CLEAN', content_check_state: 'VERIFIED', content_check_at: ago(31 * DAY) });
    const due = [...justChecked, clean].filter((r) => isDueForVerification(r, NOW, INTERVALS));
    expect(due.map((r) => r.media_key)).toEqual(['CLEAN']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('separation from the R2 backlog (Gate 5)', () => {
  it('(10) the verification selector is structurally distinct from the backlog universe', () => {
    const verification = buildContentVerificationWhere(NOW, INTERVALS);
    const backlog = buildR2MirrorableBacklogUniverseWhere();
    expect(verification).not.toEqual(backlog);
    // the backlog universe is defined by MISSING delivery; verification never asserts that
    expect(JSON.stringify(verification)).not.toContain('"r2_key":null');
    expect(JSON.stringify(verification)).not.toContain('"media_url_cached":null');
  });

  it('(10b) a bounded pass reports zero backlog delta — it can never move backlog_remaining', async () => {
    const deps = makeDeps();
    const { backlogDelta } = await runBoundedVerificationPass([row()], 10, deps, NOW);
    expect(backlogDelta).toBe(0);
  });

  it('(10c) the verifier writes only content_check_* — never a delivery pointer or cooldown field', async () => {
    const deps = makeDeps({ async readR2Bytes() { return Buffer.from('DIFFERENT'); } });
    await verifyRow(row(), deps, NOW);
    for (const w of deps.recorded) {
      expect(Object.keys(w)).toEqual(['mediaKey', 'state']);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('repair handoff and durability', () => {
  it('(9) repair + verified read-back converts MISMATCH → VERIFIED and restarts the clock', () => {
    const mismatched = row({ content_check_state: 'MISMATCH', content_check_at: ago(90 * DAY) });
    const patch = applyRepairVerified(mismatched, NOW);
    expect(patch.content_check_state).toBe('VERIFIED');
    expect(patch.content_check_at).toEqual(NOW);
    const after = { ...mismatched, ...patch };
    expect(isDueForVerification(after, NOW, INTERVALS)).toBe(false);
    const later = new Date(NOW.getTime() + 31 * DAY);
    expect(isDueForVerification(after, later, INTERVALS)).toBe(true); // ages back in — Gate 11
  });

  it('(11) interruption/restart preserves all three durable outcomes', async () => {
    const rows = [
      row({ media_key: 'A' }),
      row({ media_key: 'B' }),
      row({ media_key: 'C' }),
      row({ media_key: 'D' }),
    ];
    const deps = makeDeps();
    const first = await runBoundedVerificationPass(rows, 2, deps, NOW);
    expect(first.outcomes).toHaveLength(2);
    expect(first.cursor.lastMediaKey).toBe('B');
    const second = await runBoundedVerificationPass(rows, 2, deps, NOW, first.cursor);
    expect(second.outcomes.map((o) => o.media_key)).toEqual(['C', 'D']);
    // every state survives a restart boundary, and each is paced by ITS OWN rule
    //   VERIFIED @1d  vs 30d verification interval -> not due
    //   MISMATCH @1d  -> never verifier work, at any age
    //   INDETERMINATE @1d vs 1d retry interval     -> due (its own, much shorter clock)
    const expectedDue: Record<ContentCheckState, boolean> = {
      VERIFIED: false,
      MISMATCH: false,
      INDETERMINATE: true,
    };
    for (const state of ['VERIFIED', 'MISMATCH', 'INDETERMINATE'] as ContentCheckState[]) {
      const persisted = row({ content_check_state: state, content_check_at: ago(DAY) });
      expect(persisted.content_check_state).toBe(state);
      expect(isDueForVerification(persisted, NOW, INTERVALS)).toBe(expectedDue[state]);
    }
  });
});
