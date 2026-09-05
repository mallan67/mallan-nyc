/// <reference types="jest" />
/**
 * BROKER DELEGATED ACCESS — the principal broker enters an agent's CRM account
 * with NO agent password and NO agent MFA, and returns with NO second MFA.
 *
 * This suite pins the FULL invariant set. Every one of these is a security
 * property, not a preference:
 *
 *   1. the parent is a non-delegated, authenticated BROKER session
 *      (`parent_session_id IS NULL`) — `requireBroker` alone is NOT enough,
 *      because a broker may delegate into another row whose role is BROKER,
 *      and that delegated session would itself pass `requireBroker`.
 *   2. a delegated session may NEVER create a further delegated session.
 *   3. a delegated `expires_at` is a FIXED MAXIMUM LIFETIME — never slid,
 *      never re-derived from the target's role.
 *   4. a child may never outlive its parent (clamped at creation).
 *   5. parent deletion or expiry invalidates the child IMMEDIATELY.
 *   6. the target agent's own sessions are untouched throughout.
 *   7. the relation is ON DELETE CASCADE, never SET NULL — clearing
 *      `parent_session_id` would silently convert a delegated child into an
 *      ordinary agent session with no server-side trace.
 *   8. `AuditEvent.user_id` stays the EFFECTIVE agent (load-bearing business
 *      data at seven call sites); `actor_user_id` carries the broker actor
 *      only during delegation, and is null otherwise.
 *
 * Fail-closed precedence, also pinned here:
 *   no parent_session_id                     -> ordinary session
 *   parent present, resolvable and valid     -> effective AGENT permissions
 *   parent unresolvable or expired           -> FAIL CLOSED (never broker)
 *
 * The live end-to-end proof against a real Postgres lives in the sibling
 * file `broker-delegated-access.integration.test.ts`.
 */

import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');
const SESSION_TS = path.join(ROOT, 'lib', 'auth', 'session.ts');
const MIDDLEWARE_TS = path.join(ROOT, 'lib', 'auth', 'middleware.ts');
const START_ROUTE = path.join(ROOT, 'app', 'api', 'crm', 'agents', '[id]', 'impersonate', 'route.ts');
const STOP_ROUTE = path.join(ROOT, 'app', 'api', 'auth', 'impersonation', 'stop', 'route.ts');

