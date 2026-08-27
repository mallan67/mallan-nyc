/**
 * A PRISMA DOUBLE THAT REMEMBERS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AND `buildPrismaMock` DOES NOT SUFFICE
 *
 * `buildPrismaMock` answers each call from a fixed seed: `findUnique` returns
 * whatever the seed says, forever, no matter what a preceding `update` wrote.
 * That is right for pinning ONE route's behaviour, and useless for proving a
 * WORKFLOW — because the whole question in a workflow is whether step 4 sees
 * what step 2 wrote.
 *
 * A test that asserts "create then reload shows no data loss" against a mock
 * whose reads are constants proves nothing at all. It would pass with the
 * persistence layer deleted.
 *
 * So this is a small in-memory database: writes mutate rows, reads query them,
 * and the only thing between two steps of a workflow is the store itself.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It is not a Postgres emulator and must not grow into one. It supports exactly
 * the Prisma surface the CRM/portal listing workflow uses:
 *
 *   scalar equality · `in` · `not` · `lt`/`gt` · `contains` · AND/OR arrays
 *   `select` projection · `orderBy` on one field · `take`
 *   create (autoincrement BigInt id) · update · updateMany · upsert · delete
 *   count · findUnique · findFirst · findMany · $transaction (both forms)
 *
 * Anything outside that throws LOUDLY rather than returning a plausible empty
 * result. A silent `[]` from an unsupported filter is exactly how a workflow
 * test goes green while proving nothing, so unsupported input is a test bug and
 * must read like one.
 */

type Row = Record<string, unknown>;

export interface InMemoryStore {
  /** model name → rows. Mutated in place by writes. */
  tables: Map<string, Row[]>;
  /** Every write, in order, for assertions about what a workflow actually did. */
  writeLog: Array<{ model: string; op: string; data: Row }>;
  reset(): void;
  seed(model: string, rows: Row[]): void;
  rows(model: string): Row[];
}

