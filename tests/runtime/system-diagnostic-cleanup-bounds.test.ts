/**
 * Bounded-deletion guarantees for the 30-day system-diagnostic retention.
 *
 * These are the ALWAYS-RUN guarantees: the shape of the statement and the
 * arithmetic of the batching, proven without a database by capturing the
 * `Prisma.Sql` the module builds. The BEHAVIOURAL cases (a 29-day row survives,
 * a 31-day row is taken, a non-allowlisted row survives, interrupted runs
 * resume) are proven against real PostgreSQL in
 * `system-diagnostic-cleanup-postgres.test.ts` — a mocked client cannot prove
 * what a predicate actually matches.
 *
 * Why parameter capture rather than SQL-text matching: the safety property is
 * that the action list is BOUND, never interpolated. Reading `.values` proves
 * exactly that, and would fail loudly if anyone ever concatenated an action
 * into the statement text.
 */
import { Prisma } from "@prisma/client";
import {
  purgeExpiredDiagnostics,
  countExpiredDiagnostics,
  diagnosticCutoff,
  DIAGNOSTIC_BATCH_SIZE,
  DIAGNOSTIC_MAX_PER_INVOCATION,
  DIAGNOSTIC_RETENTION_DAYS,
} from "@/lib/retention/system-diagnostic-cleanup";
import { SYNC_DIAGNOSTIC_DEDUPE_ACTIONS } from "@/lib/idx/diagnostic-recorder";

const NOW = new Date("2026-07-29T00:00:00.000Z");

// The purge is fail-closed by default (see the compliance gate in
// system-diagnostic-cleanup.ts). These bounds tests exercise the DELETING
// path, so they open the gate explicitly and restore it afterwards.
const GATE = "DIAGNOSTIC_RETENTION_ENABLED";
let previousGate: string | undefined;
beforeEach(() => { previousGate = process.env[GATE]; process.env[GATE] = "true"; });
afterEach(() => {
  if (previousGate === undefined) delete process.env[GATE];
  else process.env[GATE] = previousGate;
});

/** Captures every statement and replays a scripted per-batch row count. */
function makeClient(batchCounts: number[]) {
  const captured: Prisma.Sql[] = [];
  let i = 0;
  return {
    captured,
    client: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $queryRaw: async (query: Prisma.Sql): Promise<any> => {
        captured.push(query);
        const rows = batchCounts[i] ?? 0;
        i += 1;
        return [{ rows, bytes: BigInt(rows * 700) }];
      },
    },
  };
}

/** The action list is always the FIRST bound value of every statement. */
function boundActions(q: Prisma.Sql): unknown {
  return q.values[0];
}
/** LIMIT is the last bound value of a delete batch (actions, cutoff, limit). */
function boundLimit(q: Prisma.Sql): unknown {
  return q.values[2];
}