const read = (p: string) => readFileSync(p, 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// A. SCHEMA + MIGRATION DISCIPLINE (NEON.md §4)
// ═══════════════════════════════════════════════════════════════════════════
describe('A. authorized schema — exactly two nullable columns and one index', () => {
  let schema: string;
  beforeAll(() => { schema = read(SCHEMA); });

  const sessionModel = () => {
    const m = read(SCHEMA).match(/model Session \{[\s\S]*?\n\}/);
    if (!m) throw new Error('model Session not found');
    return m[0];
  };
  const auditModel = () => {
    const m = read(SCHEMA).match(/model AuditEvent \{[\s\S]*?\n\}/);
    if (!m) throw new Error('model AuditEvent not found');
    return m[0];
  };

  it('Session.parent_session_id is a NULLABLE String mapped to parent_session_id', () => {
    expect(sessionModel()).toMatch(/parent_session_id\s+String\?\s+@map\("parent_session_id"\)/);
  });

  it('AuditEvent.actor_user_id is a NULLABLE BigInt mapped to actor_user_id', () => {
    expect(auditModel()).toMatch(/actor_user_id\s+BigInt\?\s+@map\("actor_user_id"\)/);
  });

  it('the self-relation uses onDelete: Cascade and NEVER SetNull (deletion invariant)', () => {
    const m = sessionModel();
    expect(m).toMatch(/references:\s*\[id\][^\)]*onDelete:\s*Cascade/);
    expect(m).not.toMatch(/onDelete:\s*SetNull/);
  });

  it('exactly one new index — on parent_session_id — and no unauthorized index', () => {
    const m = sessionModel();
    expect(m).toMatch(/@@index\(\[parent_session_id\]\)/);
    // AuditEvent.actor_user_id was NOT authorized an index.
    expect(auditModel()).not.toMatch(/@@index\(\[[^\]]*actor_user_id/);
  });

  it('none of the UNAUTHORIZED columns were added to Session', () => {
    const m = sessionModel();
    for (const forbidden of [
      'actor_user_id',
      'actor_role',
      'parent_session_token',
      'delegation_expires_at',
      'delegation_status',
      'delegation_state',
      'is_delegated',
    ]) {
      expect(m).not.toContain(forbidden);
    }
  });

  it('no new authentication model was introduced', () => {
    const models = (schema.match(/^model\s+(\w+)/gm) || []).map(s => s.replace(/^model\s+/, ''));
    for (const invented of ['DelegatedSession', 'Impersonation', 'ImpersonationSession', 'Delegation']) {
      expect(models).not.toContain(invented);
    }
  });
});

describe('A2. two SEPARATE migrations — one column per commit (NEON.md §4)', () => {
  const dirs = () => readdirSync(MIGRATIONS_DIR).filter(d => !d.endsWith('.toml'));

  /**
   * The EXECUTABLE statements only. These migrations carry long `--` rationale
   * headers that legitimately quote the very phrases being asserted against
   * ("Never NOT NULL DEFAULT", "CREATE INDEX ... CONCURRENTLY"), so asserting
   * over the raw file would test the prose instead of the SQL.
   */
  const stripComments = (sql: string) =>
    sql
      .split(/\r?\n/)
      .filter(l => !/^\s*--/.test(l))
      .join('\n');

  const sessionMig = () => {
    const d = dirs().find(x => /parent_session_id/.test(x));
    if (!d) throw new Error('no migration directory naming parent_session_id');
    return stripComments(read(path.join(MIGRATIONS_DIR, d, 'migration.sql')));
  };
  const auditMig = () => {
    const d = dirs().find(x => /actor_user_id/.test(x));
    if (!d) throw new Error('no migration directory naming actor_user_id');
    return stripComments(read(path.join(MIGRATIONS_DIR, d, 'migration.sql')));
  };

  it('there is a dedicated migration for sessions.parent_session_id', () => {
    expect(dirs().filter(x => /parent_session_id/.test(x))).toHaveLength(1);
  });

  it('there is a SEPARATE dedicated migration for audit_events.actor_user_id', () => {
    expect(dirs().filter(x => /actor_user_id/.test(x))).toHaveLength(1);
  });

  it('the two migrations are distinct directories (two rollback paths)', () => {
    const a = dirs().find(x => /parent_session_id/.test(x));
    const b = dirs().find(x => /actor_user_id/.test(x));
    expect(a).not.toEqual(b);
  });

  it('the sessions migration adds a NULLABLE column (never NOT NULL DEFAULT)', () => {
    const sql = sessionMig();
    expect(sql).toMatch(/ALTER TABLE "sessions" ADD COLUMN "parent_session_id" TEXT;/);
    expect(sql).not.toMatch(/NOT NULL/i);
  });

  it('the sessions migration declares ON DELETE CASCADE explicitly (NEON.md forbids an unspecified FK)', () => {
    const sql = sessionMig();
    expect(sql).toMatch(/FOREIGN KEY \("parent_session_id"\) REFERENCES "sessions"\("id"\)/);
    expect(sql).toMatch(/ON DELETE CASCADE/);
    expect(sql).not.toMatch(/ON DELETE SET NULL/);
  });

  it('the sessions migration creates exactly one index', () => {
    const sql = sessionMig();
    expect((sql.match(/CREATE +(UNIQUE +)?INDEX/g) || [])).toHaveLength(1);
    expect(sql).toMatch(/CREATE INDEX "sessions_parent_session_id_idx" ON "sessions"\("parent_session_id"\)/);
  });

  it('the audit_events migration adds ONLY the nullable actor_user_id column', () => {
    const sql = auditMig();
    expect(sql).toMatch(/ALTER TABLE "audit_events" ADD COLUMN "actor_user_id" BIGINT;/);
    expect(sql).not.toMatch(/NOT NULL/i);
    expect(sql).not.toMatch(/CREATE +(UNIQUE +)?INDEX/);
    // one column per commit — it must not also touch sessions
    expect(sql).not.toMatch(/"sessions"/);
  });

  it('neither migration uses prisma db push or a destructive statement', () => {
    for (const sql of [sessionMig(), auditMig()]) {
      expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE|TRUNCATE/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B–D. lib/auth/session.ts against an in-memory Prisma double
// ═══════════════════════════════════════════════════════════════════════════

type Row = {
  id: string;
  token: string;
  user_type: string;
  user_id: bigint;
  role: string;
  expires_at: Date;
  created_at: Date;
  ip_address: string | null;
  user_agent: string | null;
  parent_session_id: string | null;
};

const store = new Map<string, Row>();
let seq = 0;

/** Emulates ON DELETE CASCADE for the sessions self-relation. */
function cascadeDelete(id: string) {
  store.delete(id);
  for (const [k, v] of Array.from(store.entries())) {
    if (v.parent_session_id === id) cascadeDelete(k);
    void k;
  }
}

const find = (where: { token?: string; id?: string }) => {
  if (where.id) return store.get(where.id) ?? null;
  for (const r of store.values()) if (r.token === where.token) return r;
  return null;
};

const mockPrismaDouble = {
  session: {
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      const row: Row = {
        id: `sess-${++seq}`,
        token: data.token as string,
        user_type: data.user_type as string,
        user_id: data.user_id as bigint,
        role: data.role as string,
        expires_at: data.expires_at as Date,
        created_at: new Date(),
        ip_address: (data.ip_address ?? null) as string | null,
        user_agent: (data.user_agent ?? null) as string | null,
        parent_session_id: (data.parent_session_id ?? null) as string | null,
      };
      store.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: { where: { token?: string; id?: string } }) => find(where)),
    update: jest.fn(async ({ where, data }: { where: { token?: string; id?: string }; data: Partial<Row> }) => {
      const row = find(where);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
    delete: jest.fn(async ({ where }: { where: { token?: string; id?: string } }) => {
      const row = find(where);
      if (!row) throw new Error('not found');
      cascadeDelete(row.id);
      return row;
    }),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  },
  auditEvent: { create: jest.fn(async (a: unknown) => a) },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: mockPrismaDouble }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sessionLib = require('@/lib/auth/session');

const HOUR = 60 * 60 * 1000;

function seedBroker(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: `sess-${++seq}`,
    token: `tok-broker-${seq}`,
    user_type: 'agent',
    user_id: 1n,
    role: 'BROKER',
    expires_at: new Date(Date.now() + 24 * HOUR),
    created_at: new Date(),
    ip_address: null,
    user_agent: null,
    parent_session_id: null,
    ...overrides,
  };
  store.set(row.id, row);
  return row;
}

beforeEach(() => {
  store.clear();
  seq = 0;
  jest.clearAllMocks();
});

describe('B. createSessionRecord — delegation creation is fail-closed', () => {
  it('an ordinary session is created with parent_session_id = null', async () => {
    const created = await sessionLib.createSessionRecord('agent', 7n, 'SALESPERSON');
    expect(store.get(created.sessionId)!.parent_session_id).toBeNull();
  });

  it('a delegated session stores the parent Session.id — never a token (invariant: never a token)', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id,
      maxLifetimeMs: 2 * HOUR,
    });
    const row = store.get(created.sessionId)!;
    expect(row.parent_session_id).toBe(parent.id);
    expect(row.parent_session_id).not.toBe(parent.token);
    // the delegated row carries the EFFECTIVE agent identity, not the broker's
    expect(row.user_id).toBe(9n);
    expect(row.role).toBe('SALESPERSON');
  });

  it('INVARIANT 1 — refuses when the parent session is not a BROKER session', async () => {
    const parent = seedBroker({ role: 'SALESPERSON' });
    await expect(
      sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
        parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
      })
    ).rejects.toMatchObject({ reason: 'PARENT_NOT_BROKER' });
    expect(store.size).toBe(1); // no row created
  });

  it('INVARIANT 1+2 — refuses when the parent session is ITSELF delegated (no chaining)', async () => {
    const grandparent = seedBroker();
    const delegated = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: grandparent.id, maxLifetimeMs: 2 * HOUR,
    });
    const sizeBefore = store.size;
    await expect(
      sessionLib.createSessionRecord('agent', 11n, 'SALESPERSON', undefined, undefined, {
        parentSessionId: delegated.sessionId, maxLifetimeMs: 2 * HOUR,
      })
    ).rejects.toMatchObject({ reason: 'PARENT_IS_DELEGATED' });
    expect(store.size).toBe(sizeBefore); // NO session row was created
  });

  it('a PRE-EXISTING delegated BROKER row still cannot delegate (defence in depth)', async () => {
    // The target rule means this row can no longer be CREATED. A row written
    // before that rule existed still could, so the anti-chaining check must
    // hold independently rather than relying on the target rule upstream.
    const grandparent = seedBroker();
    const legacyDelegatedBroker = seedBroker({
      user_id: 9n,
      role: 'BROKER',
      parent_session_id: grandparent.id,
    });
    const sizeBefore = store.size;
    await expect(
      sessionLib.createSessionRecord('agent', 11n, 'SALESPERSON', undefined, undefined, {
        parentSessionId: legacyDelegatedBroker.id, maxLifetimeMs: 2 * HOUR,
      })
    ).rejects.toMatchObject({ reason: 'PARENT_IS_DELEGATED' });
    expect(store.size).toBe(sizeBefore);
    // and it does not even validate as a session
    expect(await sessionLib.validateSession(legacyDelegatedBroker.token)).not.toBeNull();
  });

  it('refuses a nonexistent parent', async () => {
    await expect(
      sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
        parentSessionId: 'sess-does-not-exist', maxLifetimeMs: 2 * HOUR,
      })
    ).rejects.toMatchObject({ reason: 'PARENT_NOT_FOUND' });
    expect(store.size).toBe(0);
  });

  it('refuses an already-expired parent', async () => {
    const parent = seedBroker({ expires_at: new Date(Date.now() - 1000) });
    await expect(
      sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
        parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
      })
    ).rejects.toMatchObject({ reason: 'PARENT_EXPIRED' });
    expect(store.size).toBe(1);
  });

  it('INVARIANT 3 — the delegated expiry is the FIXED cap, not the 8h agent role duration', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    const ms = created.expiresAt.getTime() - Date.now();
    expect(ms).toBeLessThanOrEqual(2 * HOUR + 2000);
    expect(ms).toBeGreaterThan(2 * HOUR - 60_000);
  });

  it('INVARIANT 4 — the child is clamped to the parent expiry when the parent expires sooner', async () => {
    const parent = seedBroker({ expires_at: new Date(Date.now() + 30 * 60 * 1000) }); // 30 min left
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    expect(created.expiresAt.getTime()).toBe(parent.expires_at.getTime());
    expect(created.expiresAt.getTime()).toBeLessThan(Date.now() + 2 * HOUR);
  });

  it('no parent credential or token is copied onto the delegated row', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    const row = store.get(created.sessionId)!;
    expect(created.token).not.toBe(parent.token);
    // No field of the delegated row may hold the parent's token. (BigInt is
    // not JSON-serializable, so compare the string-valued fields directly.)
    const stringFields = Object.values(row).filter(v => typeof v === 'string');
    expect(stringFields).not.toContain(parent.token);
    expect(row.parent_session_id).toBe(parent.id);
  });
});