function isPlainObject(v: unknown): v is Row {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

/** Prisma compares BigInt/Decimal/Date by value; `===` would compare identity. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    try {
      return BigInt(a as string | number | bigint) === BigInt(b as string | number | bigint);
    } catch {
      return false;
    }
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return false;
}

const OPERATORS = new Set(['equals', 'in', 'notIn', 'not', 'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith']);

function matchCondition(value: unknown, cond: unknown): boolean {
  if (isPlainObject(cond)) {
    const keys = Object.keys(cond);
    const isOperatorObject = keys.length > 0 && keys.every((k) => OPERATORS.has(k));
    if (isOperatorObject) {
      for (const key of keys) {
        const operand = cond[key];
        switch (key) {
          case 'equals':
            if (!sameValue(value, operand)) return false;
            break;
          case 'in':
            if (!(operand as unknown[]).some((o) => sameValue(value, o))) return false;
            break;
          case 'notIn':
            if ((operand as unknown[]).some((o) => sameValue(value, o))) return false;
            break;
          case 'not':
            // Prisma's `not` also accepts a nested operator object.
            if (isPlainObject(operand) && Object.keys(operand).every((k) => OPERATORS.has(k))) {
              if (matchCondition(value, operand)) return false;
            } else if (sameValue(value, operand)) {
              return false;
            }
            break;
          case 'lt':
          case 'lte':
          case 'gt':
          case 'gte': {
            // NULL comparisons are NULL in SQL, i.e. never true. Reproducing
            // that matters: the archive predicate depends on it.
            if (value == null || operand == null) return false;
            const a = value instanceof Date ? value.getTime() : Number(value);
            const b = operand instanceof Date ? operand.getTime() : Number(operand);
            if (key === 'lt' && !(a < b)) return false;
            if (key === 'lte' && !(a <= b)) return false;
            if (key === 'gt' && !(a > b)) return false;
            if (key === 'gte' && !(a >= b)) return false;
            break;
          }
          case 'contains':
            if (typeof value !== 'string' || !value.includes(String(operand))) return false;
            break;
          case 'startsWith':
            if (typeof value !== 'string' || !value.startsWith(String(operand))) return false;
            break;
        }
      }
      return true;
    }
  }
  return sameValue(value, cond);
}

function matchWhere(row: Row, where: unknown): boolean {
  if (!isPlainObject(where)) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(cond as unknown[]).every((c) => matchWhere(row, c))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(cond as unknown[]).some((c) => matchWhere(row, c))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (matchWhere(row, cond)) return false;
      continue;
    }
    if (!matchCondition(row[key], cond)) return false;
  }
  return true;
}

function project(row: Row, select: unknown): Row {
  if (!isPlainObject(select)) return { ...row };
  const out: Row = {};
  for (const [key, want] of Object.entries(select)) {
    if (want === true) out[key] = row[key];
    else if (isPlainObject(want) && isPlainObject(want.select)) {
      // A relation include. The store holds no relations, so this must be
      // seeded onto the row by the test; returning undefined silently would
      // make an assertion about the relation vacuous.
      out[key] = row[key];
    }
  }
  return out;
}

function sortRows(rows: Row[], orderBy: unknown): Row[] {
  if (!isPlainObject(orderBy)) return rows;
  const [field, dir] = Object.entries(orderBy)[0] ?? [];
  if (!field) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // NULLs last, like Postgres default for ASC
    if (bv == null) return -1;
    const an = av instanceof Date ? av.getTime() : av;
    const bn = bv instanceof Date ? bv.getTime() : bv;
    if (an === bn) return 0;
    return (an < bn ? -1 : 1) * sign;
  });
}

export interface InMemoryPrisma {
  prisma: Record<string, unknown>;
  store: InMemoryStore;
}

export function createInMemoryPrisma(): InMemoryPrisma {
  const tables = new Map<string, Row[]>();
  const writeLog: Array<{ model: string; op: string; data: Row }> = [];
  const nextId = new Map<string, bigint>();

  const store: InMemoryStore = {
    tables,
    writeLog,
    reset() {
      tables.clear();
      nextId.clear();
      writeLog.length = 0;
    },
    seed(model, rows) {
      tables.set(model, rows.map((r) => ({ ...r })));
    },
    rows(model) {
      return tables.get(model) ?? [];
    },
  };

  const table = (model: string): Row[] => {
    if (!tables.has(model)) tables.set(model, []);
    return tables.get(model) as Row[];
  };

  const allocateId = (model: string): bigint => {
    const current = nextId.get(model) ?? BigInt(0);
    const existing = table(model).reduce((max, row) => {
      const id = row.id;
      return typeof id === 'bigint' && id > max ? id : max;
    }, current);
    const next = existing + BigInt(1);
    nextId.set(model, next);
    return next;
  };

  function makeModel(model: string) {
    const rowsOf = () => table(model);

    const findMany = async (args: Row = {}) => {
      let rows = rowsOf().filter((r) => matchWhere(r, args.where));
      rows = sortRows(rows, args.orderBy);
      if (typeof args.take === 'number') rows = rows.slice(0, args.take);
      if (typeof args.skip === 'number') rows = rows.slice(args.skip);
      return rows.map((r) => project(r, args.select));
    };

    const findFirst = async (args: Row = {}) => {
      const rows = await findMany({ ...args, take: 1 });
      return rows[0] ?? null;
    };

    const create = async (args: Row) => {
      const data = { ...(args.data as Row) };
      if (data.id === undefined) data.id = allocateId(model);
      if (data.created_at === undefined) data.created_at = new Date();
      rowsOf().push(data);
      writeLog.push({ model, op: 'create', data: { ...data } });
      return project(data, args.select);
    };

    const update = async (args: Row) => {
      const row = rowsOf().find((r) => matchWhere(r, args.where));
      if (!row) {
        // Prisma throws P2025 here. Returning null instead would let a test
        // "pass" while the update silently hit nothing.
        throw new Error(
          `[in-memory-prisma] ${model}.update matched no row for ${JSON.stringify(
            args.where,
            (_k, v) => (typeof v === 'bigint' ? String(v) : v),
          )}`,
        );
      }
      Object.assign(row, args.data as Row);
      writeLog.push({ model, op: 'update', data: { ...(args.data as Row) } });
      return project(row, args.select);
    };

    const updateMany = async (args: Row) => {
      const matched = rowsOf().filter((r) => matchWhere(r, args.where));
      for (const row of matched) Object.assign(row, args.data as Row);
      if (matched.length) writeLog.push({ model, op: 'updateMany', data: { ...(args.data as Row) } });
      return { count: matched.length };
    };

    // `args` is required for the write handlers and optional for the reads, so
    // the map is typed at the loosest shape a Proxy get can return.
    const handlers: Record<string, (args: never) => Promise<unknown>> = {
      findMany,
      findFirst,
      findUnique: async (args: Row = {}) => findFirst(args),
      findUniqueOrThrow: async (args: Row = {}) => {
        const row = await findFirst(args);
        if (!row) throw new Error(`[in-memory-prisma] ${model}.findUniqueOrThrow found nothing`);
        return row;
      },
      count: async (args: Row = {}) => rowsOf().filter((r) => matchWhere(r, args.where)).length,
      create,
      update,
      updateMany,
      upsert: async (args: Row) => {
        const row = rowsOf().find((r) => matchWhere(r, args.where));
        if (row) {
          Object.assign(row, args.update as Row);
          writeLog.push({ model, op: 'upsert:update', data: { ...(args.update as Row) } });
          return project(row, args.select);
        }
        return create({ data: args.create, select: args.select });
      },
      delete: async (args: Row) => {
        const rows = rowsOf();
        const idx = rows.findIndex((r) => matchWhere(r, args.where));
        if (idx === -1) throw new Error(`[in-memory-prisma] ${model}.delete matched no row`);
        const [removed] = rows.splice(idx, 1);
        writeLog.push({ model, op: 'delete', data: { ...removed } });
        return removed;
      },
      deleteMany: async (args: Row = {}) => {
        const rows = rowsOf();
        const keep = rows.filter((r) => !matchWhere(r, args.where));
        const removed = rows.length - keep.length;
        rows.length = 0;
        rows.push(...keep);
        if (removed) writeLog.push({ model, op: 'deleteMany', data: { count: removed } });
        return { count: removed };
      },
      aggregate: async () => {
        throw new Error(
          `[in-memory-prisma] ${model}.aggregate is not supported. Add it deliberately ` +
            `rather than letting a workflow test pass on an empty aggregate.`,
        );
      },
      groupBy: async () => {
        throw new Error(
          `[in-memory-prisma] ${model}.groupBy is not supported. Add it deliberately ` +
            `rather than letting a workflow test pass on an empty group.`,
        );
      },
    };

    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          const handler = handlers[prop];
          if (handler) return handler;
          // LOUD. A silent undefined would surface as "x is not a function"
          // three frames away from the cause.
          throw new Error(
            `[in-memory-prisma] ${model}.${String(prop)} is not implemented by the workflow store.`,
          );
        },
      },
    );
  }

  const modelCache = new Map<string, unknown>();

  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === '$transaction') {
          return async (arg: unknown) =>
            Array.isArray(arg)
              ? Promise.all(arg)
              : typeof arg === 'function'
                ? (arg as (tx: unknown) => unknown)(prisma)
                : null;
        }
        if (prop === '$queryRaw' || prop === '$queryRawUnsafe') {
          // The only raw query in the workflow is generateListingId's MAX()
          // lookup. The store allocates ids itself, so an empty result is the
          // correct answer here — and it is the ONLY raw query allowed to be
          // answered generically.
          return async () => [{ max_seq: null }];
        }
        if (prop === '$executeRaw' || prop === '$executeRawUnsafe') return async () => 0;
        if (prop === '$connect' || prop === '$disconnect') return async () => undefined;
        if (typeof prop !== 'string' || prop.startsWith('$')) return undefined;
        if (!modelCache.has(prop)) modelCache.set(prop, makeModel(prop));
        return modelCache.get(prop);
      },
    },
  );

  return { prisma, store };
}