describe("system-diagnostic cleanup — bounded deletion guarantees", () => {
  it("binds the allowlist as a PARAMETER and never interpolates an action", async () => {
    const { client, captured } = makeClient([0]);
    await purgeExpiredDiagnostics(client, NOW);
    const sql = captured[0];
    expect(boundActions(sql)).toEqual([...SYNC_DIAGNOSTIC_DEDUPE_ACTIONS]);
    // The literal action names must appear NOWHERE in the statement text.
    const text = sql.strings.join("");
    for (const action of SYNC_DIAGNOSTIC_DEDUPE_ACTIONS) {
      expect(text).not.toContain(action);
    }
  });

  it("uses a 30-day cutoff, bound as a parameter", async () => {
    const { client, captured } = makeClient([0]);
    await purgeExpiredDiagnostics(client, NOW);
    const cutoff = captured[0].values[1] as Date;
    expect(cutoff).toEqual(diagnosticCutoff(NOW));
    expect(NOW.getTime() - cutoff.getTime()).toBe(
      DIAGNOSTIC_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it("orders deterministically and claims with SKIP LOCKED", async () => {
    const { client, captured } = makeClient([0]);
    await purgeExpiredDiagnostics(client, NOW);
    const text = captured[0].strings.join("").replace(/\s+/g, " ");
    expect(text).toContain("ORDER BY created_at, id");
    expect(text).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("never asks for more than DIAGNOSTIC_BATCH_SIZE in one statement", async () => {
    // Five full batches then a short one.
    const { client, captured } = makeClient([2000, 2000, 2000, 2000, 2000, 1]);
    await purgeExpiredDiagnostics(client, NOW);
    for (const q of captured) {
      expect(boundLimit(q) as number).toBeLessThanOrEqual(DIAGNOSTIC_BATCH_SIZE);
    }
  });

  it("never deletes more than DIAGNOSTIC_MAX_PER_INVOCATION in one invocation", async () => {
    // Always-full batches: the loop must stop at the invocation ceiling.
    const { client, captured } = makeClient(new Array(50).fill(DIAGNOSTIC_BATCH_SIZE));
    const result = await purgeExpiredDiagnostics(client, NOW);
    expect(result.rows).toBe(DIAGNOSTIC_MAX_PER_INVOCATION);
    expect(result.stopped).toBe("invocation_cap");
    const requested = captured.reduce((n, q) => n + (boundLimit(q) as number), 0);
    expect(requested).toBeLessThanOrEqual(DIAGNOSTIC_MAX_PER_INVOCATION);
  });

  it("the final batch is trimmed so the ceiling is never overshot", async () => {
    const { client, captured } = makeClient(new Array(50).fill(DIAGNOSTIC_BATCH_SIZE));
    await purgeExpiredDiagnostics(client, NOW, { maxRows: 4500, batchSize: 2000 });
    expect(captured.map(boundLimit)).toEqual([2000, 2000, 500]);
  });

  it("stops as soon as a short batch shows the backlog is drained", async () => {
    const { client, captured } = makeClient([2000, 37]);
    const result = await purgeExpiredDiagnostics(client, NOW);
    expect(result.rows).toBe(2037);
    expect(result.batches).toBe(2);
    expect(result.stopped).toBe("drained");
    expect(captured).toHaveLength(2); // no pointless third statement
  });

  it("reports rows and bytes from what the DATABASE returned, not what was asked", async () => {
    const { client } = makeClient([2000, 500]);
    const result = await purgeExpiredDiagnostics(client, NOW);
    expect(result.rows).toBe(2500);
    expect(result.bytes).toBe(2500 * 700);
  });

  it("stops immediately on a database error and reports progress so far", async () => {
    let call = 0;
    const client = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $queryRaw: async (): Promise<any> => {
        call += 1;
        if (call === 1) return [{ rows: 2000, bytes: BigInt(1400000) }];
        const err = new Error("canceling statement due to statement timeout");
        err.name = "PrismaClientKnownRequestError";
        throw err;
      },
    };
    const result = await purgeExpiredDiagnostics(client, NOW);
    expect(result.stopped).toBe("error");
    expect(result.error).toBe("PrismaClientKnownRequestError");
    expect(result.rows).toBe(2000); // the committed first batch is kept
    // The error NAME only — never a message that could carry row data.
    expect(result.error).not.toContain("statement");
  });

  it("stops if a batch ever returns more rows than it asked for", async () => {
    const { client } = makeClient([5000]); // impossible under LIMIT 2000
    const result = await purgeExpiredDiagnostics(client, NOW, { batchSize: 2000 });
    expect(result.stopped).toBe("error");
    expect(result.error).toBe("batch_overshoot");
    expect(result.rows).toBe(0); // the suspect batch is not counted as progress
  });

  it("dry run counts without issuing any DELETE, using the identical predicate", async () => {
    const dry = makeClient([46103]);
    const live = makeClient([0]);
    const dryResult = await purgeExpiredDiagnostics(dry.client, NOW, { dryRun: true });
    await purgeExpiredDiagnostics(live.client, NOW);

    expect(dryResult.stopped).toBe("dry_run");
    expect(dryResult.rows).toBe(46103);
    expect(dry.captured).toHaveLength(1);
    const dryText = dry.captured[0].strings.join("").replace(/\s+/g, " ");
    expect(dryText).not.toContain("DELETE");

    // Predicate parity: same bound allowlist and same bound cutoff on both paths.
    expect(boundActions(dry.captured[0])).toEqual(boundActions(live.captured[0]));
    expect(dry.captured[0].values[1]).toEqual(live.captured[0].values[1]);
  });

  it("is FAIL-CLOSED by default: without the compliance gate it counts and deletes nothing", async () => {
    delete process.env[GATE];
    const { client, captured } = makeClient([46103]);
    const result = await purgeExpiredDiagnostics(client, NOW);
    expect(result.stopped).toBe("compliance_gate_closed");
    expect(result.batches).toBe(0);
    expect(result.rows).toBe(0);
    // ...and issues NO query at all: a disabled feature must not cost a
    // database round-trip on every cron run.
    expect(captured).toHaveLength(0);
  });

  it("dry run STILL measures while the gate is shut, without deleting", async () => {
    delete process.env[GATE];
    const { client, captured } = makeClient([46103]);
    const result = await purgeExpiredDiagnostics(client, NOW, { dryRun: true });
    expect(result.stopped).toBe("dry_run");
    expect(result.rows).toBe(46103);
    expect(captured).toHaveLength(1);
    expect(captured[0].strings.join("")).not.toContain("DELETE");
  });

  it("countExpiredDiagnostics uses the same allowlist and cutoff as the delete", async () => {
    const counter = makeClient([123]);
    const deleter = makeClient([0]);
    await countExpiredDiagnostics(counter.client, NOW);
    await purgeExpiredDiagnostics(deleter.client, NOW);
    expect(boundActions(counter.captured[0])).toEqual(boundActions(deleter.captured[0]));
    expect(counter.captured[0].values[1]).toEqual(deleter.captured[0].values[1]);
  });
});