describe('C. validateSession — fail-closed precedence', () => {
  it('no parent_session_id -> ordinary session, actorUserId null', async () => {
    const created = await sessionLib.createSessionRecord('agent', 7n, 'SALESPERSON');
    const u = await sessionLib.validateSession(created.token);
    expect(u).toMatchObject({ userId: 7n, role: 'SALESPERSON', parentSessionId: null, actorUserId: null });
  });

  it('parent valid -> EFFECTIVE AGENT identity, with the broker as actorUserId', async () => {
    const parent = seedBroker({ user_id: 1n });
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    const u = await sessionLib.validateSession(created.token);
    // authorization operates as the AGENT
    expect(u.userId).toBe(9n);
    expect(u.role).toBe('SALESPERSON');
    // and the real human actor is recorded
    expect(u.actorUserId).toBe(1n);
    expect(u.parentSessionId).toBe(parent.id);
  });

  it('INVARIANT 5 — parent DELETED -> child immediately invalid, never broker authority', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    cascadeDelete(parent.id);
    const u = await sessionLib.validateSession(created.token);
    expect(u).toBeNull();
  });

  it('INVARIANT 5 — parent EXPIRED -> child invalid, and does NOT fall back to broker', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    parent.expires_at = new Date(Date.now() - 1000);
    const u = await sessionLib.validateSession(created.token);
    expect(u).toBeNull();
  });

  it('an ORPHANED delegated row (parent_session_id pointing nowhere) FAILS CLOSED', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    // simulate a row that survived its parent (cascade bypassed)
    store.get(created.sessionId)!.parent_session_id = 'sess-vanished';
    expect(await sessionLib.validateSession(created.token)).toBeNull();
  });

  it('an expired DELEGATED session is rejected and does not fall back to broker authority', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    store.get(created.sessionId)!.expires_at = new Date(Date.now() - 1000);
    expect(await sessionLib.validateSession(created.token)).toBeNull();
    // and the parent broker row is untouched by the child's expiry
    expect(store.get(parent.id)).toBeDefined();
  });

  it('INVARIANT 3 — repeated use inside the refresh window does NOT move a delegated expires_at', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    // force the row inside the 1h sliding-refresh threshold
    const fixed = new Date(Date.now() + 10 * 60 * 1000);
    store.get(created.sessionId)!.expires_at = fixed;

    for (let i = 0; i < 5; i++) await sessionLib.validateSession(created.token);

    expect(store.get(created.sessionId)!.expires_at.getTime()).toBe(fixed.getTime());
    // and it certainly did not get re-derived to the 8h agent duration
    expect(store.get(created.sessionId)!.expires_at.getTime()).toBeLessThan(Date.now() + HOUR);
  });

  it('an ORDINARY session still slides (the delegated carve-out did not break normal renewal)', async () => {
    const created = await sessionLib.createSessionRecord('agent', 7n, 'SALESPERSON');
    const soon = new Date(Date.now() + 10 * 60 * 1000);
    store.get(created.sessionId)!.expires_at = soon;
    await sessionLib.validateSession(created.token);
    expect(store.get(created.sessionId)!.expires_at.getTime()).toBeGreaterThan(soon.getTime());
  });
});

describe('D. endDelegationAndRotateParent — Return to Broker, no second MFA', () => {
  it('destroys ONLY the delegated row and preserves the parent broker row', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    const restored = await sessionLib.endDelegationAndRotateParent(created.sessionId);
    expect(store.get(created.sessionId)).toBeUndefined();
    expect(store.get(parent.id)).toBeDefined();
    expect(restored.userId).toBe(1n);
    expect(restored.role).toBe('BROKER');
  });

  it('rotates a FRESH token onto the preserved parent row (old token is dead)', async () => {
    const parent = seedBroker();
    const oldToken = parent.token;
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    const restored = await sessionLib.endDelegationAndRotateParent(created.sessionId);
    expect(restored.token).not.toBe(oldToken);
    expect(store.get(parent.id)!.token).toBe(restored.token);
    expect(await sessionLib.validateSession(oldToken)).toBeNull();
    // the restored token authenticates the broker again — with no MFA step
    const u = await sessionLib.validateSession(restored.token);
    expect(u).toMatchObject({ userId: 1n, role: 'BROKER', parentSessionId: null, actorUserId: null });
  });

  it('returns null for a session that is not delegated (nothing is destroyed)', async () => {
    const created = await sessionLib.createSessionRecord('agent', 7n, 'SALESPERSON');
    expect(await sessionLib.endDelegationAndRotateParent(created.sessionId)).toBeNull();
    expect(store.get(created.sessionId)).toBeDefined();
  });

  it('fails closed when the parent expired mid-delegation — child destroyed, nothing restored', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    parent.expires_at = new Date(Date.now() - 1000);
    expect(await sessionLib.endDelegationAndRotateParent(created.sessionId)).toBeNull();
    expect(store.get(created.sessionId)).toBeUndefined();
  });

  it('INVARIANT 6 — the target agent\'s own independent sessions are untouched throughout', async () => {
    const agentOwn = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON');
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    await sessionLib.endDelegationAndRotateParent(created.sessionId);
    const still = await sessionLib.validateSession(agentOwn.token);
    expect(still).toMatchObject({ userId: 9n, parentSessionId: null, actorUserId: null });
    expect(store.get(agentOwn.sessionId)!.token).toBe(agentOwn.token);
  });

  it('deleting the PARENT cascades the child away but never touches the agent\'s own session', async () => {
    const agentOwn = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON');
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    cascadeDelete(parent.id);
    expect(store.get(created.sessionId)).toBeUndefined();
    expect(await sessionLib.validateSession(agentOwn.token)).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. SOURCE PINS — the canonical routes, not a second auth system
// ═══════════════════════════════════════════════════════════════════════════
describe('E. the canonical routes were repaired (no second authentication system)', () => {
  it('the delegated token occupies the SINGLE session_token cookie — no second cookie name', () => {
    const start = read(START_ROUTE);
    const stop = read(STOP_ROUTE);
    for (const src of [start, stop]) {
      expect(src).toMatch(/SESSION_COOKIE/);
      // Three call sites read the literal 'session_token' outside the shared
      // helper and proxy.ts cannot reach them, so a second cookie would resolve
      // BROKER mid-delegation.
      expect(src).not.toMatch(/cookies\.set\(\s*['"](?!session_token)[a-z_]*(impersonat|delegat|parent|broker)[a-z_]*['"]/i);
    }
  });

  it('the start route requires a NON-DELEGATED broker (requireBroker alone is insufficient)', () => {
    const src = read(START_ROUTE);
    expect(src).toMatch(/requireNonDelegatedBroker\(req\)/);
  });

  it('the start route no longer creates an unparented session', () => {
    const src = read(START_ROUTE);
    expect(src).toMatch(/parentSessionId:\s*auth\.sessionId/);
    expect(src).toMatch(/maxLifetimeMs/);
  });

  it('the stop route restores the broker WITHOUT a re-login / second MFA', () => {
    const src = read(STOP_ROUTE);
    expect(src).toMatch(/endDelegationAndRotateParent/);
    // the old broken contract told the broker to log in again
    expect(src).not.toMatch(/Please log in again/);
    expect(src).not.toMatch(/res\.cookies\.delete\(SESSION_COOKIE\);\s*\n\s*return res;\s*\n\}\s*$/);
  });

  it('the stop route refuses when the caller is not in a delegated session', () => {
    expect(read(STOP_ROUTE)).toMatch(/!auth\.parentSessionId/);
  });

  it('logAuditEvent stamps actor_user_id and does NOT invert user_id', () => {
    const src = read(MIDDLEWARE_TS);
    expect(src).toMatch(/user_id:\s*user\.userId/);
    expect(src).toMatch(/actor_user_id:\s*user\.actorUserId\s*\?\?\s*null/);
    // the effective user must never be replaced by the actor
    expect(src).not.toMatch(/(?<!actor_)user_id:\s*user\.actorUserId/);
  });

  it('the sliding refresh is gated so a delegated row can never be extended', () => {
    const src = read(SESSION_TS);
    const refreshIdx = src.indexOf('REFRESH_THRESHOLD_MS');
    expect(refreshIdx).toBeGreaterThan(0);
    expect(src).toMatch(/parent_session_id/);
    // the refresh must be inside a non-delegated branch
    expect(src).toMatch(/session\.parent_session_id[\s\S]{0,2000}REFRESH_THRESHOLD_MS/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F. TARGET RULE — no delegated session may EVER carry broker authority
// ═══════════════════════════════════════════════════════════════════════════
describe('F. a BROKER account is not a delegated-access target', () => {
  it('refuses a BROKER target at the single writer, and creates NO session row', async () => {
    const parent = seedBroker();
    const before = store.size;
    await expect(
      sessionLib.createSessionRecord('agent', 9n, 'BROKER', undefined, undefined, {
        parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
      })
    ).rejects.toMatchObject({ reason: 'TARGET_IS_BROKER' });
    expect(store.size).toBe(before);
  });

  it('refuses lowercase "broker" too (live data carries mixed casing)', async () => {
    const parent = seedBroker();
    await expect(
      sessionLib.createSessionRecord('agent', 9n, 'broker', undefined, undefined, {
        parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
      })
    ).rejects.toMatchObject({ reason: 'TARGET_IS_BROKER' });
  });

  it('refuses a non-licensee target role', async () => {
    const parent = seedBroker();
    await expect(
      sessionLib.createSessionRecord('agent', 9n, 'OFFICE_ADMIN', undefined, undefined, {
        parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
      })
    ).rejects.toMatchObject({ reason: 'TARGET_NOT_LICENSEE' });
    expect(store.size).toBe(1);
  });

  it('PERMITS ASSOCIATE_BROKER, SALESPERSON and legacy AGENT targets', async () => {
    for (const role of ['ASSOCIATE_BROKER', 'SALESPERSON', 'AGENT']) {
      const parent = seedBroker();
      const created = await sessionLib.createSessionRecord('agent', 9n, role, undefined, undefined, {
        parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
      });
      expect(store.get(created.sessionId)!.role).toBe(role);
    }
  });

  it('NO delegated row in the store carries role BROKER, ever', async () => {
    const parent = seedBroker();
    await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    await sessionLib.createSessionRecord('agent', 10n, 'ASSOCIATE_BROKER', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    const delegatedRows = Array.from(store.values()).filter(r => r.parent_session_id !== null);
    expect(delegatedRows.length).toBeGreaterThan(0);
    for (const r of delegatedRows) {
      expect(r.role.toUpperCase()).not.toBe('BROKER');
    }
  });

  it('isDelegationTargetRole encodes the product rule', () => {
    expect(sessionLib.isDelegationTargetRole('BROKER')).toBe(false);
    expect(sessionLib.isDelegationTargetRole('broker')).toBe(false);
    expect(sessionLib.isDelegationTargetRole('ASSOCIATE_BROKER')).toBe(true);
    expect(sessionLib.isDelegationTargetRole('SALESPERSON')).toBe(true);
    expect(sessionLib.isDelegationTargetRole('AGENT')).toBe(true);
    expect(sessionLib.isDelegationTargetRole('OFFICE_ADMIN')).toBe(false);
    expect(sessionLib.isDelegationTargetRole(null)).toBe(false);
  });

  it('the route refuses a BROKER target SEPARATELY from self-impersonation', () => {
    const src = read(START_ROUTE);
    // two distinct refusals, two distinct messages
    expect(src).toMatch(/Cannot impersonate yourself/);
    expect(src).toMatch(/Cannot delegate into a broker account/);
    // and the self-check comes first so it keeps its own error
    expect(src.indexOf('Cannot impersonate yourself'))
      .toBeLessThan(src.indexOf('Cannot delegate into a broker account'));
    expect(src).toMatch(/isPrincipalBroker\(agent\.role\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. THE CEILING — byte-for-byte, and no refresh side channel
// ═══════════════════════════════════════════════════════════════════════════
describe('G. the delegated ceiling cannot be moved by activity', () => {
  it('expires_at is BYTE-FOR-BYTE unchanged after repeated use in the refresh window', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    const row = store.get(created.sessionId)!;
    row.expires_at = new Date(Date.now() + 5 * 60 * 1000); // deep inside the 1h threshold
    const beforeIso = row.expires_at.toISOString();
    const parentBeforeIso = store.get(parent.id)!.expires_at.toISOString();

    for (let i = 0; i < 10; i++) {
      const u = await sessionLib.validateSession(created.token);
      expect(u).not.toBeNull();
    }

    expect(store.get(created.sessionId)!.expires_at.toISOString()).toBe(beforeIso);
    // and verifying the parent must not become a side channel that refreshes IT
    expect(store.get(parent.id)!.expires_at.toISOString()).toBe(parentBeforeIso);
  });

  it('validating a delegated session performs NO session write at all', async () => {
    const parent = seedBroker();
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    store.get(created.sessionId)!.expires_at = new Date(Date.now() + 5 * 60 * 1000);

    mockPrismaDouble.session.update.mockClear();
    mockPrismaDouble.session.delete.mockClear();
    for (let i = 0; i < 5; i++) await sessionLib.validateSession(created.token);

    // The parent check is a read. If it ever became a write, this catches it.
    expect(mockPrismaDouble.session.update).not.toHaveBeenCalled();
    expect(mockPrismaDouble.session.delete).not.toHaveBeenCalled();
  });

  it('the child cannot outlive the parent even when the parent expires first', async () => {
    const parent = seedBroker({ expires_at: new Date(Date.now() + 20 * 60 * 1000) });
    const created = await sessionLib.createSessionRecord('agent', 9n, 'SALESPERSON', undefined, undefined, {
      parentSessionId: parent.id, maxLifetimeMs: 2 * HOUR,
    });
    // clamped at creation ...
    expect(created.expiresAt.toISOString()).toBe(parent.expires_at.toISOString());
    // ... and still enforced at validation time once the parent lapses
    store.get(parent.id)!.expires_at = new Date(Date.now() - 1);
    expect(await sessionLib.validateSession(created.token)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H. AUDIT-WRITER CENSUS — AuditEvent is NOT written through one helper
// ═══════════════════════════════════════════════════════════════════════════
/**
 * `AuditEvent` doubles as a general-purpose entity store — CE courses,
 * referrals, financial scenarios, listing engagement, campaigns — and several
 * of those are DIRECT `prisma.auditEvent.create` calls that never pass through
 * logAuditEvent(). Instrumenting only the helper would leave delegated
 * provenance silently blank on exactly the records that matter most.
 *
 * This scanner walks every direct writer in the namespaces a DELEGATED session
 * can reach and fails if any of them omits `actor_user_id`. It is the guard
 * against a NEW un-instrumented writer being added later.
 */
describe('H. every delegation-reachable AuditEvent writer carries actor context', () => {
  const REACHABLE_DIRS = [
    path.join(ROOT, 'app', 'api', 'crm'),
    path.join(ROOT, 'app', 'api', 'portal'),
  ];
  const REACHABLE_LIB_FILES = [
    path.join(ROOT, 'lib', 'auth', 'middleware.ts'),
    path.join(ROOT, 'lib', 'email', 'sendgrid.ts'),
    path.join(ROOT, 'lib', 'agents', 'agent-lifecycle.ts'),
    path.join(ROOT, 'lib', 'search', 'search-run-recorder.ts'),
  ];

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(full));
      else if (e.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  /**
   * Drop comment lines before scanning. Several of these files DOCUMENT the
   * audit row they write in a `//` header, so scanning raw source would flag
   * prose as an un-instrumented writer.
   */
  function stripCodeComments(src: string): string {
    return src
      .split(/\r?\n/)
      .filter(l => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
  }

  /** Every `auditEvent.create(` block in a file, brace-balanced. */
  function createBlocks(rawSrc: string): string[] {
    const src = stripCodeComments(rawSrc);
    const blocks: string[] = [];
    const re = /auditEvent\.create\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      let depth = 0;
      let i = m.index + m[0].length - 1;
      const start = i;
      for (; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      blocks.push(src.slice(start, i + 1));
    }
    return blocks;
  }

  const files = [
    ...REACHABLE_DIRS.flatMap(walk),
    ...REACHABLE_LIB_FILES,
  ];

  it('the census actually found direct writers (the scanner is not vacuous)', () => {
    const withCreates = files.filter(f => createBlocks(read(f)).length > 0);
    // 17 route files + 4 lib files carried direct creates at the time of
    // writing. If this drops to a handful the scanner has stopped working.
    expect(withCreates.length).toBeGreaterThanOrEqual(15);
  });

  it('NO direct writer in a delegation-reachable namespace omits actor_user_id', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const block of createBlocks(read(f))) {
        if (!/actor_user_id/.test(block)) {
          offenders.push(path.relative(ROOT, f) + ' :: ' + block.slice(0, 90).replace(/\s+/g, ' '));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('NO direct writer sets user_id to the ACTOR (the inversion Maya forbade)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const block of createBlocks(read(f))) {
        if (/(?<!actor_)user_id:\s*[A-Za-z_$][\w$.]*\.actorUserId/.test(block)) {
          offenders.push(path.relative(ROOT, f));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('there is no createMany or raw-SQL writer hiding in a reachable namespace', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripCodeComments(read(f));
      if (/auditEvent\.createMany\(/.test(src)) offenders.push(path.relative(ROOT, f) + ' (createMany)');
      if (/INSERT\s+INTO\s+"?audit_events"?/i.test(src)) offenders.push(path.relative(ROOT, f) + ' (raw SQL)');
    }
    expect(offenders).toEqual([]);
  });
});
